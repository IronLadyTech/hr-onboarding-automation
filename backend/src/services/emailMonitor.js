const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

// Conditionally require IMAP packages (only if available)
let Imap = null;
let simpleParser = null;
try {
  Imap = require('imap');
  simpleParser = require('mailparser').simpleParser;
} catch (error) {
  logger.warn('IMAP packages not installed. IMAP email monitoring will be disabled.');
  logger.warn('To enable IMAP support, run: npm install imap mailparser');
}

// Helper to convert absolute file path to relative path for storage
const getRelativeFilePath = (filePath) => {
  if (!filePath) return null;
  // Convert to relative path from uploads directory
  const uploadsDir = path.join(__dirname, '../../uploads');
  const relativePath = path.relative(uploadsDir, filePath);
  // Normalize to forward slashes for URLs (works on both Windows and Unix)
  return relativePath.split(path.sep).join('/');
};

let prisma;
let gmail;
let imapClient;
let isProcessing = false;
let useImap = false;
let imapEmail = null;

// ============================================================
// AUTOMATIC EMAIL REPLY DETECTION USING GMAIL API
// FREE - 15,000 requests/day limit (more than enough)
// ============================================================

const initEmailMonitor = async (prismaClient) => {
  prisma = prismaClient;
  
  // Try IMAP first (for GoDaddy/professional emails), then fallback to Gmail API
  const imapConfigured = await initImapMonitor();
  
  if (!imapConfigured) {
    // Fallback to Gmail API if IMAP not configured
    try {
      // Initialize Gmail API with OAuth2
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      // Set credentials from refresh token
      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });

      gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Test connection
      const profile = await gmail.users.getProfile({ userId: 'me' });
      logger.info(`📧 Gmail API connected: ${profile.data.emailAddress}`);
      
      // Start monitoring - check every 30 seconds for faster capture
      const checkInterval = setInterval(async () => {
        try {
          logger.info('📧 [SCHEDULED CHECK] Starting automatic email check for signed offer letters...');
          await checkForReplies();
          logger.info('📧 [SCHEDULED CHECK] Email check completed');
        } catch (error) {
          logger.error('📧 [SCHEDULED CHECK] Error during automatic email check:', error.message);
        }
      }, 30 * 1000);
      
      // Initial check
      logger.info('📧 [INITIAL CHECK] Running initial email check for signed offer letters...');
      await checkForReplies();
      
      logger.info('✅ Email reply monitor initialized (Gmail API)');
      logger.info('📧 Automatic email detection is ACTIVE - checking every 30 seconds');
      logger.info('📧 Monitoring candidates with offerSentAt but no offerSignedAt');
    } catch (error) {
      logger.error('❌ Gmail API initialization failed:', error.message);
      logger.error('Full error:', error);
      logger.warn('📧 Email monitoring DISABLED. Automatic detection will NOT work.');
      logger.info('📧 To enable automatic email detection:');
      logger.info('   Option 1 - IMAP (for GoDaddy/professional emails):');
      logger.info('     Configure IMAP settings in Settings → HR Email Configuration');
      logger.info('   Option 2 - Gmail API:');
      logger.info('     1. Go to Google Cloud Console');
      logger.info('     2. Enable Gmail API');
      logger.info('     3. Create OAuth 2.0 credentials');
      logger.info('     4. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN to .env');
      gmail = null; // Ensure gmail is null if initialization failed
    }
  }
};

