const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Helper to create transporter dynamically (uses database credentials if available, falls back to env)
const createTransporter = async (prisma = null) => {
  let smtpUser = process.env.SMTP_USER;
  let smtpPass = process.env.SMTP_PASS;
  let smtpHost = process.env.SMTP_HOST;
  let smtpPort = process.env.SMTP_PORT;
  let smtpSecure = process.env.SMTP_SECURE === 'true';
  
  // If prisma is provided, try to get SMTP credentials and settings from database (dynamic)
  if (prisma) {
    try {
      const smtpConfigs = await prisma.workflowConfig.findMany({
        where: {
          key: {
            in: ['smtp_user', 'smtp_pass', 'smtp_host', 'smtp_port', 'smtp_secure']
          }
        }
      });
      const smtpConfigMap = {};
      smtpConfigs.forEach(c => { smtpConfigMap[c.key] = c.value; });
      
      if (smtpConfigMap.smtp_user) {
        smtpUser = smtpConfigMap.smtp_user;
      }
      if (smtpConfigMap.smtp_pass) {
        smtpPass = smtpConfigMap.smtp_pass;
      }
      if (smtpConfigMap.smtp_host) {
        smtpHost = smtpConfigMap.smtp_host;
      }
      if (smtpConfigMap.smtp_port) {
        smtpPort = smtpConfigMap.smtp_port;
      }
      if (smtpConfigMap.smtp_secure !== undefined) {
        smtpSecure = smtpConfigMap.smtp_secure === 'true';
      }
    } catch (error) {
      logger.warn('Could not fetch SMTP credentials from database, using env vars:', error.message);
    }
  }
  
  return nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort) || 587,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
};

// Create default transporter (for backward compatibility and scheduler)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify transporter on startup
transporter.verify((error, success) => {
  if (error) {
    logger.error('❌ SMTP Connection Error:', error);
    logger.error('Please check your SMTP configuration in .env file:');
    logger.error('  - SMTP_HOST:', process.env.SMTP_HOST || 'NOT SET');
    logger.error('  - SMTP_PORT:', process.env.SMTP_PORT || 'NOT SET');
    logger.error('  - SMTP_USER:', process.env.SMTP_USER ? 'SET' : 'NOT SET');
    logger.error('  - SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT SET');
    logger.error('  - EMAIL_FROM:', process.env.EMAIL_FROM || 'NOT SET');
  } else {
    logger.info('✅ SMTP Server ready and verified');
    logger.info('SMTP Configuration:');
    logger.info('  - Host:', process.env.SMTP_HOST);
    logger.info('  - Port:', process.env.SMTP_PORT);
    logger.info('  - User:', process.env.SMTP_USER);
    logger.info('  - From:', process.env.EMAIL_FROM || process.env.SMTP_USER);
  }
});

// Helper to get company config from database
const getCompanyConfig = async (prisma) => {
  try {
    const configs = await prisma.workflowConfig.findMany({
      where: {
        key: {
          in: ['company_name', 'hr_name', 'hr_email', 'hr_phone', 'company_address', 'office_timings']
        }
      }
    });
    const configMap = {};
    configs.forEach(c => { configMap[c.key] = c.value; });
    return configMap;
  } catch (error) {
    logger.warn('Failed to fetch company config, using defaults:', error);
    return {};
  }
};

// Helper to get custom placeholders from database
const getCustomPlaceholders = async (prisma) => {
  try {
    const placeholders = await prisma.customPlaceholder.findMany({
      where: { isActive: true }
    });
    const placeholderMap = {};
    placeholders.forEach(p => {
      placeholderMap[`{{${p.placeholderKey}}}`] = p.value;
    });
    return placeholderMap;
  } catch (error) {
    // If table doesn't exist yet, return empty object
    logger.warn('Failed to fetch custom placeholders, using defaults:', error.message);
    return {};
  }
};

