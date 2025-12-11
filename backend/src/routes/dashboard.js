const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(authenticateToken);

// Get dashboard overview stats
router.get('/overview', async (req, res) => {
  try {
    const today = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const [
      activeCandidates,
      joiningThisWeek,
      pendingOffers,
      pendingTasks
    ] = await Promise.all([
      req.prisma.candidate.count({ 
        where: { 
          status: { notIn: ['WITHDRAWN', 'REJECTED', 'COMPLETED'] } 
        } 
      }),
      req.prisma.candidate.count({
        where: {
          expectedJoiningDate: { gte: today, lte: weekFromNow },
          status: { in: ['OFFER_SIGNED', 'JOINING_PENDING'] }
        }
      }),
      req.prisma.candidate.count({ 
        where: { status: { in: ['OFFER_SENT', 'OFFER_VIEWED', 'OFFER_PENDING'] } } 
      }),
      req.prisma.task.count({ where: { status: 'PENDING' } })
    ]);

    res.json({
      success: true,
      data: {
        activeCandidates,
        joiningThisWeek,
        pendingOffers,
        pendingTasks
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard overview:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get pipeline visualization data
router.get('/pipeline', async (req, res) => {
  try {
    const stages = [
      { status: 'OFFER_PENDING', stage: 'Offer Pending' },
      { status: 'OFFER_SENT', stage: 'Offer Sent' },
      { status: 'OFFER_VIEWED', stage: 'Offer Viewed' },
      { status: 'OFFER_SIGNED', stage: 'Offer Signed' },
      { status: 'JOINING_PENDING', stage: 'Joining Pending' },
      { status: 'JOINED', stage: 'Joined' },
      { status: 'ONBOARDING', stage: 'Onboarding' },
      { status: 'COMPLETED', stage: 'Completed' }
    ];

    const pipelineData = await Promise.all(
      stages.map(async (s) => {
        const count = await req.prisma.candidate.count({ 
          where: { status: s.status } 
        });
        return { stage: s.stage, count };
      })
    );

    res.json({ success: true, data: pipelineData });
  } catch (error) {
    logger.error('Error fetching pipeline data:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get activity timeline
router.get('/activity', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const activities = await req.prisma.activityLog.findMany({
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        candidate: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });

    res.json({ success: true, data: activities });
  } catch (error) {
    logger.error('Error fetching activity timeline:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get upcoming joinings
router.get('/upcoming-joinings', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + parseInt(days));

    const upcomingJoinings = await req.prisma.candidate.findMany({
      where: {
        expectedJoiningDate: {
          gte: startDate,
          lte: endDate
        },
        status: {
          in: ['OFFER_SIGNED', 'JOINING_PENDING']
        }
      },
      orderBy: { expectedJoiningDate: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        position: true,
        department: true,
        expectedJoiningDate: true,
        status: true
      }
    });

    res.json({ success: true, data: upcomingJoinings });
  } catch (error) {
    logger.error('Error fetching upcoming joinings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get pending tasks
router.get('/pending-tasks', async (req, res) => {
  try {
    const tasks = await req.prisma.task.findMany({
      where: { status: 'PENDING' },
      orderBy: { dueDate: 'asc' },
      include: {
        candidate: {
          select: { firstName: true, lastName: true, email: true, department: true }
        }
      }
    });

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('Error fetching pending tasks:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get email statistics
router.get('/email-stats', async (req, res) => {
  try {
    const [total, sent, opened, clicked, failed] = await Promise.all([
      req.prisma.email.count(),
      req.prisma.email.count({ where: { status: 'SENT' } }),
      req.prisma.email.count({ where: { status: 'OPENED' } }),
      req.prisma.email.count({ where: { status: 'CLICKED' } }),
      req.prisma.email.count({ where: { status: 'FAILED' } })
    ]);

    // Email by type
    const byType = await req.prisma.email.groupBy({
      by: ['type'],
      _count: true
    });

    res.json({
      success: true,
      data: {
        total,
        sent,
        opened,
        clicked,
        failed,
        openRate: sent > 0 ? ((opened / sent) * 100).toFixed(1) : 0,
        clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(1) : 0,
        byType
      }
    });
  } catch (error) {
    logger.error('Error fetching email stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get department breakdown
router.get('/department-breakdown', async (req, res) => {
  try {
    const breakdown = await req.prisma.candidate.groupBy({
      by: ['department'],
      _count: true
    });

    res.json({
      success: true,
      data: breakdown.map(d => ({
        department: d.department,
        count: d._count
      }))
    });
  } catch (error) {
    logger.error('Error fetching department breakdown:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get check-in summary
router.get('/checkin-summary', async (req, res) => {
  try {
    const [total, completed, pending, avgRating] = await Promise.all([
      req.prisma.checkIn.count(),
      req.prisma.checkIn.count({ where: { isCompleted: true } }),
      req.prisma.checkIn.count({ where: { isCompleted: false } }),
      req.prisma.checkIn.aggregate({
        where: { isCompleted: true, rating: { not: null } },
        _avg: { rating: true }
      })
    ]);

    res.json({
      success: true,
      data: {
        total,
        completed,
        pending,
        avgRating: avgRating._avg.rating?.toFixed(1) || 'N/A'
      }
    });
  } catch (error) {
    logger.error('Error fetching check-in summary:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get monthly trends
router.get('/monthly-trends', async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const candidates = await req.prisma.candidate.findMany({
      where: {
        createdAt: { gte: sixMonthsAgo }
      },
      select: {
        createdAt: true,
        status: true
      }
    });

    // Group by month
    const monthlyData = {};
    candidates.forEach(c => {
      const month = c.createdAt.toISOString().slice(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = { added: 0, completed: 0 };
      }
      monthlyData[month].added++;
      if (c.status === 'COMPLETED') {
        monthlyData[month].completed++;
      }
    });

    res.json({
      success: true,
      data: Object.entries(monthlyData).map(([month, data]) => ({
        month,
        ...data
      }))
    });
  } catch (error) {
    logger.error('Error fetching monthly trends:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
