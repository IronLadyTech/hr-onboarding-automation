const cron = require('node-cron');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const stepService = require('../services/stepService');

let prisma;
let transporter;

// ============================================================
// IRON LADY HR ONBOARDING - FULL 11-STEP AUTOMATION
// ============================================================
// Step 1:  Offer Letter Email (Manual upload + click send)
// Step 2:  Offer Reminder (Auto - if not signed in X days)
// Step 3:  Day -1 Welcome Email (Auto - one day before joining)
// Step 4:  Day 0 HR Induction 9:30 AM (Auto - calendar invite)
// Step 5:  WhatsApp Group Task (Auto - task with groups list)
// Step 6:  Onboarding Form Email (Auto - 1 hour after joining)
// Step 7:  Form Reminder (Auto - if not submitted in 24h)
// Step 8:  CEO Induction (Semi-auto - HR confirms time)
// Step 9:  Sales Induction (Semi-auto - for sales roles)
// Step 10: Training Plan Email (Auto - Day 3)
// Step 11: HR Check-in Call (Auto - Day 7)
// ============================================================

const initScheduledJobs = (prismaClient) => {
  prisma = prismaClient;
  
  // Initialize email transporter
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  // Verify transporter
  transporter.verify((error, success) => {
    if (error) {
      logger.error('SMTP connection error:', error);
    } else {
      logger.info('SMTP Server ready');
    }
  });

  // ========== CRON JOBS ==========
  
  // Every 5 minutes - Process pending emails (only sends queued emails, doesn't trigger steps)
  cron.schedule('*/5 * * * *', async () => {
    await sendPendingEmails();
  });

  // Every 1 minute - Check for calendar events that should auto-complete steps
  // This ONLY completes steps when calendar events pass their scheduled time
  // Reduced to 1 minute for faster email delivery (max 1 minute delay)
  cron.schedule('* * * * *', async () => {
    logger.info('Running calendar event auto-completion check...');
    await autoCompleteCalendarSteps();
  });

  // At 6:00 AM - Mark candidates as joined (status update only, doesn't trigger steps)
  cron.schedule('0 6 * * *', async () => {
    logger.info('Running 6 AM status update...');
    await markCandidatesAsJoined();  // Pre-Day 0 status update only
  });

  // ============================================================
  // AUTOMATIC STEP TRIGGERS DISABLED
  // Steps will ONLY complete when:
  // 1. Calendar event time passes (handled by autoCompleteCalendarSteps)
  // 2. User manually clicks "Send" button
  // ============================================================
  
  // DISABLED: Every 30 minutes - Check for automated triggers
  // cron.schedule('*/30 * * * *', async () => {
  //   logger.info('Running 30-minute automation check...');
  //   await checkOfferReminders();      // Step 2
  //   await checkFormReminders();        // Step 7
  // });

  // DISABLED: At 6:00 AM - Daily morning automation
  // cron.schedule('0 6 * * *', async () => {
  //   logger.info('Running 6 AM daily automation...');
  //   await sendDayMinus1WelcomeEmails();  // Step 3
  // });

  // DISABLED: At 9:00 AM - Day 0 automations
  // cron.schedule('0 9 * * *', async () => {
  //   logger.info('Running 9 AM Day 0 automation...');
  //   await processDayZeroAutomations();  // Steps 4, 5
  // });

  // DISABLED: At 10:30 AM - Onboarding form email
  // cron.schedule('30 10 * * *', async () => {
  //   logger.info('Running 10:30 AM Onboarding Form automation...');
  //   await sendOnboardingForms();  // Step 6
  // });

  // DISABLED: At 9:00 AM - Training Plan (Day 3) & Check-in (Day 7)
  // cron.schedule('0 9 * * *', async () => {
  //   await sendTrainingPlans();     // Step 10
  //   await scheduleCheckInCalls();  // Step 11
  // });

  logger.info('Scheduled jobs initialized - Only calendar event auto-completion enabled');
};

