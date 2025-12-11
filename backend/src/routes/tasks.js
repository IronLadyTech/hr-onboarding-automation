const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// Apply authentication to all routes
router.use(authenticateToken);

// Get all tasks
router.get('/', async (req, res) => {
  try {
    const { candidateId, status, type, department, page = 1, limit = 100 } = req.query;
    
    const where = {};
    if (candidateId) where.candidateId = candidateId;
    if (status) where.status = status;
    if (type) where.type = type;
    
    // Filter by department through candidate
    if (department) {
      where.candidate = {
        department: department
      };
    }

    const [tasks, total] = await Promise.all([
      req.prisma.task.findMany({
        where,
        include: {
          candidate: {
            select: { 
              id: true, 
              firstName: true, 
              lastName: true, 
              email: true, 
              position: true, 
              department: true,
              expectedJoiningDate: true 
            }
          }
        },
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * limit,
        take: parseInt(limit)
      }),
      req.prisma.task.count({ where })
    ]);

    res.json({
      success: true,
      data: tasks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching tasks:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get pending tasks for current user
router.get('/my-tasks', async (req, res) => {
  try {
    const { department } = req.query;
    
    const where = {
      status: 'PENDING'
    };
    
    // Filter by department through candidate
    if (department) {
      where.candidate = {
        department: department
      };
    }
    
    const tasks = await req.prisma.task.findMany({
      where,
      include: {
        candidate: {
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            email: true, 
            position: true,
            department: true,
            expectedJoiningDate: true 
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('Error fetching my tasks:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get overdue tasks
router.get('/overdue', async (req, res) => {
  try {
    const tasks = await req.prisma.task.findMany({
      where: {
        status: 'PENDING',
        dueDate: { lt: new Date() }
      },
      include: {
        candidate: {
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            email: true, 
            position: true 
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('Error fetching overdue tasks:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get today's tasks
router.get('/today', async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const tasks = await req.prisma.task.findMany({
      where: {
        status: 'PENDING',
        dueDate: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        candidate: {
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            email: true, 
            position: true 
          }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('Error fetching today\'s tasks:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get task statistics - MOVE THIS BEFORE /:id to avoid conflict
router.get('/stats/overview', async (req, res) => {
  try {
    const [total, pending, completed, overdue] = await Promise.all([
      req.prisma.task.count(),
      req.prisma.task.count({ where: { status: 'PENDING' } }),
      req.prisma.task.count({ where: { status: 'COMPLETED' } }),
      req.prisma.task.count({
        where: {
          status: 'PENDING',
          dueDate: { lt: new Date() }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        total,
        pending,
        completed,
        overdue,
        completionRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    logger.error('Error fetching task stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get task by ID
router.get('/:id', async (req, res) => {
  try {
    const task = await req.prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        candidate: true
      }
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    logger.error('Error fetching task:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new task
router.post('/', async (req, res) => {
  try {
    const { candidateId, type, title, description, dueDate } = req.body;

    // candidateId is optional - tasks can be department-level
    const taskData = {
      candidateId: candidateId || null,
      type: type || 'MANUAL',
      title,
      description,
      dueDate: dueDate ? new Date(dueDate) : null,
      status: 'PENDING'
    };

    const task = await req.prisma.task.create({
      data: taskData,
      include: {
        candidate: {
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            email: true, 
            position: true,
            department: true,
            expectedJoiningDate: true 
          }
        }
      }
    });

    // Log activity only if candidateId is provided
    if (candidateId) {
      await req.prisma.activityLog.create({
        data: {
          candidateId,
          userId: req.user.id,
          action: 'TASK_CREATED',
          description: `Task created: ${title}`
        }
      });
    }

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    logger.error('Error creating task:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update task
router.put('/:id', async (req, res) => {
  try {
    const { title, description, dueDate, status } = req.body;

    const task = await req.prisma.task.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...(status && { status })
      }
    });

    res.json({ success: true, data: task });
  } catch (error) {
    logger.error('Error updating task:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark task as completed
router.post('/:id/complete', async (req, res) => {
  try {
    const task = await req.prisma.task.update({
      where: { id: req.params.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: req.user.id
      }
    });

    // Log activity
    if (task.candidateId) {
      await req.prisma.activityLog.create({
        data: {
          candidateId: task.candidateId,
          userId: req.user.id,
          action: 'TASK_COMPLETED',
          description: `Task completed: ${task.title}`
        }
      });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    logger.error('Error completing task:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Snooze task
router.post('/:id/snooze', async (req, res) => {
  try {
    const { hours = 24 } = req.body;

    const existing = await req.prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const newDueDate = new Date();
    newDueDate.setHours(newDueDate.getHours() + hours);

    const task = await req.prisma.task.update({
      where: { id: req.params.id },
      data: {
        dueDate: newDueDate
      }
    });

    res.json({ success: true, data: task });
  } catch (error) {
    logger.error('Error snoozing task:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Skip task
router.post('/:id/skip', async (req, res) => {
  try {
    const task = await req.prisma.task.update({
      where: { id: req.params.id },
      data: {
        status: 'SKIPPED'
      }
    });

    res.json({ success: true, data: task });
  } catch (error) {
    logger.error('Error skipping task:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    await req.prisma.task.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    logger.error('Error deleting task:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Bulk create tasks for candidate
router.post('/bulk', async (req, res) => {
  try {
    const { candidateId, tasks } = req.body;

    const createdTasks = await Promise.all(
      tasks.map(task =>
        req.prisma.task.create({
          data: {
            candidateId,
            type: task.type || 'MANUAL',
            title: task.title,
            description: task.description,
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
            status: 'PENDING'
          }
        })
      )
    );

    res.status(201).json({ 
      success: true, 
      data: createdTasks,
      message: `Created ${createdTasks.length} tasks`
    });
  } catch (error) {
    logger.error('Error bulk creating tasks:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize default tasks for all departments
router.post('/init-department-tasks', async (req, res) => {
  try {
    const { department } = req.body;
    
    if (!department) {
      return res.status(400).json({ success: false, message: 'Department is required' });
    }

    // Get all candidates in this department
    const candidates = await req.prisma.candidate.findMany({
      where: { department }
    });

    let createdCount = 0;
    let skippedCount = 0;

    for (const candidate of candidates) {
      // Check if candidate already has tasks
      const existingTasks = await req.prisma.task.count({
        where: { candidateId: candidate.id }
      });

      if (existingTasks === 0) {
        // Create tasks for this candidate
        await createDepartmentTasks(req.prisma, candidate);
        createdCount++;
      } else {
        skippedCount++;
      }
    }

    res.json({
      success: true,
      message: `Initialized tasks for ${department} department`,
      data: {
        department,
        candidatesProcessed: candidates.length,
        tasksCreated: createdCount,
        candidatesSkipped: skippedCount
      }
    });
  } catch (error) {
    logger.error('Error initializing department tasks:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper function to create department tasks (same as in candidates.js)
const createDepartmentTasks = async (prisma, candidate) => {
  const department = candidate.department;
  const joiningDate = candidate.expectedJoiningDate || candidate.actualJoiningDate || new Date();
  
  const taskTemplates = [
    {
      step: 1,
      type: 'OFFER_LETTER',
      title: `Send Offer Letter - ${candidate.firstName} ${candidate.lastName}`,
      description: `Upload and send offer letter to ${candidate.firstName} ${candidate.lastName} for ${candidate.position} position in ${department} department.`,
      dueDate: new Date(),
      priority: 'HIGH'
    },
    {
      step: 2,
      type: 'OFFER_REMINDER',
      title: `Offer Reminder - ${candidate.firstName} ${candidate.lastName}`,
      description: `Send reminder email if offer letter is not signed within 3 days.`,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      priority: 'MEDIUM'
    },
    {
      step: 3,
      type: 'WELCOME_EMAIL',
      title: `Welcome Email (Day -1) - ${candidate.firstName} ${candidate.lastName}`,
      description: `Send welcome email one day before joining date.`,
      dueDate: new Date(new Date(joiningDate).getTime() - 24 * 60 * 60 * 1000),
      priority: 'MEDIUM'
    },
    {
      step: 4,
      type: 'HR_INDUCTION',
      title: `HR Induction - ${candidate.firstName} ${candidate.lastName}`,
      description: `Schedule HR induction meeting at 9:30 AM on joining day.`,
      dueDate: joiningDate,
      priority: 'HIGH'
    },
    {
      step: 5,
      type: 'WHATSAPP_ADDITION',
      title: `Add to WhatsApp Groups - ${candidate.firstName} ${candidate.lastName}`,
      description: `Add ${candidate.firstName} ${candidate.lastName} to relevant WhatsApp groups for ${department} department.`,
      dueDate: joiningDate,
      priority: 'HIGH'
    },
    {
      step: 6,
      type: 'ONBOARDING_FORM',
      title: `Send Onboarding Form - ${candidate.firstName} ${candidate.lastName}`,
      description: `Send onboarding form email within 1 hour of joining.`,
      dueDate: joiningDate,
      priority: 'HIGH'
    },
    {
      step: 7,
      type: 'FORM_REMINDER',
      title: `Form Reminder - ${candidate.firstName} ${candidate.lastName}`,
      description: `Send reminder if onboarding form is not completed within 24 hours.`,
      dueDate: new Date(new Date(joiningDate).getTime() + 24 * 60 * 60 * 1000),
      priority: 'MEDIUM'
    },
    {
      step: 8,
      type: 'CEO_INDUCTION',
      title: `CEO Induction - ${candidate.firstName} ${candidate.lastName}`,
      description: `Schedule CEO induction meeting. HR to confirm time with CEO first.`,
      dueDate: new Date(new Date(joiningDate).getTime() + 2 * 24 * 60 * 60 * 1000),
      priority: 'MEDIUM'
    },
    {
      step: 9,
      type: department === 'Sales' ? 'SALES_INDUCTION' : 'DEPARTMENT_INDUCTION',
      title: `${department} Induction - ${candidate.firstName} ${candidate.lastName}`,
      description: `Schedule ${department} team induction. HR to confirm time with ${department} team lead.`,
      dueDate: new Date(new Date(joiningDate).getTime() + 3 * 24 * 60 * 60 * 1000),
      priority: 'MEDIUM'
    },
    {
      step: 10,
      type: 'TRAINING_PLAN',
      title: `Training Plan Email - ${candidate.firstName} ${candidate.lastName}`,
      description: `Send structured training plan email on Day 3 after joining.`,
      dueDate: new Date(new Date(joiningDate).getTime() + 3 * 24 * 60 * 60 * 1000),
      priority: 'MEDIUM'
    },
    {
      step: 11,
      type: 'CHECKIN_CALL',
      title: `HR Check-in Call (Day 7) - ${candidate.firstName} ${candidate.lastName}`,
      description: `Schedule HR check-in call 7 days after joining to discuss onboarding experience.`,
      dueDate: new Date(new Date(joiningDate).getTime() + 7 * 24 * 60 * 60 * 1000),
      priority: 'MEDIUM'
    }
  ];

  for (const taskTemplate of taskTemplates) {
    try {
      await prisma.task.create({
        data: {
          candidateId: candidate.id,
          type: taskTemplate.type,
          title: taskTemplate.title,
          description: taskTemplate.description,
          dueDate: taskTemplate.dueDate,
          status: 'PENDING',
          metadata: {
            step: taskTemplate.step,
            priority: taskTemplate.priority,
            department: department
          }
        }
      });
    } catch (error) {
      logger.warn(`Failed to create task ${taskTemplate.step} for candidate ${candidate.id}:`, error);
    }
  }
};

module.exports = router;