// Helper to get template and replace placeholders
const getEmailContent = async (prisma, type, candidate, customData = {}) => {
  const template = await prisma.emailTemplate.findFirst({
    where: { type, isActive: true }
  });

  if (!template) {
    // NO HARDCODED FALLBACK - All emails must use templates from database
    throw new Error(`No email template found for type: ${type}. Please create an email template in the database.`);
  }

  // Get company config from database
  const companyConfig = await getCompanyConfig(prisma);
  
  // Get custom placeholders from database
  const customPlaceholders = await getCustomPlaceholders(prisma);

  let subject = template.subject;
  let body = template.body;

  // Replace placeholders
  const placeholders = {
    '{{firstName}}': candidate.firstName,
    '{{lastName}}': candidate.lastName,
    '{{fullName}}': `${candidate.firstName} ${candidate.lastName}`,
    '{{candidateName}}': `${candidate.firstName} ${candidate.lastName}`,
    '{{email}}': candidate.email,
    '{{position}}': candidate.position,
    '{{department}}': candidate.department,
    '{{salary}}': candidate.salary || '',
    '{{joiningDate}}': candidate.expectedJoiningDate?.toLocaleDateString() || '',
    '{{reportingManager}}': candidate.reportingManager || '',
    '{{hrName}}': companyConfig.hr_name || process.env.HR_NAME || 'HR Team',
    '{{companyName}}': companyConfig.company_name || process.env.COMPANY_NAME || 'Company',
    ...customData,
    ...customPlaceholders // Add custom placeholders (e.g., {{googleMeetLink}}, etc.)
  };

  // Add custom fields as placeholders (e.g., {{address}}, {{emergencyContact}}, etc.)
  if (candidate.customFields && typeof candidate.customFields === 'object') {
    Object.entries(candidate.customFields).forEach(([fieldKey, fieldValue]) => {
      // Convert fieldKey to placeholder format: address -> {{address}}
      const placeholderKey = `{{${fieldKey}}}`;
      placeholders[placeholderKey] = fieldValue || '';
    });
  }

  Object.entries(placeholders).forEach(([key, value]) => {
    subject = subject.replace(new RegExp(key, 'g'), value || '');
    body = body.replace(new RegExp(key, 'g'), value || '');
  });

  return { subject, body };
};

// UNIVERSAL: Get email content from template or step template
// This ensures ALL steps use editable email templates
const getUniversalEmailContent = async (prisma, emailType, candidate, stepTemplate = null, customData = {}) => {
  // Get company config from database
  const companyConfig = await getCompanyConfig(prisma);
  
  // Get custom placeholders from database
  const customPlaceholders = await getCustomPlaceholders(prisma);
  
  // Priority 1: If step template has a linked email template (emailTemplateId), use that specific template
  if (stepTemplate && stepTemplate.emailTemplateId && stepTemplate.emailTemplate) {
    const emailTemplate = stepTemplate.emailTemplate;
    logger.info(`Using linked email template: ${emailTemplate.name} (${emailTemplate.type})`);
    
    let subject = emailTemplate.subject;
    let body = emailTemplate.body;

    // Replace placeholders
    const placeholders = {
      '{{firstName}}': candidate.firstName,
      '{{lastName}}': candidate.lastName,
      '{{fullName}}': `${candidate.firstName} ${candidate.lastName}`,
      '{{candidateName}}': `${candidate.firstName} ${candidate.lastName}`,
      '{{email}}': candidate.email,
      '{{position}}': candidate.position,
      '{{department}}': candidate.department,
      '{{salary}}': candidate.salary || '',
      '{{joiningDate}}': candidate.expectedJoiningDate?.toLocaleDateString() || '',
      '{{reportingManager}}': candidate.reportingManager || '',
      '{{hrName}}': companyConfig.hr_name || process.env.HR_NAME || 'HR Team',
      '{{companyName}}': companyConfig.company_name || process.env.COMPANY_NAME || 'Company',
      ...customData,
      ...customPlaceholders // Add custom placeholders (e.g., {{googleMeetLink}}, etc.)
    };

    // Add custom fields as placeholders (e.g., {{address}}, {{emergencyContact}}, etc.)
    if (candidate.customFields && typeof candidate.customFields === 'object') {
      Object.entries(candidate.customFields).forEach(([fieldKey, fieldValue]) => {
        // Convert fieldKey to placeholder format: address -> {{address}}
        const placeholderKey = `{{${fieldKey}}}`;
        placeholders[placeholderKey] = fieldValue || '';
      });
    }

    Object.entries(placeholders).forEach(([key, value]) => {
      subject = subject.replace(new RegExp(key, 'g'), value || '');
      body = body.replace(new RegExp(key, 'g'), value || '');
    });

    return { subject, body };
  }

  // If no linked template, throw error - steps MUST use existing templates
  throw new Error(`No email template found. Step must have an email template assigned. Email type: ${emailType}`);
};

