const emailService = require('./emailService');
const calendarService = require('./calendarService');
const logger = require('../utils/logger');

/**
 * Complete a step for a candidate - UNIVERSAL function used by both manual "Send" button and scheduler
 * This ensures both use the EXACT same logic
 */
const completeStep = async (prisma, candidateId, stepNumber, userId = null, description = null, attachmentPath = null) => {
  try {
    if (!stepNumber || stepNumber < 1) {
      throw new Error('Invalid step number');
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId }
    });

    if (!candidate) {
      throw new Error('Candidate not found');
    }

    // CRITICAL: Check if step is already completed to prevent re-triggering
    // Check if there's a completed calendar event for this step
    const completedEvent = await prisma.calendarEvent.findFirst({
      where: {
        candidateId: candidate.id,
        stepNumber: stepNumber,
        status: 'COMPLETED'
      }
    });

    if (completedEvent) {
      // Check if email was already sent for this completed step
      const stepTemplate = await prisma.departmentStepTemplate.findFirst({
        where: {
          department: candidate.department,
          stepNumber: stepNumber
        },
        include: {
          emailTemplate: true
        }
      });

      if (stepTemplate?.emailTemplate) {
        const emailType = stepTemplate.emailTemplate.type;
        const existingSentEmail = await prisma.email.findFirst({
          where: {
            candidateId: candidate.id,
            type: emailType,
            status: 'SENT'
          },
          orderBy: { sentAt: 'desc' }
        });

        if (existingSentEmail) {
          logger.info(`⏭️ Step ${stepNumber} for ${candidate.email} is already completed and email was already sent. Skipping to prevent duplicate.`);
          logger.info(`   Completed event: ${completedEvent.id}, Sent email: ${existingSentEmail.id} at ${existingSentEmail.sentAt?.toISOString() || 'N/A'}`);
          return { success: true, skipped: true, reason: 'Step already completed and email already sent' };
        }
      }
    }

    // Fetch department step template to get the step type and email template
    let stepTemplate = null;
    try {
      stepTemplate = await prisma.departmentStepTemplate.findFirst({
        where: {
          department: candidate.department,
          stepNumber: stepNumber
        },
        include: {
          emailTemplate: true // Include email template if linked
        }
      });
    } catch (error) {
      logger.warn(`Failed to fetch step template for step ${stepNumber} in ${candidate.department}:`, error);
    }

    const updateData = {};
    
    // Default step actions for standard steps (backward compatibility)
    const stepActions = {
      1: { 
        field: 'offerSentAt', 
        value: new Date(), 
        action: 'OFFER_SENT',
        sendEmail: true,
        emailType: 'OFFER_LETTER'
      },
      2: { 
        field: 'offerReminderSent', 
        value: true, 
        action: 'OFFER_REMINDER_SENT',
        sendEmail: true,
        emailType: 'OFFER_REMINDER'
      },
      3: { 
        field: 'welcomeEmailSentAt', 
        value: new Date(), 
        action: 'WELCOME_EMAIL_SENT',
        sendEmail: true,
        emailType: 'WELCOME_DAY_MINUS_1'
      },
      4: { 
        field: 'hrInductionScheduled', 
        value: true, 
        action: 'HR_INDUCTION_COMPLETED',
        sendEmail: false
      },
      5: { 
        field: 'whatsappGroupsAdded', 
        value: true, 
        action: 'WHATSAPP_GROUPS_ADDED',
        sendEmail: false
      },
      6: { 
        field: 'onboardingFormSentAt', 
        value: new Date(), 
        action: 'ONBOARDING_FORM_SENT',
        sendEmail: true,
        emailType: 'ONBOARDING_FORM'
      },
      7: { 
        field: 'onboardingFormCompletedAt', 
        value: new Date(), 
        action: 'FORM_COMPLETED',
        sendEmail: false
      },
      8: { 
        field: 'ceoInductionScheduled', 
        value: true, 
        action: 'CEO_INDUCTION_COMPLETED',
        sendEmail: false
      },
      9: { 
        field: 'salesInductionScheduled', 
        value: true, 
        action: 'SALES_INDUCTION_COMPLETED',
        sendEmail: false
      },
      10: { 
        field: 'trainingPlanSent', 
        value: true, 
        action: 'TRAINING_PLAN_SENT',
        sendEmail: true,
        emailType: 'TRAINING_PLAN'
      },
      11: { 
        field: 'checkinScheduled', 
        value: true, 
        action: 'CHECKIN_COMPLETED',
        sendEmail: false
      }
    };

    // Determine step config - use template if available, otherwise use default actions
    let stepConfig = null;
    if (stepTemplate) {
      const stepType = stepTemplate.type;
      stepConfig = {
        field: null,
        value: null,
        action: `${stepType}_COMPLETED`,
        sendEmail: false
      };
      
      // Map specific types to actions
      if (stepType === 'OFFER_LETTER') {
        stepConfig.field = 'offerSentAt';
        stepConfig.value = new Date();
        stepConfig.sendEmail = true;
        stepConfig.emailType = 'OFFER_LETTER';
      } else if (stepType === 'OFFER_REMINDER') {
        // Check if candidate already has signed offer letter - if yes, skip sending reminder
        if (candidate.signedOfferPath || candidate.offerSignedAt) {
          logger.info(`⏭️ Skipping offer reminder for ${candidate.email} - signed offer letter already exists`);
          return { success: true, skipped: true, reason: 'Signed offer letter already exists' };
        }
        stepConfig.field = 'offerReminderSent';
        stepConfig.value = true;
        stepConfig.sendEmail = true;
        stepConfig.emailType = 'OFFER_REMINDER';
      } else if (stepType === 'WELCOME_EMAIL') {
        stepConfig.field = 'welcomeEmailSentAt';
        stepConfig.value = new Date();
        stepConfig.sendEmail = true;
        stepConfig.emailType = 'WELCOME_DAY_MINUS_1';
      } else if (stepType === 'ONBOARDING_FORM') {
        stepConfig.field = 'onboardingFormSentAt';
        stepConfig.value = new Date();
        stepConfig.sendEmail = true;
        stepConfig.emailType = 'ONBOARDING_FORM';
      } else if (stepType === 'TRAINING_PLAN') {
        stepConfig.field = 'trainingPlanSent';
        stepConfig.value = true;
        stepConfig.sendEmail = true;
        stepConfig.emailType = 'TRAINING_PLAN';
      } else if (stepType === 'FORM_REMINDER') {
        stepConfig.field = 'onboardingFormCompletedAt';
        stepConfig.value = new Date();
        stepConfig.sendEmail = true;
        stepConfig.emailType = 'FORM_REMINDER';
      } else {
        // For any other step type, send a custom email
        stepConfig.sendEmail = true;
        stepConfig.emailType = 'CUSTOM';
        stepConfig.stepTemplate = stepTemplate;
      }
    } else {
      stepConfig = stepActions[stepNumber];
    }
    
    if (!stepConfig) {
      // UNIVERSAL FALLBACK: For truly new steps
      stepConfig = {
        field: null,
        value: null,
        action: 'STEP_COMPLETED',
        sendEmail: true,
        emailType: 'CUSTOM',
        stepTemplate: stepTemplate
      };
    }

    // Check if step should be skipped (e.g., offer reminder if signed offer already exists)
    // For step 2 (OFFER_REMINDER), skip if candidate already has signed offer letter
    if (stepNumber === 2 || (stepTemplate && stepTemplate.type === 'OFFER_REMINDER')) {
      if (candidate.signedOfferPath || candidate.offerSignedAt) {
        logger.info(`⏭️ Skipping offer reminder (step ${stepNumber}) for ${candidate.email} - signed offer letter already exists`);
        return { success: true, skipped: true, reason: 'Signed offer letter already exists' };
      }
    }

    // Send email if needed
    if (stepConfig.sendEmail && stepConfig.emailType) {
      try {
        // UNIVERSAL ATTACHMENT HANDLING: Check if there's a calendar event with attachment
        // CRITICAL FIX: Search by stepNumber first (most reliable), then by type as fallback
        // This ensures attachments work for ALL steps including newly created custom steps
        let stepAttachmentPath = null;
        
        // Priority 1: Search by stepNumber (most reliable - works for all step types)
        // This is the primary search method that works for existing, edited, and newly created steps
        let calendarEvent = await prisma.calendarEvent.findFirst({
          where: {
            candidateId: candidate.id,
            stepNumber: stepNumber, // Match by stepNumber - ensures unique step identification
            status: { in: ['SCHEDULED', 'COMPLETED'] },
            OR: [
              { attachmentPath: { not: null } }, // Single attachment
              { attachmentPaths: { not: null } } // Multiple attachments
            ]
          },
          orderBy: { createdAt: 'desc' }
        });
        
        // Priority 2: If not found by stepNumber, try searching by type (fallback for old events without stepNumber)
        if (!calendarEvent && stepTemplate && stepTemplate.type) {
          let eventTypeToSearch = stepTemplate.type === 'MANUAL' ? 'CUSTOM' : stepTemplate.type;
          if (eventTypeToSearch === 'WHATSAPP_ADDITION') {
            eventTypeToSearch = 'WHATSAPP_TASK';
          }
          
          calendarEvent = await prisma.calendarEvent.findFirst({
            where: {
              candidateId: candidate.id,
              type: eventTypeToSearch,
              status: { in: ['SCHEDULED', 'COMPLETED'] },
              OR: [
                { attachmentPath: { not: null } }, // Single attachment
                { attachmentPaths: { not: null } } // Multiple attachments
              ]
            },
            orderBy: { createdAt: 'desc' }
          });
        }
        
        // Priority 3: If still not found, try hardcoded mapping (backward compatibility)
        if (!calendarEvent) {
          const eventTypeMap = {
            1: 'OFFER_LETTER',
            2: 'OFFER_REMINDER',
            3: 'WELCOME_EMAIL',
            4: 'HR_INDUCTION',
            5: 'WHATSAPP_TASK',
            6: 'ONBOARDING_FORM',
            7: 'FORM_REMINDER',
            8: 'CEO_INDUCTION',
            9: 'SALES_INDUCTION',
            10: 'TRAINING_PLAN',
            11: 'CHECKIN_CALL'
          };
          const eventTypeToSearch = eventTypeMap[stepNumber];
          
          if (eventTypeToSearch) {
            calendarEvent = await prisma.calendarEvent.findFirst({
              where: {
                candidateId: candidate.id,
                type: eventTypeToSearch,
                status: { in: ['SCHEDULED', 'COMPLETED'] },
                OR: [
                  { attachmentPath: { not: null } }, // Single attachment
                  { attachmentPaths: { not: null } } // Multiple attachments
                ]
              },
              orderBy: { createdAt: 'desc' }
            });
          }
        }
        
        // Extract attachment path(s) if found
        // Support both single attachment (backward compatibility) and multiple attachments
        // Priority: Use provided attachmentPath (from upload), then calendar event attachment
        if (attachmentPath) {
          // Use attachment provided in function call (from file upload)
          stepAttachmentPath = attachmentPath;
          logger.info(`✅ Using provided attachment for step ${stepNumber}: ${attachmentPath}`);
        } else if (calendarEvent) {
          // Priority: Use attachmentPaths (array) if available, otherwise use attachmentPath (single)
          if (calendarEvent.attachmentPaths && Array.isArray(calendarEvent.attachmentPaths) && calendarEvent.attachmentPaths.length > 0) {
            // Multiple attachments - pass as array
            stepAttachmentPath = calendarEvent.attachmentPaths;
            logger.info(`✅ Found ${calendarEvent.attachmentPaths.length} attachment(s) for step ${stepNumber} (${calendarEvent.type})`);
          } else if (calendarEvent.attachmentPath) {
            // Single attachment - pass as string (will be converted to array in sendUniversalEmail)
            stepAttachmentPath = calendarEvent.attachmentPath;
            logger.info(`✅ Found attachment for step ${stepNumber} (${calendarEvent.type}): ${calendarEvent.attachmentPath}`);
          }
        }
        
        // For Step 1, also check candidate.offerLetterPath if no attachment found yet
        if (!stepAttachmentPath && stepNumber === 1 && candidate.offerLetterPath) {
          stepAttachmentPath = candidate.offerLetterPath;
          logger.info(`✅ Using candidate offer letter path for step 1: ${candidate.offerLetterPath}`);
        }
        
        if (!stepAttachmentPath) {
          logger.debug(`ℹ️ No attachment found for step ${stepNumber} - email will be sent without attachment`);
        }

        // UNIVERSAL: ALL steps MUST use existing email templates from database
        // Only use the linked email template - no fallbacks
        
        if (!stepTemplate || !stepTemplate.emailTemplateId || !stepTemplate.emailTemplate) {
          throw new Error(`Step ${stepNumber} does not have an email template assigned. Please assign an email template to this step.`);
        }

        // Use the type from the linked email template
        const emailTemplateType = stepTemplate.emailTemplate.type;
        logger.info(`Using email template: ${stepTemplate.emailTemplate.name} (${emailTemplateType}) for step ${stepNumber}`);

        // Special handling for OFFER_LETTER - must have attachment
        if (emailTemplateType === 'OFFER_LETTER') {
          if (!candidate.offerLetterPath && !stepAttachmentPath) {
            throw new Error('Offer letter must be uploaded before sending. Please upload the offer letter first.');
          }
        }

        // Special handling for ONBOARDING_FORM and FORM_REMINDER - need form link
        let customData = {};
        if (emailTemplateType === 'ONBOARDING_FORM' || emailTemplateType === 'FORM_REMINDER') {
          const formLink = process.env.ONBOARDING_FORM_URL || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/onboarding-form/${candidate.id}`;
          customData['{{formLink}}'] = formLink;
        }

            // CRITICAL: Check if email was already sent for this step to prevent duplicates
        // Check for emails sent in the last 5 minutes for this step to prevent duplicate sends
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const existingEmail = await prisma.email.findFirst({
          where: {
            candidateId: candidate.id,
            type: emailTemplateType,
            status: { in: ['SENT', 'PENDING'] },
            createdAt: { gte: fiveMinutesAgo }
          },
          orderBy: { createdAt: 'desc' }
        });

        if (existingEmail) {
          logger.warn(`⏭️ Skipping email send for step ${stepNumber} (${emailTemplateType}): Email already sent or pending in last 5 minutes (email ID: ${existingEmail.id})`);
          logger.info(`   Existing email status: ${existingEmail.status}, created: ${existingEmail.createdAt.toISOString()}`);
        } else {
          // UNIVERSAL: Use sendUniversalEmail for ALL steps
          // stepAttachmentPath can be a string (single) or array (multiple)
          logger.info(`📧 Completing step ${stepNumber} for ${candidate.email} - sending email type: ${emailTemplateType}`);
          await emailService.sendUniversalEmail(
            prisma, 
            candidate, 
            emailTemplateType, 
            stepTemplate,
            stepAttachmentPath, // Can be string or array
            customData
          );
          logger.info(`✅ Email sent successfully for step ${stepNumber}`);
        }
      } catch (emailError) {
        logger.error(`❌ Failed to send email for step ${stepNumber} (${stepConfig.emailType || 'unknown'}):`, emailError.message);
        logger.error('Full email error:', emailError);
        throw emailError; // Re-throw so caller knows email failed
      }
    }

    // Update candidate fields
    if (stepConfig.field) {
      updateData[stepConfig.field] = stepConfig.value;
    }

    // If there's a scheduled calendar event for this step, mark it as completed
    let eventType = null;
    
    if (stepTemplate && stepTemplate.type) {
      eventType = stepTemplate.type === 'MANUAL' ? 'CUSTOM' : stepTemplate.type;
      if (eventType === 'WHATSAPP_ADDITION') {
        eventType = 'WHATSAPP_TASK';
      }
    } else {
      const eventTypeMap = {
        1: 'OFFER_LETTER',
        2: 'OFFER_REMINDER',
        3: 'WELCOME_EMAIL',
        4: 'HR_INDUCTION',
        5: 'WHATSAPP_TASK',
        6: 'ONBOARDING_FORM',
        7: 'FORM_REMINDER',
        8: 'CEO_INDUCTION',
        9: 'SALES_INDUCTION',
        10: 'TRAINING_PLAN',
        11: 'CHECKIN_CALL'
      };
      eventType = eventTypeMap[stepNumber];
    }
    
    if (eventType) {
      let calendarEventType = eventType;
      if (calendarEventType === 'WHATSAPP_ADDITION') {
        calendarEventType = 'WHATSAPP_TASK';
      } else if (calendarEventType === 'MANUAL') {
        calendarEventType = 'CUSTOM';
      } else if (!['OFFER_LETTER', 'OFFER_REMINDER', 'WELCOME_EMAIL', 'HR_INDUCTION', 
                    'WHATSAPP_TASK', 'ONBOARDING_FORM', 'FORM_REMINDER', 'CEO_INDUCTION', 
                    'SALES_INDUCTION', 'DEPARTMENT_INDUCTION', 'TRAINING_PLAN', 
                    'CHECKIN_CALL', 'TRAINING', 'CUSTOM'].includes(calendarEventType)) {
        calendarEventType = 'CUSTOM';
      }
      
      // CRITICAL: Only update the specific event for this step number
      // This ensures each step has its own independent event
      await prisma.calendarEvent.updateMany({
        where: {
          candidateId: candidate.id,
          type: calendarEventType,
          stepNumber: stepNumber, // Match by stepNumber to ensure only this step's event is updated
          status: { not: 'COMPLETED' }
        },
        data: {
          status: 'COMPLETED'
        }
      });
    }

    // Update candidate
    const updated = await prisma.candidate.update({
      where: { id: candidate.id },
      data: updateData,
      include: {
        calendarEvents: { orderBy: { startTime: 'asc' } }
      }
    });

    // Log activity (if userId provided)
    if (userId) {
      try {
        await prisma.activityLog.create({
          data: {
            candidateId: candidate.id,
            userId: userId,
            action: stepConfig.action,
            description: `Step ${stepNumber} completed${stepConfig.sendEmail ? ' and email sent' : ''}`
          }
        });
      } catch (logError) {
        logger.warn('Failed to log activity:', logError);
        // Continue even if logging fails
      }
    }

    // If Step 1 (OFFER_LETTER) was just completed, schedule all offerLetter-based steps
    if (stepNumber === 1 && stepConfig.field === 'offerSentAt' && updated.offerSentAt) {
      try {
        logger.info(`🔄 Step 1 completed - scheduling offerLetter-based steps for ${candidate.email}...`);
        await scheduleOfferLetterBasedSteps(prisma, updated);
      } catch (scheduleError) {
        logger.error(`❌ Error scheduling offerLetter-based steps after Step 1 completion:`, scheduleError.message);
        // Don't fail the step completion - just log the error
      }
    }

    logger.info(`✅ Step ${stepNumber} completed successfully for ${candidate.email}`);
    return updated;
  } catch (error) {
    logger.error(`❌ Error completing step ${stepNumber} for candidate ${candidateId}:`, error);
    throw error;
  }
};

// Helper to schedule all offerLetter-based steps when Step 1 is completed
const scheduleOfferLetterBasedSteps = async (prisma, candidate) => {
  try {
    const department = candidate.department;
    const offerSentAt = candidate.offerSentAt;
    
    if (!offerSentAt) {
      logger.warn(`⚠️ Cannot schedule offerLetter-based steps: offerSentAt is not set for ${candidate.email}`);
      return;
    }

    // Get all auto-scheduled step templates that are based on offer letter
    const stepTemplates = await prisma.departmentStepTemplate.findMany({
      where: {
        department,
        isActive: true,
        isAuto: true,
        schedulingMethod: 'offerLetter',
        stepNumber: { not: 1 } // Skip Step 1 itself
      },
      orderBy: { stepNumber: 'asc' }
    });

    if (stepTemplates.length === 0) {
      logger.info(`ℹ️ No offerLetter-based steps found for ${candidate.email} in ${department} department`);
      return;
    }

    logger.info(`🔄 Scheduling ${stepTemplates.length} offerLetter-based step(s) for ${candidate.email}...`);

    let eventsCreated = 0;
    let eventsSkipped = 0;

    for (const step of stepTemplates) {
      try {
        // Check if event already exists for this step
        const existingEvent = await prisma.calendarEvent.findFirst({
          where: {
            candidateId: candidate.id,
            stepNumber: step.stepNumber,
            status: { not: 'COMPLETED' }
          }
        });

        if (existingEvent) {
          logger.debug(`⏭️ Skipping step ${step.stepNumber} for ${candidate.email}: Event already exists`);
          eventsSkipped++;
          continue;
        }

        const scheduledTimeStr = step.scheduledTimeOfferLetter || '14:00';
        const base = new Date(offerSentAt);
        const scheduledDate = new Date(base);
        scheduledDate.setDate(scheduledDate.getDate() + (step.dueDateOffset || 0));

        // Extract date components
        const year = scheduledDate.getFullYear();
        const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
        const day = String(scheduledDate.getDate()).padStart(2, '0');
        
        // Get time from scheduledTimeStr (HH:mm format, e.g., "12:03")
        const [hours, minutes] = scheduledTimeStr.split(':');
        const hour = parseInt(hours) || 14;
        const minute = parseInt(minutes) || 0;

        // Create date string treating the time as IST (Asia/Kolkata, UTC+5:30)
        const istDateString = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;
        const scheduledDateIST = new Date(istDateString);

        if (isNaN(scheduledDateIST.getTime())) {
          logger.error(`❌ Invalid date created for candidate ${candidate.email}: ${istDateString}`);
          eventsSkipped++;
          continue;
        }

        // Calculate end time
        const durationMap = { 
          'OFFER_LETTER': 30, 
          'OFFER_REMINDER': 15, 
          'WELCOME_EMAIL': 30, 
          'HR_INDUCTION': 60, 
          'WHATSAPP_ADDITION': 15, 
          'ONBOARDING_FORM': 30, 
          'FORM_REMINDER': 15, 
          'CEO_INDUCTION': 60, 
          'SALES_INDUCTION': 90, 
          'DEPARTMENT_INDUCTION': 90,
          'TRAINING_PLAN': 30, 
          'CHECKIN_CALL': 30 
        };
        const eventDuration = durationMap[step.type] || 15;
        const endTime = new Date(scheduledDateIST);
        endTime.setMinutes(endTime.getMinutes() + eventDuration);

        // Create calendar event
        const eventData = {
          title: `${step.title} - ${candidate.firstName} ${candidate.lastName}`,
          description: step.description || '',
          startTime: scheduledDateIST,
          endTime: endTime,
          attendees: [candidate.email],
          createMeet: false
        };

        // Try to create Google Calendar event (optional)
        let googleEvent = null;
        try {
          googleEvent = await calendarService.createGoogleEvent(eventData, prisma);
        } catch (gcalError) {
          logger.warn(`⚠️ Google Calendar event creation failed for ${candidate.email}, continuing with local event:`, gcalError.message);
        }

        // Create calendar event in database
        await prisma.calendarEvent.create({
          data: {
            candidateId: candidate.id,
            type: step.type,
            title: eventData.title,
            description: eventData.description,
            startTime: scheduledDateIST,
            endTime: endTime,
            attendees: eventData.attendees,
            meetingLink: googleEvent?.hangoutLink || googleEvent?.htmlLink || null,
            googleEventId: googleEvent?.id || null,
            stepNumber: step.stepNumber,
            status: 'SCHEDULED'
          }
        });

        eventsCreated++;
        logger.info(`✅ Scheduled offerLetter-based step ${step.stepNumber} for ${candidate.email}: ${scheduledDateIST.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`);

      } catch (stepError) {
        logger.error(`❌ Error scheduling offerLetter-based step ${step.stepNumber} for candidate ${candidate.email}:`, stepError.message);
        eventsSkipped++;
      }
    }

    logger.info(`✅ OfferLetter-based scheduling complete for ${candidate.email}: ${eventsCreated} event(s) created, ${eventsSkipped} skipped`);
  } catch (error) {
    logger.error(`❌ Error in scheduleOfferLetterBasedSteps for ${candidate.email}:`, error.message);
    // Don't throw - allow step completion to succeed even if scheduling fails
  }
};

module.exports = {
  completeStep
};

