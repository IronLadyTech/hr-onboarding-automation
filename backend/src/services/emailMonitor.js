const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

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
let isProcessing = false;

// ============================================================
// AUTOMATIC EMAIL REPLY DETECTION USING GMAIL API
// FREE - 15,000 requests/day limit (more than enough)
// ============================================================

const initEmailMonitor = async (prismaClient) => {
  prisma = prismaClient;
  
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
    setInterval(async () => {
      await checkForReplies();
    }, 30 * 1000);
    
    // Initial check
    await checkForReplies();
    
    logger.info('✅ Email reply monitor initialized (Gmail API)');
  } catch (error) {
    logger.error('Gmail API initialization failed:', error.message);
    logger.info('📧 Email monitoring disabled. To enable:');
    logger.info('   1. Go to Google Cloud Console');
    logger.info('   2. Enable Gmail API');
    logger.info('   3. Create OAuth credentials');
    logger.info('   4. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN to .env');
  }
};

const checkForReplies = async (checkReadEmails = false) => {
  if (isProcessing || !gmail) return;
  
  isProcessing = true;
  
  try {
    // First, get all candidates who have been sent offers but haven't signed yet
    const candidates = await prisma.candidate.findMany({
      where: {
        offerSentAt: { not: null },
        offerSignedAt: null,
        status: { in: ['OFFER_SENT', 'OFFER_VIEWED'] }
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        offerSentAt: true
      }
    });

    if (candidates.length === 0) {
      logger.info('📧 No candidates waiting for signed offers');
      return;
    }

    logger.info(`📧 Checking emails for ${candidates.length} candidate(s) waiting for signed offers`);

    // Search for emails from each candidate specifically
    let totalProcessed = 0;
    for (const candidate of candidates) {
      try {
        // First check unread emails, then check read emails if no unread found
        // This ensures we don't miss emails that were already read
        let emailQuery = `from:${candidate.email} has:attachment newer_than:30d`;
        if (!checkReadEmails) {
          // Try unread first
          emailQuery = `from:${candidate.email} is:unread has:attachment newer_than:30d`;
        }
        
        let response = await gmail.users.messages.list({
          userId: 'me',
          q: emailQuery,
          maxResults: 10 // Only need a few emails per candidate
        });

        let messages = response.data.messages || [];
        
        // If no unread emails found and we're not checking read emails, also check read emails
        if (messages.length === 0 && !checkReadEmails) {
          logger.info(`No unread emails found for ${candidate.email}, checking read emails...`);
          emailQuery = `from:${candidate.email} has:attachment newer_than:30d`;
          response = await gmail.users.messages.list({
            userId: 'me',
            q: emailQuery,
            maxResults: 10
          });
          messages = response.data.messages || [];
        }
        
        if (messages.length > 0) {
          logger.info(`📧 Found ${messages.length} email(s) with attachments from ${candidate.email}`);
          for (const msg of messages) {
            await processMessage(msg.id);
            totalProcessed++;
          }
        }
      } catch (error) {
        logger.error(`Error checking emails for ${candidate.email}:`, error.message);
        // Continue with next candidate even if one fails
      }
    }

    if (totalProcessed > 0) {
      logger.info(`✅ Processed ${totalProcessed} email(s) from ${candidates.length} candidate(s)`);
    }
  } catch (error) {
    logger.error('Error checking emails:', error.message);
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
    // Check if this email is a reply to an offer-related email by checking subject or matching original email
    let isReplyToOfferEmail = false;
    let originalEmailType = null;
    
    const subjectLower = subject.toLowerCase();
    
    // Method 1: Check subject for offer letter keywords (strict - must be related to offer letter)
    // Only accept if subject contains "offer" AND ("letter" OR "reminder" OR "signed")
    if (subjectLower.includes('offer') && (subjectLower.includes('letter') || subjectLower.includes('reminder') || subjectLower.includes('signed'))) {
      isReplyToOfferEmail = true;
      logger.info(`✅ Detected as offer email reply based on subject: "${subject}"`);
    }
    
    // Method 2: Find the original OFFER_LETTER or OFFER_REMINDER email and check if this is a reply to it
    if (!isReplyToOfferEmail) {
      // Find the most recent OFFER_LETTER or OFFER_REMINDER email sent to this candidate
      const offerEmails = await prisma.email.findMany({
        where: {
          candidateId: candidate.id,
          type: { in: ['OFFER_LETTER', 'OFFER_REMINDER'] },
          status: 'SENT'
        },
        orderBy: { sentAt: 'desc' },
        take: 5 // Check last 5 offer-related emails
      });
      
      logger.info(`Found ${offerEmails.length} offer-related email(s) for candidate ${candidate.email}`);
      
      for (const offerEmail of offerEmails) {
        const offerSubjectLower = offerEmail.subject.toLowerCase();
        // Remove "Re:" prefix for comparison
        const cleanOfferSubject = offerSubjectLower.replace(/^re:\s*/i, '').trim();
        const cleanReplySubject = subjectLower.replace(/^re:\s*/i, '').trim();
        
        logger.info(`Comparing: Reply="${cleanReplySubject}" vs Original="${cleanOfferSubject}"`);
        
        // Check if reply subject matches or contains the original email subject
        // STRICT: Only accept if the reply subject actually matches the original offer email subject
        // This ensures we only capture replies to the actual offer letter email, not other emails
        if (cleanReplySubject.includes(cleanOfferSubject) || 
            cleanOfferSubject.includes(cleanReplySubject)) {
          isReplyToOfferEmail = true;
          originalEmailType = offerEmail.type;
          logger.info(`✅ Detected as reply to ${offerEmail.type} email - subject matches. Original: "${offerEmail.subject}", Reply: "${subject}"`);
          break;
        }
      }
      
      // Method 3: If still not matched, check if email has "Re:" and matches the original offer email subject
      // This is a fallback for cases where subject doesn't match exactly but is still a reply
      if (!isReplyToOfferEmail && subjectLower.includes('re:') && candidate.offerSentAt) {
        // Check if this email came after the offer was sent (within reasonable time)
        const offerSentTime = new Date(candidate.offerSentAt);
        const timeDiff = emailDate.getTime() - offerSentTime.getTime();
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
        
        // Only accept if it's a reply (has "Re:") and came within 30 days of offer being sent
        // AND the subject contains offer-related keywords
        if (daysDiff >= 0 && daysDiff <= 30 && (subjectLower.includes('offer') || subjectLower.includes('letter'))) {
          isReplyToOfferEmail = true;
          logger.info(`✅ Detected as potential offer reply - has "Re:" prefix and offer keywords, came ${daysDiff.toFixed(1)} days after offer sent`);
        }
      }
    }
    
    // If not a reply to Step 1 or Step 2 email, skip processing
    if (!isReplyToOfferEmail) {
      logger.info(`⏭️ Skipping email from ${fromEmail}: Not a reply to Step 1 (Offer Letter) or Step 2 (Offer Reminder) email. Subject: "${subject}"`);
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
    
    if (attachments.length === 0) {
      logger.info(`No attachments found in email from ${candidate.firstName} ${candidate.email}`);
      return;
    }
    
    logger.info(`📎 Found ${attachments.length} attachment(s) from ${candidate.firstName} ${candidate.email}`);
    
    // Download and save first valid attachment
    for (const att of attachments) {
      const ext = path.extname(att.filename || '').toLowerCase();
      logger.info(`Processing attachment: ${att.filename}, extension: ${ext}`);
      
      if (['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'].includes(ext)) {
        const savedPath = await downloadAndSaveAttachment(messageId, att, candidate.id);
        
        if (savedPath) {
          logger.info(`✅ Attachment saved: ${savedPath}`);
          
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
        }
      }
    }
  } catch (error) {
    logger.error('Error processing message:', error.message);
  }
};

const findAttachments = (payload, attachments = []) => {
  if (payload.filename && payload.body?.attachmentId) {
    attachments.push({
      filename: payload.filename,
      mimeType: payload.mimeType,
      attachmentId: payload.body.attachmentId
    });
  }
  
  if (payload.parts) {
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

module.exports = {
  initEmailMonitor,
  checkForReplies,
  checkEmailForCandidate,
  checkNow
};
