const { google } = require('googleapis');
const logger = require('../utils/logger');
const emailService = require('./emailService');

// Initialize Google Calendar API
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Helper to get company config (for HR email)
const getCompanyConfig = async (prisma) => {
  try {
    const configs = await prisma.workflowConfig.findMany({
      where: {
        key: {
          in: ['hr_email', 'hr_name', 'company_name']
        }
      }
    });
    const configMap = {};
    configs.forEach(c => { configMap[c.key] = c.value; });
    return configMap;
  } catch (error) {
    logger.warn('Failed to fetch company config for calendar:', error);
    return {};
  }
};

// Helper to create calendar event
const createGoogleEvent = async (eventData, prisma = null) => {
  try {
    // Get HR email from database if prisma is provided
    let hrEmail = null;
    let calendarId = 'primary'; // Default to OAuth account's primary calendar
    
    if (prisma) {
      const companyConfig = await getCompanyConfig(prisma);
      hrEmail = companyConfig.hr_email || process.env.HR_EMAIL;
      
      // If HR email is set and different from OAuth account, try to use it as calendarId
      // Note: This works if the OAuth account has access to the HR email's calendar
      // (e.g., shared calendar or domain-wide delegation in Google Workspace)
      if (hrEmail) {
        // Try using HR email as calendarId (works if calendar is shared/accessible)
        // If it fails, we'll fallback to 'primary'
        calendarId = hrEmail;
      }
    }

    const event = {
      summary: eventData.title,
      description: eventData.description,
      start: {
        dateTime: eventData.startTime.toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      end: {
        dateTime: eventData.endTime.toISOString(),
        timeZone: 'Asia/Kolkata'
      },
      attendees: eventData.attendees?.map(email => ({ email })) || [],
      conferenceData: eventData.createMeet ? {
        createRequest: {
          requestId: Date.now().toString()
        }
      } : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 }
        ]
      }
    };

    // Add HR email as organizer if available (this ensures invites come from HR email)
    if (hrEmail && !event.attendees.find(a => a.email === hrEmail)) {
      event.attendees.unshift({ email: hrEmail, organizer: true });
    }

    if (eventData.location) {
      event.location = eventData.location;
    }

    // Try to create event in HR email's calendar, fallback to primary if it fails
    let response;
    try {
      response = await calendar.events.insert({
        calendarId: calendarId,
        resource: event,
        conferenceDataVersion: eventData.createMeet ? 1 : 0,
        sendUpdates: 'all'
      });
      logger.info(`Google Calendar event created in ${calendarId}: ${response.data.id}`);
    } catch (calendarError) {
      // If using HR email as calendarId fails, fallback to 'primary'
      if (calendarId !== 'primary' && calendarError.code === 404) {
        logger.warn(`Calendar ${calendarId} not accessible, using 'primary' calendar instead`);
        response = await calendar.events.insert({
          calendarId: 'primary',
          resource: event,
          conferenceDataVersion: eventData.createMeet ? 1 : 0,
          sendUpdates: 'all'
        });
        logger.info(`Google Calendar event created in primary calendar: ${response.data.id}`);
      } else {
        throw calendarError;
      }
    }

    return response.data;
  } catch (error) {
    logger.error('Error creating Google Calendar event:', error);
    // Don't throw - allow local event creation to continue
    return null;
  }
};

// Create HR Induction (Day 0 at 9:30 AM)
const createHRInduction = async (prisma, candidate) => {
  const joiningDate = candidate.actualJoiningDate || candidate.expectedJoiningDate || new Date();
  
  const startTime = new Date(joiningDate);
  startTime.setHours(9, 30, 0, 0);
  
  const endTime = new Date(startTime);
  endTime.setHours(10, 30, 0, 0);

  const eventData = {
    title: `HR Induction - ${candidate.firstName} ${candidate.lastName}`,
    description: `Welcome to Iron Lady!\n\nThis is your HR induction session where we'll cover:\n- Company policies\n- Benefits overview\n- Team introduction\n- Q&A session`,
    startTime,
    endTime,
    attendees: [candidate.email],
    createMeet: true
  };

  // Create in Google Calendar (pass prisma to get HR email)
  const googleEvent = await createGoogleEvent(eventData, prisma);

  // Create local record
  const event = await prisma.calendarEvent.create({
    data: {
      candidateId: candidate.id,
      type: 'HR_INDUCTION',
      title: eventData.title,
      description: eventData.description,
      startTime,
      endTime,
      meetingLink: googleEvent?.hangoutLink || googleEvent?.htmlLink,
      attendees: [candidate.email],
      googleEventId: googleEvent?.id
    }
  });

  // Update candidate
  await prisma.candidate.update({
    where: { id: candidate.id },
    data: { hrInductionScheduled: true }
  });

  // Send calendar invite email
  await emailService.sendCalendarInvite(prisma, candidate, {
    ...eventData,
    meetingLink: event.meetingLink,
    emailType: 'HR_INDUCTION_INVITE'
  });

  logger.info(`HR Induction scheduled for ${candidate.email}`);
  return event;
};

