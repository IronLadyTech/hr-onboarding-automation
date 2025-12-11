const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Helper to convert absolute file path to relative path for storage
const getRelativeFilePath = (filePath) => {
  if (!filePath) return null;
  // Convert to relative path from uploads directory
  const uploadsDir = path.join(__dirname, '../../uploads');
  const relativePath = path.relative(uploadsDir, filePath);
  // Normalize to forward slashes for URLs (works on both Windows and Unix)
  return relativePath.split(path.sep).join('/');
};

// Configure multer for signed offer uploads via webhook
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/signed-offers');
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'signed-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Email open tracking webhook (pixel loaded)
router.get('/email/open/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    const email = await req.prisma.email.findFirst({
      where: { trackingId },
      include: { candidate: true }
    });

    if (email) {
      await req.prisma.email.update({
        where: { id: email.id },
        data: { 
          status: 'OPENED',
          openedAt: new Date()
        }
      });

      // Update candidate status if offer letter was viewed
      if (email.type === 'OFFER_LETTER' && email.candidate) {
        await req.prisma.candidate.update({
          where: { id: email.candidateId },
          data: { 
            status: 'OFFER_VIEWED',
            offerViewedAt: new Date()
          }
        });

        await req.prisma.activityLog.create({
          data: {
            candidateId: email.candidateId,
            action: 'OFFER_VIEWED',
            description: 'Candidate viewed offer letter email'
          }
        });
      }

      logger.info(`Email opened: ${trackingId}`);
    }
  } catch (error) {
    logger.error('Error tracking email open:', error);
  }

  // Return 1x1 transparent pixel
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(pixel);
});

// Email click tracking webhook
router.get('/email/click/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const { url } = req.query;

    const email = await req.prisma.email.findFirst({
      where: { trackingId }
    });

    if (email) {
      await req.prisma.email.update({
        where: { id: email.id },
        data: { 
          status: 'CLICKED',
          clickedAt: new Date()
        }
      });

      logger.info(`Email link clicked: ${trackingId}`);
    }

    // Redirect to original URL
    if (url) {
      res.redirect(decodeURIComponent(url));
    } else {
      res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
    }
  } catch (error) {
    logger.error('Error tracking email click:', error);
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
  }
});

