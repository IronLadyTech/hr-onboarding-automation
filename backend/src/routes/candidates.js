const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { body, validationResult, query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const emailService = require('../services/emailService');
const calendarService = require('../services/calendarService');
const emailMonitor = require('../services/emailMonitor');
const stepService = require('../services/stepService');
const logger = require('../utils/logger');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const folder = file.fieldname === 'signedOffer' ? 'signed-offers' : 'offer-letters';
    const dir = path.join(__dirname, `../../uploads/${folder}`);
    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word documents are allowed'));
    }
  }
});

// Apply auth to all routes
router.use(authMiddleware);

// Helper to convert absolute file path to relative path for storage
const getRelativeFilePath = (filePath) => {
  if (!filePath) return null;
  // Convert to relative path from uploads directory
  const uploadsDir = path.join(__dirname, '../../uploads');
  const relativePath = path.relative(uploadsDir, filePath);
  // Normalize to forward slashes for URLs (works on both Windows and Unix)
  return relativePath.split(path.sep).join('/');
};

// Helper to log activity
const logActivity = async (prisma, candidateId, userId, action, description, metadata = null) => {
  await prisma.activityLog.create({
    data: { candidateId, userId, action, description, metadata }
  });
};

// Helper to create department-specific onboarding tasks
const createDepartmentTasks = async (prisma, candidate) => {
  const department = candidate.department;
  const joiningDate = candidate.expectedJoiningDate || candidate.actualJoiningDate || new Date();
  
  // Get department-specific step templates (include emailTemplate relation)
  const stepTemplates = await prisma.departmentStepTemplate.findMany({
    where: {
      department,
      isActive: true
    },
    include: {
      emailTemplate: true
    },
    orderBy: { stepNumber: 'asc' }
  });

  // If no templates exist, use default hardcoded templates
  if (stepTemplates.length === 0) {
    const defaultTemplates = [
      { stepNumber: 1, type: 'OFFER_LETTER', title: `Send Offer Letter - ${candidate.firstName} ${candidate.lastName}`, description: `Upload and send offer letter to ${candidate.firstName} ${candidate.lastName} for ${candidate.position} position in ${department} department.`, dueDateOffset: 0, priority: 'HIGH' },
      { stepNumber: 2, type: 'OFFER_REMINDER', title: `Offer Reminder - ${candidate.firstName} ${candidate.lastName}`, description: `Send reminder email if offer letter is not signed within 3 days.`, dueDateOffset: 3, priority: 'MEDIUM' },
      { stepNumber: 3, type: 'WELCOME_EMAIL', title: `Welcome Email (Day -1) - ${candidate.firstName} ${candidate.lastName}`, description: `Send welcome email one day before joining date.`, dueDateOffset: -1, priority: 'MEDIUM' },
      { stepNumber: 4, type: 'HR_INDUCTION', title: `HR Induction - ${candidate.firstName} ${candidate.lastName}`, description: `Schedule HR induction meeting at 9:30 AM on joining day.`, dueDateOffset: 0, priority: 'HIGH' },
      { stepNumber: 5, type: 'WHATSAPP_ADDITION', title: `Add to WhatsApp Groups - ${candidate.firstName} ${candidate.lastName}`, description: `Add ${candidate.firstName} ${candidate.lastName} to relevant WhatsApp groups for ${department} department.`, dueDateOffset: 0, priority: 'HIGH' },
      { stepNumber: 6, type: 'ONBOARDING_FORM', title: `Send Onboarding Form - ${candidate.firstName} ${candidate.lastName}`, description: `Send onboarding form email within 1 hour of joining.`, dueDateOffset: 0, priority: 'HIGH' },
      { stepNumber: 7, type: 'FORM_REMINDER', title: `Form Reminder - ${candidate.firstName} ${candidate.lastName}`, description: `Send reminder if onboarding form is not completed within 24 hours.`, dueDateOffset: 1, priority: 'MEDIUM' },
      { stepNumber: 8, type: 'CEO_INDUCTION', title: `CEO Induction - ${candidate.firstName} ${candidate.lastName}`, description: `Schedule CEO induction meeting. HR to confirm time with CEO first.`, dueDateOffset: 2, priority: 'MEDIUM' },
      { stepNumber: 9, type: department === 'Sales' ? 'SALES_INDUCTION' : 'DEPARTMENT_INDUCTION', title: `${department} Induction - ${candidate.firstName} ${candidate.lastName}`, description: `Schedule ${department} team induction. HR to confirm time with ${department} team lead.`, dueDateOffset: 3, priority: 'MEDIUM' },
      { stepNumber: 10, type: 'TRAINING_PLAN', title: `Training Plan Email - ${candidate.firstName} ${candidate.lastName}`, description: `Send structured training plan email on Day 3 after joining.`, dueDateOffset: 3, priority: 'MEDIUM' },
      { stepNumber: 11, type: 'CHECKIN_CALL', title: `HR Check-in Call (Day 7) - ${candidate.firstName} ${candidate.lastName}`, description: `Schedule HR check-in call 7 days after joining to discuss onboarding experience.`, dueDateOffset: 7, priority: 'MEDIUM' }
    ];

    // Create tasks from default templates
    for (const template of defaultTemplates) {
      try {
        const dueDate = template.dueDateOffset === null 
          ? new Date()
          : template.dueDateOffset < 0
            ? new Date(new Date(joiningDate).getTime() + template.dueDateOffset * 24 * 60 * 60 * 1000)
            : new Date(new Date(joiningDate).getTime() + template.dueDateOffset * 24 * 60 * 60 * 1000);

        await prisma.task.create({
          data: {
            candidateId: candidate.id,
            type: template.type,
            title: template.title,
            description: template.description,
            dueDate,
            status: 'PENDING',
            metadata: {
              step: template.stepNumber,
              priority: template.priority,
              department: department
            }
          }
        });
      } catch (error) {
        logger.warn(`Failed to create task ${template.stepNumber} for candidate ${candidate.id}:`, error);
      }
    }
  } else {
    // Create tasks from department templates
    for (const template of stepTemplates) {
      try {
        // Calculate due date based on offset
        let dueDate;
        if (template.dueDateOffset === null) {
          dueDate = new Date();
        } else if (template.dueDateOffset < 0) {
          // Negative offset means before joining date
          dueDate = new Date(new Date(joiningDate).getTime() + template.dueDateOffset * 24 * 60 * 60 * 1000);
        } else {
          // Positive offset means after joining date
          dueDate = new Date(new Date(joiningDate).getTime() + template.dueDateOffset * 24 * 60 * 60 * 1000);
        }

        // Replace placeholders in title and description
        const title = template.title
          .replace(/\{\{firstName\}\}/g, candidate.firstName)
          .replace(/\{\{lastName\}\}/g, candidate.lastName)
          .replace(/\{\{position\}\}/g, candidate.position)
          .replace(/\{\{department\}\}/g, department);
        
        const description = template.description
          ? template.description
              .replace(/\{\{firstName\}\}/g, candidate.firstName)
              .replace(/\{\{lastName\}\}/g, candidate.lastName)
              .replace(/\{\{position\}\}/g, candidate.position)
              .replace(/\{\{department\}\}/g, department)
          : null;

        await prisma.task.create({
          data: {
            candidateId: candidate.id,
            type: template.type,
            title,
            description,
            dueDate,
            status: 'PENDING',
            metadata: {
              step: template.stepNumber,
              priority: template.priority,
              department: department
            }
          }
        });
      } catch (error) {
        logger.warn(`Failed to create task ${template.stepNumber} for candidate ${candidate.id}:`, error);
      }
    }
  }
};