// ============================================================
// STEP 2: OFFER LETTER REMINDER
// ============================================================
const checkOfferReminders = async () => {
  try {
    const config = await getConfig();
    if (config.step2_offer_reminder_enabled !== 'true') return;

    const reminderDays = parseInt(config.step2_reminder_days) || 3;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - reminderDays);

    const candidates = await prisma.candidate.findMany({
      where: {
        offerSentAt: { lte: cutoffDate },
        offerSignedAt: null,
        offerReminderSent: { not: true },
        status: { in: ['OFFER_SENT', 'OFFER_VIEWED'] }
      }
    });

    for (const candidate of candidates) {
      await createEmail(candidate, 'OFFER_REMINDER', config);
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { offerReminderSent: true }
      });
      await logActivity(candidate.id, 'OFFER_REMINDER_SENT', 'Step 2: Automated offer reminder sent');
      logger.info(`Step 2: Offer reminder queued for ${candidate.email}`);
    }
  } catch (error) {
    logger.error('Step 2 Error:', error);
  }
};

// ============================================================
// STEP 3: DAY -1 WELCOME EMAIL
// ============================================================
const sendDayMinus1WelcomeEmails = async () => {
  try {
    const config = await getConfig();
    if (config.step3_welcome_email_enabled !== 'true') return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const candidates = await prisma.candidate.findMany({
      where: {
        expectedJoiningDate: { gte: tomorrow, lt: dayAfter },
        offerSignedAt: { not: null },
        welcomeEmailSentAt: null,
        status: { in: ['OFFER_ACCEPTED', 'OFFER_SIGNED', 'READY_TO_JOIN'] }
      }
    });

    for (const candidate of candidates) {
      await createEmail(candidate, 'WELCOME_DAY_MINUS_1', config);
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { welcomeEmailSentAt: new Date(), status: 'READY_TO_JOIN' }
      });
      await logActivity(candidate.id, 'WELCOME_EMAIL_SENT', 'Step 3: Day -1 welcome email sent automatically');
      logger.info(`Step 3: Welcome email queued for ${candidate.email}`);
    }
  } catch (error) {
    logger.error('Step 3 Error:', error);
  }
};

// ============================================================
// MARK CANDIDATES AS JOINED (Pre-Day 0)
// ============================================================
const markCandidatesAsJoined = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const candidates = await prisma.candidate.findMany({
      where: {
        expectedJoiningDate: { gte: today, lt: tomorrow },
        offerSignedAt: { not: null },
        status: { in: ['READY_TO_JOIN', 'OFFER_ACCEPTED', 'OFFER_SIGNED'] }
      }
    });

    for (const candidate of candidates) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { status: 'JOINED', actualJoiningDate: new Date() }
      });
      await logActivity(candidate.id, 'CANDIDATE_JOINED', 'Candidate marked as JOINED on joining day');
      logger.info(`Candidate ${candidate.email} marked as JOINED`);
    }
  } catch (error) {
    logger.error('Mark Joined Error:', error);
  }
};

// ============================================================
// STEPS 4 & 5: DAY 0 AUTOMATIONS
// ============================================================
const processDayZeroAutomations = async () => {
  try {
    const config = await getConfig();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const candidates = await prisma.candidate.findMany({
      where: {
        actualJoiningDate: { gte: today, lt: tomorrow },
        status: 'JOINED',
        hrInductionScheduled: { not: true }
      }
    });

    for (const candidate of candidates) {
      // Step 4: HR Induction
      if (config.step4_hr_induction_enabled === 'true') {
        await scheduleHRInduction(candidate, config);
      }

      // Step 5: WhatsApp Task
      if (config.step5_whatsapp_task_enabled === 'true') {
        await createWhatsAppTask(candidate, config);
      }

      logger.info(`Day 0 automations completed for ${candidate.email}`);
    }
  } catch (error) {
    logger.error('Day 0 Error:', error);
  }
};

