const emailService = require('./emailService');
const logger = require('../utils/logger');

/**
 * Complete a step for a candidate - UNIVERSAL function used by both manual "Send" button and scheduler
 * This ensures both use the EXACT same logic
 */
const completeStep = async (prisma, candidateId, stepNumber, userId = null) => {
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

    // Send email if needed
    if (stepConfig.sendEmail && stepConfig.emailType) {
      try {
        // UNIVERSAL ATTACHMENT HANDLING: Check if there's a calendar event with attachment
        let stepAttachmentPath = null;
        
        // Determine event type to search for calendar event
        let eventTypeToSearch = null;
        if (stepTemplate && stepTemplate.type) {
          eventTypeToSearch = stepTemplate.type === 'MANUAL' ? 'CUSTOM' : stepTemplate.type;
          if (eventTypeToSearch === 'WHATSAPP_ADDITION') {
            eventTypeToSearch = 'WHATSAPP_TASK';
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
          eventTypeToSearch = eventTypeMap[stepNumber];
        }
        
        // Search for calendar event with attachment - use stepNumber for unique identification
        if (eventTypeToSearch) {
          const calendarEvent = await prisma.calendarEvent.findFirst({
            where: {
              candidateId: candidate.id,
              type: eventTypeToSearch,
              stepNumber: stepNumber, // Match by stepNumber to ensure unique step identification
              status: { in: ['SCHEDULED', 'COMPLETED'] }
            },
            orderBy: { createdAt: 'desc' }
          });
          if (calendarEvent && calendarEvent.attachmentPath) {
            stepAttachmentPath = calendarEvent.attachmentPath;
            logger.info(`Found attachment for step ${stepNumber}: ${stepAttachmentPath}`);
          }
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

        // UNIVERSAL: Use sendUniversalEmail for ALL steps
        logger.info(`📧 Completing step ${stepNumber} for ${candidate.email} - sending email type: ${emailTemplateType}`);
        await emailService.sendUniversalEmail(
          prisma, 
          candidate, 
          emailTemplateType, 
          stepTemplate,
          stepAttachmentPath,
          customData
        );
        logger.info(`✅ Email sent successfully for step ${stepNumber}`);
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

    logger.info(`✅ Step ${stepNumber} completed successfully for ${candidate.email}`);
    return updated;
  } catch (error) {
    logger.error(`❌ Error completing step ${stepNumber} for candidate ${candidateId}:`, error);
    throw error;
  }
};

module.exports = {
  completeStep
};