// Signed offer received via email reply webhook
router.post('/email/reply', async (req, res) => {
  try {
    const { from, subject, body, attachments, inReplyTo } = req.body;

    logger.info('Email reply webhook received', { from, subject });

    // Find candidate by email
    const candidate = await req.prisma.candidate.findFirst({
      where: { email: from.toLowerCase() }
    });

    if (!candidate) {
      logger.warn('Email reply from unknown sender:', from);
      return res.json({ success: true, message: 'Processed' });
    }

    // Check if this is a signed offer reply
    const isSignedOffer = subject.toLowerCase().includes('signed') || 
                          subject.toLowerCase().includes('offer') ||
                          (attachments && attachments.length > 0);

    if (isSignedOffer && attachments && attachments.length > 0) {
      // Update candidate with signed offer
      await req.prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          status: 'OFFER_ACCEPTED',
          offerSignedAt: new Date()
        }
      });

      // Log activity
      await req.prisma.activityLog.create({
        data: {
          candidateId: candidate.id,
          action: 'OFFER_SIGNED',
          description: 'Signed offer received via email reply',
          metadata: { attachmentCount: attachments.length }
        }
      });

      logger.info(`Signed offer received for candidate: ${candidate.name}`);
    }

    res.json({ success: true, message: 'Email reply processed' });
  } catch (error) {
    logger.error('Error processing email reply webhook:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Signed offer upload webhook (from external form or direct upload)
router.post('/signed-offer', upload.single('signedOffer'), async (req, res) => {
  try {
    const { candidateId, candidateEmail } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Find candidate
    let candidate;
    if (candidateId) {
      candidate = await req.prisma.candidate.findUnique({
        where: { id: candidateId }
      });
    } else if (candidateEmail) {
      candidate = await req.prisma.candidate.findFirst({
        where: { email: candidateEmail.toLowerCase() }
      });
    }

    if (!candidate) {
      // Clean up uploaded file
      await fs.unlink(file.path);
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Update candidate
    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        status: 'OFFER_ACCEPTED',
        signedOfferPath: getRelativeFilePath(file.path),
        offerSignedAt: new Date()
      }
    });

    // Log activity
    await req.prisma.activityLog.create({
      data: {
        candidateId: candidate.id,
        action: 'SIGNED_OFFER_UPLOADED',
        description: 'Signed offer letter uploaded via webhook',
        metadata: { filename: file.filename }
      }
    });

    logger.info(`Signed offer uploaded for candidate: ${candidate.name}`);

    res.json({ 
      success: true, 
      message: 'Signed offer received successfully',
      data: { candidateId: candidate.id }
    });
  } catch (error) {
    logger.error('Error processing signed offer webhook:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Onboarding form completion webhook
router.post('/form/completed', async (req, res) => {
  try {
    const { candidateId, candidateEmail, formData, formType = 'ONBOARDING' } = req.body;

    // Find candidate
    let candidate;
    if (candidateId) {
      candidate = await req.prisma.candidate.findUnique({
        where: { id: candidateId }
      });
    } else if (candidateEmail) {
      candidate = await req.prisma.candidate.findFirst({
        where: { email: candidateEmail.toLowerCase() }
      });
    }

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Update candidate
    const updateData = {
      onboardingFormCompleted: true,
      onboardingFormCompletedAt: new Date()
    };

    // Store additional form data if provided
    if (formData) {
      updateData.metadata = {
        ...candidate.metadata,
        onboardingFormData: formData
      };
    }

    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: updateData
    });

    // Mark any form reminders as completed
    await req.prisma.reminder.updateMany({
      where: {
        candidateId: candidate.id,
        type: 'FORM_REMINDER',
        status: 'PENDING'
      },
      data: { status: 'COMPLETED' }
    });

    // Log activity
    await req.prisma.activityLog.create({
      data: {
        candidateId: candidate.id,
        action: 'FORM_COMPLETED',
        description: `${formType} form completed`,
        metadata: { formType }
      }
    });

    logger.info(`Onboarding form completed for candidate: ${candidate.name}`);

    res.json({ 
      success: true, 
      message: 'Form completion recorded',
      data: { candidateId: candidate.id }
    });
  } catch (error) {
    logger.error('Error processing form completion webhook:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Calendar event response webhook (Google Calendar)
router.post('/calendar/response', async (req, res) => {
  try {
    const { eventId, attendeeEmail, response } = req.body;

    // Find event by Google event ID
    const event = await req.prisma.calendarEvent.findFirst({
      where: { googleEventId: eventId }
    });

    if (!event) {
      logger.warn('Calendar response for unknown event:', eventId);
      return res.json({ success: true, message: 'Processed' });
    }

    // Update attendee response in event metadata
    const attendeeResponses = event.metadata?.attendeeResponses || {};
    attendeeResponses[attendeeEmail] = {
      response,
      respondedAt: new Date().toISOString()
    };

    await req.prisma.calendarEvent.update({
      where: { id: event.id },
      data: {
        metadata: {
          ...event.metadata,
          attendeeResponses
        }
      }
    });

    // Log activity
    await req.prisma.activityLog.create({
      data: {
        candidateId: event.candidateId,
        action: 'CALENDAR_RESPONSE',
        description: `Calendar event ${response}: ${event.title}`,
        metadata: { eventId: event.id, response, attendeeEmail }
      }
    });

    logger.info(`Calendar response received: ${response} for event ${event.title}`);

    res.json({ success: true, message: 'Response recorded' });
  } catch (error) {
    logger.error('Error processing calendar response webhook:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// WATI WhatsApp webhook
router.post('/wati/message', async (req, res) => {
  try {
    const { waNumber, text, timestamp, type } = req.body;

    logger.info('WATI webhook received', { waNumber, type });

    // Find candidate by phone number
    const candidate = await req.prisma.candidate.findFirst({
      where: { 
        phone: { contains: waNumber.slice(-10) }
      }
    });

    if (candidate) {
      // Log activity
      await req.prisma.activityLog.create({
        data: {
          candidateId: candidate.id,
          action: 'WHATSAPP_MESSAGE',
          description: 'WhatsApp message received',
          metadata: { 
            messageType: type,
            timestamp,
            preview: text?.substring(0, 100)
          }
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error processing WATI webhook:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Zoho CRM webhook (lead status update)
router.post('/zoho/lead-update', async (req, res) => {
  try {
    const { leadId, status, email } = req.body;

    logger.info('Zoho webhook received', { leadId, status });

    // Find candidate by Zoho lead ID or email
    const candidate = await req.prisma.candidate.findFirst({
      where: {
        OR: [
          { zohoLeadId: leadId },
          { email: email?.toLowerCase() }
        ]
      }
    });

    if (candidate) {
      await req.prisma.activityLog.create({
        data: {
          candidateId: candidate.id,
          action: 'ZOHO_UPDATE',
          description: `Zoho lead status updated to: ${status}`,
          metadata: { leadId, status }
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error processing Zoho webhook:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Health check for webhooks
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Webhook endpoints operational',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