// ============================================================
// STEP 4: HR INDUCTION CALENDAR INVITE
// ============================================================
const scheduleHRInduction = async (candidate, config) => {
  try {
    const inductionTime = config.step4_hr_induction_time || '09:30';
    const duration = parseInt(config.step4_hr_induction_duration) || 90;
    const meetingLink = config.step4_hr_induction_link || '';

    const [hours, minutes] = inductionTime.split(':');
    const startTime = new Date();
    startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);

    await prisma.calendarEvent.create({
      data: {
        candidateId: candidate.id,
        type: 'HR_INDUCTION',
        title: `HR Induction - ${candidate.firstName} ${candidate.lastName}`,
        description: `HR Induction Session\n\nMeeting Link: ${meetingLink}\n\nTopics:\n- Company overview & culture\n- Policies and procedures\n- Benefits and payroll\n- Tools and systems access\n- Q&A session`,
        startTime,
        endTime,
        location: meetingLink || 'Office - HR Room',
        attendees: [candidate.email, config.hr_email].filter(Boolean).join(','),
        status: 'SCHEDULED'
      }
    });

    await createEmail(candidate, 'HR_INDUCTION_INVITE', config, { meetingLink, startTime: inductionTime, duration });
    
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { hrInductionScheduled: true }
    });

    await logActivity(candidate.id, 'HR_INDUCTION_SCHEDULED', `Step 4: HR Induction scheduled at ${inductionTime}`);
    logger.info(`Step 4: HR Induction scheduled for ${candidate.email}`);
  } catch (error) {
    logger.error('Step 4 Error:', error);
  }
};

// ============================================================
// STEP 5: WHATSAPP GROUP TASK
// ============================================================
const createWhatsAppTask = async (candidate, config) => {
  try {
    const groups = await prisma.whatsAppGroup.findMany();
    const relevantGroups = groups.filter(g => 
      g.department === 'ALL' || 
      g.department === candidate.department ||
      g.name.includes('All Hands') ||
      g.name.includes('New Joiner')
    );

    const groupsList = relevantGroups.length > 0 
      ? relevantGroups.map(g => `• ${g.name}`).join('\n')
      : `• All Hands\n• ${candidate.department} Team\n• New Joiners`;

    const introTemplate = config.step5_whatsapp_intro_template || 
      `Hi Team! 👋\n\nPlease welcome our new team member:\n\n*Name:* {{firstName}} {{lastName}}\n*Position:* {{position}}\n*Department:* {{department}}\n\nPlease extend a warm welcome! 🎉`;

    const introMessage = replacePlaceholders(introTemplate, candidate, config);

    await prisma.task.create({
      data: {
        candidateId: candidate.id,
        type: 'WHATSAPP_ADDITION',
        title: `Add ${candidate.firstName} ${candidate.lastName} to WhatsApp Groups`,
        description: `📱 Please add the new employee to these WhatsApp groups:\n\n${groupsList}\n\n📋 CANDIDATE DETAILS:\n• Name: ${candidate.firstName} ${candidate.lastName}\n• Phone: ${candidate.phone || 'Not provided'}\n• Department: ${candidate.department}\n• Position: ${candidate.position}\n\n📝 INTRODUCTION MESSAGE (Copy & Paste):\n\n${introMessage}`,
        priority: 'HIGH',
        dueDate: new Date(),
        status: 'PENDING',
        metadata: JSON.stringify({
          groups: relevantGroups.map(g => g.name),
          introMessage,
          phone: candidate.phone
        })
      }
    });

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { whatsappTaskCreated: true }
    });

    await logActivity(candidate.id, 'WHATSAPP_TASK_CREATED', `Step 5: WhatsApp task created with ${relevantGroups.length} groups`);
    logger.info(`Step 5: WhatsApp task created for ${candidate.email}`);
  } catch (error) {
    logger.error('Step 5 Error:', error);
  }
};

// ============================================================
// STEP 6: ONBOARDING FORM EMAIL
// ============================================================
const sendOnboardingForms = async () => {
  try {
    const config = await getConfig();
    if (config.step6_onboarding_form_enabled !== 'true') return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const candidates = await prisma.candidate.findMany({
      where: {
        actualJoiningDate: { gte: today, lt: tomorrow },
        onboardingFormSentAt: null,
        status: 'JOINED'
      }
    });

    for (const candidate of candidates) {
      const formLink = config.step6_onboarding_form_url || '';
      await createEmail(candidate, 'ONBOARDING_FORM', config, { formLink });
      
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { onboardingFormSentAt: new Date() }
      });

      // Schedule reminder for 24 hours later (Step 7)
      const reminderTime = new Date();
      reminderTime.setHours(reminderTime.getHours() + 24);
      await prisma.reminder.create({
        data: {
          candidateId: candidate.id,
          type: 'FORM_FOLLOWUP',
          message: 'Onboarding form reminder',
          scheduledFor: reminderTime,
          status: 'PENDING'
        }
      });

      await logActivity(candidate.id, 'ONBOARDING_FORM_SENT', 'Step 6: Onboarding form email sent automatically');
      logger.info(`Step 6: Onboarding form queued for ${candidate.email}`);
    }
  } catch (error) {
    logger.error('Step 6 Error:', error);
  }
};

