const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

// ============================================================
// SHARED FUNCTION: Auto-create calendar events for candidates
// This function is used by both POST (create) and PUT (update) endpoints
// to ensure newly created and updated steps use the exact same logic
// IMPORTANT: This must match the logic in autoScheduleStepsForNewCandidate
// ============================================================
const autoCreateCalendarEventsForStep = async (prisma, step, finalIsAuto, finalSchedulingMethod, finalDueDateOffset, finalScheduledTimeDoj, finalScheduledTimeOfferLetter) => {
  try {
    // CRITICAL: Check if step is active - EXACT SAME CONDITION as autoScheduleStepsForNewCandidate
    if (!step.isActive) {
      logger.debug(`⏭️ Step ${step.stepNumber} is not active, skipping auto-scheduling`);
      return;
    }
    
    // Check if step should auto-schedule - EXACT SAME CONDITIONS as autoScheduleStepsForNewCandidate
    // IMPORTANT: finalIsAuto must be true, schedulingMethod must not be 'manual', 
    // dueDateOffset must be set, and at least one scheduled time must be set
    const shouldAutoSchedule = finalIsAuto && 
                                finalSchedulingMethod !== 'manual' && 
                                (finalDueDateOffset !== null && finalDueDateOffset !== undefined) &&
                                (finalScheduledTimeDoj || finalScheduledTimeOfferLetter);
    
    if (!shouldAutoSchedule) {
      logger.info(`⏭️ Step ${step.stepNumber} (${step.title}) should not auto-schedule:`);
      logger.info(`   isAuto=${finalIsAuto}, method=${finalSchedulingMethod}, offset=${finalDueDateOffset}`);
      logger.info(`   timeDoj=${finalScheduledTimeDoj || 'none'}, timeOfferLetter=${finalScheduledTimeOfferLetter || 'none'}`);
      return;
    }
    
    logger.info(`🔄 Auto-creating calendar events for step ${step.stepNumber} (${step.type}) in department ${step.department}...`);
    logger.info(`   Config: isAuto=${finalIsAuto}, method=${finalSchedulingMethod}, offset=${finalDueDateOffset}, timeDoj=${finalScheduledTimeDoj}, timeOfferLetter=${finalScheduledTimeOfferLetter}`);
    
    // Get all candidates in this department who don't already have this step scheduled
    // CRITICAL: Use same conditions as autoScheduleStepsForNewCandidate
    const candidates = await prisma.candidate.findMany({
      where: {
        department: step.department,
        // Only include candidates who have the required date (DOJ or Offer Letter)
        OR: [
          { expectedJoiningDate: { not: null } },
          { offerSentAt: { not: null } }
        ]
      },
      include: {
        calendarEvents: {
          where: {
            stepNumber: step.stepNumber,
            status: { not: 'COMPLETED' }
          }
        }
      }
    });

    // Filter out candidates who already have this step scheduled
    const candidatesToSchedule = candidates.filter(c => c.calendarEvents.length === 0);
    
    logger.info(`📋 Found ${candidatesToSchedule.length} candidate(s) in ${step.department} who need calendar events for step ${step.stepNumber}`);

    if (candidatesToSchedule.length > 0) {
      const calendarService = require('../services/calendarService');
      let eventsCreated = 0;
      let eventsSkipped = 0;

      for (const candidate of candidatesToSchedule) {
        try {
          // Calculate scheduled date/time using same logic as candidate profile
          // EXACT SAME LOGIC as autoScheduleStepsForNewCandidate
          let baseDate = null;
          let scheduledTime = null;

          if (finalSchedulingMethod === 'offerLetter') {
            // Use Offer Letter date - need to fetch it separately since we filtered calendarEvents
            const offerLetterEvent = await prisma.calendarEvent.findFirst({
              where: {
                candidateId: candidate.id,
                type: 'OFFER_LETTER',
                status: { not: 'COMPLETED' }
              }
            });
            baseDate = offerLetterEvent?.startTime || candidate.offerSentAt;
            scheduledTime = finalScheduledTimeOfferLetter || '14:00';
            
            // If candidate doesn't have offerSentAt yet, skip (same as autoScheduleStepsForNewCandidate)
            if (!baseDate) {
              logger.debug(`⏭️ Skipping candidate ${candidate.email}: No offer letter date available for offerLetter-based step ${step.stepNumber}`);
              eventsSkipped++;
              continue;
            }
          } else {
            // Use DOJ
            baseDate = candidate.expectedJoiningDate;
            scheduledTime = finalScheduledTimeDoj || '09:00';
            
            // If candidate doesn't have DOJ, skip (same as autoScheduleStepsForNewCandidate)
            if (!baseDate) {
              logger.debug(`⏭️ Skipping candidate ${candidate.email}: No DOJ available for DOJ-based step ${step.stepNumber}`);
              eventsSkipped++;
              continue;
            }
          }

          // Calculate scheduled date - CRITICAL: Handle timezone correctly (IST = UTC+5:30)
          // EXACT SAME LOGIC as autoScheduleStepsForNewCandidate
          const base = new Date(baseDate);
          const scheduledDate = new Date(base);
          scheduledDate.setDate(scheduledDate.getDate() + (finalDueDateOffset || 0));

          // Extract date components
          const year = scheduledDate.getFullYear();
          const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
          const day = String(scheduledDate.getDate()).padStart(2, '0');
          
          // Get time from scheduledTime (HH:mm format, e.g., "12:03")
          const [hours, minutes] = scheduledTime.split(':');
          const hour = parseInt(hours) || 9;
          const minute = parseInt(minutes) || 0;

          // Create date string treating the time as IST (Asia/Kolkata, UTC+5:30)
          // Format: "YYYY-MM-DDTHH:mm:00+05:30" for IST
          const istDateString = `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;
          const scheduledDateIST = new Date(istDateString);

          // Verify the date is valid
          if (isNaN(scheduledDateIST.getTime())) {
            logger.error(`❌ Invalid date created for candidate ${candidate.email}: ${istDateString}`);
            eventsSkipped++;
            continue;
          }

          // Calculate end time (default 15 minutes, longer for inductions)
          // EXACT SAME DURATION MAP as autoScheduleStepsForNewCandidate
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

          // Create calendar event (same as candidate profile scheduling)
          const eventData = {
            title: `${step.title} - ${candidate.firstName} ${candidate.lastName}`,
            description: step.description || '',
            startTime: scheduledDateIST, // Use IST-converted date
            endTime: endTime,
            attendees: [candidate.email],
            createMeet: false // Don't create Google Meet for auto-scheduled events
          };

          // Try to create Google Calendar event (optional - continue if it fails)
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
              startTime: scheduledDateIST, // Use IST-converted date
              endTime: endTime,
              attendees: eventData.attendees,
              meetingLink: googleEvent?.hangoutLink || googleEvent?.htmlLink || null,
              googleEventId: googleEvent?.id || null,
              stepNumber: step.stepNumber,
              status: 'SCHEDULED'
            }
          });

          eventsCreated++;
          logger.info(`✅ Created calendar event for ${candidate.email}: Step ${step.stepNumber} scheduled for ${scheduledDateIST.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`);

        } catch (candidateError) {
          logger.error(`❌ Error creating calendar event for candidate ${candidate.email}:`, candidateError.message);
          eventsSkipped++;
        }
      }

      logger.info(`✅ Auto-created ${eventsCreated} calendar event(s) for step ${step.stepNumber}, skipped ${eventsSkipped} candidate(s)`);
    } else {
      logger.info(`ℹ️ No candidates need calendar events for step ${step.stepNumber} (all already scheduled or missing required dates)`);
    }
  } catch (autoScheduleError) {
    logger.error('❌ Error auto-creating calendar events:', autoScheduleError);
    // Don't throw - allow step creation/update to succeed even if auto-scheduling fails
  }
};

// Configure multer for logo uploads
const logoStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, `../../uploads/company-logo`);
    // Create directory if it doesn't exist
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Use a fixed filename so we can replace the old logo
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `company-logo${ext}`);
  }
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2097152 }, // 2MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.png', '.jpg', '.jpeg', '.svg', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, JPEG, SVG, and GIF images are allowed'));
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

// Get system settings (PUBLIC - no auth required for login page and theme)
// IMPORTANT: This route MUST be defined BEFORE router.use(authenticateToken) below
router.get('/settings', async (req, res) => {
  try {
    // Check if prisma is available
    if (!req.prisma) {
      logger.error('Prisma not available in /settings route');
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection not available' 
      });
    }

    // Get company config from database
    const configs = await req.prisma.workflowConfig.findMany({
      where: {
        key: {
          in: ['company_name', 'hr_email', 'hr_name', 'hr_phone', 'company_address', 'office_timings', 'ceo_name', 'office_location', 'company_logo_path', 'ui_primary_color', 'ui_secondary_color', 'ui_accent_color']
        }
      }
    }).catch(err => {
      logger.error('Database error in /settings:', err);
      return []; // Return empty array on error
    });
    
    const configMap = {};
    if (configs && Array.isArray(configs)) {
      configs.forEach(c => { configMap[c.key] = c.value; });
    }
    
    // Build logo URL if logo path exists
    let logoUrl = null;
    if (configMap.company_logo_path) {
      // Use API_URL from env, or construct from request
      let baseUrl = process.env.API_URL;
      if (!baseUrl) {
        // Always use HTTPS in production, HTTP only for localhost
        const host = req.get('host') || 'localhost:5000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        baseUrl = `${protocol}://${host}`;
      }
      // Ensure baseUrl uses HTTPS (except localhost) and doesn't end with /api
      baseUrl = baseUrl.replace(/\/api$/, '');
      if (!baseUrl.includes('localhost') && baseUrl.startsWith('http://')) {
        baseUrl = baseUrl.replace('http://', 'https://');
      }
      logoUrl = `${baseUrl}/api/uploads/${configMap.company_logo_path}`;
    }
    
    const settings = {
      companyName: configMap.company_name || process.env.COMPANY_NAME || 'Company',
      hrEmail: configMap.hr_email || process.env.HR_EMAIL || 'hr@company.com',
      hrName: configMap.hr_name || process.env.HR_NAME || 'HR Team',
      hrPhone: configMap.hr_phone || process.env.HR_PHONE || '',
      companyAddress: configMap.company_address || process.env.COMPANY_ADDRESS || '',
      ceoName: configMap.ceo_name || process.env.CEO_NAME || 'CEO',
      officeLocation: configMap.office_location || process.env.OFFICE_LOCATION || 'Office Address',
      officeTimings: configMap.office_timings || process.env.OFFICE_TIMINGS || '9:30 AM - 6:30 PM',
      companyLogoPath: configMap.company_logo_path || null,
      companyLogoUrl: logoUrl,
      uiPrimaryColor: configMap.ui_primary_color || '#4F46E5',
      uiSecondaryColor: configMap.ui_secondary_color || '#7C3AED',
      uiAccentColor: configMap.ui_accent_color || null,
      workingHours: {
        start: '09:00',
        end: '18:00'
      },
      timezone: process.env.TIMEZONE || 'Asia/Kolkata',
      automationEnabled: true,
      emailTrackingEnabled: true
    };

    res.json({ success: true, data: settings });
  } catch (error) {
    logger.error('Error fetching settings:', error);
    // Return default settings on error instead of 500
    res.json({ 
      success: true, 
      data: {
        companyName: process.env.COMPANY_NAME || 'Company',
        hrEmail: process.env.HR_EMAIL || 'hr@company.com',
        hrName: process.env.HR_NAME || 'HR Team',
        uiPrimaryColor: '#4F46E5',
        uiSecondaryColor: '#7C3AED',
        companyLogoUrl: null
      }
    });
  }
});

// Apply authentication to all other routes
router.use(authenticateToken);

// Get all workflow configurations
router.get('/workflow', async (req, res) => {
  try {
    const configs = await req.prisma.workflowConfig.findMany({
      orderBy: { key: 'asc' }
    });

    // Return as key-value object
    const configMap = configs.reduce((acc, config) => {
      acc[config.key] = config.value;
      return acc;
    }, {});

    res.json({ success: true, data: configMap });
  } catch (error) {
    logger.error('Error fetching workflow config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update workflow configuration
router.put('/workflow', requireAdmin, async (req, res) => {
  try {
    const configs = req.body;

    const updates = await Promise.all(
      Object.entries(configs).map(([key, value]) =>
        req.prisma.workflowConfig.upsert({
          where: { key },
          update: { value },
          create: { key, value }
        })
      )
    );

    res.json({ success: true, data: updates });
  } catch (error) {
    logger.error('Error updating workflow config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all WhatsApp groups
router.get('/whatsapp-groups', async (req, res) => {
  try {
    const groups = await req.prisma.whatsAppGroup.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    res.json({ success: true, data: groups });
  } catch (error) {
    logger.error('Error fetching WhatsApp groups:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create WhatsApp group
router.post('/whatsapp-groups', requireAdmin, async (req, res) => {
  try {
    const { name, department, description, url } = req.body;

    const group = await req.prisma.whatsAppGroup.create({
      data: {
        name,
        department,
        description,
        url,
        isActive: true
      }
    });

    res.status(201).json({ success: true, data: group });
  } catch (error) {
    logger.error('Error creating WhatsApp group:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update WhatsApp group
router.put('/whatsapp-groups/:id', requireAdmin, async (req, res) => {
  try {
    const { name, department, description, url, isActive } = req.body;

    const group = await req.prisma.whatsAppGroup.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(department !== undefined && { department }),
        ...(description !== undefined && { description }),
        ...(url !== undefined && { url }),
        ...(isActive !== undefined && { isActive })
      }
    });

    res.json({ success: true, data: group });
  } catch (error) {
    logger.error('Error updating WhatsApp group:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete WhatsApp group
router.delete('/whatsapp-groups/:id', requireAdmin, async (req, res) => {
  try {
    await req.prisma.whatsAppGroup.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: 'WhatsApp group deleted' });
  } catch (error) {
    logger.error('Error deleting WhatsApp group:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all training plans
router.get('/training-plans', async (req, res) => {
  try {
    const { department } = req.query;
    
    const where = { isActive: true };
    if (department) where.department = department;

    const plans = await req.prisma.trainingPlan.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    res.json({ success: true, data: plans });
  } catch (error) {
    logger.error('Error fetching training plans:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create training plan
router.post('/training-plans', requireAdmin, async (req, res) => {
  try {
    const { name, department, duration, modules, description } = req.body;

    const plan = await req.prisma.trainingPlan.create({
      data: {
        name,
        department,
        duration,
        modules: modules || [],
        description,
        isActive: true
      }
    });

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    logger.error('Error creating training plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update training plan
router.put('/training-plans/:id', requireAdmin, async (req, res) => {
  try {
    const { name, department, duration, modules, description, isActive } = req.body;

    const plan = await req.prisma.trainingPlan.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(department && { department }),
        ...(duration && { duration }),
        ...(modules && { modules }),
        ...(description && { description }),
        ...(isActive !== undefined && { isActive })
      }
    });

    res.json({ success: true, data: plan });
  } catch (error) {
    logger.error('Error updating training plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete training plan
router.delete('/training-plans/:id', requireAdmin, async (req, res) => {
  try {
    await req.prisma.trainingPlan.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: 'Training plan deleted' });
  } catch (error) {
    logger.error('Error deleting training plan:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all departments
router.get('/departments', async (req, res) => {
  try {
    // Get departments from WorkflowConfig (stored as JSON array)
    let storedDepartments = [];
    try {
      const config = await req.prisma.workflowConfig.findUnique({
        where: { key: 'departments' }
      });
      if (config && config.value) {
        storedDepartments = JSON.parse(config.value);
      }
    } catch (error) {
      logger.warn('Could not parse stored departments:', error);
    }

    // Get unique departments from candidates (for backward compatibility)
    const candidateDepartments = await req.prisma.candidate.findMany({
      select: { department: true },
      distinct: ['department']
    });

    const candidateDepartmentList = candidateDepartments
      .map(d => d.department)
      .filter(d => d && d.trim() !== '');

    // Merge stored departments with candidate departments and defaults
    const defaults = ['Engineering', 'Sales', 'Marketing', 'Operations', 'HR', 'Finance'];
    const allDepartments = [...new Set([...storedDepartments, ...candidateDepartmentList, ...defaults])].sort();

    res.json({ success: true, data: allDepartments });
  } catch (error) {
    logger.error('Error fetching departments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a new department
router.post('/departments', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Department name is required' });
    }

    const departmentName = name.trim();

    // Get existing departments from WorkflowConfig
    let existingDepartments = [];
    try {
      const config = await req.prisma.workflowConfig.findUnique({
        where: { key: 'departments' }
      });
      if (config && config.value) {
        existingDepartments = JSON.parse(config.value);
      }
    } catch (error) {
      logger.warn('Could not parse stored departments:', error);
    }

    // Check if department already exists
    if (existingDepartments.includes(departmentName)) {
      return res.status(400).json({ success: false, message: 'Department already exists' });
    }

    // Also check if any candidate uses it (for backward compatibility)
    const candidateWithDept = await req.prisma.candidate.findFirst({
      where: { department: departmentName }
    });

    if (candidateWithDept) {
      return res.status(400).json({ success: false, message: 'Department already exists' });
    }

    // Add new department to the list
    existingDepartments.push(departmentName);
    existingDepartments.sort(); // Keep sorted

    // Store in WorkflowConfig
    await req.prisma.workflowConfig.upsert({
      where: { key: 'departments' },
      update: { value: JSON.stringify(existingDepartments) },
      create: { key: 'departments', value: JSON.stringify(existingDepartments) }
    });

    logger.info(`Department created: ${departmentName}`);
    res.json({ success: true, data: { name: departmentName }, message: 'Department created successfully' });
  } catch (error) {
    logger.error('Error creating department:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update department name (rename)
router.put('/departments/:oldName', async (req, res) => {
  try {
    const { oldName } = req.params;
    const { newName } = req.body;

    if (!newName || !newName.trim()) {
      return res.status(400).json({ success: false, message: 'New department name is required' });
    }

    const oldDepartmentName = decodeURIComponent(oldName);
    const newDepartmentName = newName.trim();

    if (oldDepartmentName === newDepartmentName) {
      return res.status(400).json({ success: false, message: 'New name must be different from old name' });
    }

    // Check if new name already exists in stored departments
    let storedDepartments = [];
    try {
      const config = await req.prisma.workflowConfig.findUnique({
        where: { key: 'departments' }
      });
      if (config && config.value) {
        storedDepartments = JSON.parse(config.value);
      }
    } catch (error) {
      logger.warn('Could not parse stored departments:', error);
    }

    if (storedDepartments.includes(newDepartmentName)) {
      return res.status(400).json({ success: false, message: 'Department with new name already exists' });
    }

    // Check if new name already exists in candidates
    const existing = await req.prisma.candidate.findFirst({
      where: { department: newDepartmentName }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'Department with new name already exists' });
    }

    // Update all candidates with the old department name
    const updateResult = await req.prisma.candidate.updateMany({
      where: { department: oldDepartmentName },
      data: { department: newDepartmentName }
    });

    // Update all department step templates
    await req.prisma.departmentStepTemplate.updateMany({
      where: { department: oldDepartmentName },
      data: { department: newDepartmentName }
    });

    // Update stored departments list
    const index = storedDepartments.indexOf(oldDepartmentName);
    if (index !== -1) {
      storedDepartments[index] = newDepartmentName;
      storedDepartments.sort();
      await req.prisma.workflowConfig.upsert({
        where: { key: 'departments' },
        update: { value: JSON.stringify(storedDepartments) },
        create: { key: 'departments', value: JSON.stringify(storedDepartments) }
      });
    }

    logger.info(`Department renamed: ${oldDepartmentName} -> ${newDepartmentName}`);
    res.json({ 
      success: true, 
      data: { oldName: oldDepartmentName, newName: newDepartmentName, updatedCandidates: updateResult.count },
      message: `Department renamed successfully. Updated ${updateResult.count} candidate(s).`
    });
  } catch (error) {
    logger.error('Error updating department:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete department
router.delete('/departments/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const departmentName = decodeURIComponent(name);

    // Check if department is in use
    const candidatesUsingDept = await req.prisma.candidate.count({
      where: { department: departmentName }
    });

    if (candidatesUsingDept > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete department. It is currently used by ${candidatesUsingDept} candidate(s). Please reassign candidates to another department first.` 
      });
    }

    // Check if department has step templates
    const stepTemplatesCount = await req.prisma.departmentStepTemplate.count({
      where: { department: departmentName }
    });

    if (stepTemplatesCount > 0) {
      // Delete department step templates
      await req.prisma.departmentStepTemplate.deleteMany({
        where: { department: departmentName }
      });
    }

    // Remove from stored departments list
    let storedDepartments = [];
    try {
      const config = await req.prisma.workflowConfig.findUnique({
        where: { key: 'departments' }
      });
      if (config && config.value) {
        storedDepartments = JSON.parse(config.value);
        const index = storedDepartments.indexOf(departmentName);
        if (index !== -1) {
          storedDepartments.splice(index, 1);
          await req.prisma.workflowConfig.upsert({
            where: { key: 'departments' },
            update: { value: JSON.stringify(storedDepartments) },
            create: { key: 'departments', value: JSON.stringify(storedDepartments) }
          });
        }
      }
    } catch (error) {
      logger.warn('Could not update stored departments:', error);
    }

    logger.info(`Department deleted: ${departmentName}`);
    res.json({ 
      success: true, 
      message: 'Department deleted successfully',
      data: { name: departmentName, deletedStepTemplates: stepTemplatesCount }
    });
  } catch (error) {
    logger.error('Error deleting department:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Upload company logo
router.post('/logo', requireAdmin, uploadLogo.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const logoPath = getRelativeFilePath(req.file.path);
    
    // Store logo path in database
    await req.prisma.workflowConfig.upsert({
      where: { key: 'company_logo_path' },
      update: { value: logoPath },
      create: { key: 'company_logo_path', value: logoPath }
    });

    // Build logo URL
    let baseUrl = process.env.API_URL;
    if (!baseUrl) {
      // Always use HTTPS in production, HTTP only for localhost
      const host = req.get('host') || 'localhost:5000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      baseUrl = `${protocol}://${host}`;
    }
    // Ensure baseUrl uses HTTPS (except localhost) and doesn't end with /api
    baseUrl = baseUrl.replace(/\/api$/, '');
    if (!baseUrl.includes('localhost') && baseUrl.startsWith('http://')) {
      baseUrl = baseUrl.replace('http://', 'https://');
    }
    const logoUrl = `${baseUrl}/api/uploads/${logoPath}`;

    logger.info(`✅ Company logo uploaded: ${logoPath}`);

    res.json({ 
      success: true, 
      data: { 
        logoPath, 
        logoUrl 
      } 
    });
  } catch (error) {
    logger.error('Error uploading logo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete company logo
router.delete('/logo', requireAdmin, async (req, res) => {
  try {
    // Get current logo path
    const config = await req.prisma.workflowConfig.findUnique({
      where: { key: 'company_logo_path' }
    });

    if (config && config.value) {
      // Delete file from filesystem
      const filePath = path.join(__dirname, '../../uploads', config.value);
      try {
        await fs.unlink(filePath);
      } catch (fileError) {
        logger.warn('Logo file not found, continuing with database deletion:', fileError);
      }

      // Remove from database
      await req.prisma.workflowConfig.delete({
        where: { key: 'company_logo_path' }
      });

      logger.info('✅ Company logo deleted');
    }

    res.json({ success: true, message: 'Logo deleted successfully' });
  } catch (error) {
    logger.error('Error deleting logo:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update UI colors
router.put('/ui-colors', requireAdmin, async (req, res) => {
  try {
    const { primaryColor, secondaryColor, accentColor } = req.body;

    const updates = [];
    
    if (primaryColor) {
      updates.push(
        req.prisma.workflowConfig.upsert({
          where: { key: 'ui_primary_color' },
          update: { value: primaryColor },
          create: { key: 'ui_primary_color', value: primaryColor }
        })
      );
    }

    if (secondaryColor) {
      updates.push(
        req.prisma.workflowConfig.upsert({
          where: { key: 'ui_secondary_color' },
          update: { value: secondaryColor },
          create: { key: 'ui_secondary_color', value: secondaryColor }
        })
      );
    }

    if (accentColor !== undefined) {
      if (accentColor) {
        updates.push(
          req.prisma.workflowConfig.upsert({
            where: { key: 'ui_accent_color' },
            update: { value: accentColor },
            create: { key: 'ui_accent_color', value: accentColor }
          })
        );
      } else {
        // Delete if set to null/empty
        await req.prisma.workflowConfig.deleteMany({
          where: { key: 'ui_accent_color' }
        });
      }
    }

    await Promise.all(updates);

    logger.info('✅ UI colors updated');

    res.json({ success: true, message: 'UI colors updated successfully' });
  } catch (error) {
    logger.error('Error updating UI colors:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize default workflow configurations
router.post('/workflow/init', requireAdmin, async (req, res) => {
  try {
    const defaultConfigs = [
      { key: 'offer_reminder_days', value: '3' },
      { key: 'welcome_email_days_before', value: '1' },
      { key: 'hr_induction_time', value: '09:30' },
      { key: 'onboarding_form_reminder_hours', value: '24' },
      { key: 'checkin_call_days_after', value: '7' },
      { key: 'training_duration_days', value: '7' },
      { key: 'auto_send_welcome_email', value: 'true' },
      { key: 'auto_create_calendar_events', value: 'true' },
      { key: 'auto_send_form_reminders', value: 'true' },
      { key: 'email_tracking_enabled', value: 'true' }
    ];

    const created = [];
    for (const config of defaultConfigs) {
      const existing = await req.prisma.workflowConfig.findUnique({
        where: { key: config.key }
      });

      if (!existing) {
        const newConfig = await req.prisma.workflowConfig.create({
          data: config
        });
        created.push(newConfig);
      }
    }

    res.json({
      success: true,
      message: `Initialized ${created.length} workflow configurations`,
      data: created
    });
  } catch (error) {
    logger.error('Error initializing workflow config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize default training plans
router.post('/training-plans/init', requireAdmin, async (req, res) => {
  try {
    const defaultPlans = [
      {
        name: 'General Onboarding',
        department: 'ALL',
        duration: 7,
        description: 'Standard one-week onboarding for all new employees',
        modules: [
          { day: 1, title: 'Company Overview', description: 'Introduction to company history, mission, and values' },
          { day: 2, title: 'Policies & Procedures', description: 'HR policies, code of conduct, compliance training' },
          { day: 3, title: 'Tools & Systems', description: 'Setting up email, communication tools, and internal systems' },
          { day: 4, title: 'Team Introduction', description: 'Meet the team, understand team structure and processes' },
          { day: 5, title: 'Role-Specific Training', description: 'Deep dive into role responsibilities' },
          { day: 6, title: 'Shadowing', description: 'Shadow experienced team members' },
          { day: 7, title: 'Review & Feedback', description: 'Week 1 review and feedback session' }
        ]
      },
      {
        name: 'Sales Onboarding',
        department: 'Sales',
        duration: 14,
        description: 'Two-week intensive sales training program',
        modules: [
          { day: 1, title: 'Company & Product Overview', description: 'Understanding our products and services' },
          { day: 2, title: 'Sales Process', description: 'End-to-end sales process and CRM training' },
          { day: 3, title: 'Product Deep Dive', description: 'Detailed product knowledge sessions' },
          { day: 4, title: 'Competitor Analysis', description: 'Understanding competitive landscape' },
          { day: 5, title: 'Sales Tools', description: 'CRM, proposal tools, and sales enablement' },
          { day: 6, title: 'Role Play - Discovery', description: 'Practice discovery calls' },
          { day: 7, title: 'Role Play - Demo', description: 'Practice product demonstrations' },
          { day: 8, title: 'Objection Handling', description: 'Common objections and responses' },
          { day: 9, title: 'Closing Techniques', description: 'Negotiation and closing strategies' },
          { day: 10, title: 'Shadowing Calls', description: 'Shadow senior sales reps on live calls' },
          { day: 11, title: 'First Solo Calls', description: 'Make first independent calls with supervision' },
          { day: 12, title: 'Pipeline Management', description: 'Managing and forecasting pipeline' },
          { day: 13, title: 'Advanced Scenarios', description: 'Complex deal scenarios and solutions' },
          { day: 14, title: 'Certification', description: 'Final assessment and certification' }
        ]
      }
    ];

    const created = [];
    for (const plan of defaultPlans) {
      const existing = await req.prisma.trainingPlan.findFirst({
        where: { name: plan.name }
      });

      if (!existing) {
        const newPlan = await req.prisma.trainingPlan.create({
          data: {
            ...plan,
            isActive: true
          }
        });
        created.push(newPlan);
      }
    }

    res.json({
      success: true,
      message: `Created ${created.length} default training plans`,
      data: created
    });
  } catch (error) {
    logger.error('Error initializing training plans:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ DEPARTMENT STEP TEMPLATES ============

// Get all step templates for a department
router.get('/department-steps/:department', async (req, res) => {
  try {
    const { department } = req.params;
    
    const steps = await req.prisma.departmentStepTemplate.findMany({
      where: { 
        department,
        isActive: true
      },
      include: {
        emailTemplate: true // Include email template details
      },
      orderBy: { stepNumber: 'asc' }
    });

    // Debug: Log what we're returning
    logger.info(`Fetching steps for ${department}:`, steps.map(s => ({
      id: s.id,
      stepNumber: s.stepNumber,
      title: s.title,
      scheduledTime: s.scheduledTime,
      schedulingMethod: s.schedulingMethod,
      dueDateOffset: s.dueDateOffset
    })));

    // Ensure scheduledTime fields and schedulingMethod are always included (even if null)
    const stepsWithDefaults = steps.map(step => {
      const schedulingMethod = step.schedulingMethod ?? 'doj';
      // Get the active time based on schedulingMethod
      const activeTime = schedulingMethod === 'offerLetter' 
        ? (step.scheduledTimeOfferLetter ?? step.scheduledTime ?? null)
        : (step.scheduledTimeDoj ?? step.scheduledTime ?? null);
      
      return {
        ...step,
        scheduledTime: activeTime, // Active time based on schedulingMethod (for backward compatibility)
        scheduledTimeDoj: step.scheduledTimeDoj ?? null, // Separate time for DOJ
        scheduledTimeOfferLetter: step.scheduledTimeOfferLetter ?? null, // Separate time for Offer Letter
        schedulingMethod: schedulingMethod // Default to 'doj' if undefined
      };
    });

    res.json({ success: true, data: stepsWithDefaults });
  } catch (error) {
    logger.error('Error fetching department steps:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create or update step template
router.post('/department-steps', async (req, res) => {
  try {
    const { department, stepNumber, title, description, type, icon, isAuto, dueDateOffset, priority, emailTemplateId, scheduledTime, scheduledTimeDoj, scheduledTimeOfferLetter, schedulingMethod } = req.body;

    if (!department || !stepNumber || !title || !type) {
      return res.status(400).json({ success: false, message: 'Department, stepNumber, title, and type are required' });
    }

    // Validate: Email template is required (check for null, undefined, or empty string)
    if (!emailTemplateId || emailTemplateId.trim() === '') {
      return res.status(400).json({ success: false, message: 'Email template is required for every step. Please select an email template.' });
    }

    // Check if step already exists
    const existing = await req.prisma.departmentStepTemplate.findUnique({
      where: {
        department_stepNumber: {
          department,
          stepNumber: parseInt(stepNumber)
        }
      }
    });

    let step;
    if (existing) {
      // Determine scheduling method
      const createMethod = schedulingMethod || existing.schedulingMethod || 'doj';
      
      // Automatically determine isAuto: true if step has scheduling configuration (not manual)
      const hasSchedulingConfig = createMethod !== 'manual' && 
        (dueDateOffset !== undefined && dueDateOffset !== null && dueDateOffset !== '') &&
        ((scheduledTimeDoj && scheduledTimeDoj.trim() !== '') || 
         (scheduledTimeOfferLetter && scheduledTimeOfferLetter.trim() !== '') ||
         (scheduledTime && scheduledTime.trim() !== ''));
      
      // Ensure isAuto is always a boolean
      // CRITICAL: If isAuto is provided but is not a valid boolean value (e.g., it's a time string like "11:40"),
      // ignore it and auto-detect from scheduling config instead
      let finalIsAuto;
      if (isAuto !== undefined && isAuto !== null) {
        // Check if isAuto is a valid boolean value
        const isValidBoolean = typeof isAuto === 'boolean' || 
                               isAuto === 'true' || isAuto === 'false' || 
                               isAuto === 1 || isAuto === 0 || 
                               isAuto === '1' || isAuto === '0';
        
        if (isValidBoolean) {
          // Convert to boolean: handle string "true"/"false", boolean true/false, or any truthy/falsy value
          finalIsAuto = isAuto === true || isAuto === 'true' || isAuto === 1 || isAuto === '1';
        } else {
          // If isAuto is not a valid boolean (e.g., it's "11:40"), ignore it and auto-detect
          logger.warn(`⚠️ Invalid isAuto value received: "${isAuto}" (type: ${typeof isAuto}). Auto-detecting from scheduling config instead.`);
          finalIsAuto = hasSchedulingConfig;
        }
      } else {
        // Auto-detect from scheduling config
        finalIsAuto = hasSchedulingConfig;
      }
      
      // Prepare update data with separate times
      const updateData = {
        title,
        description,
        type,
        icon,
        isAuto: finalIsAuto, // Always a boolean
        dueDateOffset: dueDateOffset !== undefined && dueDateOffset !== null && dueDateOffset !== '' ? parseInt(dueDateOffset) : null,
        schedulingMethod: createMethod,
        priority: priority || 'MEDIUM',
        emailTemplateId: emailTemplateId && emailTemplateId.trim() !== '' ? emailTemplateId : null
      };
      
      // Handle separate scheduled times
      if (scheduledTimeDoj !== undefined) {
        updateData.scheduledTimeDoj = (scheduledTimeDoj && scheduledTimeDoj.trim() !== '') ? scheduledTimeDoj.trim() : null;
      }
      if (scheduledTimeOfferLetter !== undefined) {
        updateData.scheduledTimeOfferLetter = (scheduledTimeOfferLetter && scheduledTimeOfferLetter.trim() !== '') ? scheduledTimeOfferLetter.trim() : null;
      }
      // Backward compatibility: if old scheduledTime is provided, use it
      if (scheduledTime !== undefined && scheduledTimeDoj === undefined && scheduledTimeOfferLetter === undefined) {
        const method = schedulingMethod || existing.schedulingMethod || 'doj';
        updateData.scheduledTime = (scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null;
        if (method === 'doj') {
          updateData.scheduledTimeDoj = (scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null;
        } else if (method === 'offerLetter') {
          updateData.scheduledTimeOfferLetter = (scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null;
        }
      }
      
      // Update existing step
      step = await req.prisma.departmentStepTemplate.update({
        where: { id: existing.id },
        data: updateData,
        include: {
          emailTemplate: true
        }
      });
      
      // Ensure all scheduled time fields are explicitly included in response
      const method = step.schedulingMethod ?? 'doj';
      const activeTime = method === 'offerLetter' 
        ? (step.scheduledTimeOfferLetter ?? step.scheduledTime ?? null)
        : (step.scheduledTimeDoj ?? step.scheduledTime ?? null);
      
      step = {
        ...step,
        scheduledTime: activeTime,
        scheduledTimeDoj: step.scheduledTimeDoj ?? null,
        scheduledTimeOfferLetter: step.scheduledTimeOfferLetter ?? null,
        schedulingMethod: step.schedulingMethod ?? 'doj'
      };
    } else {
      // Create new step - need to shift other steps if inserting in middle
      const stepsAfter = await req.prisma.departmentStepTemplate.findMany({
        where: {
          department,
          stepNumber: { gte: parseInt(stepNumber) }
        }
      });

      // Shift existing steps
      for (const stepAfter of stepsAfter) {
        await req.prisma.departmentStepTemplate.update({
          where: { id: stepAfter.id },
          data: { stepNumber: stepAfter.stepNumber + 1 }
        });
      }

      // Prepare create data with separate times
      const createMethod = schedulingMethod || 'doj';
      
      // Automatically determine isAuto: true if step has scheduling configuration (not manual)
      const hasSchedulingConfig = createMethod !== 'manual' && 
        (dueDateOffset !== undefined && dueDateOffset !== null && dueDateOffset !== '') &&
        ((scheduledTimeDoj && scheduledTimeDoj.trim() !== '') || 
         (scheduledTimeOfferLetter && scheduledTimeOfferLetter.trim() !== '') ||
         (scheduledTime && scheduledTime.trim() !== ''));
      
      // Ensure isAuto is always a boolean
      // CRITICAL: If isAuto is provided but is not a valid boolean value (e.g., it's a time string like "11:40"),
      // ignore it and auto-detect from scheduling config instead
      let finalIsAuto;
      if (isAuto !== undefined && isAuto !== null) {
        // Check if isAuto is a valid boolean value
        const isValidBoolean = typeof isAuto === 'boolean' || 
                               isAuto === 'true' || isAuto === 'false' || 
                               isAuto === 1 || isAuto === 0 || 
                               isAuto === '1' || isAuto === '0';
        
        if (isValidBoolean) {
          // Convert to boolean: handle string "true"/"false", boolean true/false, or any truthy/falsy value
          finalIsAuto = isAuto === true || isAuto === 'true' || isAuto === 1 || isAuto === '1';
        } else {
          // If isAuto is not a valid boolean (e.g., it's "11:40"), ignore it and auto-detect
          logger.warn(`⚠️ Invalid isAuto value received: "${isAuto}" (type: ${typeof isAuto}). Auto-detecting from scheduling config instead.`);
          finalIsAuto = hasSchedulingConfig;
        }
      } else {
        // Auto-detect from scheduling config
        finalIsAuto = hasSchedulingConfig;
      }
      
      const createData = {
        department,
        stepNumber: parseInt(stepNumber),
        title,
        description,
        type,
        icon,
        isAuto: finalIsAuto, // Always boolean
        dueDateOffset: dueDateOffset !== undefined && dueDateOffset !== null && dueDateOffset !== '' ? parseInt(dueDateOffset) : null,
        schedulingMethod: createMethod,
        priority: priority || 'MEDIUM',
        emailTemplateId: emailTemplateId && emailTemplateId.trim() !== '' ? emailTemplateId : null
      };
      
      // Handle separate scheduled times
      if (scheduledTimeDoj !== undefined) {
        createData.scheduledTimeDoj = (scheduledTimeDoj && scheduledTimeDoj.trim() !== '') ? scheduledTimeDoj.trim() : null;
      }
      if (scheduledTimeOfferLetter !== undefined) {
        createData.scheduledTimeOfferLetter = (scheduledTimeOfferLetter && scheduledTimeOfferLetter.trim() !== '') ? scheduledTimeOfferLetter.trim() : null;
      }
      // Backward compatibility: if old scheduledTime is provided, use it
      if (scheduledTime !== undefined && scheduledTimeDoj === undefined && scheduledTimeOfferLetter === undefined) {
        createData.scheduledTime = (scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null;
        if (createMethod === 'doj') {
          createData.scheduledTimeDoj = (scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null;
        } else if (createMethod === 'offerLetter') {
          createData.scheduledTimeOfferLetter = (scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null;
        }
      }
      
      step = await req.prisma.departmentStepTemplate.create({
        data: createData,
        include: {
          emailTemplate: true
        }
      });
      
      // Ensure all scheduled time fields are explicitly included in response
      const method = step.schedulingMethod ?? 'doj';
      const activeTime = method === 'offerLetter' 
        ? (step.scheduledTimeOfferLetter ?? step.scheduledTime ?? null)
        : (step.scheduledTimeDoj ?? step.scheduledTime ?? null);
      
      step = {
        ...step,
        scheduledTime: activeTime,
        scheduledTimeDoj: step.scheduledTimeDoj ?? null,
        scheduledTimeOfferLetter: step.scheduledTimeOfferLetter ?? null,
        schedulingMethod: step.schedulingMethod ?? 'doj'
      };
      
      // ============================================================
      // AUTO-CREATE CALENDAR EVENTS FOR EXISTING CANDIDATES
      // Use the shared function to ensure same logic as PUT endpoint
      // ============================================================
      // Use createData values (what we just saved) for consistency
      const createSchedulingMethod = createMethod;
      const createDueDateOffset = createData.dueDateOffset;
      const createScheduledTimeDoj = createData.scheduledTimeDoj;
      const createScheduledTimeOfferLetter = createData.scheduledTimeOfferLetter;
      
      await autoCreateCalendarEventsForStep(
        req.prisma,
        step,
        finalIsAuto,
        createSchedulingMethod,
        createDueDateOffset,
        createScheduledTimeDoj,
        createScheduledTimeOfferLetter
      );
    }

    res.json({ success: true, data: step });
  } catch (error) {
    logger.error('Error creating/updating department step:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update step template
router.put('/department-steps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Extract all fields from req.body, but explicitly handle isAuto separately
    const { title, description, type, icon, dueDateOffset, scheduledTime, scheduledTimeDoj, scheduledTimeOfferLetter, priority, stepNumber, emailTemplateId, schedulingMethod } = req.body;
    
    // CRITICAL: Extract isAuto separately and validate it immediately
    // If isAuto is present but is not a valid boolean (e.g., it's a time string), ignore it completely
    let isAuto = req.body.isAuto;
    if (isAuto !== undefined && isAuto !== null) {
      const isValidBoolean = typeof isAuto === 'boolean' || 
                             isAuto === 'true' || isAuto === 'false' || 
                             isAuto === 1 || isAuto === 0 || 
                             isAuto === '1' || isAuto === '0';
      if (!isValidBoolean) {
        // If isAuto is not a valid boolean, set it to undefined so it will be auto-detected
        logger.warn(`⚠️ Ignoring invalid isAuto value from request: "${isAuto}" (type: ${typeof isAuto}). Will auto-detect from scheduling config.`);
        isAuto = undefined;
      }
    }

    // Debug: Log what we're receiving
    logger.info(`Updating step ${id} with data:`, {
      scheduledTime: scheduledTime,
      scheduledTimeDoj: scheduledTimeDoj,
      scheduledTimeOfferLetter: scheduledTimeOfferLetter,
      schedulingMethod: schedulingMethod,
      dueDateOffset: dueDateOffset
    });

    // Get existing step to check current emailTemplateId
    const existingStep = await req.prisma.departmentStepTemplate.findUnique({
      where: { id }
    });

    if (!existingStep) {
      return res.status(404).json({ success: false, message: 'Step not found' });
    }

    // Validate: Email template is required
    // If emailTemplateId is provided in the update, validate it
    // If not provided, we keep the existing one (so we don't require it in every update)
    if (emailTemplateId !== undefined) {
      // If emailTemplateId is being updated, validate it's not empty
      if (!emailTemplateId || emailTemplateId.trim() === '') {
        return res.status(400).json({ success: false, message: 'Email template is required for every step. Please select an email template.' });
      }
    } else {
      // If not provided, ensure existing step has one
      if (!existingStep.emailTemplateId) {
        return res.status(400).json({ success: false, message: 'Email template is required for every step. Please select an email template.' });
      }
    }

    // Determine final values for scheduling config (use provided or existing)
    const finalSchedulingMethod = schedulingMethod !== undefined ? schedulingMethod : existingStep.schedulingMethod;
    const finalDueDateOffset = dueDateOffset !== undefined ? (dueDateOffset !== null && dueDateOffset !== '' && !isNaN(dueDateOffset) ? parseInt(dueDateOffset) : null) : existingStep.dueDateOffset;
    const finalScheduledTimeDoj = scheduledTimeDoj !== undefined ? ((scheduledTimeDoj && scheduledTimeDoj.trim() !== '') ? scheduledTimeDoj.trim() : null) : existingStep.scheduledTimeDoj;
    const finalScheduledTimeOfferLetter = scheduledTimeOfferLetter !== undefined ? ((scheduledTimeOfferLetter && scheduledTimeOfferLetter.trim() !== '') ? scheduledTimeOfferLetter.trim() : null) : existingStep.scheduledTimeOfferLetter;
    const finalScheduledTime = scheduledTime !== undefined ? ((scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null) : existingStep.scheduledTime;
    
    // Automatically determine isAuto: true if step has scheduling configuration (not manual)
    const hasSchedulingConfig = finalSchedulingMethod !== 'manual' && 
      (finalDueDateOffset !== null && finalDueDateOffset !== undefined) &&
      (finalScheduledTimeDoj || finalScheduledTimeOfferLetter || finalScheduledTime);
    
    // Ensure isAuto is always a boolean
    // CRITICAL: If isAuto is provided but is not a valid boolean value (e.g., it's a time string like "11:40"),
    // ignore it and auto-detect from scheduling config instead
    let finalIsAuto;
    
    // Debug: Log what we received for isAuto
    logger.info(`🔍 DEBUG isAuto: received="${isAuto}", type=${typeof isAuto}, hasSchedulingConfig=${hasSchedulingConfig}`);
    
    if (isAuto !== undefined && isAuto !== null) {
      // Check if isAuto is a valid boolean value
      const isValidBoolean = typeof isAuto === 'boolean' || 
                             isAuto === 'true' || isAuto === 'false' || 
                             isAuto === 1 || isAuto === 0 || 
                             isAuto === '1' || isAuto === '0';
      
      logger.info(`🔍 DEBUG isAuto validation: isValidBoolean=${isValidBoolean}`);
      
      if (isValidBoolean) {
        // Convert to boolean: handle string "true"/"false", boolean true/false, or any truthy/falsy value
        finalIsAuto = isAuto === true || isAuto === 'true' || isAuto === 1 || isAuto === '1';
        logger.info(`🔍 DEBUG isAuto: converted to boolean=${finalIsAuto}`);
      } else {
        // If isAuto is not a valid boolean (e.g., it's "11:40"), ignore it and auto-detect
        logger.warn(`⚠️ Invalid isAuto value received: "${isAuto}" (type: ${typeof isAuto}). Auto-detecting from scheduling config instead.`);
        finalIsAuto = hasSchedulingConfig;
        logger.info(`🔍 DEBUG isAuto: auto-detected=${finalIsAuto}`);
      }
    } else {
      // Auto-detect from scheduling config
      finalIsAuto = hasSchedulingConfig;
      logger.info(`🔍 DEBUG isAuto: not provided, auto-detected=${finalIsAuto}`);
    }
    
    // CRITICAL: Ensure finalIsAuto is definitely a boolean
    finalIsAuto = Boolean(finalIsAuto);
    logger.info(`🔍 DEBUG isAuto: final value=${finalIsAuto}, type=${typeof finalIsAuto}`);
    
    // Prepare update data - only include fields that are being updated
    const updateData = {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(type && { type }),
      ...(icon !== undefined && { icon }),
      isAuto: finalIsAuto, // Always include isAuto as boolean
      ...(priority && { priority }),
      ...(stepNumber !== undefined && { stepNumber: parseInt(stepNumber) }),
      // Only include emailTemplateId if it's being explicitly updated
      ...(emailTemplateId !== undefined && emailTemplateId && emailTemplateId.trim() !== '' && { emailTemplateId: emailTemplateId.trim() }),
      ...(schedulingMethod !== undefined && { schedulingMethod })
    };
    
    // CRITICAL: Double-check that isAuto in updateData is a boolean
    if (typeof updateData.isAuto !== 'boolean') {
      logger.error(`❌ CRITICAL ERROR: updateData.isAuto is not a boolean! Value="${updateData.isAuto}", type=${typeof updateData.isAuto}`);
      // Force it to be a boolean
      updateData.isAuto = Boolean(hasSchedulingConfig);
      logger.info(`🔧 FIXED: updateData.isAuto forced to boolean=${updateData.isAuto}`);
    }
    
    // Handle dueDateOffset - convert to null if empty string or undefined
    if (dueDateOffset !== undefined) {
      updateData.dueDateOffset = (dueDateOffset !== null && dueDateOffset !== '' && !isNaN(dueDateOffset)) ? parseInt(dueDateOffset) : null;
    }
    
    // CRITICAL: Handle separate scheduled times for each method
    // scheduledTimeDoj - for DOJ-based scheduling
    if (scheduledTimeDoj !== undefined) {
      updateData.scheduledTimeDoj = (scheduledTimeDoj && scheduledTimeDoj.trim() !== '') ? scheduledTimeDoj.trim() : null;
    }
    
    // scheduledTimeOfferLetter - for Offer Letter-based scheduling
    if (scheduledTimeOfferLetter !== undefined) {
      updateData.scheduledTimeOfferLetter = (scheduledTimeOfferLetter && scheduledTimeOfferLetter.trim() !== '') ? scheduledTimeOfferLetter.trim() : null;
    }
    
    // Handle old scheduledTime for backward compatibility
    // If new separate times are not provided, use old scheduledTime
    if (scheduledTime !== undefined && scheduledTimeDoj === undefined && scheduledTimeOfferLetter === undefined) {
      updateData.scheduledTime = (scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null;
      // Also set the appropriate separate field based on schedulingMethod
      if (schedulingMethod === 'doj' || (!schedulingMethod && existingStep.schedulingMethod === 'doj')) {
        updateData.scheduledTimeDoj = (scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null;
      } else if (schedulingMethod === 'offerLetter' || (!schedulingMethod && existingStep.schedulingMethod === 'offerLetter')) {
        updateData.scheduledTimeOfferLetter = (scheduledTime && scheduledTime.trim() !== '') ? scheduledTime.trim() : null;
      }
    }
    
    // CRITICAL FINAL CHECK: Ensure isAuto is definitely a boolean before sending to Prisma
    if (typeof updateData.isAuto !== 'boolean') {
      logger.error(`❌ CRITICAL: updateData.isAuto is not a boolean before Prisma update! Value="${updateData.isAuto}", type=${typeof updateData.isAuto}`);
      updateData.isAuto = Boolean(hasSchedulingConfig);
      logger.info(`🔧 FIXED: updateData.isAuto forced to boolean=${updateData.isAuto}`);
    }
    
    // Debug: Log what we're saving
    logger.info(`Saving step ${id} with updateData:`, JSON.stringify(updateData, null, 2));
    
    // FINAL VERIFICATION: Double-check isAuto is boolean
    if (typeof updateData.isAuto !== 'boolean') {
      logger.error(`❌ FATAL: updateData.isAuto is still not a boolean! This should never happen.`);
      // Remove isAuto completely and let Prisma use the existing value
      delete updateData.isAuto;
      logger.warn(`⚠️ Removed isAuto from updateData to prevent Prisma error`);
    }
    
    const step = await req.prisma.departmentStepTemplate.update({
      where: { id },
      data: updateData,
      include: {
        emailTemplate: true
      }
    });

    // Debug: Log what we got back from database
    logger.info(`Step ${id} saved successfully:`, {
      scheduledTime: step.scheduledTime,
      scheduledTimeDoj: step.scheduledTimeDoj,
      scheduledTimeOfferLetter: step.scheduledTimeOfferLetter,
      schedulingMethod: step.schedulingMethod,
      dueDateOffset: step.dueDateOffset
    });

    // CRITICAL: Ensure all scheduled time fields are explicitly included in response
    // Use values from updated step (from database) or fallback to updateData
    const responseScheduledTimeDoj = step.scheduledTimeDoj !== undefined && step.scheduledTimeDoj !== null 
      ? step.scheduledTimeDoj 
      : (updateData.scheduledTimeDoj !== undefined ? updateData.scheduledTimeDoj : null);
    
    const responseScheduledTimeOfferLetter = step.scheduledTimeOfferLetter !== undefined && step.scheduledTimeOfferLetter !== null 
      ? step.scheduledTimeOfferLetter 
      : (updateData.scheduledTimeOfferLetter !== undefined ? updateData.scheduledTimeOfferLetter : null);
    
    // For backward compatibility, set scheduledTime based on current schedulingMethod
    const currentMethod = step.schedulingMethod || updateData.schedulingMethod || 'doj';
    const responseScheduledTime = currentMethod === 'offerLetter' ? responseScheduledTimeOfferLetter : responseScheduledTimeDoj;
    
    const responseSchedulingMethod = step.schedulingMethod !== undefined && step.schedulingMethod !== null
      ? step.schedulingMethod
      : (updateData.schedulingMethod !== undefined ? updateData.schedulingMethod : 'doj');

    // Build response data ensuring all fields are present
    const responseData = {
      ...step,
      scheduledTime: responseScheduledTime, // Active time based on schedulingMethod (for backward compatibility)
      scheduledTimeDoj: responseScheduledTimeDoj, // Separate time for DOJ
      scheduledTimeOfferLetter: responseScheduledTimeOfferLetter, // Separate time for Offer Letter
      schedulingMethod: responseSchedulingMethod // Always include
    };

    // Debug: Log what we're sending back
    logger.info(`Step ${id} response data:`, {
      scheduledTime: responseData.scheduledTime,
      schedulingMethod: responseData.schedulingMethod,
      dueDateOffset: responseData.dueDateOffset
    });

    // ============================================================
    // AUTO-CREATE CALENDAR EVENTS FOR EXISTING CANDIDATES
    // Use the shared function to ensure same logic as POST endpoint
    // ============================================================
    await autoCreateCalendarEventsForStep(
      req.prisma,
      step,
      finalIsAuto,
      finalSchedulingMethod,
      finalDueDateOffset,
      finalScheduledTimeDoj,
      finalScheduledTimeOfferLetter
    );

    res.json({ success: true, data: responseData });
  } catch (error) {
    logger.error('Error updating department step:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reorder steps (swap two steps)
router.post('/department-steps/reorder', async (req, res) => {
  try {
    const { stepId1, stepId2 } = req.body;

    if (!stepId1 || !stepId2) {
      return res.status(400).json({ success: false, message: 'Both step IDs are required' });
    }

    // Get both steps
    const step1 = await req.prisma.departmentStepTemplate.findUnique({
      where: { id: stepId1 }
    });
    const step2 = await req.prisma.departmentStepTemplate.findUnique({
      where: { id: stepId2 }
    });

    if (!step1 || !step2) {
      return res.status(404).json({ success: false, message: 'One or both steps not found' });
    }

    if (step1.department !== step2.department) {
      return res.status(400).json({ success: false, message: 'Steps must be from the same department' });
    }

    // Swap step numbers using a transaction with temporary step number to avoid unique constraint violation
    // Strategy: Use a temporary negative number to avoid conflicts
    const tempStepNumber = -999999; // Temporary number that won't conflict
    
    await req.prisma.$transaction([
      // Step 1: Move step1 to temporary number
      req.prisma.departmentStepTemplate.update({
        where: { id: stepId1 },
        data: { stepNumber: tempStepNumber }
      }),
      // Step 2: Move step2 to step1's original number
      req.prisma.departmentStepTemplate.update({
        where: { id: stepId2 },
        data: { stepNumber: step1.stepNumber }
      }),
      // Step 3: Move step1 to step2's original number
      req.prisma.departmentStepTemplate.update({
        where: { id: stepId1 },
        data: { stepNumber: step2.stepNumber }
      })
    ]);

    logger.info(`✅ Steps reordered: ${step1.stepNumber} <-> ${step2.stepNumber} in ${step1.department}`);
    res.json({ success: true, message: 'Steps reordered successfully' });
  } catch (error) {
    logger.error('Error reordering steps:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete step template
router.delete('/department-steps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const step = await req.prisma.departmentStepTemplate.findUnique({
      where: { id }
    });

    if (!step) {
      return res.status(404).json({ success: false, message: 'Step not found' });
    }

    await req.prisma.departmentStepTemplate.delete({
      where: { id }
    });

    // Reorder remaining steps
    const stepsAfter = await req.prisma.departmentStepTemplate.findMany({
      where: {
        department: step.department,
        stepNumber: { gt: step.stepNumber }
      }
    });

    for (const stepAfter of stepsAfter) {
      await req.prisma.departmentStepTemplate.update({
        where: { id: stepAfter.id },
        data: { stepNumber: stepAfter.stepNumber - 1 }
      });
    }

    res.json({ success: true, message: 'Step deleted and steps reordered' });
  } catch (error) {
    logger.error('Error deleting department step:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize default steps for a department
router.post('/department-steps/init-defaults/:department', async (req, res) => {
  try {
    const { department } = req.params;

    // Check if steps already exist
    const existing = await req.prisma.departmentStepTemplate.findFirst({
      where: { department }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'Steps already exist for this department. Delete existing steps first.' });
    }

    // Get all email templates to match by type
    const emailTemplates = await req.prisma.emailTemplate.findMany({
      where: { isActive: true }
    });

    // Map step types to email template types
    const typeToEmailTypeMap = {
      'OFFER_LETTER': 'OFFER_LETTER',
      'OFFER_REMINDER': 'OFFER_REMINDER',
      'WELCOME_EMAIL': 'WELCOME_DAY_MINUS_1',
      'HR_INDUCTION': 'HR_INDUCTION_INVITE',
      'WHATSAPP_ADDITION': 'WHATSAPP_TASK',
      'ONBOARDING_FORM': 'ONBOARDING_FORM',
      'FORM_REMINDER': 'FORM_REMINDER',
      'CEO_INDUCTION': 'CEO_INDUCTION_INVITE',
      'SALES_INDUCTION': 'SALES_INDUCTION_INVITE',
      'DEPARTMENT_INDUCTION': 'HR_INDUCTION_INVITE', // Fallback to HR_INDUCTION_INVITE
      'TRAINING_PLAN': 'TRAINING_PLAN',
      'CHECKIN_CALL': 'CHECKIN_INVITE'
    };

    // Helper function to find template by type
    const findTemplateByType = (stepType) => {
      const emailType = typeToEmailTypeMap[stepType] || 'CUSTOM';
      // First try exact match
      let template = emailTemplates.find(t => t.type === emailType);
      // If not found, try first active template
      if (!template && emailTemplates.length > 0) {
        template = emailTemplates[0];
      }
      return template;
    };

    const defaultSteps = [
      { stepNumber: 1, title: 'Offer Letter Email', description: 'Upload and send offer letter with tracking', type: 'OFFER_LETTER', icon: '📄', isAuto: false, dueDateOffset: 0, priority: 'HIGH', scheduledTime: null },
      { stepNumber: 2, title: 'Offer Reminder (Auto)', description: 'Auto-sends next day at 2:00 PM if not signed', type: 'OFFER_REMINDER', icon: '⏰', isAuto: true, dueDateOffset: 1, priority: 'MEDIUM', scheduledTime: '14:00' },
      { stepNumber: 3, title: 'Day -1 Welcome Email (Auto)', description: 'Sent automatically at 11:00 AM one day before joining', type: 'WELCOME_EMAIL', icon: '👋', isAuto: true, dueDateOffset: -1, priority: 'MEDIUM', scheduledTime: '11:00' },
      { stepNumber: 4, title: 'HR Induction (Auto)', description: 'Calendar invite at 8:30 AM on joining day', type: 'HR_INDUCTION', icon: '🏢', isAuto: true, dueDateOffset: 0, priority: 'HIGH', scheduledTime: '08:30' },
      { stepNumber: 5, title: 'WhatsApp Group Addition (Auto)', description: 'Send WhatsApp group URLs via email at 9:30 AM on joining day', type: 'WHATSAPP_ADDITION', icon: '💬', isAuto: true, dueDateOffset: 0, priority: 'HIGH', scheduledTime: '09:30' },
      { stepNumber: 6, title: 'Onboarding Form Email (Auto)', description: 'Sent at 1:00 PM on joining day', type: 'ONBOARDING_FORM', icon: '📝', isAuto: true, dueDateOffset: 0, priority: 'HIGH', scheduledTime: '13:00' },
      { stepNumber: 7, title: 'Form Reminder (Auto)', description: 'Auto-sends next day after DOJ at 9:00 AM if not completed', type: 'FORM_REMINDER', icon: '🔔', isAuto: true, dueDateOffset: 1, priority: 'MEDIUM', scheduledTime: '09:00' },
      { stepNumber: 8, title: 'CEO Induction', description: 'HR confirms time with CEO, then system sends invite', type: 'CEO_INDUCTION', icon: '👔', isAuto: false, dueDateOffset: 2, priority: 'MEDIUM', scheduledTime: null },
      { stepNumber: 9, title: `${department} Induction`, description: `HR confirms time with ${department} team, then system sends invite at 10:15 AM on DOJ`, type: department === 'Sales' ? 'SALES_INDUCTION' : 'DEPARTMENT_INDUCTION', icon: '💼', isAuto: false, dueDateOffset: 0, priority: 'MEDIUM', scheduledTime: '10:15' },
      { stepNumber: 10, title: 'Training Plan Email (Auto)', description: 'Auto-sends on Day 3 with structured training', type: 'TRAINING_PLAN', icon: '📚', isAuto: true, dueDateOffset: 3, priority: 'MEDIUM', scheduledTime: null },
      { stepNumber: 11, title: 'HR Check-in Call (Day 7) (Auto)', description: 'Auto-scheduled exactly one week later at 10:00 AM', type: 'CHECKIN_CALL', icon: '📞', isAuto: true, dueDateOffset: 7, priority: 'MEDIUM', scheduledTime: '10:00' }
    ];

    // Validate that we have templates for all steps
    const stepsWithTemplates = defaultSteps.map(step => {
      const template = findTemplateByType(step.type);
      if (!template) {
        throw new Error(`No email template found for step type: ${step.type}. Please create email templates first in the Templates page.`);
      }
      return {
        ...step,
        emailTemplateId: template.id
      };
    });

    const created = await Promise.all(
      stepsWithTemplates.map(step =>
        req.prisma.departmentStepTemplate.create({
          data: {
            department,
            ...step
          }
        })
      )
    );

    res.json({ success: true, message: `Initialized ${created.length} default steps for ${department}`, data: created });
  } catch (error) {
    logger.error('Error initializing default steps:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ CUSTOM FORM FIELDS ============

// Get all custom fields
router.get('/custom-fields', async (req, res) => {
  try {
    const fields = await req.prisma.customField.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' }
    });
    res.json({ success: true, data: fields });
  } catch (error) {
    logger.error('Error fetching custom fields:', error);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      name: error.name
    });
    
    // If table doesn't exist yet, return empty array instead of error
    // Catch ALL possible database errors related to missing table
    const errorMessage = String(error.message || '').toLowerCase();
    const errorCode = String(error.code || '');
    const errorName = String(error.name || '').toLowerCase();
    
    if (
      errorMessage.includes('does not exist') ||
      errorMessage.includes('unknown table') ||
      errorMessage.includes('relation') ||
      errorMessage.includes('table') && errorMessage.includes('not found') ||
      errorCode === 'P2021' || // Table does not exist in Prisma
      errorCode === '42P01' || // PostgreSQL: relation does not exist
      errorCode === 'P1001' || // Can't reach database server
      errorName.includes('prisma') && errorMessage.includes('not found')
    ) {
      logger.warn('⚠️ CustomField table does not exist yet. Returning empty array.');
      logger.warn('⚠️ Please run on server: npx prisma db push');
      return res.json({ success: true, data: [] });
    }
    
    // For any other error, still return empty array to prevent frontend crash
    logger.warn('⚠️ Unknown error fetching custom fields, returning empty array:', error.message);
    return res.json({ success: true, data: [] });
  }
});

// Get all custom fields (including inactive - for admin)
router.get('/custom-fields/all', requireAdmin, async (req, res) => {
  try {
    const fields = await req.prisma.customField.findMany({
      orderBy: [{ isActive: 'desc' }, { order: 'asc' }]
    });
    res.json({ success: true, data: fields });
  } catch (error) {
    logger.error('Error fetching all custom fields:', error);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      name: error.name
    });
    
    // If table doesn't exist yet, return empty array instead of error
    // Catch ALL possible database errors related to missing table
    const errorMessage = String(error.message || '').toLowerCase();
    const errorCode = String(error.code || '');
    const errorName = String(error.name || '').toLowerCase();
    
    if (
      errorMessage.includes('does not exist') ||
      errorMessage.includes('unknown table') ||
      errorMessage.includes('relation') ||
      errorMessage.includes('table') && errorMessage.includes('not found') ||
      errorCode === 'P2021' || // Table does not exist in Prisma
      errorCode === '42P01' || // PostgreSQL: relation does not exist
      errorCode === 'P1001' || // Can't reach database server
      errorName.includes('prisma') && errorMessage.includes('not found')
    ) {
      logger.warn('⚠️ CustomField table does not exist yet. Returning empty array.');
      logger.warn('⚠️ Please run on server: npx prisma db push');
      return res.json({ success: true, data: [] });
    }
    
    // For any other error, still return empty array to prevent frontend crash
    logger.warn('⚠️ Unknown error fetching custom fields, returning empty array:', error.message);
    return res.json({ success: true, data: [] });
  }
});

// Create custom field
router.post('/custom-fields', requireAdmin, async (req, res) => {
  try {
    const { label, fieldKey, fieldType, placeholder, required, validation, options, order } = req.body;

    // Validate fieldKey format (alphanumeric and underscore only)
    if (!/^[a-zA-Z0-9_]+$/.test(fieldKey)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Field key must contain only letters, numbers, and underscores' 
      });
    }

    // Check if fieldKey already exists
    const existing = await req.prisma.customField.findUnique({
      where: { fieldKey }
    });

    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'Field key already exists. Please use a different key.' 
      });
    }

    const field = await req.prisma.customField.create({
      data: {
        label,
        fieldKey,
        fieldType,
        placeholder: placeholder || null,
        required: required || false,
        validation: validation || null,
        options: options || null,
        order: order || 0,
        isActive: true
      }
    });

    logger.info(`✅ Custom field created: ${fieldKey}`);

    res.json({ success: true, data: field });
  } catch (error) {
    logger.error('Error creating custom field:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update custom field
router.put('/custom-fields/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { label, fieldType, placeholder, required, validation, options, order, isActive } = req.body;

    // Check if it's a standard field - don't allow changing fieldKey or isStandard
    const existingField = await req.prisma.customField.findUnique({
      where: { id }
    });

    if (!existingField) {
      return res.status(404).json({ success: false, message: 'Field not found' });
    }

    // For standard fields, only allow editing label, placeholder, required, order, isActive
    // Don't allow changing fieldKey, fieldType, or isStandard
    const updateData = {
      ...(label !== undefined && { label }),
      ...(placeholder !== undefined && { placeholder }),
      ...(required !== undefined && { required }),
      ...(validation !== undefined && { validation }),
      ...(options !== undefined && { options }),
      ...(order !== undefined && { order }),
      ...(isActive !== undefined && { isActive })
    };

    // Only allow fieldType change for custom fields
    if (!existingField.isStandard && fieldType !== undefined) {
      updateData.fieldType = fieldType;
    }

    const field = await req.prisma.customField.update({
      where: { id },
      data: updateData
    });

    logger.info(`✅ Field updated: ${field.fieldKey}`);

    res.json({ success: true, data: field });
  } catch (error) {
    logger.error('Error updating field:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete custom field
router.delete('/custom-fields/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if it's a standard field - don't allow deletion, only deactivation
    const field = await req.prisma.customField.findUnique({
      where: { id }
    });

    if (field && field.isStandard) {
      return res.status(400).json({ 
        success: false, 
        message: 'Standard fields cannot be deleted. You can hide them by deactivating.' 
      });
    }

    await req.prisma.customField.delete({
      where: { id }
    });

    logger.info('✅ Custom field deleted');

    res.json({ success: true, message: 'Custom field deleted successfully' });
  } catch (error) {
    logger.error('Error deleting custom field:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize standard candidate form fields
router.post('/custom-fields/init-standard', requireAdmin, async (req, res) => {
  try {
    const standardFields = [
      { fieldKey: 'firstName', label: 'First Name', fieldType: 'text', placeholder: 'John', required: true, order: 1, isStandard: true },
      { fieldKey: 'lastName', label: 'Last Name', fieldType: 'text', placeholder: 'Doe', required: true, order: 2, isStandard: true },
      { fieldKey: 'email', label: 'Email Address', fieldType: 'email', placeholder: 'john@example.com', required: true, order: 3, isStandard: true },
      { fieldKey: 'phone', label: 'Phone Number', fieldType: 'phone', placeholder: '+91 98765 43210', required: false, order: 4, isStandard: true },
      { fieldKey: 'position', label: 'Position', fieldType: 'text', placeholder: 'Software Engineer', required: true, order: 5, isStandard: true },
      { fieldKey: 'department', label: 'Department', fieldType: 'select', placeholder: 'Select Department', required: true, order: 6, isStandard: true },
      { fieldKey: 'expectedJoiningDate', label: 'Expected Joining Date', fieldType: 'date', required: true, order: 7, isStandard: true },
      { fieldKey: 'salary', label: 'Annual CTC (₹)', fieldType: 'text', placeholder: '10,00,000', required: false, order: 8, isStandard: true },
      { fieldKey: 'reportingManager', label: 'Reporting Manager', fieldType: 'text', placeholder: 'Manager Name', required: false, order: 9, isStandard: true },
      { fieldKey: 'notes', label: 'Notes', fieldType: 'textarea', placeholder: 'Any additional notes...', required: false, order: 10, isStandard: true },
    ];

    const createdFields = [];
    for (const field of standardFields) {
      const existing = await req.prisma.customField.findUnique({
        where: { fieldKey: field.fieldKey }
      });

      if (!existing) {
        const created = await req.prisma.customField.create({
          data: field
        });
        createdFields.push(created);
      }
    }

    logger.info(`✅ Initialized ${createdFields.length} standard fields`);

    res.json({ 
      success: true, 
      message: `Initialized ${createdFields.length} standard fields`,
      data: createdFields
    });
  } catch (error) {
    logger.error('Error initializing standard fields:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// CUSTOM PLACEHOLDERS - For email templates
// ============================================================

// Get all custom placeholders
router.get('/custom-placeholders', async (req, res) => {
  try {
    const placeholders = await req.prisma.customPlaceholder.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }]
    });
    res.json({ success: true, data: placeholders });
  } catch (error) {
    logger.error('Error fetching custom placeholders:', error);
    // If table doesn't exist yet, return empty array
    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    if (
      errorMessage.includes('does not exist') ||
      errorMessage.includes('Unknown table') ||
      errorMessage.includes('relation') ||
      errorCode === 'P2021' ||
      errorCode === '42P01'
    ) {
      logger.warn('CustomPlaceholder table does not exist yet. Returning empty array. Please run: npx prisma db push');
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all custom placeholders (including inactive - for admin)
router.get('/custom-placeholders/all', requireAdmin, async (req, res) => {
  try {
    const placeholders = await req.prisma.customPlaceholder.findMany({
      orderBy: [{ isActive: 'desc' }, { order: 'asc' }, { name: 'asc' }]
    });
    res.json({ success: true, data: placeholders });
  } catch (error) {
    logger.error('Error fetching all custom placeholders:', error);
    // If table doesn't exist yet, return empty array
    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    if (
      errorMessage.includes('does not exist') ||
      errorMessage.includes('Unknown table') ||
      errorMessage.includes('relation') ||
      errorCode === 'P2021' ||
      errorCode === '42P01'
    ) {
      logger.warn('CustomPlaceholder table does not exist yet. Returning empty array. Please run: npx prisma db push');
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create custom placeholder
router.post('/custom-placeholders', requireAdmin, async (req, res) => {
  try {
    const { name, placeholderKey, value, description, order } = req.body;

    if (!name || !placeholderKey || value === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, placeholderKey, and value are required' 
      });
    }

    // Validate placeholderKey format (should be alphanumeric with camelCase)
    if (!/^[a-z][a-zA-Z0-9]*$/.test(placeholderKey)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Placeholder key must start with lowercase letter and contain only alphanumeric characters (camelCase format)' 
      });
    }

    // Check if placeholderKey already exists
    const existing = await req.prisma.customPlaceholder.findUnique({
      where: { placeholderKey }
    });

    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'Placeholder key already exists' 
      });
    }

    const placeholder = await req.prisma.customPlaceholder.create({
      data: {
        name,
        placeholderKey,
        value,
        description: description || null,
        order: order || 0,
        isActive: true
      }
    });

    logger.info(`✅ Custom placeholder created: ${placeholderKey}`);
    res.json({ success: true, data: placeholder });
  } catch (error) {
    logger.error('Error creating custom placeholder:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update custom placeholder
router.put('/custom-placeholders/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, placeholderKey, value, description, isActive, order } = req.body;

    // Check if placeholder exists
    const existing = await req.prisma.customPlaceholder.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Placeholder not found' });
    }

    // If placeholderKey is being changed, validate it and check for duplicates
    if (placeholderKey && placeholderKey !== existing.placeholderKey) {
      if (!/^[a-z][a-zA-Z0-9]*$/.test(placeholderKey)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Placeholder key must start with lowercase letter and contain only alphanumeric characters (camelCase format)' 
        });
      }

      const duplicate = await req.prisma.customPlaceholder.findUnique({
        where: { placeholderKey }
      });

      if (duplicate) {
        return res.status(400).json({ 
          success: false, 
          message: 'Placeholder key already exists' 
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (placeholderKey !== undefined) updateData.placeholderKey = placeholderKey;
    if (value !== undefined) updateData.value = value;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;

    const placeholder = await req.prisma.customPlaceholder.update({
      where: { id },
      data: updateData
    });

    logger.info(`✅ Custom placeholder updated: ${placeholder.placeholderKey}`);
    res.json({ success: true, data: placeholder });
  } catch (error) {
    logger.error('Error updating custom placeholder:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete custom placeholder
router.delete('/custom-placeholders/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const placeholder = await req.prisma.customPlaceholder.findUnique({
      where: { id }
    });

    if (!placeholder) {
      return res.status(404).json({ success: false, message: 'Placeholder not found' });
    }

    await req.prisma.customPlaceholder.delete({
      where: { id }
    });

    logger.info(`✅ Custom placeholder deleted: ${placeholder.placeholderKey}`);
    res.json({ success: true, message: 'Placeholder deleted successfully' });
  } catch (error) {
    logger.error('Error deleting custom placeholder:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update HR email and optionally configure Google Cloud
router.post('/update-hr-email', requireAdmin, async (req, res) => {
  try {
    const { hrEmail, hrName, updateSmtpUser, smtpPassword, smtpHost, smtpPort, smtpSecure, smtpUsername, 
            imapEnabled, imapHost, imapUser, imapPass, imapPort, imapSecure, emailProvider, googleRefreshToken } = req.body;
    
    // Log received refresh token (for debugging - don't log the actual token value)
    if (googleRefreshToken) {
      logger.info(`📝 Received Google Refresh Token in request (length: ${googleRefreshToken.length} characters)`);
    } else {
      logger.debug('📝 No Google Refresh Token received in request');
    }
    
    if (!hrEmail || !hrEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please provide a valid HR email address' });
    }

    // Get old HR email for comparison
    const oldConfig = await req.prisma.workflowConfig.findUnique({
      where: { key: 'hr_email' }
    });
    const oldHrEmail = oldConfig?.value;

    // Update HR email in database
    await req.prisma.workflowConfig.upsert({
      where: { key: 'hr_email' },
      update: { value: hrEmail },
      create: { key: 'hr_email', value: hrEmail }
    });

    // Update HR name if provided
    if (hrName) {
      await req.prisma.workflowConfig.upsert({
        where: { key: 'hr_name' },
        update: { value: hrName },
        create: { key: 'hr_name', value: hrName }
      });
    }

    logger.info(`✅ HR email updated from ${oldHrEmail || 'none'} to ${hrEmail}`);

    // Store SMTP credentials and settings in database (dynamic, no restart needed)
    let smtpUpdated = false;
    if (updateSmtpUser && smtpPassword) {
      try {
        // Store SMTP username (use provided username or default to email address)
        const smtpUserValue = smtpUsername || hrEmail;
        await req.prisma.workflowConfig.upsert({
          where: { key: 'smtp_user' },
          update: { value: smtpUserValue },
          create: { key: 'smtp_user', value: smtpUserValue }
        });
        
        await req.prisma.workflowConfig.upsert({
          where: { key: 'smtp_pass' },
          update: { value: smtpPassword },
          create: { key: 'smtp_pass', value: smtpPassword }
        });

        // Store SMTP host, port, and secure settings (always save, use defaults if not provided)
        // Determine default host based on email provider or use provided value
        let defaultHost = '';
        if (emailProvider === 'gmail') {
          defaultHost = 'smtp.gmail.com';
        } else if (emailProvider === 'godaddy') {
          defaultHost = 'smtpout.secureserver.net';
        } else {
          defaultHost = process.env.SMTP_HOST || '';
        }
        const hostToSave = smtpHost || defaultHost;
        const portToSave = smtpPort || '587';
        const secureToSave = smtpSecure !== undefined ? smtpSecure : false;
        
        if (hostToSave) {
          await req.prisma.workflowConfig.upsert({
            where: { key: 'smtp_host' },
            update: { value: hostToSave },
            create: { key: 'smtp_host', value: hostToSave }
          });
          logger.info(`✅ SMTP Host stored: ${hostToSave}`);
        }

        await req.prisma.workflowConfig.upsert({
          where: { key: 'smtp_port' },
          update: { value: portToSave.toString() },
          create: { key: 'smtp_port', value: portToSave.toString() }
        });
        logger.info(`✅ SMTP Port stored: ${portToSave}`);

        await req.prisma.workflowConfig.upsert({
          where: { key: 'smtp_secure' },
          update: { value: secureToSave.toString() },
          create: { key: 'smtp_secure', value: secureToSave.toString() }
        });
        logger.info(`✅ SMTP Secure stored: ${secureToSave}`);
        
        smtpUpdated = true;
        logger.info(`✅ SMTP credentials and settings stored in database for ${hrEmail} (no restart needed)`);
      } catch (smtpError) {
        logger.error('Error storing SMTP credentials:', smtpError);
        // Don't fail the request, just log the error
      }
    }

    // Store email provider/monitoring method preference in database
    if (emailProvider) {
      try {
        await req.prisma.workflowConfig.upsert({
          where: { key: 'email_provider' },
          update: { value: emailProvider },
          create: { key: 'email_provider', value: emailProvider }
        });
        logger.info(`✅ Email provider preference stored: ${emailProvider}`);
      } catch (error) {
        logger.error('Error storing email provider preference:', error);
      }
    }

    // Store IMAP credentials and settings in database (for email monitoring)
    let imapUpdated = false;
    if (imapEnabled && imapHost && imapUser && imapPass) {
      try {
        await req.prisma.workflowConfig.upsert({
          where: { key: 'imap_enabled' },
          update: { value: 'true' },
          create: { key: 'imap_enabled', value: 'true' }
        });
        
        await req.prisma.workflowConfig.upsert({
          where: { key: 'imap_host' },
          update: { value: imapHost },
          create: { key: 'imap_host', value: imapHost }
        });
        
        await req.prisma.workflowConfig.upsert({
          where: { key: 'imap_user' },
          update: { value: imapUser },
          create: { key: 'imap_user', value: imapUser }
        });
        
        await req.prisma.workflowConfig.upsert({
          where: { key: 'imap_pass' },
          update: { value: imapPass },
          create: { key: 'imap_pass', value: imapPass }
        });

        if (imapPort) {
          await req.prisma.workflowConfig.upsert({
            where: { key: 'imap_port' },
            update: { value: imapPort.toString() },
            create: { key: 'imap_port', value: imapPort.toString() }
          });
        }

        if (imapSecure !== undefined) {
          await req.prisma.workflowConfig.upsert({
            where: { key: 'imap_secure' },
            update: { value: imapSecure.toString() },
            create: { key: 'imap_secure', value: imapSecure.toString() }
          });
        }
        
        imapUpdated = true;
        logger.info(`✅ IMAP credentials stored in database (no restart needed)`);
      } catch (imapError) {
        logger.error('Error storing IMAP credentials:', imapError);
      }
    } else if (imapEnabled === false) {
      // Disable IMAP
      await req.prisma.workflowConfig.upsert({
        where: { key: 'imap_enabled' },
        update: { value: 'false' },
        create: { key: 'imap_enabled', value: 'false' }
      });
      logger.info(`✅ IMAP disabled`);
    }

    // Update Google Refresh Token in .env file if provided
    let tokenUpdateSuccess = false;
    let tokenUpdateMessage = '';
    if (googleRefreshToken && googleRefreshToken.trim()) {
      try {
        const fs = require('fs');
        const path = require('path');
        
        // Try multiple possible paths for .env file
        const possiblePaths = [
          path.join(process.cwd(), '.env'), // Current working directory
          path.join(__dirname, '../../.env'), // Relative to this file
          path.join(__dirname, '../../../.env'), // One level up
          '.env' // Current directory
        ];
        
        let envPath = null;
        for (const testPath of possiblePaths) {
          if (fs.existsSync(testPath)) {
            envPath = testPath;
            logger.info(`📝 Found .env file at: ${envPath}`);
            break;
          }
        }
        
        if (!envPath) {
          // Use the most likely path (current working directory)
          envPath = path.join(process.cwd(), '.env');
          logger.warn(`⚠️  .env file not found, will create at: ${envPath}`);
        }
        
        logger.info(`📝 Attempting to update Google Refresh Token in .env file: ${envPath}`);
        
        // Read current .env file
        let envContent = '';
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf8');
          logger.info(`📝 Read .env file (${envContent.length} characters)`);
        } else {
          logger.info(`📝 .env file does not exist, will create new one`);
        }
        
        // Update or add GOOGLE_REFRESH_TOKEN
        const trimmedToken = googleRefreshToken.trim();
        const tokenLine = `GOOGLE_REFRESH_TOKEN=${trimmedToken}`;
        
        // Check if GOOGLE_REFRESH_TOKEN exists (handle various formats: with/without spaces, quotes, comments)
        // Match: GOOGLE_REFRESH_TOKEN=value or GOOGLE_REFRESH_TOKEN = value or GOOGLE_REFRESH_TOKEN="value" etc.
        const tokenRegex = /^GOOGLE_REFRESH_TOKEN\s*=\s*[^\r\n]*(?:\r?\n|$)/gm;
        
        if (tokenRegex.test(envContent)) {
          // Replace existing token (handles spaces, quotes, etc.)
          envContent = envContent.replace(tokenRegex, tokenLine + '\n');
          logger.info('📝 Replaced existing GOOGLE_REFRESH_TOKEN in .env file');
        } else {
          // Add new token at the end
          const separator = envContent && !envContent.endsWith('\n') ? '\n' : '';
          envContent += separator + tokenLine + '\n';
          logger.info('📝 Added new GOOGLE_REFRESH_TOKEN to .env file');
        }
        
        // Write back to .env file
        fs.writeFileSync(envPath, envContent, 'utf8');
        logger.info('✅ Google Refresh Token successfully written to .env file');
        
        // Verify the write
        const verifyContent = fs.readFileSync(envPath, 'utf8');
        if (verifyContent.includes(`GOOGLE_REFRESH_TOKEN=${trimmedToken}`)) {
          logger.info('✅ Verified: Token is present in .env file');
          tokenUpdateSuccess = true;
          tokenUpdateMessage = 'Google Refresh Token successfully updated in .env file';
        } else {
          logger.warn('⚠️  Warning: Token verification failed - token may not have been written correctly');
          tokenUpdateMessage = 'Warning: Token may not have been written correctly';
        }
        
        // Reload environment variables (for current process)
        process.env.GOOGLE_REFRESH_TOKEN = trimmedToken;
        logger.info('✅ Google Refresh Token reloaded in current process');
        
        // Reinitialize email monitor with new token (if Gmail flow)
        if (emailProvider === 'gmail') {
          try {
            const { reinitializeEmailMonitor } = require('../services/emailMonitor');
            logger.info('📧 Reinitializing email monitor with new refresh token...');
            await reinitializeEmailMonitor();
            logger.info('✅ Email monitor reinitialized successfully');
            tokenUpdateMessage = 'Google Refresh Token updated and email monitor reinitialized';
          } catch (reinitError) {
            logger.error('⚠️  Could not reinitialize email monitor:', reinitError.message);
            tokenUpdateMessage = 'Token updated but email monitor needs manual restart. Please restart backend: pm2 restart hr-onboarding-backend';
          }
        }
      } catch (error) {
        logger.error('❌ Error updating Google Refresh Token in .env:', error.message);
        logger.error('Full error:', error);
        logger.error('Error stack:', error.stack);
        tokenUpdateMessage = `Error updating .env file: ${error.message}`;
        // Don't fail the request, just log the error
      }
    } else {
      logger.debug('📝 No Google Refresh Token provided, skipping .env update');
    }

    // Try to configure Gmail "Send As" using Gmail API if OAuth is configured
    // Note: The OAuth account (ironladytech@gmail.com) needs to have permission to send as the HR email
    let gmailConfigured = false;
    let gmailConfigMessage = '';
    try {
      // Use token from request (if provided) or from .env (which may have been just updated)
      const refreshToken = googleRefreshToken?.trim() || process.env.GOOGLE_REFRESH_TOKEN;
      if (process.env.GOOGLE_CLIENT_ID && refreshToken) {
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        oauth2Client.setCredentials({
          refresh_token: refreshToken
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // Get the authenticated user's email (should be ironladytech@gmail.com)
        let authenticatedEmail = 'me';
        try {
          const profile = await gmail.users.getProfile({ userId: 'me' });
          authenticatedEmail = profile.data.emailAddress;
          logger.info(`📧 Authenticated Gmail account: ${authenticatedEmail}`);
        } catch (profileError) {
          logger.warn('Could not get Gmail profile:', profileError.message);
        }
        
        // Try to add "Send As" alias
        // This allows ironladytech@gmail.com to send emails as the HR email
        try {
          await gmail.users.settings.sendAs.create({
            userId: 'me',
            requestBody: {
              sendAsEmail: hrEmail,
              displayName: hrName || 'HR Team',
              isDefault: false, // Don't make it default, just add it
              treatAsAlias: false
            }
          });
          gmailConfigured = true;
          gmailConfigMessage = `Gmail "Send As" configured: ${authenticatedEmail} can now send as ${hrEmail}`;
          logger.info(`✅ Gmail "Send As" configured: ${authenticatedEmail} → ${hrEmail}`);
        } catch (gmailError) {
          // If email already exists as send-as, that's okay
          if (gmailError.message && gmailError.message.includes('already exists')) {
            gmailConfigured = true;
            gmailConfigMessage = `Gmail "Send As" already configured: ${authenticatedEmail} can send as ${hrEmail}`;
            logger.info(`✅ Gmail "Send As" already exists: ${authenticatedEmail} → ${hrEmail}`);
          } else {
            gmailConfigMessage = `Could not auto-configure Gmail "Send As". Please manually add ${hrEmail} in Gmail Settings (${authenticatedEmail}) → Accounts and Import → Send mail as`;
            logger.warn(`⚠️ Could not automatically configure Gmail "Send As" for ${hrEmail}: ${gmailError.message}`);
            logger.info(`💡 Manual setup: In Gmail (${authenticatedEmail}), go to Settings → Accounts and Import → Send mail as → Add ${hrEmail}`);
          }
        }
      } else {
        gmailConfigMessage = 'Google OAuth not configured. Emails will use SMTP only.';
        logger.info('ℹ️ Google OAuth not configured, skipping Gmail API setup');
      }
    } catch (gmailError) {
      gmailConfigMessage = `Gmail API error: ${gmailError.message}`;
      logger.warn('⚠️ Gmail API error:', gmailError.message);
    }

    // Build success message
    let successMessage = `HR email updated successfully to ${hrEmail}`;
    if (tokenUpdateSuccess) {
      successMessage += '. Google Refresh Token updated in .env file.';
    } else if (tokenUpdateMessage && tokenUpdateMessage.includes('Error')) {
      successMessage += `. ${tokenUpdateMessage}`;
    }
    
    res.json({ 
      success: true, 
      message: successMessage,
      data: {
        oldHrEmail,
        newHrEmail: hrEmail,
        smtpUpdated,
        gmailConfigured,
        gmailConfigMessage,
        refreshTokenUpdated: tokenUpdateSuccess,
        refreshTokenMessage: tokenUpdateMessage,
        requiresRestart: smtpUpdated
      }
    });
  } catch (error) {
    logger.error('Error updating HR email:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to update HR email' 
    });
  }
});

// Test HR email - Send a test email to verify the HR email is working
router.post('/test-hr-email', requireAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;
    
    if (!testEmail || !testEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please provide a valid test email address' });
    }

    // Get current HR email, name, and SMTP credentials from database
    const configs = await req.prisma.workflowConfig.findMany({
      where: {
        key: {
          in: ['hr_email', 'hr_name', 'company_name', 'smtp_user', 'smtp_pass', 'smtp_host', 'smtp_port', 'smtp_secure']
        }
      }
    });
    const configMap = {};
    configs.forEach(c => { configMap[c.key] = c.value; });
    
    const hrEmail = configMap.hr_email || process.env.HR_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_USER;
    const hrName = configMap.hr_name || process.env.HR_NAME || 'HR Team';
    const companyName = configMap.company_name || process.env.COMPANY_NAME || 'Company';
    
    // Get SMTP credentials and settings from database if available, else use env
    let smtpUser = configMap.smtp_user || process.env.SMTP_USER;
    let smtpPass = configMap.smtp_pass || process.env.SMTP_PASS;
    let smtpHost = configMap.smtp_host || process.env.SMTP_HOST;
    let smtpPort = configMap.smtp_port || process.env.SMTP_PORT || '587';
    let smtpSecure = configMap.smtp_secure !== undefined ? (configMap.smtp_secure === 'true') : (process.env.SMTP_SECURE === 'true');
    
    if (!hrEmail) {
      return res.status(400).json({ success: false, message: 'HR email is not configured. Please set it in Settings first.' });
    }

    // Validate SMTP configuration
    if (!smtpHost || !smtpUser || !smtpPass) {
      return res.status(400).json({ 
        success: false, 
        message: 'SMTP configuration is missing. The system needs SMTP credentials to send emails. Please either:\n1. Provide SMTP settings in Step 2 of the wizard, OR\n2. Ensure SMTP_HOST, SMTP_USER, and SMTP_PASS are set in the backend .env file.' 
      });
    }
    
    logger.info(`📧 Test email - Using SMTP host: ${smtpHost} (${configMap.smtp_host ? 'from database' : 'from env'})`);
    logger.info(`📧 Test email - Using SMTP port: ${smtpPort} (${configMap.smtp_port ? 'from database' : 'from env'})`);
    logger.info(`📧 Test email - Using SMTP secure: ${smtpSecure} (${configMap.smtp_secure !== undefined ? 'from database' : 'from env'})`);
    logger.info(`📧 Test email - Using SMTP user: ${smtpUser} (${configMap.smtp_user ? 'from database' : 'from env'})`);
    logger.info(`📧 Test email - From address will be: ${hrEmail}`);

    const nodemailer = require('nodemailer');
    
    // Create transporter with dynamic credentials (from database or env)
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort) || 587,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    // Format "from" address
    const fromAddress = hrName && hrEmail ? `${hrName} <${hrEmail}>` : hrEmail;
    
    // Send test email
    await transporter.sendMail({
      from: fromAddress,
      to: testEmail,
      subject: `Test Email from ${companyName} HR System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">✅ HR Email Test Successful!</h2>
          <p>This is a test email to verify that your HR email configuration is working correctly.</p>
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>HR Email:</strong> ${hrEmail}</p>
            <p><strong>HR Name:</strong> ${hrName}</p>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>From Address:</strong> ${fromAddress}</p>
          </div>
          <p>If you received this email, it means:</p>
          <ul>
            <li>✅ The HR email is correctly configured in the system</li>
            <li>✅ The SMTP server is working properly</li>
            <li>✅ All future emails to candidates will be sent from: <strong>${hrEmail}</strong></li>
          </ul>
          <p style="color: #6B7280; font-size: 12px; margin-top: 30px;">
            This is an automated test email from the HR Onboarding System.
          </p>
        </div>
      `
    });

    logger.info(`✅ Test email sent successfully from ${fromAddress} to ${testEmail}`);
    
    res.json({ 
      success: true, 
      message: `Test email sent successfully to ${testEmail} from ${fromAddress}`,
      data: {
        from: fromAddress,
        to: testEmail,
        hrEmail,
        hrName
      }
    });
  } catch (error) {
    logger.error('Error sending test email:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to send test email. ';
    
    if (error.code === 'EAUTH' || error.message?.includes('Invalid login') || error.message?.includes('535-5.7.8')) {
      errorMessage += 'SMTP authentication failed. Please check:';
      errorMessage += '\n1. The App Password you provided in Step 2 is correct';
      errorMessage += '\n2. 2-Step Verification is enabled on the email account';
      errorMessage += '\n3. The email address matches the one you configured';
      errorMessage += '\n\nIf you didn\'t provide an App Password, go back to Step 2 and generate one.';
    } else if (error.code === 'ECONNECTION' || error.message?.includes('connection')) {
      errorMessage += 'Could not connect to SMTP server. Please check your SMTP_HOST and SMTP_PORT settings.';
    } else {
      errorMessage += error.message || 'Please check your SMTP configuration.';
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      errorCode: error.code,
      errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
