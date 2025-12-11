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

// Single file upload (backward compatibility)
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

// Multiple files upload (new feature)
const uploadCalendarAttachments = multer({
  storage: calendarAttachmentStorage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents, and images are allowed'));
    }
  }
}).array('attachments', 10); // Allow up to 10 attachments

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

// Create calendar event (with optional single or multiple attachment support for all steps)
router.post('/', (req, res, next) => {
  // Check if multiple attachments are being uploaded
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    // Use multiple file upload handler
    uploadCalendarAttachments(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  } else {
    // Use single file upload handler (backward compatibility)
    uploadCalendarAttachment.single('attachment')(req, res, next);
  }
}, async (req, res) => {
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
      stepNumber,
      eventId,
      existingAttachmentPaths
    } = req.body;

    // Handle attendees if it's a JSON string (from FormData)
    if (typeof attendees === 'string') {
      try {
        attendees = JSON.parse(attendees);
      } catch (e) {
        attendees = [attendees];
      }
    }

    // Handle attachments (support both single and multiple, and preserve existing when editing)
    let attachmentPath = null; // Single attachment (backward compatibility)
    let attachmentPaths = []; // Multiple attachments (new feature)
    
    // If editing an event, fetch and preserve existing attachments
    if (eventId) {
      try {
        const existingEvent = await req.prisma.calendarEvent.findUnique({
          where: { id: eventId }
        });
        
        if (existingEvent) {
          // Preserve existing attachments
          if (existingEvent.attachmentPaths && Array.isArray(existingEvent.attachmentPaths)) {
            attachmentPaths = [...existingEvent.attachmentPaths];
            attachmentPath = attachmentPaths[0] || null;
          } else if (existingEvent.attachmentPath) {
            attachmentPaths = [existingEvent.attachmentPath];
            attachmentPath = existingEvent.attachmentPath;
          }
          
          // Also check if existingAttachmentPaths was sent (in case user removed some)
          if (existingAttachmentPaths) {
            try {
              const keptPaths = typeof existingAttachmentPaths === 'string' 
                ? JSON.parse(existingAttachmentPaths) 
                : existingAttachmentPaths;
              if (Array.isArray(keptPaths)) {
                // User may have removed some existing attachments, use only the kept ones
                attachmentPaths = keptPaths;
                attachmentPath = keptPaths[0] || null;
              }
            } catch (e) {
              logger.warn('Failed to parse existing attachment paths:', e);
            }
          }
        }
      } catch (e) {
        logger.warn('Failed to fetch existing event for attachment preservation:', e);
      }
    }
    
    // Add new attachments to existing ones
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      // Multiple new files uploaded - append to existing
      const newPaths = req.files.map(file => getRelativeFilePath(file.path));
      attachmentPaths = [...attachmentPaths, ...newPaths];
      attachmentPath = attachmentPaths[0]; // First file for backward compatibility
      logger.info(`📎 ${req.files.length} new attachment(s) added. Total: ${attachmentPaths.length} attachment(s)`);
    } else if (req.file) {
      // Single new file uploaded - append to existing
      const newPath = getRelativeFilePath(req.file.path);
      attachmentPaths = [...attachmentPaths, newPath];
      attachmentPath = attachmentPaths[0];
      logger.info(`📎 New attachment added. Total: ${attachmentPaths.length} attachment(s)`);
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

    // If this is Step 1 (OFFER_LETTER) with attachment, also save it to candidate.offerLetterPath
    // This ensures the offer letter shows in the candidate profile section
    if (type === 'OFFER_LETTER' && attachmentPath) {
      await req.prisma.candidate.update({
        where: { id: candidateId },
        data: { offerLetterPath: attachmentPath }
      });
      logger.info(`✅ Saved offer letter attachment to candidate profile: ${attachmentPath}`);
    }

    // Create or update event in database (with universal single and multiple attachment support and stepNumber for unique identification)
    let event;
    if (eventId) {
      // Update existing event (when editing/rescheduling)
      event = await req.prisma.calendarEvent.update({
        where: { id: eventId },
        data: {
          title,
          description,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          attendees: attendees || [],
          location,
          meetingLink,
          attachmentPath: attachmentPath, // Single attachment (backward compatibility)
          attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : null, // Multiple attachments (new feature)
          status: 'SCHEDULED'
        }
      });
      logger.info(`📅 Calendar event updated: ${event.id} with ${attachmentPaths.length} attachment(s)`);
    } else {
      // Create new event
      event = await req.prisma.calendarEvent.create({
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
          attachmentPath: attachmentPath, // Single attachment (backward compatibility)
          attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : null, // Multiple attachments (new feature)
          stepNumber: stepNumber ? parseInt(stepNumber) : null, // Step number for unique step identification
          status: 'SCHEDULED'
        }
      });
      logger.info(`📅 Calendar event created: ${event.id} with ${attachmentPaths.length} attachment(s)`);
    }

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