// ============================================================
// STEP 7: FORM REMINDER
// ============================================================
const checkFormReminders = async () => {
  try {
    const config = await getConfig();
    if (config.step7_form_reminder_enabled !== 'true') return;

    const reminders = await prisma.reminder.findMany({
      where: {
        type: 'FORM_FOLLOWUP',
        status: 'PENDING',
        scheduledFor: { lte: new Date() }
      },
      include: { candidate: true }
    });

    for (const reminder of reminders) {
      if (!reminder.candidate.onboardingFormCompletedAt) {
        const formLink = config.step6_onboarding_form_url || '';
        await createEmail(reminder.candidate, 'FORM_REMINDER', config, { formLink });
        await logActivity(reminder.candidate.id, 'FORM_REMINDER_SENT', 'Step 7: Form reminder sent automatically');
        logger.info(`Step 7: Form reminder queued for ${reminder.candidate.email}`);
      }

      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: 'SENT', sentAt: new Date() }
      });
    }
  } catch (error) {
    logger.error('Step 7 Error:', error);
  }
};

// ============================================================
// STEP 10: TRAINING PLAN EMAIL
// ============================================================
const sendTrainingPlans = async () => {
  try {
    const config = await getConfig();
    if (config.step10_training_plan_enabled !== 'true') return;

    const trainingDay = parseInt(config.step10_training_day) || 3;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - trainingDay);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const candidates = await prisma.candidate.findMany({
      where: {
        actualJoiningDate: { gte: targetDate, lt: nextDay },
        trainingPlanSent: { not: true },
        status: { in: ['JOINED', 'ONBOARDING'] }
      }
    });

    for (const candidate of candidates) {
      const trainingPlan = await prisma.trainingPlan.findFirst({
        where: {
          OR: [{ department: candidate.department }, { department: 'ALL' }],
          isActive: true
        },
        orderBy: { department: 'desc' }
      });

      let trainingContent = 'Your personalized training plan will be shared by your manager.';
      if (trainingPlan?.content) {
        try {
          const content = typeof trainingPlan.content === 'string' 
            ? JSON.parse(trainingPlan.content) 
            : trainingPlan.content;
          trainingContent = content.map((day, i) => `📅 Day ${i + 1}: ${day.title}\n   ${day.description}`).join('\n\n');
        } catch (e) {}
      }

      await createEmail(candidate, 'TRAINING_PLAN', config, { trainingContent });
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { trainingPlanSent: true }
      });
      await logActivity(candidate.id, 'TRAINING_PLAN_SENT', 'Step 10: Training plan sent automatically');
      logger.info(`Step 10: Training plan queued for ${candidate.email}`);
    }
  } catch (error) {
    logger.error('Step 10 Error:', error);
  }
};