// Initialize IMAP monitor for GoDaddy/professional emails
const initImapMonitor = async () => {
  try {
    // Get IMAP credentials from database
    const imapConfigs = await prisma.workflowConfig.findMany({
      where: {
        key: {
          in: ['imap_enabled', 'imap_host', 'imap_user', 'imap_pass', 'imap_port', 'imap_secure']
        }
      }
    });
    
    const configMap = {};
    imapConfigs.forEach(c => { configMap[c.key] = c.value; });
    
    const imapEnabled = configMap.imap_enabled === 'true';
    const imapHost = configMap.imap_host;
    const imapUser = configMap.imap_user;
    const imapPass = configMap.imap_pass;
    const imapPort = parseInt(configMap.imap_port) || 993;
    const imapSecure = configMap.imap_secure !== 'false'; // Default to true
    
    if (!imapEnabled || !imapHost || !imapUser || !imapPass) {
      logger.debug('📧 IMAP not configured - will try Gmail API instead');
      return false;
    }
    
    logger.info(`📧 Initializing IMAP monitor for ${imapUser}...`);
    
    // Create IMAP connection
    imapClient = new Imap({
      user: imapUser,
      password: imapPass,
      host: imapHost,
      port: imapPort,
      tls: imapSecure,
      tlsOptions: { rejectUnauthorized: false } // Allow self-signed certificates
    });
    
    // Connect to IMAP server
    await new Promise((resolve, reject) => {
      imapClient.once('ready', () => {
        logger.info(`✅ IMAP connected: ${imapUser} (${imapHost}:${imapPort})`);
        useImap = true;
        imapEmail = imapUser;
        resolve();
      });
      
      imapClient.once('error', (err) => {
        logger.error('❌ IMAP connection error:', err.message);
        reject(err);
      });
      
      imapClient.connect();
    });
    
    // Start monitoring - check every 30 seconds
    const checkInterval = setInterval(async () => {
      try {
        logger.info('📧 [SCHEDULED CHECK] Starting automatic email check for signed offer letters (IMAP)...');
        await checkForRepliesImap();
        logger.info('📧 [SCHEDULED CHECK] Email check completed (IMAP)');
      } catch (error) {
        logger.error('📧 [SCHEDULED CHECK] Error during automatic email check (IMAP):', error.message);
      }
    }, 30 * 1000);
    
    // Initial check
    logger.info('📧 [INITIAL CHECK] Running initial email check for signed offer letters (IMAP)...');
    await checkForRepliesImap();
    
    logger.info('✅ Email reply monitor initialized (IMAP)');
    logger.info('📧 Automatic email detection is ACTIVE - checking every 30 seconds');
    logger.info('📧 Monitoring candidates with offerSentAt but no offerSignedAt');
    return true;
  } catch (error) {
    logger.error('❌ IMAP initialization failed:', error.message);
    logger.warn('📧 Will try Gmail API instead');
    imapClient = null;
    useImap = false;
    return false;
  }
};

