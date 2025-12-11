const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

router.use(authenticateToken);

// Get all emails with filters
router.get('/', async (req, res) => {
  try {
    const { candidateId, type, status, page = 1, limit = 20 } = req.query;
    
    const where = {};
    if (candidateId) where.candidateId = candidateId;
    if (type) where.type = type;
    if (status) where.status = status;

    const [emails, total] = await Promise.all([
      req.prisma.email.findMany({
        where,
        include: {
          candidate: {
            select: { id: true, firstName: true, lastName: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit)
      }),
      req.prisma.email.count({ where })
    ]);

    res.json({
      success: true,
      data: emails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching emails:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get email by ID
router.get('/:id', async (req, res) => {
  try {
    const email = await req.prisma.email.findUnique({
      where: { id: req.params.id },
      include: { candidate: true }
    });

    if (!email) {
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    res.json({ success: true, data: email });
  } catch (error) {
    logger.error('Error fetching email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Send custom email
router.post('/send', async (req, res) => {
  try {
    const { candidateId, subject, body, type = 'CUSTOM' } = req.body;

    const candidate = await req.prisma.candidate.findUnique({
      where: { id: candidateId }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const result = await emailService.sendCustomEmail({
      to: candidate.email,
      subject,
      body,
      candidateId,
      type
    }, req.prisma);

    await req.prisma.activityLog.create({
      data: {
        candidateId,
        action: 'EMAIL_SENT',
        description: `Custom email sent: ${subject}`,
        performedBy: req.user.id,
        metadata: { emailId: result.emailId, type }
      }
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error sending custom email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Schedule email
router.post('/schedule', async (req, res) => {
  try {
    const { candidateId, subject, body, type, scheduledFor } = req.body;

    const candidate = await req.prisma.candidate.findUnique({
      where: { id: candidateId }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const email = await req.prisma.email.create({
      data: {
        candidateId,
        type: type || 'CUSTOM',
        subject,
        body,
        status: 'SCHEDULED',
        scheduledFor: new Date(scheduledFor),
        trackingId: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    });

    await req.prisma.reminder.create({
      data: {
        candidateId,
        type: 'EMAIL_SCHEDULED',
        message: `Send scheduled email: ${subject}`,
        dueDate: new Date(scheduledFor),
        metadata: { emailId: email.id }
      }
    });

    res.json({ success: true, data: email });
  } catch (error) {
    logger.error('Error scheduling email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Resend email
router.post('/:id/resend', async (req, res) => {
  try {
    const email = await req.prisma.email.findUnique({
      where: { id: req.params.id },
      include: { candidate: true }
    });

    if (!email) {
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    const result = await emailService.sendCustomEmail({
      to: email.candidate.email,
      subject: email.subject,
      body: email.body,
      candidateId: email.candidateId,
      type: email.type
    }, req.prisma);

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error resending email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get email statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [total, sent, opened, clicked, failed] = await Promise.all([
      req.prisma.email.count({ where }),
      req.prisma.email.count({ where: { ...where, status: 'SENT' } }),
      req.prisma.email.count({ where: { ...where, status: 'OPENED' } }),
      req.prisma.email.count({ where: { ...where, status: 'CLICKED' } }),
      req.prisma.email.count({ where: { ...where, status: 'FAILED' } })
    ]);

    const openRate = sent > 0 ? ((opened + clicked) / sent * 100).toFixed(2) : 0;
    const clickRate = (opened + clicked) > 0 ? (clicked / (opened + clicked) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        total,
        sent,
        opened,
        clicked,
        failed,
        openRate: parseFloat(openRate),
        clickRate: parseFloat(clickRate)
      }
    });
  } catch (error) {
    logger.error('Error fetching email stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel scheduled email
router.delete('/:id/cancel', async (req, res) => {
  try {
    const email = await req.prisma.email.findUnique({
      where: { id: req.params.id }
    });

    if (!email) {
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    if (email.status !== 'SCHEDULED') {
      return res.status(400).json({ success: false, message: 'Only scheduled emails can be cancelled' });
    }

    await req.prisma.email.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' }
    });

    res.json({ success: true, message: 'Email cancelled successfully' });
  } catch (error) {
    logger.error('Error cancelling email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