// ============================================================
// STEP 11: HR CHECK-IN CALL
// ============================================================
const scheduleCheckInCalls = async () => {
  try {
    const config = await getConfig();
    if (config.step11_checkin_call_enabled !== 'true') return;

    const checkinDay = parseInt(config.step11_checkin_day) || 7;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - checkinDay);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const candidates = await prisma.candidate.findMany({
      where: {
        actualJoiningDate: { gte: targetDate, lt: nextDay },
        checkinScheduled: { not: true },
        status: { in: ['JOINED', 'ONBOARDING'] }
      }
    });

    for (const candidate of candidates) {
      const checkinTime = config.step11_checkin_time || '10:00';
      const duration = parseInt(config.step11_checkin_duration) || 30;

      const [hours, minutes] = checkinTime.split(':');
      const startTime = new Date();
      startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + duration);

      await prisma.calendarEvent.create({
        data: {
          candidateId: candidate.id,
          type: 'HR_CHECKIN',
          title: `HR Check-in Call - ${candidate.firstName} ${candidate.lastName}`,
          description: `One-Week Check-in Call\n\nTopics:\n- How is the first week going?\n- Any challenges or concerns?\n- Do you have everything you need?\n- Feedback on onboarding\n- Questions or support needed?`,
          startTime,
          endTime,
          location: 'Phone/Video Call',
          attendees: [candidate.email, config.hr_email].filter(Boolean).join(','),
          status: 'SCHEDULED'
        }
      });

      await prisma.checkIn.create({
        data: {
          candidateId: candidate.id,
          type: 'WEEK_1',
          scheduledDate: startTime,
          isCompleted: false
        }
      });

      await createEmail(candidate, 'CHECKIN_INVITE', config, { dateTime: startTime.toLocaleString('en-IN'), duration });
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { checkinScheduled: true }
      });
      await logActivity(candidate.id, 'CHECKIN_SCHEDULED', `Step 11: Check-in call scheduled for ${checkinTime}`);
      logger.info(`Step 11: Check-in scheduled for ${candidate.email}`);
    }
  } catch (error) {
    logger.error('Step 11 Error:', error);
  }
};

// ============================================================
// STEP 8: CEO INDUCTION (Called from routes - semi-auto)
// ============================================================
const scheduleCEOInduction = async (candidateId, dateTime) => {
  try {
    const config = await getConfig();
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new Error('Candidate not found');

    const duration = parseInt(config.step8_ceo_induction_duration) || 60;
    const startTime = new Date(dateTime);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);
    const ceoName = config.ceo_name || 'CEO';
    const ceoEmail = config.ceo_email || '';

    await prisma.calendarEvent.create({
      data: {
        candidateId: candidate.id,
        type: 'CEO_INDUCTION',
        title: `CEO Induction with ${ceoName} - ${candidate.firstName} ${candidate.lastName}`,
        description: `CEO Induction Session\n\nTopics:\n- Company vision and mission\n- Strategic direction\n- Leadership values\n- Q&A with CEO`,
        startTime,
        endTime,
        location: 'CEO Office / Video Call',
        attendees: [candidate.email, ceoEmail, config.hr_email].filter(Boolean).join(','),
        status: 'SCHEDULED'
      }
    });

    await createEmail(candidate, 'CEO_INDUCTION_INVITE', config, { ceoName, dateTime: startTime.toLocaleString('en-IN'), duration });
    await prisma.candidate.update({ where: { id: candidate.id }, data: { ceoInductionScheduled: true } });
    await logActivity(candidate.id, 'CEO_INDUCTION_SCHEDULED', `Step 8: CEO Induction scheduled`);
    
    return { success: true };
  } catch (error) {
    logger.error('Step 8 Error:', error);
    throw error;
  }
};

// ============================================================
// STEP 9: SALES INDUCTION (Called from routes - semi-auto)
// ============================================================
const scheduleSalesInduction = async (candidateId, dateTime) => {
  try {
    const config = await getConfig();
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new Error('Candidate not found');

    const salesDepts = (config.step9_sales_induction_departments || 'Sales,BD,Marketing').split(',').map(d => d.trim().toLowerCase());
    if (!salesDepts.some(d => candidate.department.toLowerCase().includes(d))) {
      return { success: false, message: 'Not applicable for this department' };
    }

    const duration = parseInt(config.step9_sales_induction_duration) || 90;
    const startTime = new Date(dateTime);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);
    const salesHeadName = config.sales_head_name || 'Sales Head';
    const salesHeadEmail = config.sales_head_email || '';

    await prisma.calendarEvent.create({
      data: {
        candidateId: candidate.id,
        type: 'SALES_INDUCTION',
        title: `Sales Induction with ${salesHeadName} - ${candidate.firstName} ${candidate.lastName}`,
        description: `Sales Induction Session\n\nTopics:\n- Sales processes and workflows\n- CRM systems\n- Targets and KPIs\n- Client management`,
        startTime,
        endTime,
        location: 'Sales Floor / Video Call',
        attendees: [candidate.email, salesHeadEmail, config.hr_email].filter(Boolean).join(','),
        status: 'SCHEDULED'
      }
    });

    await createEmail(candidate, 'SALES_INDUCTION_INVITE', config, { salesHeadName, dateTime: startTime.toLocaleString('en-IN'), duration });
    await prisma.candidate.update({ where: { id: candidate.id }, data: { salesInductionScheduled: true } });
    await logActivity(candidate.id, 'SALES_INDUCTION_SCHEDULED', `Step 9: Sales Induction scheduled`);
    
    return { success: true };
  } catch (error) {
    logger.error('Step 9 Error:', error);
    throw error;
  }
};