// IMAP-based email checking
const checkForRepliesImap = async () => {
  if (isProcessing) {
    logger.debug('📧 Email check already in progress, skipping...');
    return;
  }
  
  if (!Imap || !simpleParser) {
    logger.debug('📧 IMAP packages not available, skipping email check');
    return;
  }
  
  if (!imapClient || !useImap) {
    logger.debug('📧 IMAP not initialized, skipping email check');
    return;
  }
  
  isProcessing = true;
  
  try {
    // Get all candidates waiting for signed offers
    const candidates = await prisma.candidate.findMany({
      where: {
        offerSentAt: { not: null },
        offerSignedAt: null
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        offerSentAt: true,
        status: true
      }
    });

    if (candidates.length === 0) {
      logger.debug('📧 No candidates waiting for signed offers');
      return;
    }

    logger.info(`📧 [IMAP AUTO-CHECK] Checking emails for ${candidates.length} candidate(s)`);

    // Open inbox
    await new Promise((resolve, reject) => {
      imapClient.openBox('INBOX', false, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });

    let totalProcessed = 0;
    for (const candidate of candidates) {
      try {
        // Search for unread emails from this candidate
        const searchCriteria = [
          ['UNSEEN'],
          ['FROM', candidate.email]
        ];

        const results = await new Promise((resolve, reject) => {
          imapClient.search(searchCriteria, (err, results) => {
            if (err) reject(err);
            else resolve(results || []);
          });
        });

        if (results.length === 0) {
          logger.debug(`📧 No unread emails from ${candidate.email}`);
          continue;
        }

        // Fetch messages
        const messages = await new Promise((resolve, reject) => {
          const fetch = imapClient.fetch(results, { bodies: '' });
          const emailMessages = [];
          
          fetch.on('message', (msg, seqno) => {
            let buffer = '';
            let uid = null;
            
            msg.once('attributes', (attrs) => {
              uid = attrs.uid;
            });
            
            msg.on('body', (stream, info) => {
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
            });
            
            msg.once('end', () => {
              emailMessages.push({ uid, raw: buffer });
            });
          });
          
          fetch.once('end', () => {
            resolve(emailMessages);
          });
          
          fetch.once('error', (err) => {
            reject(err);
          });
        });

        if (messages && messages.length > 0) {
          logger.info(`📧 Found ${messages.length} unread email(s) from ${candidate.email}`);
          for (const msg of messages) {
            await processMessageImap(msg, candidate);
            totalProcessed++;
          }
        }
      } catch (error) {
        logger.error(`❌ Error checking IMAP emails for ${candidate.email}:`, error.message);
      }
    }

    if (totalProcessed > 0) {
      logger.info(`✅ [IMAP AUTO-CHECK] Processed ${totalProcessed} email(s)`);
    }
  } catch (error) {
    logger.error('❌ Error in checkForRepliesImap:', error.message);
  } finally {
    isProcessing = false;
  }
};

const processMessageImap = async (emailData, candidate) => {
  if (!simpleParser) {
    logger.warn('📧 mailparser not available, cannot process IMAP email');
    return;
  }
  
  try {
    // Parse email using mailparser
    const parsed = await simpleParser(emailData.raw);
    
    const fromEmail = parsed.from?.value[0]?.address || '';
    const subject = parsed.subject || '';
    const inReplyTo = parsed.inReplyTo || '';
    
    logger.info(`Processing IMAP email: From=${fromEmail}, Subject=${subject}, InReplyTo=${inReplyTo || 'none'}`);

    // Verify it's a reply to offer email (same logic as Gmail API)
    const offerEmails = await prisma.email.findMany({
      where: {
        candidateId: candidate.id,
        type: { in: ['OFFER_LETTER', 'OFFER_REMINDER'] },
        status: { in: ['SENT', 'PENDING'] }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    
    if (offerEmails.length === 0) {
      logger.info(`⏭️ Skipping IMAP email: No offer emails found for candidate`);
      return;
    }
    
    let isReplyToOfferEmail = false;
    const subjectLower = subject.toLowerCase();
    
    // Check subject matching
    for (const offerEmail of offerEmails) {
      const offerSubjectLower = offerEmail.subject.toLowerCase();
      const cleanOfferSubject = offerSubjectLower.replace(/^re:\s*/i, '').trim();
      const cleanReplySubject = subjectLower.replace(/^re:\s*/i, '').trim();
      
      const subjectsMatch = cleanReplySubject.includes(cleanOfferSubject) || 
                           cleanOfferSubject.includes(cleanReplySubject) ||
                           (cleanReplySubject.includes('offer') && cleanOfferSubject.includes('offer')) ||
                           (cleanReplySubject.includes('letter') && cleanOfferSubject.includes('letter'));
      
      if (subjectsMatch) {
        isReplyToOfferEmail = true;
        logger.info(`✅ Detected as reply to ${offerEmail.type} email`);
        break;
      }
    }
    
    if (!isReplyToOfferEmail) {
      logger.info(`⏭️ Skipping IMAP email: Not a reply to offer email`);
      return;
    }
    
    // Process attachments
    if (parsed.attachments && parsed.attachments.length > 0) {
      logger.info(`📎 Found ${parsed.attachments.length} attachment(s) in IMAP email`);
      
      for (const att of parsed.attachments) {
        const ext = path.extname(att.filename || '').toLowerCase();
        const validExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt', '.rtf'];
        
        if (validExtensions.includes(ext)) {
          const savedPath = await saveImapAttachment(att, candidate.id);
          
          if (savedPath) {
            const signedAt = new Date();
            
            // Update candidate
            await prisma.candidate.update({
              where: { id: candidate.id },
              data: {
                signedOfferPath: getRelativeFilePath(savedPath),
                offerSignedAt: signedAt,
                status: 'OFFER_SIGNED',
                offerReminderSent: true
              }
            });

            // Mark Step 2 as completed
            try {
              const stepService = require('./stepService');
              await stepService.completeStep(prisma, candidate.id, 2, null, 'Signed offer received via email (IMAP)');
              logger.info(`✅ Marked Step 2 as completed for ${candidate.firstName} ${candidate.lastName}`);
            } catch (stepError) {
              logger.warn(`⚠️ Could not mark Step 2 as completed: ${stepError.message}`);
            }

            // Log activity
            await prisma.activityLog.create({
              data: {
                candidateId: candidate.id,
                userId: null,
                action: 'SIGNED_OFFER_AUTO_DETECTED',
                description: `✅ Signed offer auto-captured from email reply (IMAP) - Step 2 marked as completed`,
                metadata: { 
                  filename: att.filename,
                  emailSubject: subject,
                  receivedAt: signedAt.toISOString(),
                  stepCompleted: 2
                }
              }
            });

            logger.info(`✅ AUTO-CAPTURED (IMAP): Signed offer from ${candidate.firstName} ${candidate.lastName}`);
            
            // Mark email as read
            if (emailData.uid) {
              imapClient.addFlags(emailData.uid, '\\Seen', (err) => {
                if (err) logger.warn(`Could not mark email as read: ${err.message}`);
              });
            }
            
            break; // Only process first valid attachment
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error processing IMAP message:', error.message);
  }
};

const saveImapAttachment = async (attachment, candidateId) => {
  try {
    const uploadDir = path.join(__dirname, '../../uploads/signed-offers');
    await fs.mkdir(uploadDir, { recursive: true });

    const ext = path.extname(attachment.filename || '.pdf');
    const filename = `signed-${candidateId}-${Date.now()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    await fs.writeFile(filepath, attachment.content);
    
    logger.info(`Saved IMAP attachment: ${filename}`);
    return filepath;
  } catch (error) {
    logger.error('Error saving IMAP attachment:', error.message);
    return null;
  }
};

const checkForReplies = async (checkReadEmails = false) => {
  if (isProcessing) {
    logger.debug('📧 Email check already in progress, skipping...');
    return;
  }
  
  if (!gmail) {
    logger.debug('📧 Gmail API not initialized, skipping email check');
    return;
  }
  
  isProcessing = true;
  
  try {
    // First, get all candidates who have been sent offers but haven't signed yet
    // Don't restrict by status - just check if offer was sent and not yet signed
    const candidates = await prisma.candidate.findMany({
      where: {
        offerSentAt: { not: null },
        offerSignedAt: null
        // Removed status restriction - check all candidates with offerSentAt but no offerSignedAt
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        offerSentAt: true,
        status: true
      }
    });

    if (candidates.length === 0) {
      logger.debug('📧 No candidates waiting for signed offers');
      return;
    }

    logger.info(`📧 [AUTO-CHECK] Checking emails for ${candidates.length} candidate(s) waiting for signed offers`);

    // Search for emails from each candidate specifically
    let totalProcessed = 0;
    for (const candidate of candidates) {
      try {
        logger.info(`🔍 Checking emails for candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.email})`);
        logger.info(`   Offer sent at: ${candidate.offerSentAt?.toISOString() || 'N/A'}`);
        logger.info(`   Offer signed at: ${candidate.offerSignedAt?.toISOString() || 'Not signed yet'}`);
        
        // First check unread emails with attachments (most likely to be signed offers)
        // Then check all emails (read + unread) with attachments
        // Finally check all emails (even without attachments) in case attachment detection fails
        let emailQuery = `from:${candidate.email} has:attachment newer_than:60d`; // Extended to 60 days
        if (!checkReadEmails) {
          // Try unread first
          emailQuery = `from:${candidate.email} is:unread has:attachment newer_than:60d`;
        }
        
        logger.info(`   Search query: ${emailQuery}`);
        let response = await gmail.users.messages.list({
          userId: 'me',
          q: emailQuery,
          maxResults: 20 // Check more emails per candidate
        });

        let messages = response.data.messages || [];
        logger.info(`   Found ${messages.length} email(s) with attachments (unread)`);
        
        // If no unread emails found and we're not checking read emails, also check read emails
        if (messages.length === 0 && !checkReadEmails) {
          logger.info(`   No unread emails with attachments found, checking read emails...`);
          emailQuery = `from:${candidate.email} has:attachment newer_than:60d`;
          response = await gmail.users.messages.list({
            userId: 'me',
            q: emailQuery,
            maxResults: 20
          });
          messages = response.data.messages || [];
          logger.info(`   Found ${messages.length} email(s) with attachments (read + unread)`);
        }
        
        // If still no emails with attachments, check all emails (in case attachment detection in Gmail query fails)
        if (messages.length === 0) {
          logger.info(`   No emails with attachments found, checking all emails (including those without detected attachments)...`);
          emailQuery = `from:${candidate.email} newer_than:60d`;
          response = await gmail.users.messages.list({
            userId: 'me',
            q: emailQuery,
            maxResults: 20
          });
          messages = response.data.messages || [];
          logger.info(`   Found ${messages.length} total email(s) from candidate`);
        }
        
        if (messages.length > 0) {
          logger.info(`📧 Found ${messages.length} email(s) with attachments from ${candidate.email}`);
          for (const msg of messages) {
            await processMessage(msg.id);
            totalProcessed++;
          }
        } else {
          logger.debug(`📧 No emails with attachments found for ${candidate.email}`);
        }
      } catch (error) {
        logger.error(`❌ Error checking emails for ${candidate.email}:`, error.message);
        // Continue with next candidate even if one fails
      }
    }

    if (totalProcessed > 0) {
      logger.info(`✅ [AUTO-CHECK] Processed ${totalProcessed} email(s) from ${candidates.length} candidate(s)`);
    } else {
      logger.debug(`📧 [AUTO-CHECK] No new emails to process`);
    }
  } catch (error) {
    logger.error('❌ Error in checkForReplies:', error.message);
    logger.error('Full error:', error);
  } finally {
    isProcessing = false;
  }
};

// Manual check for specific email address
const checkEmailForCandidate = async (emailAddress) => {
  if (!gmail) {
    logger.error('Gmail API not initialized');
    return { success: false, message: 'Gmail API not initialized' };
  }
  
  try {
    logger.info(`🔍 Manually checking emails from: ${emailAddress}`);
    
    // Search for emails from this specific address with attachments
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: `from:${emailAddress} has:attachment newer_than:30d`,
      maxResults: 50
    });

    const messages = response.data.messages || [];
    logger.info(`Found ${messages.length} email(s) from ${emailAddress} with attachments`);
    
    let processed = 0;
    for (const msg of messages) {
      await processMessage(msg.id);
      processed++;
    }
    
    return { success: true, message: `Processed ${processed} email(s) from ${emailAddress}` };
  } catch (error) {
    logger.error('Error manually checking email:', error.message);
    return { success: false, message: error.message };
  }
};

const processMessage = async (messageId) => {
  try {
    // Get full message details
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const headers = message.data.payload.headers;
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
    const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
    const dateHeader = headers.find(h => h.name.toLowerCase() === 'date');
    const inReplyToHeader = headers.find(h => h.name.toLowerCase() === 'in-reply-to');
    const referencesHeader = headers.find(h => h.name.toLowerCase() === 'references');
    const messageIdHeader = headers.find(h => h.name.toLowerCase() === 'message-id');
    
    // Extract email address from "Name <email@domain.com>" format
    const fromEmail = extractEmail(fromHeader?.value || '');
    const subject = subjectHeader?.value || '';
    const emailDate = dateHeader ? new Date(dateHeader.value) : new Date(message.data.internalDate ? parseInt(message.data.internalDate) : Date.now());
    const inReplyTo = inReplyToHeader?.value || '';
    const references = referencesHeader?.value || '';

    if (!fromEmail) return;

    logger.info(`Processing: From=${fromEmail}, Subject=${subject}, Date=${emailDate.toISOString()}, InReplyTo=${inReplyTo || 'none'}`);

    // Find candidate by email
    const candidate = await prisma.candidate.findFirst({
      where: { 
        email: fromEmail.toLowerCase()
      }
    });

    if (!candidate) {
      logger.info(`No matching candidate for: ${fromEmail}`);
      return;
    }

    // CRITICAL: Only process attachments from replies to Step 1 (OFFER_LETTER) or Step 2 (OFFER_REMINDER) emails
    // We must verify this is a reply to an offer email, not to any other step email
    let isReplyToOfferEmail = false;
    let originalEmailType = null;
    
    const subjectLower = subject.toLowerCase();
    const isReplySubject = subjectLower.startsWith('re:') || subjectLower.startsWith('re ');
    const hasReplyHeaders = !!(inReplyTo || references);
    const isReply = isReplySubject || hasReplyHeaders;
    
    logger.info(`Email from ${fromEmail}: Subject="${subject}", In-Reply-To=${inReplyTo || 'none'}, References=${references || 'none'}, IsReply=${isReply}`);
    
    // First, get all OFFER_LETTER and OFFER_REMINDER emails sent to this candidate
    const offerEmails = await prisma.email.findMany({
      where: {
        candidateId: candidate.id,
        type: { in: ['OFFER_LETTER', 'OFFER_REMINDER'] },
        status: { in: ['SENT', 'PENDING'] }
      },
      orderBy: { createdAt: 'desc' },
      take: 20 // Check more emails to find matches
    });
    
    logger.info(`Found ${offerEmails.length} offer-related email(s) (OFFER_LETTER or OFFER_REMINDER) for candidate ${candidate.email}`);
    
    if (offerEmails.length === 0) {
      // No offer emails in database - can't verify it's a reply to offer email
      logger.info(`⏭️ Skipping email from ${fromEmail}: No OFFER_LETTER or OFFER_REMINDER emails found in database for this candidate. Subject: "${subject}"`);
      return;
    }
    
    // Method 1: Check if In-Reply-To or References headers match (most reliable)
    // Extract Message-ID from In-Reply-To/References and try to match
    if (hasReplyHeaders) {
      logger.info(`Reply headers found, checking if this is a reply to an offer email...`);
      
      // Check subject matching - if reply subject contains original subject (after removing "Re:")
      for (const offerEmail of offerEmails) {
        const offerSubjectLower = offerEmail.subject.toLowerCase();
        const cleanOfferSubject = offerSubjectLower.replace(/^re:\s*/i, '').replace(/^fwd?:\s*/i, '').trim();
        const cleanReplySubject = subjectLower.replace(/^re:\s*/i, '').replace(/^fwd?:\s*/i, '').trim();
        
        // Check if subjects match (reply contains original or vice versa)
        const subjectsMatch = cleanReplySubject.includes(cleanOfferSubject) || 
                             cleanOfferSubject.includes(cleanReplySubject) ||
                             // Also check if both contain key offer-related words
                             (cleanReplySubject.includes('offer') && cleanOfferSubject.includes('offer')) ||
                             (cleanReplySubject.includes('letter') && cleanOfferSubject.includes('letter'));
        
        if (subjectsMatch) {
          isReplyToOfferEmail = true;
          originalEmailType = offerEmail.type;
          logger.info(`✅ Detected as reply to ${offerEmail.type} email - In-Reply-To/References present and subject matches. Original: "${offerEmail.subject}", Reply: "${subject}"`);
          break;
        }
      }
    }
    
    // Method 2: If no match yet, check subject matching (for cases where headers aren't set properly)
    if (!isReplyToOfferEmail && isReplySubject) {
      logger.info(`No header match found, checking subject matching...`);
      
      for (const offerEmail of offerEmails) {
        const offerSubjectLower = offerEmail.subject.toLowerCase();
        const cleanOfferSubject = offerSubjectLower.replace(/^re:\s*/i, '').replace(/^fwd?:\s*/i, '').trim();
        const cleanReplySubject = subjectLower.replace(/^re:\s*/i, '').replace(/^fwd?:\s*/i, '').trim();
        
        // Check if reply subject matches or contains the original email subject
        const subjectsMatch = cleanReplySubject.includes(cleanOfferSubject) || 
                             cleanOfferSubject.includes(cleanReplySubject) ||
                             // Check if both contain key offer-related words
                             (cleanReplySubject.includes('offer') && cleanOfferSubject.includes('offer')) ||
                             (cleanReplySubject.includes('letter') && cleanOfferSubject.includes('letter')) ||
                             (cleanReplySubject.includes('reminder') && cleanOfferSubject.includes('reminder'));
        
        if (subjectsMatch) {
          isReplyToOfferEmail = true;
          originalEmailType = offerEmail.type;
          logger.info(`✅ Detected as reply to ${offerEmail.type} email - subject matches. Original: "${offerEmail.subject}", Reply: "${subject}"`);
          break;
        }
      }
    }
    
    // If still no match, this is NOT a reply to Step 1 or Step 2 - skip it
    if (!isReplyToOfferEmail) {
      logger.info(`⏭️ Skipping email from ${fromEmail}: Not a reply to Step 1 (OFFER_LETTER) or Step 2 (OFFER_REMINDER) email. Subject: "${subject}"`);
      logger.info(`   This email might be a reply to Step 3, 4, 5, or other emails - ignoring to prevent false positives.`);
      return;
    }
    
    // Only process if candidate hasn't signed yet
    if (candidate.offerSignedAt) {
      logger.info(`⏭️ Skipping email from ${fromEmail}: Candidate has already signed offer letter`);
      return;
    }
    
    const shouldProcessSignedOffer = true;
    
    logger.info(`📧 Processing email from ${candidate.firstName} ${candidate.lastName}: OfferSentAt=${candidate.offerSentAt?.toISOString()}, EmailDate=${emailDate.toISOString()}, HasSigned=${!!candidate.offerSignedAt}, WillProcess=${shouldProcessSignedOffer}`);

    // Check for attachments
    const attachments = findAttachments(message.data.payload);
    
    logger.info(`📎 Checking for attachments in email from ${candidate.firstName} ${candidate.email}...`);
    logger.info(`📎 Email payload structure: parts=${message.data.payload.parts?.length || 0}, hasBody=${!!message.data.payload.body}, filename=${message.data.payload.filename || 'none'}`);
    
    if (attachments.length === 0) {
      logger.warn(`⚠️ No attachments found in email from ${candidate.firstName} ${candidate.email}. Email subject: "${subject}"`);
      logger.warn(`⚠️ This might be because:`);
      logger.warn(`   1. The email doesn't have attachments`);
      logger.warn(`   2. The attachment format is not recognized`);
      logger.warn(`   3. The email structure is different than expected`);
      return;
    }
    
    logger.info(`📎 Found ${attachments.length} attachment(s) from ${candidate.firstName} ${candidate.email}:`);
    attachments.forEach((att, idx) => {
      logger.info(`   ${idx + 1}. ${att.filename || 'unnamed'} (${att.mimeType || 'unknown type'}, ID: ${att.attachmentId || 'none'})`);
    });
    
    // Download and save first valid attachment
    let attachmentProcessed = false;
    for (const att of attachments) {
      const ext = path.extname(att.filename || '').toLowerCase();
      logger.info(`📎 Processing attachment: ${att.filename}, extension: ${ext}, mimeType: ${att.mimeType}`);
      
      // Accept common document and image formats
      const validExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt', '.rtf'];
      const validMimeTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
                              'image/jpeg', 'image/png', 'text/plain', 'application/rtf'];
      
      const isValidExtension = ext && validExtensions.includes(ext);
      const isValidMimeType = att.mimeType && validMimeTypes.some(mt => att.mimeType.toLowerCase().includes(mt.toLowerCase()));
      
      if (isValidExtension || isValidMimeType) {
        logger.info(`✅ Attachment is valid (extension: ${isValidExtension}, mimeType: ${isValidMimeType}), downloading...`);
        const savedPath = await downloadAndSaveAttachment(messageId, att, candidate.id);
        
        if (savedPath) {
          logger.info(`✅ Attachment saved successfully: ${savedPath}`);
          attachmentProcessed = true;
          
          // If candidate hasn't signed yet and email came after offer was sent, treat it as signed offer
          if (shouldProcessSignedOffer) {
            const signedAt = new Date();
            
            // Update candidate with signed offer
            await prisma.candidate.update({
              where: { id: candidate.id },
              data: {
                signedOfferPath: getRelativeFilePath(savedPath),
                offerSignedAt: signedAt,
                status: 'OFFER_SIGNED',
                offerReminderSent: true
              }
            });

            // Cancel reminders
            await prisma.reminder.updateMany({
              where: {
                candidateId: candidate.id,
                type: 'OFFER_FOLLOWUP',
                status: 'PENDING'
              },
              data: { status: 'CANCELLED' }
            });

            // Mark Step 2 (Offer Reminder) as completed using stepService
            try {
              const stepService = require('./stepService');
              await stepService.completeStep(prisma, candidate.id, 2, null, 'Signed offer received via email');
              logger.info(`✅ Marked Step 2 (Offer Reminder) as completed for ${candidate.firstName} ${candidate.lastName}`);
            } catch (stepError) {
              logger.warn(`⚠️ Could not mark Step 2 as completed: ${stepError.message}`);
              // Fallback: Mark old task system if it exists
              const tasks = await prisma.task.findMany({
                where: {
                  candidateId: candidate.id,
                  status: { not: 'COMPLETED' }
                }
              });

              for (const task of tasks) {
                const isStep2 = task.type === 'OFFER_REMINDER' || 
                               (task.metadata && typeof task.metadata === 'object' && task.metadata.step === 2);
                
                if (isStep2) {
                  await prisma.task.update({
                    where: { id: task.id },
                    data: {
                      status: 'COMPLETED',
                      completedAt: signedAt
                    }
                  });
                  logger.info(`✅ Marked Step 2 task as completed: ${task.title}`);
                }
              }
            }

            // Log activity
            await prisma.activityLog.create({
              data: {
                candidateId: candidate.id,
                userId: null, // System action
                action: 'SIGNED_OFFER_AUTO_DETECTED',
                description: `✅ Signed offer auto-captured from email reply - Step 2 marked as completed`,
                metadata: { 
                  filename: att.filename,
                  emailSubject: subject,
                  receivedAt: signedAt.toISOString(),
                  stepCompleted: 2
                }
              }
            });

            logger.info(`✅ AUTO-CAPTURED: Signed offer from ${candidate.firstName} ${candidate.lastName} - Step 2 marked as completed`);
          } else {
            // Log that we received an attachment but it's not a signed offer
            logger.info(`📎 Received attachment from ${candidate.firstName} but not processing as signed offer (already signed or not offer-related)`);
            
            // Still log the activity for tracking
            await prisma.activityLog.create({
              data: {
                candidateId: candidate.id,
                userId: null,
                action: 'EMAIL_ATTACHMENT_RECEIVED',
                description: `📎 Attachment received from candidate: ${att.filename}`,
                metadata: { 
                  filename: att.filename,
                  emailSubject: subject,
                  receivedAt: new Date().toISOString(),
                  savedPath: getRelativeFilePath(savedPath)
                }
              }
            });
          }
          
          // Mark email as read only after successful processing
          try {
            await gmail.users.messages.modify({
              userId: 'me',
              id: messageId,
              requestBody: { removeLabelIds: ['UNREAD'] }
            });
            logger.info(`✅ Marked email as read: ${messageId}`);
          } catch (readError) {
            logger.warn(`Could not mark email as read: ${readError.message}`);
            // Don't fail the whole process if marking as read fails
          }
          
          break; // Only need first valid attachment
        } else {
          logger.error(`❌ Failed to save attachment: ${att.filename}`);
        }
      } else {
        logger.warn(`⚠️ Skipping attachment ${att.filename}: Invalid extension (${ext}) and mimeType (${att.mimeType})`);
      }
    }
    
    if (!attachmentProcessed && attachments.length > 0) {
      logger.warn(`⚠️ No valid attachments were processed from ${attachments.length} attachment(s) found`);
    }
  } catch (error) {
    logger.error('Error processing message:', error.message);
  }
};

const findAttachments = (payload, attachments = []) => {
  if (!payload) return attachments;
  
  // Check if this part itself is an attachment
  if (payload.filename && payload.body?.attachmentId) {
    attachments.push({
      filename: payload.filename,
      mimeType: payload.mimeType || 'application/octet-stream',
      attachmentId: payload.body.attachmentId
    });
    logger.debug(`Found attachment: ${payload.filename} (ID: ${payload.body.attachmentId})`);
  }
  
  // Recursively check parts
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      findAttachments(part, attachments);
    }
  }
  
  return attachments;
};

const downloadAndSaveAttachment = async (messageId, attachment, candidateId) => {
  try {
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachment.attachmentId
    });

    const data = response.data.data;
    const buffer = Buffer.from(data, 'base64');

    // Save to uploads folder
    const uploadDir = path.join(__dirname, '../../uploads/signed-offers');
    await fs.mkdir(uploadDir, { recursive: true });

    const ext = path.extname(attachment.filename || '.pdf');
    const filename = `signed-${candidateId}-${Date.now()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    await fs.writeFile(filepath, buffer);
    
    logger.info(`Saved attachment: ${filename}`);
    return filepath;
  } catch (error) {
    logger.error('Error saving attachment:', error.message);
    return null;
  }
};

const extractEmail = (fromHeader) => {
  const match = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([^\s<]+@[^\s>]+)/);
  return match ? match[1].toLowerCase() : null;
};

// Manual trigger for testing
const checkNow = async () => {
  logger.info('Manual email check triggered');
  await checkForReplies();
};

// Get email monitor status
const getEmailMonitorStatus = () => {
  return {
    isActive: useImap ? !!imapClient : !!gmail,
    isProcessing: isProcessing,
    hasGmail: !!gmail,
    hasImap: useImap && !!imapClient,
    method: useImap ? 'IMAP' : (gmail ? 'Gmail API' : 'None'),
    email: useImap ? imapEmail : (gmail ? 'Gmail API' : null)
  };
};

module.exports = {
  initEmailMonitor,
  checkForReplies,
  checkEmailForCandidate,
  checkNow,
  getEmailMonitorStatus
};