// Create CEO Induction
const createCEOInduction = async (prisma, candidate, dateTime, meetingLink = null) => {
  const startTime = new Date(dateTime);
  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + 45);

  const eventData = {
    title: `CEO Induction - ${candidate.firstName} ${candidate.lastName}`,
    description: `Meet with the CEO to learn about:\n- Company vision and mission\n- Growth strategy\n- Your role in the bigger picture`,
    startTime,
    endTime,
    attendees: [candidate.email],
    createMeet: !meetingLink
  };

  const googleEvent = await createGoogleEvent(eventData, prisma);

  const event = await prisma.calendarEvent.create({
    data: {
      candidateId: candidate.id,
      type: 'CEO_INDUCTION',
      title: eventData.title,
      description: eventData.description,
      startTime,
      endTime,
      meetingLink: meetingLink || googleEvent?.hangoutLink || googleEvent?.htmlLink,
      attendees: [candidate.email],
      googleEventId: googleEvent?.id
    }
  });

  await emailService.sendCalendarInvite(prisma, candidate, {
    ...eventData,
    meetingLink: event.meetingLink,
    emailType: 'CEO_INDUCTION_INVITE'
  });

  logger.info(`CEO Induction scheduled for ${candidate.email}`);
  return event;
};

// Create Sales Induction
const createSalesInduction = async (prisma, candidate, dateTime, meetingLink = null) => {
  const startTime = new Date(dateTime);
  const endTime = new Date(startTime);
  endTime.setHours(endTime.getHours() + 1);

  const eventData = {
    title: `Sales Induction with Brunda - ${candidate.firstName} ${candidate.lastName}`,
    description: `Sales team onboarding session covering:\n- Sales processes\n- Tools and CRM\n- Targets and expectations\n- Best practices`,
    startTime,
    endTime,
    attendees: [candidate.email],
    createMeet: !meetingLink
  };

  const googleEvent = await createGoogleEvent(eventData, prisma);

  const event = await prisma.calendarEvent.create({
    data: {
      candidateId: candidate.id,
      type: 'SALES_INDUCTION',
      title: eventData.title,
      description: eventData.description,
      startTime,
      endTime,
      meetingLink: meetingLink || googleEvent?.hangoutLink || googleEvent?.htmlLink,
      attendees: [candidate.email],
      googleEventId: googleEvent?.id
    }
  });

  await emailService.sendCalendarInvite(prisma, candidate, {
    ...eventData,
    meetingLink: event.meetingLink,
    emailType: 'SALES_INDUCTION_INVITE'
  });

  logger.info(`Sales Induction scheduled for ${candidate.email}`);
  return event;
};

// Create Check-in Call
const createCheckInCall = async (prisma, candidate, dateTime = null) => {
  // Default to 7 days after joining
  let startTime;
  if (dateTime) {
    startTime = new Date(dateTime);
  } else {
    const joiningDate = candidate.actualJoiningDate || candidate.expectedJoiningDate;
    startTime = new Date(joiningDate);
    startTime.setDate(startTime.getDate() + 7);
    startTime.setHours(15, 0, 0, 0); // 3 PM default
  }

  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + 30);

  const eventData = {
    title: `HR Check-in Call - ${candidate.firstName} ${candidate.lastName}`,
    description: `One week check-in call to discuss:\n- Your onboarding experience\n- Any challenges or concerns\n- Feedback and suggestions\n- Next steps`,
    startTime,
    endTime,
    attendees: [candidate.email],
    createMeet: true
  };

  const googleEvent = await createGoogleEvent(eventData, prisma);

  const event = await prisma.calendarEvent.create({
    data: {
      candidateId: candidate.id,
      type: 'CHECKIN_CALL',
      title: eventData.title,
      description: eventData.description,
      startTime,
      endTime,
      meetingLink: googleEvent?.hangoutLink || googleEvent?.htmlLink,
      attendees: [candidate.email],
      googleEventId: googleEvent?.id
    }
  });

  // Update check-in record
  await prisma.checkIn.updateMany({
    where: {
      candidateId: candidate.id,
      isCompleted: false
    },
    data: {
      scheduledDate: startTime
    }
  });

  await emailService.sendCalendarInvite(prisma, candidate, {
    ...eventData,
    meetingLink: event.meetingLink,
    emailType: 'CHECKIN_INVITE'
  });

  logger.info(`Check-in call scheduled for ${candidate.email}`);
  return event;
};

// Reschedule event
const rescheduleEvent = async (prisma, eventId, newStartTime, newEndTime) => {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId }
  });

  if (!event) {
    throw new Error('Event not found');
  }

  // Update Google Calendar if synced
  if (event.googleEventId) {
    try {
      await calendar.events.patch({
        calendarId: 'primary',
        eventId: event.googleEventId,
        resource: {
          start: {
            dateTime: newStartTime.toISOString(),
            timeZone: 'Asia/Kolkata'
          },
          end: {
            dateTime: newEndTime.toISOString(),
            timeZone: 'Asia/Kolkata'
          }
        },
        sendUpdates: 'all'
      });
    } catch (error) {
      logger.error('Error updating Google Calendar:', error);
    }
  }

  const updated = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      startTime: newStartTime,
      endTime: newEndTime,
      status: 'RESCHEDULED'
    }
  });

  logger.info(`Event ${eventId} rescheduled`);
  return updated;
};

// Cancel event
const cancelEvent = async (prisma, eventId) => {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId }
  });

  if (!event) {
    throw new Error('Event not found');
  }

  // Cancel in Google Calendar
  if (event.googleEventId) {
    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: event.googleEventId,
        sendUpdates: 'all'
      });
    } catch (error) {
      logger.error('Error canceling Google Calendar event:', error);
    }
  }

  const updated = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: { status: 'CANCELLED' }
  });

  logger.info(`Event ${eventId} cancelled`);
  return updated;
};

module.exports = {
  createHRInduction,
  createCEOInduction,
  createSalesInduction,
  createCheckInCall,
  rescheduleEvent,
  cancelEvent,
  createGoogleEvent,
  createEvent: createGoogleEvent // Alias for compatibility
};