// ============================================================
// EMAIL PROCESSOR - Sends all pending emails
// ============================================================
const sendPendingEmails = async () => {
  try {
    // Validate SMTP configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.error('SMTP configuration is missing. Cannot send pending emails. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env file.');
      return;
    }

    const emails = await prisma.email.findMany({
      where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
      take: 20,
      include: { candidate: true }
    });

    if (emails.length === 0) {
      logger.debug('No pending emails to send');
      return;
    }

    logger.info(`📧 Processing ${emails.length} pending email(s)...`);

    for (const email of emails) {
      try {
        logger.info(`Attempting to send pending email: ${email.type} to ${email.toEmail}`);
        
        await transporter.sendMail({
          from: email.fromEmail || process.env.EMAIL_FROM || process.env.SMTP_USER,
          to: email.toEmail,
          subject: email.subject,
          html: email.body
        });

        await prisma.email.update({
          where: { id: email.id },
          data: { status: 'SENT', sentAt: new Date() }
        });
        logger.info(`✅ Email sent: ${email.type} to ${email.toEmail}`);
      } catch (err) {
        logger.error(`❌ Email failed: ${email.id} (${email.type} to ${email.toEmail})`, err.message);
        logger.error('Full error:', err);
        
        await prisma.email.update({
          where: { id: email.id },
          data: { status: 'FAILED', error: err.message }
        }).catch(updateError => {
          logger.error('Failed to update email record status:', updateError);
        });
      }
    }
  } catch (error) {
    logger.error('Email Processor Error:', error);
    logger.error('Stack trace:', error.stack);
  }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================
const getConfig = async () => {
  const configs = await prisma.workflowConfig.findMany();
  const map = {};
  configs.forEach(c => { map[c.key] = c.value; });
  return map;
};

const getTemplate = async (type) => {
  const template = await prisma.emailTemplate.findFirst({ where: { type, isActive: true } });
  return template || { 
    subject: type.replace(/_/g, ' '), 
    body: `<p>Email template for ${type} not found. Please configure in Settings.</p>` 
  };
};

const createEmail = async (candidate, type, config, extra = {}) => {
  const template = await getTemplate(type);
  const subject = replacePlaceholders(template.subject, candidate, config, extra);
  const body = replacePlaceholders(template.body, candidate, config, extra);

  await prisma.email.create({
    data: {
      candidateId: candidate.id,
      type,
      subject,
      body,
      toEmail: candidate.email,
      fromEmail: config.hr_email || process.env.SMTP_USER,
      status: 'PENDING',
      scheduledFor: new Date()
    }
  });
};

