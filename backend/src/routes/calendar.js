const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken } = require('../middleware/auth');
const calendarService = require('../services/calendarService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

// Configure multer for calendar event attachments (universal for all steps)
const calendarAttachmentStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, `../../uploads/calendar-attachments`);
    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const uploadCalendarAttachment = multer({
  storage: calendarAttachmentStorage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 }, // 10MB default
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents, and images are allowed'));
    }
  }
});

// Helper to convert absolute file path to relative path for storage
const getRelativeFilePath = (filePath) => {
  if (!filePath) return null;
  const uploadsDir = path.join(__dirname, '../../uploads');
  const relativePath = path.relative(uploadsDir, filePath);
  return relativePath.replace(/\\/g, '/'); // Normalize path separators
};

// Apply authentication to all routes
router.use(authenticateToken);

// Get all calendar events
router.get('/', async (req, res) => {
  try {
    const { candidateId, type, status, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    const where = {};
    if (candidateId) where.candidateId = candidateId;
    if (type) where.type = type;
    if (status) where.status = status;
    
    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = new Date(startDate);
      if (endDate) where.startTime.lte = new Date(endDate);
    }

    const [events, total] = await Promise.all([
      req.prisma.calendarEvent.findMany({
        where,
        include: {
          candidate: {
            select: { id: true, firstName: true, lastName: true, email: true, position: true }
          }
        },
        orderBy: { startTime: 'asc' },
        skip: (page - 1) * limit,
        take: parseInt(limit)
      }),
      req.prisma.calendarEvent.count({ where })
    ]);

    res.json({
      success: true,
      data: events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching calendar events:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get today's events
router.get('/today', async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const events = await req.prisma.calendarEvent.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: { not: 'CANCELLED' }
      },
      include: {
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true, position: true }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    res.json({ success: true, data: events });
  } catch (error) {
    logger.error('Error fetching today\'s events:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get upcoming events (next 7 days)
router.get('/upcoming', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));

    const events = await req.prisma.calendarEvent.findMany({
      where: {
        startTime: {
          gte: now,
          lte: futureDate
        },
        status: { not: 'CANCELLED' }
      },
      include: {
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true, position: true }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    res.json({ success: true, data: events });
  } catch (error) {
    logger.error('Error fetching upcoming events:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get event by ID
router.get('/:id', async (req, res) => {
  try {
    const event = await req.prisma.calendarEvent.findUnique({
      where: { id: req.params.id },
      include: {
        candidate: true
      }
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Error fetching event:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create calendar event (with optional attachment support for all steps)
router.post('/', uploadCalendarAttachment.single('attachment'), async (req, res) => {
  try {
    let { 
      candidateId, 
      type, 
      title, 
      description, 
      startTime, 
      endTime, 
      attendees,
      location,
      meetingLink,
      stepNumber
    } = req.body;

    // Handle attendees if it's a JSON string (from FormData)
    if (typeof attendees === 'string') {
      try {
        attendees = JSON.parse(attendees);
      } catch (e) {
        attendees = [attendees];
      }
    }

    // Handle attachment if uploaded
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = getRelativeFilePath(req.file.path);
      logger.info(`📎 Attachment uploaded for calendar event: ${attachmentPath}`);
    }

    // Create event in Google Calendar
    let googleEventId = null;
    try {
      const googleEvent = await calendarService.createEvent({
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        attendees: attendees || [],
        location,
        meetingLink
      });
      googleEventId = googleEvent.id;
    } catch (gcalError) {
      logger.warn('Google Calendar event creation failed:', gcalError);
    }

    // Get candidate for email sending
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: candidateId }
    });

    // Create event in database (with universal attachment support and stepNumber for unique identification)
    const event = await req.prisma.calendarEvent.create({
      data: {
        candidateId,
        type,
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        attendees: attendees || [],
        location,
        meetingLink,
        googleEventId,
        attachmentPath: attachmentPath, // Universal attachment support for all steps
        stepNumber: stepNumber ? parseInt(stepNumber) : null, // Step number for unique step identification
        status: 'SCHEDULED'
      }
    });

    // Email will be sent automatically when the calendar event auto-completes at the scheduled time
    // (handled by autoCompleteCalendarSteps in scheduler.js)
    // No email is sent immediately when scheduling to avoid sending schedule details
    logger.info(`📅 Calendar event created for ${candidate?.email || candidateId} - Email will be sent at scheduled time: ${new Date(startTime).toLocaleString('en-IN')}`);

    // Log activity
    if (req.user && req.user.id) {
      try {
        await req.prisma.activityLog.create({
          data: {
            candidateId,
            userId: req.user.id,
            action: 'CALENDAR_EVENT_CREATED',
            description: `Calendar event created: ${title}`,
            metadata: { eventId: event.id, type }
          }
        });
      } catch (logError) {
        logger.warn('Failed to log activity:', logError);
        // Continue even if logging fails
      }
    }

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    logger.error('Error creating calendar event:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update calendar event
router.put('/:id', async (req, res) => {
  try {
    const { title, description, startTime, endTime, attendees, location, meetingLink, status } = req.body;

    const existing = await req.prisma.calendarEvent.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Update in Google Calendar if linked
    if (existing.googleEventId) {
      try {
        await calendarService.updateEvent(existing.googleEventId, {
          title: title || existing.title,
          description: description || existing.description,
          startTime: startTime ? new Date(startTime) : existing.startTime,
          endTime: endTime ? new Date(endTime) : existing.endTime,
          attendees: attendees || existing.attendees
        });
      } catch (gcalError) {
        logger.warn('Google Calendar event update failed:', gcalError);
      }
    }

    const event = await req.prisma.calendarEvent.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(startTime && { startTime: new Date(startTime) }),
        ...(endTime && { endTime: new Date(endTime) }),
        ...(attendees && { attendees }),
        ...(location && { location }),
        ...(meetingLink && { meetingLink }),
        ...(status && { status })
      }
    });

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Error updating calendar event:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reschedule event
router.post('/:id/reschedule', async (req, res) => {
  try {
    const { dateTime, duration, reason } = req.body;

    const existing = await req.prisma.calendarEvent.findUnique({
      where: { id: req.params.id },
      include: { candidate: true }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const newStartTime = new Date(dateTime);
    const newEndTime = new Date(newStartTime);
    newEndTime.setMinutes(newEndTime.getMinutes() + (duration || 60));

    // Update in Google Calendar
    if (existing.googleEventId) {
      try {
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        await calendar.events.patch({
          calendarId: 'primary',
          eventId: existing.googleEventId,
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
      } catch (gcalError) {
        logger.warn('Google Calendar reschedule failed:', gcalError);
      }
    }

    const event = await req.prisma.calendarEvent.update({
      where: { id: req.params.id },
      data: {
        startTime: newStartTime,
        endTime: newEndTime,
        status: 'RESCHEDULED'
      }
    });

    // Log activity
    if (req.user && req.user.id) {
      try {
        await req.prisma.activityLog.create({
          data: {
            candidateId: existing.candidateId,
            userId: req.user.id,
            action: 'EVENT_RESCHEDULED',
            description: `Event rescheduled: ${existing.title}`,
            metadata: { eventId: event.id, reason }
          }
        });
      } catch (logError) {
        logger.warn('Failed to log activity:', logError);
        // Continue even if logging fails
      }
    }

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Error rescheduling event:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel event
router.post('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;

    const existing = await req.prisma.calendarEvent.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Cancel in Google Calendar
    if (existing.googleEventId) {
      try {
        await calendarService.deleteEvent(existing.googleEventId);
      } catch (gcalError) {
        logger.warn('Google Calendar event deletion failed:', gcalError);
      }
    }

    const event = await req.prisma.calendarEvent.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        metadata: {
          ...existing.metadata,
          cancelledAt: new Date().toISOString(),
          cancellationReason: reason
        }
      }
    });

    // Log activity
    if (req.user && req.user.id) {
      try {
        await req.prisma.activityLog.create({
          data: {
            candidateId: existing.candidateId,
            userId: req.user.id,
            action: 'EVENT_CANCELLED',
            description: `Event cancelled: ${existing.title}`,
            metadata: { eventId: event.id, reason }
          }
        });
      } catch (logError) {
        logger.warn('Failed to log activity:', logError);
        // Continue even if logging fails
      }
    }

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Error cancelling event:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark event as completed
router.post('/:id/complete', async (req, res) => {
  try {
    const { notes } = req.body;

    const event = await req.prisma.calendarEvent.update({
      where: { id: req.params.id },
      data: {
        status: 'COMPLETED',
        metadata: {
          completedAt: new Date().toISOString(),
          completionNotes: notes
        }
      }
    });

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Error completing event:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get calendar statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const [
      totalThisMonth,
      completed,
      cancelled,
      upcoming,
      byType
    ] = await Promise.all([
      req.prisma.calendarEvent.count({
        where: {
          startTime: { gte: startOfMonth, lte: endOfMonth }
        }
      }),
      req.prisma.calendarEvent.count({
        where: {
          status: 'COMPLETED',
          startTime: { gte: startOfMonth, lte: endOfMonth }
        }
      }),
      req.prisma.calendarEvent.count({
        where: {
          status: 'CANCELLED',
          startTime: { gte: startOfMonth, lte: endOfMonth }
        }
      }),
      req.prisma.calendarEvent.count({
        where: {
          startTime: { gte: today },
          status: 'SCHEDULED'
        }
      }),
      req.prisma.calendarEvent.groupBy({
        by: ['type'],
        _count: { id: true },
        where: {
          startTime: { gte: startOfMonth, lte: endOfMonth }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalThisMonth,
        completed,
        cancelled,
        upcoming,
        byType
      }
    });
  } catch (error) {
    logger.error('Error fetching calendar stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