// ============ CRUD OPERATIONS ============

// Get all candidates with filtering
router.get('/', [
  query('status').optional().isString(),
  query('department').optional().isString(),
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const { status, department, search, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (department) where.department = department;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [candidates, total] = await Promise.all([
      req.prisma.candidate.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { emails: true, calendarEvents: true, tasks: true }
          }
        }
      }),
      req.prisma.candidate.count({ where })
    ]);

    res.json({
      success: true,
      data: candidates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching candidates:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single candidate with full details
router.get('/:id', async (req, res) => {
  try {
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id },
      include: {
        emails: { orderBy: { createdAt: 'desc' } },
        calendarEvents: { orderBy: { startTime: 'asc' } },
        reminders: { orderBy: { scheduledFor: 'asc' } },
        tasks: { orderBy: { createdAt: 'desc' } },
        checkIns: { orderBy: { scheduledDate: 'desc' } },
        activityLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
        createdBy: { select: { name: true, email: true } }
      }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    res.json({ success: true, data: candidate });
  } catch (error) {
    logger.error('Error fetching candidate:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create new candidate
router.post('/', [
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('position').notEmpty().trim(),
  body('department').notEmpty().trim(),
  body('expectedJoiningDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      firstName, lastName, email, phone,
      position, department, salary, reportingManager,
      expectedJoiningDate, offerExpiryDate, notes,
      customFields
    } = req.body;

    // Check if candidate already exists
    const existing = await req.prisma.candidate.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Candidate with this email already exists' });
    }

    const candidate = await req.prisma.candidate.create({
      data: {
        firstName,
        lastName,
        email,
        phone: phone || null,
        position,
        department,
        salary: salary || null,
        reportingManager: reportingManager || null,
        expectedJoiningDate: expectedJoiningDate ? new Date(expectedJoiningDate) : null,
        offerExpiryDate: offerExpiryDate ? new Date(offerExpiryDate) : null,
        notes: notes || null,
        customFields: customFields || null,
        createdById: req.user.id,
        status: 'OFFER_PENDING'
      }
    });

    // Create department-specific onboarding tasks for this candidate
    await createDepartmentTasks(req.prisma, candidate);

    await logActivity(req.prisma, candidate.id, req.user.id, 'CANDIDATE_CREATED', 
      `New candidate added: ${firstName} ${lastName} for ${position}`);

    logger.info(`Candidate created: ${candidate.id}`);

    res.status(201).json({ success: true, data: candidate });
  } catch (error) {
    logger.error('Error creating candidate:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update candidate
router.put('/:id', async (req, res) => {
  try {
    const {
      firstName, lastName, phone,
      position, department, salary, reportingManager,
      expectedJoiningDate, actualJoiningDate, offerExpiryDate,
      notes, status
    } = req.body;

    const candidate = await req.prisma.candidate.update({
      where: { id: req.params.id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(position && { position }),
        ...(department && { department }),
        ...(salary !== undefined && { salary }),
        ...(reportingManager !== undefined && { reportingManager }),
        ...(expectedJoiningDate && { expectedJoiningDate: new Date(expectedJoiningDate) }),
        ...(actualJoiningDate && { actualJoiningDate: new Date(actualJoiningDate) }),
        ...(offerExpiryDate && { offerExpiryDate: new Date(offerExpiryDate) }),
        ...(notes !== undefined && { notes }),
        ...(status && { status }),
        ...(customFields !== undefined && { customFields })
      }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'CANDIDATE_UPDATED', 
      `Candidate profile updated`);

    res.json({ success: true, data: candidate });
  } catch (error) {
    logger.error('Error updating candidate:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete candidate (completely removes candidate and all related data)
router.delete('/:id', async (req, res) => {
  try {
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        offerLetterPath: true,
        signedOfferPath: true
      }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Delete uploaded files if they exist
    const fs = require('fs').promises;
    const path = require('path');
    const uploadsDir = path.join(__dirname, '../../uploads');

    const filesToDelete = [];
    if (candidate.offerLetterPath) {
      const offerLetterPath = path.isAbsolute(candidate.offerLetterPath)
        ? candidate.offerLetterPath
        : path.join(uploadsDir, candidate.offerLetterPath);
      filesToDelete.push(offerLetterPath);
    }
    if (candidate.signedOfferPath) {
      const signedOfferPath = path.isAbsolute(candidate.signedOfferPath)
        ? candidate.signedOfferPath
        : path.join(uploadsDir, candidate.signedOfferPath);
      filesToDelete.push(signedOfferPath);
    }

    // Delete calendar event attachments
    const calendarEvents = await req.prisma.calendarEvent.findMany({
      where: { candidateId: candidate.id },
      select: { attachmentPath: true }
    });

    for (const event of calendarEvents) {
      if (event.attachmentPath) {
        const attachmentPath = path.isAbsolute(event.attachmentPath)
          ? event.attachmentPath
          : path.join(uploadsDir, event.attachmentPath);
        filesToDelete.push(attachmentPath);
      }
    }

    // Delete email attachments
    const emails = await req.prisma.email.findMany({
      where: { candidateId: candidate.id },
      select: { attachmentPath: true }
    });

    for (const email of emails) {
      if (email.attachmentPath) {
        const attachmentPath = path.isAbsolute(email.attachmentPath)
          ? email.attachmentPath
          : path.join(uploadsDir, email.attachmentPath);
        filesToDelete.push(attachmentPath);
      }
    }

    // Delete files (ignore errors if files don't exist)
    for (const filePath of filesToDelete) {
      try {
        await fs.unlink(filePath);
        logger.info(`Deleted file: ${filePath}`);
      } catch (fileError) {
        // File might not exist, that's okay
        logger.debug(`File not found or already deleted: ${filePath}`);
      }
    }

    // Delete candidate (cascading deletes will handle related records)
    await req.prisma.candidate.delete({ where: { id: req.params.id } });

    // Log activity (before candidate is deleted, so we can still reference it)
    try {
      await req.prisma.activityLog.create({
        data: {
          candidateId: candidate.id, // This will be cleaned up by cascade
          userId: req.user.id,
          action: 'CANDIDATE_DELETED',
          description: `Candidate ${candidate.firstName} ${candidate.lastName} (${candidate.email}) was completely deleted`,
          metadata: {
            deletedAt: new Date().toISOString(),
            deletedBy: req.user.id
          }
        }
      });
    } catch (logError) {
      // If logging fails, continue with deletion
      logger.warn('Failed to log candidate deletion:', logError);
    }

    logger.info(`Candidate completely deleted: ${candidate.id} (${candidate.firstName} ${candidate.lastName})`);
    res.json({ success: true, message: 'Candidate and all related data deleted successfully' });
  } catch (error) {
    logger.error('Error deleting candidate:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// ============ OFFER LETTER WORKFLOW ============

// Upload offer letter
router.post('/:id/offer-letter', upload.single('offerLetter'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const candidate = await req.prisma.candidate.update({
      where: { id: req.params.id },
      data: { 
        offerLetterPath: getRelativeFilePath(req.file.path),
        offerDate: new Date()
      }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'OFFER_LETTER_UPLOADED', 
      `Offer letter uploaded: ${req.file.originalname}`);

    res.json({ success: true, data: candidate });
  } catch (error) {
    logger.error('Error uploading offer letter:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Send offer letter email
router.post('/:id/send-offer', async (req, res) => {
  try {
    const crypto = require('crypto');
    
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    if (!candidate.offerLetterPath) {
      return res.status(400).json({ success: false, message: 'Please upload offer letter first' });
    }

    // Generate secure upload token for self-service portal
    const uploadToken = crypto.randomBytes(32).toString('hex');
    const uploadTokenExpiry = new Date();
    uploadTokenExpiry.setDate(uploadTokenExpiry.getDate() + 30); // Valid for 30 days

    // Update candidate with token
    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { 
        uploadToken,
        uploadTokenExpiry
      }
    });

    // Use stepService to send offer letter (Step 1) - ensures it uses the same logic and templates
    // This prevents duplicate emails and ensures all emails use templates from database
    try {
      await stepService.completeStep(req.prisma, candidate.id, 1, req.user.id);
      logger.info(`✅ Step 1 (Offer Letter) completed via manual send button for ${candidate.email}`);
    } catch (stepError) {
      logger.error(`Error completing step 1: ${stepError.message}`);
      throw stepError;
    }

    // Get the email record that was just sent
    const emailRecord = await req.prisma.email.findFirst({
      where: {
        candidateId: candidate.id,
        type: 'OFFER_LETTER'
      },
      orderBy: { createdAt: 'desc' }
    });

    // Update candidate status
    const updatedCandidate = await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { 
        status: 'OFFER_SENT',
        offerSentAt: new Date()
      }
    });

    // Generate secure upload token for self-service portal (if not already set)
    if (!candidate.uploadToken) {
      const uploadToken = crypto.randomBytes(32).toString('hex');
      const uploadTokenExpiry = new Date();
      uploadTokenExpiry.setDate(uploadTokenExpiry.getDate() + 30); // Valid for 30 days

      await req.prisma.candidate.update({
        where: { id: candidate.id },
        data: { 
          uploadToken,
          uploadTokenExpiry
        }
      });
    }

    await logActivity(req.prisma, candidate.id, req.user.id, 'OFFER_SENT', 
      `Offer letter email sent to ${candidate.email}`);

    res.json({ success: true, data: { candidate: updatedCandidate, email: emailRecord } });
  } catch (error) {
    logger.error('Error sending offer letter:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Send offer reminder manually
router.post('/:id/send-offer-reminder', async (req, res) => {
  try {
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    if (!candidate.offerSentAt) {
      return res.status(400).json({ success: false, message: 'Offer letter must be sent first' });
    }

    if (candidate.offerSignedAt) {
      return res.status(400).json({ success: false, message: 'Offer already signed' });
    }

    // Send offer reminder email
    await emailService.sendOfferReminder(req.prisma, candidate);

    // Update candidate
    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { offerReminderSent: true }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'OFFER_REMINDER_SENT', 
      `Offer reminder sent manually to ${candidate.email}`);

    res.json({ success: true, message: 'Offer reminder sent' });
  } catch (error) {
    logger.error('Error sending offer reminder:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload signed offer (from dashboard or webhook)
router.post('/:id/signed-offer', upload.single('signedOffer'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const candidate = await req.prisma.candidate.update({
      where: { id: req.params.id },
      data: { 
        signedOfferPath: getRelativeFilePath(req.file.path),
        status: 'OFFER_SIGNED',
        offerSignedAt: new Date()
      }
    });

    // Cancel pending offer reminders
    await req.prisma.reminder.updateMany({
      where: {
        candidateId: candidate.id,
        type: 'OFFER_FOLLOWUP',
        status: 'PENDING'
      },
      data: { status: 'CANCELLED' }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'OFFER_SIGNED', 
      `Signed offer letter received`);

    res.json({ success: true, data: candidate });
  } catch (error) {
    logger.error('Error uploading signed offer:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ JOINING WORKFLOW ============

// Mark as joining
router.post('/:id/confirm-joining', async (req, res) => {
  try {
    const { joiningDate } = req.body;

    const candidate = await req.prisma.candidate.update({
      where: { id: req.params.id },
      data: {
        status: 'JOINING_PENDING',
        expectedJoiningDate: joiningDate ? new Date(joiningDate) : undefined
      }
    });

    // Schedule Day -1 welcome email
    const welcomeDate = new Date(candidate.expectedJoiningDate);
    welcomeDate.setDate(welcomeDate.getDate() - 1);
    welcomeDate.setHours(10, 0, 0, 0);

    await req.prisma.email.create({
      data: {
        candidateId: candidate.id,
        type: 'WELCOME_DAY_MINUS_1',
        subject: 'Looking Forward to Your Journey with Us!',
        body: '', // Will be filled from template when sent
        scheduledFor: welcomeDate
      }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'JOINING_CONFIRMED', 
      `Joining confirmed for ${candidate.expectedJoiningDate.toDateString()}`);

    res.json({ success: true, data: candidate });
  } catch (error) {
    logger.error('Error confirming joining:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Mark candidate as joined (Day 0)
router.post('/:id/mark-joined', async (req, res) => {
  try {
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Update candidate status
    const updated = await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        status: 'JOINED',
        actualJoiningDate: today
      }
    });

    // 1. Schedule HR Induction at 9:30 AM
    const hrInductionTime = new Date(today);
    hrInductionTime.setHours(9, 30, 0, 0);

    await calendarService.createHRInduction(req.prisma, updated);

    // 2. Create WhatsApp task
    await req.prisma.task.create({
      data: {
        candidateId: candidate.id,
        title: `Add ${candidate.firstName} ${candidate.lastName} to WhatsApp Groups`,
        description: `Add to department groups for ${candidate.department}`,
        type: 'WHATSAPP_ADDITION',
        dueDate: today
      }
    });

    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { whatsappTaskCreated: true }
    });

    // 3. Schedule onboarding form email (within first hour)
    const formEmailTime = new Date();
    formEmailTime.setMinutes(formEmailTime.getMinutes() + 30);

    await req.prisma.email.create({
      data: {
        candidateId: candidate.id,
        type: 'ONBOARDING_FORM',
        subject: 'Complete Your Onboarding Form',
        body: '',
        scheduledFor: formEmailTime
      }
    });

    // 4. Schedule 7-day check-in
    const checkinDate = new Date(today);
    checkinDate.setDate(checkinDate.getDate() + 7);

    await req.prisma.checkIn.create({
      data: {
        candidateId: candidate.id,
        scheduledDate: checkinDate
      }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'CANDIDATE_JOINED', 
      `${candidate.firstName} ${candidate.lastName} marked as joined`);

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Error marking candidate as joined:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ INDUCTIONS ============

// Schedule HR Induction
router.post('/:id/schedule-hr-induction', async (req, res) => {
  try {
    const { dateTime, duration = 60 } = req.body;

    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const startTime = new Date(dateTime);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (duration || 60));

    const eventData = {
      title: `HR Induction - ${candidate.firstName} ${candidate.lastName}`,
      description: `Welcome!\n\nThis is your HR induction session where we'll cover:\n- Company policies\n- Benefits overview\n- Team introduction\n- Q&A session`,
      startTime,
      endTime,
      attendees: [candidate.email],
      createMeet: true
    };

    const googleEvent = await calendarService.createGoogleEvent(eventData, req.prisma);

    const event = await req.prisma.calendarEvent.create({
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

    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { hrInductionScheduled: true }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'HR_INDUCTION_SCHEDULED', 
      `HR Induction scheduled for ${startTime.toLocaleString()}`);

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Error scheduling HR induction:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Schedule CEO Induction
router.post('/:id/schedule-ceo-induction', async (req, res) => {
  try {
    const { dateTime, duration = 60, meetingLink } = req.body;

    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const startTime = new Date(dateTime);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (duration || 60));

    const eventData = {
      title: `CEO Induction - ${candidate.firstName} ${candidate.lastName}`,
      description: `Meet with the CEO to learn about:\n- Company vision and mission\n- Growth strategy\n- Your role in the bigger picture`,
      startTime,
      endTime,
      attendees: [candidate.email],
      createMeet: !meetingLink
    };

    const googleEvent = await calendarService.createGoogleEvent(eventData, req.prisma);

    const event = await req.prisma.calendarEvent.create({
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

    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { ceoInductionScheduled: true }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'CEO_INDUCTION_SCHEDULED', 
      `CEO Induction scheduled for ${startTime.toLocaleString()}`);

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Error scheduling CEO induction:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Schedule Sales Induction
router.post('/:id/schedule-sales-induction', async (req, res) => {
  try {
    const { dateTime, duration = 90, meetingLink } = req.body;

    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const startTime = new Date(dateTime);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (duration || 90));

    const eventData = {
      title: `Sales Induction with Brunda - ${candidate.firstName} ${candidate.lastName}`,
      description: `Sales team onboarding session covering:\n- Sales processes\n- Tools and CRM\n- Targets and expectations\n- Best practices`,
      startTime,
      endTime,
      attendees: [candidate.email],
      createMeet: !meetingLink
    };

    const googleEvent = await calendarService.createGoogleEvent(eventData, req.prisma);

    const event = await req.prisma.calendarEvent.create({
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

    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { salesInductionScheduled: true }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'SALES_INDUCTION_SCHEDULED', 
      `Sales Induction scheduled for ${startTime.toLocaleString()}`);

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Error scheduling sales induction:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ TRAINING & CHECK-IN ============

// Send training plan
router.post('/:id/send-training-plan', async (req, res) => {
  try {
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const email = await emailService.sendTrainingPlan(req.prisma, candidate);

    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { trainingPlanSent: true }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'TRAINING_PLAN_SENT', 
      `One-week training plan sent`);

    res.json({ success: true, data: email });
  } catch (error) {
    logger.error('Error sending training plan:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Schedule check-in call
router.post('/:id/schedule-checkin', async (req, res) => {
  try {
    const { dateTime, duration = 30 } = req.body;

    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    let startTime;
    if (dateTime) {
      startTime = new Date(dateTime);
    } else {
      const joiningDate = candidate.actualJoiningDate || candidate.expectedJoiningDate;
      startTime = new Date(joiningDate);
      startTime.setDate(startTime.getDate() + 7);
      startTime.setHours(15, 0, 0, 0);
    }

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (duration || 30));

    const eventData = {
      title: `HR Check-in Call - ${candidate.firstName} ${candidate.lastName}`,
      description: `One week check-in call to discuss:\n- Your onboarding experience\n- Any challenges or concerns\n- Feedback and suggestions\n- Next steps`,
      startTime,
      endTime,
      attendees: [candidate.email],
      createMeet: true
    };

    const googleEvent = await calendarService.createGoogleEvent(eventData, req.prisma);

    const event = await req.prisma.calendarEvent.create({
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

    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { checkinScheduled: true }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'CHECKIN_SCHEDULED', 
      `Check-in call scheduled for ${startTime.toLocaleString()}`);

    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Error scheduling check-in:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Complete check-in
router.post('/:id/complete-checkin', async (req, res) => {
  try {
    const { feedback, concerns, actionItems, rating } = req.body;

    const checkIn = await req.prisma.checkIn.updateMany({
      where: {
        candidateId: req.params.id,
        isCompleted: false
      },
      data: {
        isCompleted: true,
        completedDate: new Date(),
        feedback,
        concerns,
        actionItems,
        rating
      }
    });

    await req.prisma.candidate.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED' }
    });

    await logActivity(req.prisma, req.params.id, req.user.id, 'CHECKIN_COMPLETED', 
      `HR Check-in completed with rating: ${rating}/5`);

    res.json({ success: true, data: checkIn });
  } catch (error) {
    logger.error('Error completing check-in:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ WHATSAPP TASKS ============

// Send WhatsApp group URLs via email
router.post('/:id/send-whatsapp-groups', async (req, res) => {
  try {
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Get WhatsApp groups for this candidate's department
    const groups = await req.prisma.whatsAppGroup.findMany({
      where: {
        isActive: true,
        OR: [
          { department: 'ALL' },
          { department: candidate.department }
        ]
      }
    });

    // Get or create email template
    let template = await req.prisma.emailTemplate.findFirst({
      where: { type: 'WHATSAPP_TASK' }
    });

    if (!template) {
      // Create default template
      template = await req.prisma.emailTemplate.create({
        data: {
          name: 'WhatsApp Groups Email',
          type: 'WHATSAPP_TASK',
          subject: 'Join Our WhatsApp Groups - {{firstName}}',
          body: `Hi {{firstName}},

Welcome! 🎉

Please join the following WhatsApp groups to stay connected with the team:

{{whatsappGroups}}

These groups will help you:
• Stay updated with team announcements
• Connect with your colleagues
• Get quick answers to your questions
• Be part of our community

Looking forward to having you on board!

Best regards,
HR Team`,
          placeholders: ['firstName', 'lastName', 'position', 'department', 'whatsappGroups']
        }
      });
    }

    // Format WhatsApp groups as clickable links
    const groupsList = groups.length > 0
      ? groups.map(g => {
          // Use URL if available, otherwise create placeholder
          const groupUrl = g.url || `https://chat.whatsapp.com/INVITE_CODE_${g.id}`;
          return `• <a href="${groupUrl}" target="_blank" style="color: #25D366; text-decoration: none; font-weight: bold;">${g.name}</a>${g.description ? ` - ${g.description}` : ''}`;
        }).join('<br>')
      : '• <a href="https://chat.whatsapp.com/ALL_HANDS" target="_blank" style="color: #25D366; text-decoration: none; font-weight: bold;">All Hands Group</a><br>• <a href="https://chat.whatsapp.com/DEPT_TEAM" target="_blank" style="color: #25D366; text-decoration: none; font-weight: bold;">Department Team Group</a><br>• <a href="https://chat.whatsapp.com/NEW_JOINERS" target="_blank" style="color: #25D366; text-decoration: none; font-weight: bold;">New Joiners Group</a>';

    // Replace placeholders
    let emailBody = template.body
      .replace(/\{\{firstName\}\}/g, candidate.firstName)
      .replace(/\{\{lastName\}\}/g, candidate.lastName)
      .replace(/\{\{position\}\}/g, candidate.position)
      .replace(/\{\{department\}\}/g, candidate.department)
      .replace(/\{\{whatsappGroups\}\}/g, groupsList);

    let emailSubject = template.subject
      .replace(/\{\{firstName\}\}/g, candidate.firstName)
      .replace(/\{\{lastName\}\}/g, candidate.lastName);

    // Create and send email
    const email = await req.prisma.email.create({
      data: {
        candidateId: candidate.id,
        type: 'WHATSAPP_TASK',
        subject: emailSubject,
        body: emailBody,
        status: 'PENDING'
      }
    });

    // Send email
    await emailService.sendEmail(req.prisma, email, candidate);

    // Update candidate
    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: { whatsappTaskCreated: true }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'WHATSAPP_GROUPS_EMAIL_SENT', 
      `WhatsApp group URLs sent via email to ${candidate.email}`);

    res.json({ success: true, data: email });
  } catch (error) {
    logger.error('Error sending WhatsApp groups email:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Mark WhatsApp groups added
router.post('/:id/whatsapp-complete', async (req, res) => {
  try {
    const { groupsAdded } = req.body;

    const candidate = await req.prisma.candidate.update({
      where: { id: req.params.id },
      data: { whatsappGroupsAdded: true }
    });

    // Complete the WhatsApp task
    await req.prisma.task.updateMany({
      where: {
        candidateId: req.params.id,
        type: 'WHATSAPP_ADDITION',
        status: 'PENDING'
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedBy: req.user.id,
        metadata: { groupsAdded }
      }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'WHATSAPP_GROUPS_ADDED', 
      `Added to WhatsApp groups: ${groupsAdded?.join(', ') || 'All required groups'}`);

    res.json({ success: true, data: candidate });
  } catch (error) {
    logger.error('Error completing WhatsApp task:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ ONBOARDING FORM ============

// Mark onboarding form completed
router.post('/:id/form-completed', async (req, res) => {
  try {
    const candidate = await req.prisma.candidate.update({
      where: { id: req.params.id },
      data: {
        onboardingFormCompletedAt: new Date(),
        status: 'ONBOARDING'
      }
    });

    // Cancel form reminder
    await req.prisma.reminder.updateMany({
      where: {
        candidateId: req.params.id,
        type: 'FORM_FOLLOWUP',
        status: 'PENDING'
      },
      data: { status: 'CANCELLED' }
    });

    await logActivity(req.prisma, candidate.id, req.user.id, 'FORM_COMPLETED', 
      `Onboarding form completed`);

    res.json({ success: true, data: candidate });
  } catch (error) {
    logger.error('Error marking form completed:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get candidate timeline/workflow status
router.get('/:id/workflow', async (req, res) => {
  try {
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id },
      include: {
        emails: { orderBy: { createdAt: 'asc' } },
        calendarEvents: { orderBy: { startTime: 'asc' } },
        tasks: true,
        checkIns: true
      }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    const workflow = [
      {
        step: 1,
        name: 'Offer Letter Sent',
        status: candidate.offerSentAt ? 'completed' : 'pending',
        completedAt: candidate.offerSentAt
      },
      {
        step: 2,
        name: 'Offer Signed',
        status: candidate.offerSignedAt ? 'completed' : (candidate.offerSentAt ? 'pending' : 'waiting'),
        completedAt: candidate.offerSignedAt
      },
      {
        step: 3,
        name: 'Welcome Email (Day -1)',
        status: candidate.emails.find(e => e.type === 'WELCOME_DAY_MINUS_1' && e.status === 'SENT') ? 'completed' : 'pending',
        completedAt: candidate.emails.find(e => e.type === 'WELCOME_DAY_MINUS_1')?.sentAt
      },
      {
        step: 4,
        name: 'HR Induction',
        status: candidate.hrInductionScheduled ? 'completed' : 'pending'
      },
      {
        step: 5,
        name: 'WhatsApp Groups Added',
        status: candidate.whatsappGroupsAdded ? 'completed' : (candidate.whatsappTaskCreated ? 'pending' : 'waiting')
      },
      {
        step: 6,
        name: 'Onboarding Form Sent',
        status: candidate.onboardingFormSentAt ? 'completed' : 'pending',
        completedAt: candidate.onboardingFormSentAt
      },
      {
        step: 7,
        name: 'Onboarding Form Completed',
        status: candidate.onboardingFormCompletedAt ? 'completed' : 'pending',
        completedAt: candidate.onboardingFormCompletedAt
      },
      {
        step: 8,
        name: 'CEO Induction',
        status: candidate.ceoInductionScheduled ? 'completed' : 'pending'
      },
      {
        step: 9,
        name: 'Sales Induction',
        status: candidate.salesInductionScheduled ? 'completed' : 
                (candidate.department?.toLowerCase().includes('sales') ? 'pending' : 'skipped')
      },
      {
        step: 10,
        name: 'Training Plan Sent',
        status: candidate.trainingPlanSent ? 'completed' : 'pending'
      },
      {
        step: 11,
        name: 'HR Check-in (Day 7)',
        status: candidate.checkIns.find(c => c.isCompleted) ? 'completed' : 'pending'
      }
    ];

    res.json({ success: true, data: { candidate, workflow } });
  } catch (error) {
    logger.error('Error fetching workflow:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============ BATCH OPERATIONS ============

// Configure multer for batch schedule attachments
const batchScheduleStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, `../../uploads/calendar-attachments`);
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const uploadBatchAttachments = multer({
  storage: batchScheduleStorage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents, and images are allowed'));
    }
  }
}).array('attachments', 10);

// Batch schedule calendar events
router.post('/batch/schedule', (req, res, next) => {
  // Check if files are being uploaded
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    uploadBatchAttachments(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  } else {
    next();
  }
}, async (req, res) => {
  try {
    // Parse FormData fields
    let candidateIds, eventType, stepNumber, dateTime, duration = 60;
    
    if (req.body.candidateIds) {
      candidateIds = typeof req.body.candidateIds === 'string' 
        ? JSON.parse(req.body.candidateIds) 
        : req.body.candidateIds;
    } else {
      candidateIds = req.body.candidateIds;
    }
    
    eventType = req.body.eventType;
    stepNumber = req.body.stepNumber ? parseInt(req.body.stepNumber) : null;
    dateTime = req.body.dateTime;
    duration = req.body.duration ? parseInt(req.body.duration) : 60;

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one candidate' });
    }

    if (!eventType || !dateTime) {
      return res.status(400).json({ success: false, message: 'Event type and date/time are required' });
    }

    // Handle timezone properly - datetime-local sends in local timezone, convert to UTC
    // Parse the datetime string and create Date object (handles local timezone correctly)
    const startTime = new Date(dateTime);
    // Ensure we're working with the correct timezone
    if (isNaN(startTime.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date/time format' });
    }
    
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (duration || 60));

    // Handle file attachments
    const attachmentPaths = [];
    if (req.files && req.files.length > 0) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      req.files.forEach(file => {
        const relativePath = path.relative(uploadsDir, file.path).replace(/\\/g, '/');
        attachmentPaths.push(relativePath);
      });
    }

    // Fetch all candidates
    const candidates = await req.prisma.candidate.findMany({
      where: { id: { in: candidateIds } }
    });

    if (candidates.length === 0) {
      return res.status(404).json({ success: false, message: 'No candidates found' });
    }

    // Get department from first candidate (all should be same department for batch)
    const department = candidates[0]?.department;

    // Default event type map for standard types
    const eventTypeMap = {
      'OFFER_LETTER': {
        title: 'Offer Letter Email - Batch Session',
        description: 'Your offer letter has been sent. Please review and sign.',
        type: 'OFFER_LETTER',
        updateField: 'offerSentAt'
      },
      'OFFER_REMINDER': {
        title: 'Offer Reminder - Batch Session',
        description: 'This is a reminder to review and sign your offer letter.',
        type: 'OFFER_REMINDER',
        updateField: 'offerReminderSent'
      },
      'WELCOME_EMAIL': {
        title: 'Welcome Email - Batch Session',
        description: 'Welcome! We\'re excited to have you join our team.',
        type: 'WELCOME_EMAIL',
        updateField: 'welcomeEmailSentAt'
      },
      'HR_INDUCTION': {
        title: 'HR Induction - Batch Session',
        description: 'Welcome!\n\nThis is your HR induction session where we\'ll cover:\n- Company policies\n- Benefits overview\n- Team introduction\n- Q&A session',
        type: 'HR_INDUCTION',
        updateField: 'hrInductionScheduled'
      },
      'WHATSAPP_TASK': {
        title: 'WhatsApp Group Addition - Batch Session',
        description: 'You will be added to relevant WhatsApp groups. Please check your email for group links.',
        type: 'WHATSAPP_TASK',
        updateField: 'whatsappTaskCreated'
      },
      'WHATSAPP_ADDITION': {
        title: 'WhatsApp Group Addition - Batch Session',
        description: 'You will be added to relevant WhatsApp groups. Please check your email for group links.',
        type: 'WHATSAPP_TASK',
        updateField: 'whatsappTaskCreated'
      },
      'ONBOARDING_FORM': {
        title: 'Onboarding Form Email - Batch Session',
        description: 'Please complete your onboarding form. Check your email for the form link.',
        type: 'ONBOARDING_FORM',
        updateField: 'onboardingFormSentAt'
      },
      'FORM_REMINDER': {
        title: 'Form Reminder - Batch Session',
        description: 'This is a reminder to complete your onboarding form.',
        type: 'FORM_REMINDER',
        updateField: null
      },
      'CEO_INDUCTION': {
        title: 'CEO Induction - Batch Session',
        description: 'Meet with the CEO to learn about:\n- Company vision and mission\n- Growth strategy\n- Your role in the bigger picture',
        type: 'CEO_INDUCTION',
        updateField: 'ceoInductionScheduled'
      },
      'SALES_INDUCTION': {
        title: 'Sales Induction with Brunda - Batch Session',
        description: 'Sales team onboarding session covering:\n- Sales processes\n- Tools and CRM\n- Targets and expectations\n- Best practices',
        type: 'SALES_INDUCTION',
        updateField: 'salesInductionScheduled'
      },
      'DEPARTMENT_INDUCTION': {
        title: 'Department Induction - Batch Session',
        description: 'Department team onboarding session covering team processes and expectations.',
        type: 'DEPARTMENT_INDUCTION',
        updateField: null
      },
      'TRAINING_PLAN': {
        title: 'Training Plan Email - Batch Session',
        description: 'Your personalized training plan has been sent. Please check your email.',
        type: 'TRAINING_PLAN',
        updateField: 'trainingPlanSent'
      },
      'CHECKIN_CALL': {
        title: 'HR Check-in Call - Batch Session',
        description: 'One week check-in call to discuss:\n- Your onboarding experience\n- Any challenges or concerns\n- Feedback and suggestions\n- Next steps',
        type: 'CHECKIN_CALL',
        updateField: 'checkinScheduled'
      }
    };

    let eventConfig = eventTypeMap[eventType];
    let finalStepNumber = stepNumber;

    // If not found in default map, try to fetch from department step templates
    // Also get stepNumber if not provided
    if (department) {
      try {
        // If stepNumber is provided, use it to find the step template
        // Otherwise, find by eventType
        const stepTemplate = await req.prisma.departmentStepTemplate.findFirst({
          where: stepNumber 
            ? {
                department: department,
                stepNumber: stepNumber
              }
            : {
                department: department,
                type: eventType
              }
        });

        if (stepTemplate) {
          // Set stepNumber from template if not provided
          if (!finalStepNumber) {
            finalStepNumber = stepTemplate.stepNumber;
          }
          
          // Replace placeholders in title for batch session
          let batchTitle = stepTemplate.title
            .replace(/{{firstName}}/g, '')
            .replace(/{{lastName}}/g, '')
            .replace(/{{position}}/g, '')
            .replace(/{{department}}/g, department)
            .replace(/\s+/g, ' ')
            .trim();
          
          // If title is empty after removing placeholders, use a default
          if (!batchTitle) {
            batchTitle = `${stepTemplate.type.replace(/_/g, ' ')} - Batch Session`;
          } else {
            batchTitle = `${batchTitle} - Batch Session`;
          }

          // Use step template to create event config
          // Map step type to valid EventType enum value
          let mappedType = stepTemplate.type;
          if (mappedType === 'MANUAL') {
            mappedType = 'CUSTOM';
          } else if (mappedType === 'WHATSAPP_ADDITION') {
            mappedType = 'WHATSAPP_TASK'; // Use WHATSAPP_TASK for calendar events
          } else if (!['OFFER_LETTER', 'OFFER_REMINDER', 'WELCOME_EMAIL', 'HR_INDUCTION', 
                       'WHATSAPP_TASK', 'ONBOARDING_FORM', 'FORM_REMINDER', 'CEO_INDUCTION', 
                       'SALES_INDUCTION', 'DEPARTMENT_INDUCTION', 'TRAINING_PLAN', 
                       'CHECKIN_CALL', 'TRAINING', 'CUSTOM'].includes(mappedType)) {
            // If type is not in enum, use CUSTOM
            mappedType = 'CUSTOM';
          }
          
          eventConfig = {
            title: batchTitle,
            description: stepTemplate.description || 'Calendar event scheduled for batch session.',
            type: mappedType,
            updateField: null // Custom steps don't update candidate fields
          };
        }
      } catch (error) {
        logger.warn(`Failed to fetch step template for ${eventType} in ${department}:`, error);
      }
    }

    // If still not found, create a generic config (allow any type that's in the enum)
    if (!eventConfig) {
      // Check if eventType is a valid EventType enum value
      const validEventTypes = [
        'OFFER_LETTER', 'OFFER_REMINDER', 'WELCOME_EMAIL', 'HR_INDUCTION',
        'WHATSAPP_TASK', 'WHATSAPP_ADDITION', 'ONBOARDING_FORM', 'FORM_REMINDER',
        'CEO_INDUCTION', 'SALES_INDUCTION', 'DEPARTMENT_INDUCTION', 'TRAINING_PLAN',
        'CHECKIN_CALL', 'TRAINING', 'CUSTOM', 'MANUAL'
      ];
      
      if (validEventTypes.includes(eventType) || eventType === 'MANUAL') {
        eventConfig = {
          title: `${eventType.replace(/_/g, ' ')} - Batch Session`,
          description: 'Calendar event scheduled for batch session.',
          type: eventType === 'MANUAL' ? 'CUSTOM' : eventType,
          updateField: null
        };
      } else {
        return res.status(400).json({ success: false, message: `Invalid event type: ${eventType}` });
      }
    }

    // Collect all attendee emails
    const attendeeEmails = candidates.map(c => c.email);

    // Create single Google Calendar event with all attendees
    const eventData = {
      title: eventConfig.title,
      description: eventConfig.description + `\n\nAttendees:\n${candidates.map(c => `- ${c.firstName} ${c.lastName} (${c.email})`).join('\n')}`,
      startTime,
      endTime,
      attendees: attendeeEmails,
      createMeet: true
    };

    // Create Google Calendar event (optional - continue even if it fails)
    let googleEvent = null;
    try {
      googleEvent = await calendarService.createGoogleEvent(eventData, req.prisma);
    } catch (gcalError) {
      logger.warn('Google Calendar event creation failed, continuing with local events:', gcalError.message);
      // Continue without Google Calendar event
    }

    // Create calendar events for each candidate
    const events = [];
    for (const candidate of candidates) {
      const event = await req.prisma.calendarEvent.create({
        data: {
          candidateId: candidate.id,
          type: eventConfig.type,
          title: `${eventConfig.title} - ${candidate.firstName} ${candidate.lastName}`,
          description: eventConfig.description,
          startTime,
          endTime,
          meetingLink: googleEvent?.hangoutLink || googleEvent?.htmlLink,
          attendees: attendeeEmails,
          googleEventId: googleEvent?.id,
          attachmentPath: attachmentPaths.length > 0 ? attachmentPaths[0] : null, // First attachment for backward compatibility
          attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : null, // All attachments
          stepNumber: finalStepNumber // CRITICAL: Set stepNumber so candidate profile can find the event
        }
      });

      // If this is Step 1 (OFFER_LETTER) with attachment, also save it to candidate.offerLetterPath
      // This ensures the offer letter shows in the candidate profile section (same as individual scheduling)
      if (eventConfig.type === 'OFFER_LETTER' && attachmentPaths.length > 0) {
        await req.prisma.candidate.update({
          where: { id: candidate.id },
          data: { offerLetterPath: attachmentPaths[0] }
        });
        logger.info(`✅ Saved offer letter attachment to candidate profile: ${attachmentPaths[0]}`);
      }

      // Update candidate status if updateField is specified
      if (eventConfig.updateField) {
        const updateData = {};
        if (eventConfig.updateField === 'offerSentAt' || eventConfig.updateField === 'welcomeEmailSentAt' || eventConfig.updateField === 'onboardingFormSentAt') {
          updateData[eventConfig.updateField] = new Date();
        } else if (eventConfig.updateField === 'offerReminderSent') {
          updateData[eventConfig.updateField] = true;
        } else {
          updateData[eventConfig.updateField] = true;
        }
        await req.prisma.candidate.update({
          where: { id: candidate.id },
          data: updateData
        });
      }

      // Log activity (only if user is authenticated)
      if (req.user && req.user.id) {
        try {
          await logActivity(req.prisma, candidate.id, req.user.id, `${eventConfig.type}_SCHEDULED`, 
            `Batch ${eventConfig.type} scheduled for ${startTime.toLocaleString()}`);
        } catch (logError) {
          logger.warn('Failed to log activity:', logError);
          // Continue even if logging fails
        }
      }

      events.push(event);
    }

    logger.info(`Batch scheduled ${eventType} for ${candidates.length} candidates`);

    res.json({ 
      success: true, 
      message: `Successfully scheduled ${eventType} for ${candidates.length} candidates`,
      data: { events, googleEventId: googleEvent?.id }
    });
  } catch (error) {
    logger.error('Error batch scheduling:', error);
    logger.error('Error details:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============ STEP MANAGEMENT ============

// Undo scheduled step - cancel event and revert to unscheduled state
router.post('/:id/undo-scheduled-step', async (req, res) => {
  try {
    const { stepNumber } = req.body;

    if (!stepNumber) {
      return res.status(400).json({ success: false, message: 'Step number is required' });
    }

    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    // Find the scheduled event for this step
    const event = await req.prisma.calendarEvent.findFirst({
      where: {
        candidateId: candidate.id,
        stepNumber: parseInt(stepNumber),
        status: { in: ['SCHEDULED', 'RESCHEDULED'] }
      }
    });

    if (!event) {
      return res.status(404).json({ success: false, message: 'No scheduled event found for this step' });
    }

    // Cancel in Google Calendar
    if (event.googleEventId) {
      try {
        await calendarService.deleteEvent(event.googleEventId);
      } catch (gcalError) {
        logger.warn('Google Calendar event deletion failed:', gcalError);
        // Continue even if Google Calendar deletion fails
      }
    }

    // Delete the calendar event (revert to unscheduled state)
    await req.prisma.calendarEvent.delete({
      where: { id: event.id }
    });

    // Revert candidate status fields if they were set by this event
    const updateData = {};
    const fieldRevertMap = {
      'HR_INDUCTION': { hrInductionScheduled: false },
      'CEO_INDUCTION': { ceoInductionScheduled: false },
      'SALES_INDUCTION': { salesInductionScheduled: false },
      'CHECKIN_CALL': { checkinScheduled: false },
      'TRAINING_PLAN': { trainingPlanSent: false },
      'WHATSAPP_TASK': { whatsappTaskCreated: false }
    };

    if (fieldRevertMap[event.type]) {
      Object.assign(updateData, fieldRevertMap[event.type]);
    }

    // Update candidate if needed
    if (Object.keys(updateData).length > 0) {
      await req.prisma.candidate.update({
        where: { id: candidate.id },
        data: updateData
      });
    }

    // Log activity
    if (req.user && req.user.id) {
      try {
        await logActivity(req.prisma, candidate.id, req.user.id, 'STEP_UNSCHEDULED', 
          `Step ${stepNumber} (${event.type}) unscheduled - event cancelled`);
      } catch (logError) {
        logger.warn('Failed to log activity:', logError);
      }
    }

    res.json({ 
      success: true, 
      message: 'Step unscheduled successfully',
      data: { stepNumber, eventType: event.type }
    });
  } catch (error) {
    logger.error('Error undoing scheduled step:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error' 
    });
  }
});

// ============ STEP COMPLETION ============

// Mark step as completed (and send email if needed)
router.post('/:id/complete-step', async (req, res) => {
  try {
    const { stepNumber } = req.body;

    if (!stepNumber || stepNumber < 1) {
      return res.status(400).json({ success: false, message: 'Invalid step number' });
    }

    // Use the universal stepService - same logic as scheduler
    const updated = await stepService.completeStep(
      req.prisma, 
      req.params.id, 
      stepNumber, 
      req.user.id
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Error completing step:', error);
    const statusCode = error.message.includes('not found') ? 404 : 
                      error.message.includes('Invalid') ? 400 : 500;
    res.status(statusCode).json({ 
      success: false, 
      message: error.message || 'Server error' 
    });
  }
});

// Initialize tasks for all candidates in a department
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

// Manually check for signed offer letter from candidate email
router.post('/check-email/:id', authMiddleware, async (req, res) => {
  try {
    const candidate = await req.prisma.candidate.findUnique({
      where: { id: req.params.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: 'Candidate not found' });
    }

    if (!candidate.email) {
      return res.status(400).json({ success: false, message: 'Candidate email not found' });
    }

    if (!candidate.offerSentAt) {
      return res.status(400).json({ success: false, message: 'Offer letter has not been sent to this candidate yet' });
    }

    // Manually check for emails from this candidate
    const result = await emailMonitor.checkEmailForCandidate(candidate.email);

    if (result.success) {
      // Refresh candidate data
      const updated = await req.prisma.candidate.findUnique({
        where: { id: candidate.id }
      });

      res.json({
        success: true,
        message: result.message,
        data: updated
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message || 'Failed to check email'
      });
    }
  } catch (error) {
    logger.error('Error checking email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