const replacePlaceholders = (text, candidate, config, extra = {}) => {
  if (!text) return '';
  
  const joiningDate = candidate.expectedJoiningDate 
    ? new Date(candidate.expectedJoiningDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const replacements = {
    '{{firstName}}': candidate.firstName || '',
    '{{lastName}}': candidate.lastName || '',
    '{{fullName}}': `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim(),
    '{{candidateName}}': `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim(),
    '{{email}}': candidate.email || '',
    '{{phone}}': candidate.phone || '',
    '{{position}}': candidate.position || '',
    '{{department}}': candidate.department || '',
    '{{joiningDate}}': joiningDate,
    '{{salary}}': candidate.salary || '',
    '{{reportingManager}}': candidate.reportingManager || '',
    '{{companyName}}': config.company_name || 'Iron Lady',
    '{{companyAddress}}': config.company_address || '',
    '{{hrName}}': config.hr_name || 'HR Team',
    '{{hrEmail}}': config.hr_email || '',
    '{{hrPhone}}': config.hr_phone || '',
    '{{ceoName}}': config.ceo_name || 'CEO',
    '{{officeTimings}}': config.office_timings || '9:30 AM - 6:30 PM',
    '{{formLink}}': extra.formLink || config.step6_onboarding_form_url || '',
    '{{meetingLink}}': extra.meetingLink || '',
    '{{trainingContent}}': extra.trainingContent || '',
    '{{dateTime}}': extra.dateTime || '',
    '{{duration}}': extra.duration || '',
    '{{startTime}}': extra.startTime || '',
    '{{ceoName}}': extra.ceoName || config.ceo_name || '',
    '{{salesHeadName}}': extra.salesHeadName || config.sales_head_name || ''
  };

  // Add custom fields as placeholders (e.g., {{address}}, {{emergencyContact}}, etc.)
  if (candidate.customFields && typeof candidate.customFields === 'object') {
    Object.entries(candidate.customFields).forEach(([fieldKey, fieldValue]) => {
      // Convert fieldKey to placeholder format: address -> {{address}}
      const placeholderKey = `{{${fieldKey}}}`;
      replacements[placeholderKey] = fieldValue || '';
    });
  }

  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value || '');
  }
  return result;
};

const logActivity = async (candidateId, action, description) => {
  try {
    await prisma.activityLog.create({
      data: {
        candidateId,
        action,
        description,
        metadata: JSON.stringify({ automated: true, timestamp: new Date().toISOString() })
      }
    });
  } catch (e) {
    logger.error('Log activity error:', e);
  }
};