// Default templates
const getDefaultTemplate = (type, candidate, customData) => {
  const templates = {
    OFFER_LETTER: {
      subject: `Offer Letter - ${candidate.position} at Iron Lady`,
      body: `
Dear ${candidate.firstName},

We are pleased to extend an offer for the position of ${candidate.position} at Iron Lady.

Please find attached your offer letter with complete details regarding compensation, benefits, and other terms of employment.

Your expected joining date is ${candidate.expectedJoiningDate?.toLocaleDateString() || 'To be confirmed'}.

Please review the offer letter carefully and return a signed copy at your earliest convenience.

If you have any questions, please don't hesitate to reach out.

We look forward to welcoming you to the Iron Lady team!

Best regards,
HR Team
Iron Lady
      `.trim()
    },
    OFFER_REMINDER: {
      subject: `Reminder: Pending Offer Letter - ${candidate.position}`,
      body: `
Dear ${candidate.firstName},

This is a gentle reminder regarding the offer letter we sent for the position of ${candidate.position} at Iron Lady.

We noticed that we haven't received your signed offer letter yet. If you have any questions or concerns about the offer, please feel free to reach out.

We would appreciate receiving your signed offer letter at your earliest convenience.

Best regards,
HR Team
Iron Lady
      `.trim()
    },
    WELCOME_DAY_MINUS_1: {
      subject: `Looking Forward to Your Journey with Iron Lady!`,
      body: `
Dear ${candidate.firstName},

Welcome aboard! We are thrilled that you will be joining us tomorrow as ${candidate.position}.

Here's what to expect on your first day:
- HR Induction at 9:30 AM
- Introduction to the team
- Setup of your workstation and accounts

Please ensure you have the following documents ready:
- Government ID proof
- Address proof
- Educational certificates
- Previous employment documents (if applicable)

If you have any questions before your first day, feel free to reach out.

We can't wait to have you on the team!

Best regards,
HR Team
Iron Lady
      `.trim()
    },
    ONBOARDING_FORM: {
      subject: `Complete Your Onboarding Form - Iron Lady`,
      body: `
Dear ${candidate.firstName},

Welcome to Iron Lady! We hope your first day is going well.

To complete your onboarding process, please fill out the HR Onboarding Form at your earliest convenience. This form collects important information needed for:
- Payroll setup
- System access
- Statutory compliance

Please click the link below to access the form:
${customData['{{formLink}}'] || '[Form Link]'}

Kindly complete this within 24 hours of joining.

Best regards,
HR Team
Iron Lady
      `.trim()
    },
    FORM_REMINDER: {
      subject: `Reminder: Complete Your Onboarding Form`,
      body: `
Dear ${candidate.firstName},

This is a friendly reminder to complete your HR Onboarding Form if you haven't already.

Your timely submission helps us:
- Process your payroll on time
- Set up your system access
- Complete statutory formalities

Please access the form here:
${customData['{{formLink}}'] || '[Form Link]'}

If you've already submitted, please ignore this reminder.

Best regards,
HR Team
Iron Lady
      `.trim()
    },
    TRAINING_PLAN: {
      subject: `Your One-Week Training Plan - Iron Lady`,
      body: `
Dear ${candidate.firstName},

Now that you've completed your initial inductions, here's your structured one-week training plan to help you get up to speed quickly.

${customData['{{trainingPlanContent}}'] || `
Day 1-2: Company Overview & Culture
- Understanding Iron Lady's mission and values
- Team introductions and org structure

Day 3-4: Role-Specific Training
- Deep dive into your responsibilities
- Tools and systems training

Day 5-6: Hands-on Practice
- Shadowing sessions
- Practical assignments

Day 7: Review & Planning
- Progress discussion
- Goal setting for the next month
`}

Feel free to reach out if you have any questions or need clarification on any topic.

Best regards,
HR Team
Iron Lady
      `.trim()
    }
  };

  return templates[type] || { subject: 'Notification', body: 'Please check your dashboard for updates.' };
};