// ============================================================
// AUTO-COMPLETE STEPS WHEN CALENDAR EVENTS PASS
// ============================================================
const autoCompleteCalendarSteps = async () => {
  try {
    const now = new Date();
    
    // Find calendar events that have passed their start time and are still SCHEDULED
    // IMPORTANT: Check for already sent emails to prevent duplicates
    const pastEvents = await prisma.calendarEvent.findMany({
      where: {
        status: 'SCHEDULED',
        startTime: { lte: now }
      },
      include: {
        candidate: {
          include: {
            tasks: true
          }
        }
      }
    });

    if (pastEvents.length === 0) {
      return;
    }

    logger.info(`Found ${pastEvents.length} calendar event(s) that have passed - auto-completing steps...`);

    // Map event types to step numbers (for backward compatibility with hardcoded steps)
    const eventTypeToStep = {
      'HR_INDUCTION': 4,
      'CEO_INDUCTION': 8,
      'SALES_INDUCTION': 9,
      'DEPARTMENT_INDUCTION': 9, // Department induction is also step 9
      'CHECKIN_CALL': 11,
      'HR_CHECKIN': 11,
      'OFFER_REMINDER': 2,
      'WELCOME_EMAIL': 3,
      'ONBOARDING_FORM': 6,
      'TRAINING_PLAN': 10
    };

    for (const event of pastEvents) {
      try {
        // IMPORTANT: Check if this event was already processed (prevent duplicate processing)
        // If event status is already COMPLETED, skip it
        if (event.status === 'COMPLETED') {
          logger.debug(`⏭️ Skipping event ${event.id} - already completed`);
          continue;
        }

        // Try to find step number from mapping first (for backward compatibility)
        let stepNumber = eventTypeToStep[event.type];
        
        // If not in mapping, we'll find it from the step template
        // Don't skip - continue to process all events

        const candidate = event.candidate;
        
        // Determine actual step number - prefer event.stepNumber (most reliable - stored when event was created)
        const actualStepNumber = event.stepNumber || stepNumber || null;
        
        // Find the step template using the actual step number (most reliable way)
        let stepTemplate = null;
        try {
          // Priority 1: Find by stepNumber (most reliable - ensures we get the exact step)
          if (actualStepNumber) {
            stepTemplate = await prisma.departmentStepTemplate.findFirst({
              where: {
                department: candidate.department,
                stepNumber: actualStepNumber
              },
              include: {
                emailTemplate: true
              }
            });
          }
          
          // Priority 2: If not found by stepNumber, try to find by event type (fallback for old events)
          if (!stepTemplate) {
            stepTemplate = await prisma.departmentStepTemplate.findFirst({
              where: {
                department: candidate.department,
                type: event.type === 'DEPARTMENT_INDUCTION' ? 'DEPARTMENT_INDUCTION' : event.type
              },
              orderBy: { stepNumber: 'asc' },
              include: {
                emailTemplate: true
              }
            });
          }
          
          // Priority 3: If still not found, try any department (last resort)
          if (!stepTemplate && actualStepNumber) {
            stepTemplate = await prisma.departmentStepTemplate.findFirst({
              where: {
                stepNumber: actualStepNumber
              },
              include: {
                emailTemplate: true
              }
            });
          }
        } catch (error) {
          logger.warn(`Failed to fetch step template for step ${actualStepNumber || 'unknown'}:`, error);
        }
        
        if (!actualStepNumber) {
          logger.warn(`⚠️ Could not determine step number for event type: ${event.type}, candidate: ${candidate.email} - skipping`);
          continue; // Skip if we can't determine step number
        }

        // ✅ USE THE SAME LOGIC AS MANUAL "SEND" BUTTON
        // This ensures scheduled emails work exactly like manual sends
        try {
          // CRITICAL: Mark event as COMPLETED immediately to prevent duplicate processing
          // Do this BEFORE calling completeStep to prevent race conditions when scheduler runs multiple times
          const updateResult = await prisma.calendarEvent.updateMany({
            where: { 
              id: event.id,
              status: 'SCHEDULED' // Only update if still SCHEDULED (prevents race condition)
            },
            data: { status: 'COMPLETED' }
          });
          
          // If updateResult.count is 0, another process already marked it as completed
          if (updateResult.count === 0) {
            logger.info(`⏭️ Skipping event ${event.id} - already processed by another instance`);
            continue;
          }
          
          logger.info(`🔄 Auto-completing step ${actualStepNumber} for ${candidate.email} (event: ${event.type}) - using same logic as manual Send button`);
          
          // Call the universal stepService - same function used by manual "Send" button
          await stepService.completeStep(
            prisma,
            candidate.id,
            actualStepNumber,
            null // No userId for automated actions
          );
          
          logger.info(`✅ Successfully auto-completed step ${actualStepNumber} for ${candidate.email} - ${event.type}`);
          
          // Mark corresponding task as completed
          const taskType = event.type === 'DEPARTMENT_INDUCTION' ? 'DEPARTMENT_INDUCTION' : event.type;
          const tasks = await prisma.task.findMany({
            where: {
              candidateId: candidate.id,
              status: { not: 'COMPLETED' }
            }
          });

          for (const task of tasks) {
            const matchesType = task.type === taskType;
            const matchesStep = task.metadata && typeof task.metadata === 'object' && task.metadata.step === actualStepNumber;
            
            if (matchesType || matchesStep) {
              await prisma.task.update({
                where: { id: task.id },
                data: {
                  status: 'COMPLETED',
                  completedAt: now
                }
              });
              logger.info(`✅ Marked task as completed: ${task.title}`);
            }
          }
          
        } catch (stepError) {
          logger.error(`❌ Failed to auto-complete step ${actualStepNumber} for ${candidate.email}:`, stepError.message);
          logger.error('Error stack:', stepError.stack);
          // Event stays SCHEDULED - will retry on next cron run
        }
      } catch (error) {
        logger.error(`Error auto-completing step for event ${event.id}:`, error);
        // Continue with next event even if one fails
      }
    }
  } catch (error) {
    logger.error('Error in autoCompleteCalendarSteps:', error);
  }
};

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  initScheduledJobs,
  scheduleCEOInduction,
  scheduleSalesInduction,
  sendPendingEmails,
  // Manual triggers for testing
  checkOfferReminders,
  sendDayMinus1WelcomeEmails,
  processDayZeroAutomations,
  sendOnboardingForms,
  checkFormReminders,
  sendTrainingPlans,
  scheduleCheckInCalls,
  autoCompleteCalendarSteps
};