// Add tracking to email body
const addTracking = (body, trackingId, backendUrl) => {
  const trackingPixel = `<img src="${backendUrl}/api/track/open/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
  return `${body}\n\n${trackingPixel}`;
};

// Send email function
const sendEmail = async (prisma, emailRecord, candidate, attachments = []) => {
  try {
    // Get SMTP credentials (from database if available, else from env)
    let smtpUser = process.env.SMTP_USER;
    let smtpPass = process.env.SMTP_PASS;
    
    if (prisma) {
      try {
        const smtpConfigs = await prisma.workflowConfig.findMany({
          where: {
            key: {
              in: ['smtp_user', 'smtp_pass']
            }
          }
        });
        const smtpConfigMap = {};
        smtpConfigs.forEach(c => { smtpConfigMap[c.key] = c.value; });
        
        if (smtpConfigMap.smtp_user) {
          smtpUser = smtpConfigMap.smtp_user;
        }
        if (smtpConfigMap.smtp_pass) {
          smtpPass = smtpConfigMap.smtp_pass;
        }
      } catch (error) {
        logger.warn('Could not fetch SMTP credentials from database, using env vars');
      }
    }
    
    // Validate SMTP configuration (check both database and env)
    if (!smtpHost || !smtpUser || !smtpPass) {
      const errorMsg = 'SMTP configuration is missing. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env file or update HR email with SMTP credentials in Settings.';
      logger.error(`❌ ${errorMsg}`);
      logger.error(`Current SMTP config - Host: ${smtpHost || 'NOT SET'}, User: ${smtpUser ? 'SET' : 'NOT SET'}, Pass: ${smtpPass ? 'SET' : 'NOT SET'}`);
      logger.error(`Source - Host: ${smtpHost ? (smtpHost === process.env.SMTP_HOST ? 'env' : 'database') : 'NOT SET'}, User: ${smtpUser ? (smtpUser === process.env.SMTP_USER ? 'env' : 'database') : 'NOT SET'}`);
      
      // Update email record with error
      await prisma.email.update({
        where: { id: emailRecord.id },
        data: {
          status: 'FAILED',
          errorMessage: errorMsg
        }
      }).catch(e => logger.error('Failed to update email record:', e));
      
      throw new Error(errorMsg);
    }
    
    // Log which source we're using (for debugging)
    logger.info(`📧 Using SMTP - Host: ${smtpHost} (${smtpHost === process.env.SMTP_HOST ? 'env' : 'database'}), User: ${smtpUser} (${smtpUser === process.env.SMTP_USER ? 'env' : 'database'}), Port: ${smtpPort}, Secure: ${smtpSecure}`);

    // Create dynamic transporter with current credentials
    const dynamicTransporter = await createTransporter(prisma);

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    
    // Get HR email from database (WorkflowConfig) - ALWAYS fetch fresh from database
    const companyConfig = await getCompanyConfig(prisma);
    const hrEmail = companyConfig.hr_email || process.env.HR_EMAIL || process.env.EMAIL_FROM || smtpUser;
    const hrName = companyConfig.hr_name || process.env.HR_NAME || 'HR Team';
    
    // Log what we're using for debugging
    logger.info(`📧 HR Email Configuration - Database hr_email: ${companyConfig.hr_email || 'NOT SET'}, Using: ${hrEmail}`);
    logger.info(`📧 HR Name Configuration - Database hr_name: ${companyConfig.hr_name || 'NOT SET'}, Using: ${hrName}`);
    logger.info(`📧 SMTP Auth User: ${smtpUser} (${smtpUser === process.env.SMTP_USER ? 'from env' : 'from database'})`);
    
    // Format "from" address: "HR Team <hr@company.com>" or just email
    const fromAddress = hrName && hrEmail ? `${hrName} <${hrEmail}>` : hrEmail;
    
    // Add tracking
    let htmlBody = emailRecord.body.replace(/\n/g, '<br>');
    htmlBody = addTracking(htmlBody, emailRecord.trackingId, backendUrl);

    const mailOptions = {
      from: fromAddress,
      to: candidate.email,
      subject: emailRecord.subject,
      html: htmlBody,
      attachments
    };

    logger.info(`📧 Attempting to send email: ${emailRecord.type} to ${candidate.email}`);
    logger.info(`📧 FROM ADDRESS: ${mailOptions.from}`);
    logger.debug(`Email options:`, { from: mailOptions.from, to: mailOptions.to, subject: mailOptions.subject });

    await dynamicTransporter.sendMail(mailOptions);

    // Update email record
    await prisma.email.update({
      where: { id: emailRecord.id },
      data: {
        status: 'SENT',
        sentAt: new Date()
      }
    });

    logger.info(`✅ Email sent successfully: ${emailRecord.type} to ${candidate.email}`);
    return emailRecord;
  } catch (error) {
    logger.error(`❌ Error sending email (${emailRecord.type} to ${candidate.email}):`, error.message);
    logger.error('Full error:', error);
    
    await prisma.email.update({
      where: { id: emailRecord.id },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
        retryCount: { increment: 1 }
      }
    }).catch(updateError => {
      logger.error('Failed to update email record status:', updateError);
    });

    throw error;
  }
};

// ============ EMAIL TYPE FUNCTIONS ============

const sendOfferLetter = async (prisma, candidate, attachmentPath = null) => {
  const content = await getEmailContent(prisma, 'OFFER_LETTER', candidate);
  
  // Use attachment from calendar event if provided, otherwise use candidate's offer letter
  const finalAttachmentPath = attachmentPath || candidate.offerLetterPath;
  
  const emailRecord = await prisma.email.create({
    data: {
      candidateId: candidate.id,
      type: 'OFFER_LETTER',
      subject: content.subject,
      body: content.body,
      attachmentPath: finalAttachmentPath
    }
  });

  const attachments = [];
  if (finalAttachmentPath) {
    // Convert relative path to absolute path
    let filePath = finalAttachmentPath;
    if (!path.isAbsolute(filePath)) {
      // If it's a relative path, resolve it from the uploads directory
      const uploadsDir = path.join(__dirname, '../../uploads');
      filePath = path.join(uploadsDir, filePath);
    }
    
    // Normalize path separators
    filePath = path.normalize(filePath);
    
    if (fs.existsSync(filePath)) {
    attachments.push({
        filename: path.basename(filePath),
        path: filePath
    });
      logger.info(`Attaching offer letter: ${filePath}`);
    } else {
      logger.warn(`Offer letter file not found: ${filePath} (original path: ${finalAttachmentPath})`);
    }
  }

  return sendEmail(prisma, emailRecord, candidate, attachments);
};

const sendOfferReminder = async (prisma, candidate, attachmentPath = null) => {
  // Check if this email type was already sent successfully in the last 24 hours
  const recentEmail = await prisma.email.findFirst({
    where: {
      candidateId: candidate.id,
      type: 'OFFER_REMINDER',
      status: 'SENT',
      sentAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      }
    },
    orderBy: { sentAt: 'desc' }
  });

  if (recentEmail) {
    logger.info(`⏭️ Skipping OFFER_REMINDER email to ${candidate.email} - already sent ${recentEmail.sentAt.toISOString()}`);
    return recentEmail;
  }

  const content = await getEmailContent(prisma, 'OFFER_REMINDER', candidate);
  
  const emailRecord = await prisma.email.create({
    data: {
      candidateId: candidate.id,
      type: 'OFFER_REMINDER',
      subject: content.subject,
      body: content.body,
      attachmentPath: attachmentPath // Universal attachment support
    }
  });

  return sendEmail(prisma, emailRecord, candidate);
};

const sendWelcomeEmail = async (prisma, candidate, attachmentPath = null) => {
  // Check if this email type was already sent successfully
  const recentEmail = await prisma.email.findFirst({
    where: {
      candidateId: candidate.id,
      type: 'WELCOME_DAY_MINUS_1',
      status: 'SENT'
    },
    orderBy: { sentAt: 'desc' }
  });

  if (recentEmail) {
    logger.info(`⏭️ Skipping WELCOME_DAY_MINUS_1 email to ${candidate.email} - already sent ${recentEmail.sentAt?.toISOString() || 'previously'}`);
    return recentEmail;
  }

  const content = await getEmailContent(prisma, 'WELCOME_DAY_MINUS_1', candidate);
  
  const emailRecord = await prisma.email.create({
    data: {
      candidateId: candidate.id,
      type: 'WELCOME_DAY_MINUS_1',
      subject: content.subject,
      body: content.body,
      attachmentPath: attachmentPath // Universal attachment support
    }
  });

  return sendEmail(prisma, emailRecord, candidate);
};

const sendOnboardingForm = async (prisma, candidate, formLink, attachmentPath = null) => {
  // Check if this email type was already sent successfully
  const recentEmail = await prisma.email.findFirst({
    where: {
      candidateId: candidate.id,
      type: 'ONBOARDING_FORM',
      status: 'SENT'
    },
    orderBy: { sentAt: 'desc' }
  });

  if (recentEmail) {
    logger.info(`⏭️ Skipping ONBOARDING_FORM email to ${candidate.email} - already sent ${recentEmail.sentAt?.toISOString() || 'previously'}`);
    return recentEmail;
  }

  const content = await getEmailContent(prisma, 'ONBOARDING_FORM', candidate, {
    '{{formLink}}': formLink
  });
  
  const emailRecord = await prisma.email.create({
    data: {
      candidateId: candidate.id,
      type: 'ONBOARDING_FORM',
      subject: content.subject,
      body: content.body,
      attachmentPath: attachmentPath // Universal attachment support
    }
  });

  // Update candidate
  await prisma.candidate.update({
    where: { id: candidate.id },
    data: { onboardingFormSentAt: new Date() }
  });

  // Schedule form reminder
  const reminderDate = new Date();
  reminderDate.setHours(reminderDate.getHours() + parseInt(process.env.FORM_REMINDER_HOURS || 24));

  await prisma.reminder.create({
    data: {
      candidateId: candidate.id,
      type: 'FORM_FOLLOWUP',
      message: `Follow up on onboarding form for ${candidate.firstName} ${candidate.lastName}`,
      scheduledFor: reminderDate
    }
  });

  return sendEmail(prisma, emailRecord, candidate);
};

const sendFormReminder = async (prisma, candidate, formLink, attachmentPath = null) => {
  const content = await getEmailContent(prisma, 'FORM_REMINDER', candidate, {
    '{{formLink}}': formLink
  });
  
  const emailRecord = await prisma.email.create({
    data: {
      candidateId: candidate.id,
      type: 'FORM_REMINDER',
      subject: content.subject,
      body: content.body,
      attachmentPath: attachmentPath
    }
  });

  const attachments = [];
  if (attachmentPath) {
    // Convert relative path to absolute path
    let filePath = attachmentPath;
    if (!path.isAbsolute(filePath)) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      filePath = path.join(uploadsDir, filePath);
    }
    
    filePath = path.normalize(filePath);
    
    if (fs.existsSync(filePath)) {
      attachments.push({
        filename: path.basename(filePath),
        path: filePath
      });
      logger.info(`Attaching file to form reminder: ${filePath}`);
    } else {
      logger.warn(`Form reminder attachment file not found: ${filePath}`);
    }
  }

  return sendEmail(prisma, emailRecord, candidate, attachments);
};

const sendTrainingPlan = async (prisma, candidate, attachmentPath = null) => {
  // Check if this email type was already sent successfully
  const recentEmail = await prisma.email.findFirst({
    where: {
      candidateId: candidate.id,
      type: 'TRAINING_PLAN',
      status: 'SENT'
    },
    orderBy: { sentAt: 'desc' }
  });

  if (recentEmail) {
    logger.info(`⏭️ Skipping TRAINING_PLAN email to ${candidate.email} - already sent ${recentEmail.sentAt?.toISOString() || 'previously'}`);
    return recentEmail;
  }

  // Get department-specific training plan
  const trainingPlan = await prisma.trainingPlan.findFirst({
    where: {
      OR: [
        { department: candidate.department },
        { department: null }
      ],
      isActive: true
    },
    orderBy: { department: 'desc' } // Prefer department-specific
  });

  let trainingContent = '';
  if (trainingPlan && trainingPlan.dayWiseContent) {
    const days = trainingPlan.dayWiseContent;
    trainingContent = Object.entries(days)
      .map(([day, content]) => `${day}:\n${content}`)
      .join('\n\n');
  }

  const content = await getEmailContent(prisma, 'TRAINING_PLAN', candidate, {
    '{{trainingPlanContent}}': trainingContent
  });
  
  const emailRecord = await prisma.email.create({
    data: {
      candidateId: candidate.id,
      type: 'TRAINING_PLAN',
      subject: content.subject,
      body: content.body,
      attachmentPath: attachmentPath // Universal attachment support
    }
  });

  const attachments = [];
  if (attachmentPath) {
    // Convert relative path to absolute path
    let filePath = attachmentPath;
    if (!path.isAbsolute(filePath)) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      filePath = path.join(uploadsDir, filePath);
    }
    
    filePath = path.normalize(filePath);
    
    if (fs.existsSync(filePath)) {
      attachments.push({
        filename: path.basename(filePath),
        path: filePath
      });
      logger.info(`Attaching file to training plan: ${filePath}`);
    } else {
      logger.warn(`Training plan attachment file not found: ${filePath}`);
    }
  }

  return sendEmail(prisma, emailRecord, candidate, attachments);
};

// UNIVERSAL: Send email using template system (editable templates)
// This is the main function that ALL steps should use
const sendUniversalEmail = async (prisma, candidate, emailType, stepTemplate = null, attachmentPath = null, customData = {}) => {
  try {
    logger.info(`📧 sendUniversalEmail called: emailType=${emailType}, candidate=${candidate.email}, stepTemplate=${stepTemplate ? stepTemplate.title : 'none'}`);
    
    // Get email content from template or step template
    const content = await getUniversalEmailContent(prisma, emailType, candidate, stepTemplate, customData);
    
    if (!content || !content.subject || !content.body) {
      throw new Error(`Failed to get email content for type: ${emailType}`);
    }
    
    logger.info(`✅ Email content retrieved: subject="${content.subject.substring(0, 50)}..."`);
    
    // Validate email type is in enum (map to valid enum value if needed)
    const validEmailTypes = ['OFFER_LETTER', 'OFFER_REMINDER', 'WELCOME_DAY_MINUS_1', 'HR_INDUCTION_INVITE', 
                             'WHATSAPP_TASK', 'ONBOARDING_FORM', 'FORM_REMINDER', 'CEO_INDUCTION_INVITE', 
                             'SALES_INDUCTION_INVITE', 'TRAINING_PLAN', 'CHECKIN_INVITE', 'CUSTOM'];
    
    // If emailType is not in valid list, use CUSTOM
    const finalEmailType = validEmailTypes.includes(emailType) ? emailType : 'CUSTOM';
    if (finalEmailType !== emailType) {
      logger.warn(`⚠️ Email type ${emailType} not in enum, using CUSTOM instead`);
    }
    
    // Handle multiple attachments: attachmentPath can be a string (single) or array (multiple)
    const attachmentPaths = Array.isArray(attachmentPath) ? attachmentPath : (attachmentPath ? [attachmentPath] : []);
    const singleAttachmentPath = attachmentPaths.length > 0 ? attachmentPaths[0] : null; // For backward compatibility
    
    const emailRecord = await prisma.email.create({
      data: {
        candidateId: candidate.id,
        type: finalEmailType,
        subject: content.subject,
        body: content.body,
        attachmentPath: singleAttachmentPath, // Single attachment (backward compatibility)
        attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : null // Multiple attachments
      }
    });
    
    logger.info(`✅ Email record created: id=${emailRecord.id}, type=${finalEmailType}`);

    // Process all attachments (support both single and multiple)
    const attachments = [];
    for (const attPath of attachmentPaths) {
      if (!attPath) continue;
      
      // Convert relative path to absolute path
      let filePath = attPath;
      if (!path.isAbsolute(filePath)) {
        const uploadsDir = path.join(__dirname, '../../uploads');
        filePath = path.join(uploadsDir, filePath);
      }
      
      filePath = path.normalize(filePath);
      
      if (fs.existsSync(filePath)) {
        attachments.push({
          filename: path.basename(filePath),
          path: filePath
        });
        logger.info(`✅ Attaching file: ${filePath}`);
      } else {
        logger.warn(`⚠️ Attachment file not found: ${filePath}`);
      }
    }
    
    if (attachments.length > 0) {
      logger.info(`📎 Total ${attachments.length} attachment(s) will be sent with email`);
    }

    logger.info(`📤 Attempting to send email via sendEmail function...`);
    logger.info(`📧 Email details: id=${emailRecord.id}, to=${candidate.email}, subject="${emailRecord.subject.substring(0, 50)}..."`);
    
    try {
      const result = await sendEmail(prisma, emailRecord, candidate, attachments);
      logger.info(`✅ sendUniversalEmail completed successfully for ${candidate.email}`);
      return result;
    } catch (sendError) {
      logger.error(`❌ sendEmail threw error in sendUniversalEmail:`, sendError.message);
      logger.error(`❌ Error details:`, sendError);
      // Re-throw so the error propagates and is caught by the outer catch
      throw sendError;
    }
  } catch (error) {
    logger.error(`❌ sendUniversalEmail failed for ${candidate.email} (type: ${emailType}):`, error.message);
    logger.error('Full error stack:', error.stack);
    throw error; // Re-throw to let caller handle it
  }
};

const sendCustomEmail = async (prisma, candidate, subject, body, attachmentPath = null) => {
  const emailRecord = await prisma.email.create({
    data: {
      candidateId: candidate.id,
      type: 'CUSTOM',
      subject,
      body,
      attachmentPath
    }
  });

  const attachments = [];
  if (attachmentPath) {
    // Convert relative path to absolute path
    let filePath = attachmentPath;
    if (!path.isAbsolute(filePath)) {
      // If it's a relative path, resolve it from the uploads directory
      const uploadsDir = path.join(__dirname, '../../uploads');
      filePath = path.join(uploadsDir, filePath);
    }
    
    // Normalize path separators
    filePath = path.normalize(filePath);
    
    if (fs.existsSync(filePath)) {
    attachments.push({
        filename: path.basename(filePath),
        path: filePath
    });
      logger.info(`Attaching file: ${filePath}`);
    } else {
      logger.warn(`Attachment file not found: ${filePath} (original path: ${attachmentPath})`);
    }
  }

  return sendEmail(prisma, emailRecord, candidate, attachments);
};

// Send calendar invite email
const sendCalendarInvite = async (prisma, candidate, eventDetails) => {
  const subject = `Calendar Invite: ${eventDetails.title}`;
  const body = `
Dear ${candidate.firstName},

You have been invited to: ${eventDetails.title}

Date: ${eventDetails.startTime.toLocaleDateString()}
Time: ${eventDetails.startTime.toLocaleTimeString()} - ${eventDetails.endTime.toLocaleTimeString()}
${eventDetails.meetingLink ? `Meeting Link: ${eventDetails.meetingLink}` : ''}
${eventDetails.location ? `Location: ${eventDetails.location}` : ''}

${eventDetails.description || ''}

Please add this to your calendar.

Best regards,
HR Team
Iron Lady
  `.trim();

  const emailRecord = await prisma.email.create({
    data: {
      candidateId: candidate.id,
      type: eventDetails.emailType || 'CUSTOM',
      subject,
      body
    }
  });

  return sendEmail(prisma, emailRecord, candidate);
};

module.exports = {
  sendOfferLetter,
  sendOfferReminder,
  sendWelcomeEmail,
  sendOnboardingForm,
  sendFormReminder,
  sendTrainingPlan,
  sendCustomEmail,
  sendUniversalEmail, // UNIVERSAL function for all steps
  sendCalendarInvite,
  getEmailContent,
  getUniversalEmailContent, // UNIVERSAL content getter
  transporter
};
