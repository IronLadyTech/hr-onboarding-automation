const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

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

// Apply authentication to all routes
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
    // Get unique departments from candidates
    const departments = await req.prisma.candidate.findMany({
      select: { department: true },
      distinct: ['department']
    });

    const departmentList = departments
      .map(d => d.department)
      .filter(d => d && d.trim() !== '');

    // Add default departments if not present
    const defaults = ['Engineering', 'Sales', 'Marketing', 'Operations', 'HR', 'Finance'];
    const allDepartments = [...new Set([...departmentList, ...defaults])].sort();

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

    // Check if department already exists (by checking if any candidate uses it)
    const existing = await req.prisma.candidate.findFirst({
      where: { department: departmentName }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'Department already exists' });
    }

    // Since departments are stored as strings in candidates, we just return success
    // The department will be available when a candidate is created with it
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

    // Check if new name already exists
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

// Get system settings
router.get('/settings', async (req, res) => {
  try {
    // Get company config from database
    const configs = await req.prisma.workflowConfig.findMany({
      where: {
        key: {
          in: ['company_name', 'hr_email', 'hr_name', 'hr_phone', 'company_address', 'office_timings', 'ceo_name', 'office_location', 'company_logo_path', 'ui_primary_color', 'ui_secondary_color', 'ui_accent_color']
        }
      }
    });
    const configMap = {};
    configs.forEach(c => { configMap[c.key] = c.value; });
    
    // Build logo URL if logo path exists
    let logoUrl = null;
    if (configMap.company_logo_path) {
      // Use API_URL from env, or construct from request
      let baseUrl = process.env.API_URL;
      if (!baseUrl) {
        const protocol = req.protocol || (req.secure ? 'https' : 'http');
        const host = req.get('host') || 'localhost:5000';
        baseUrl = `${protocol}://${host}`;
      }
      // Ensure baseUrl doesn't end with /api
      baseUrl = baseUrl.replace(/\/api$/, '');
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
      const protocol = req.protocol || (req.secure ? 'https' : 'http');
      const host = req.get('host') || 'localhost:5000';
      baseUrl = `${protocol}://${host}`;
    }
    // Ensure baseUrl doesn't end with /api
    baseUrl = baseUrl.replace(/\/api$/, '');
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

    res.json({ success: true, data: steps });
  } catch (error) {
    logger.error('Error fetching department steps:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create or update step template
router.post('/department-steps', async (req, res) => {
  try {
    const { department, stepNumber, title, description, type, icon, isAuto, dueDateOffset, priority, emailTemplateId } = req.body;

    if (!department || !stepNumber || !title || !type) {
      return res.status(400).json({ success: false, message: 'Department, stepNumber, title, and type are required' });
    }

    // Validate: Email template is required
    if (!emailTemplateId) {
      return res.status(400).json({ success: false, message: 'Email template is required for every step' });
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
      // Update existing step
      step = await req.prisma.departmentStepTemplate.update({
        where: { id: existing.id },
        data: {
          title,
          description,
          type,
          icon,
          isAuto: isAuto || false,
          dueDateOffset: dueDateOffset !== undefined ? parseInt(dueDateOffset) : null,
          priority: priority || 'MEDIUM',
          emailTemplateId: emailTemplateId || null
        },
        include: {
          emailTemplate: true
        }
      });
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

      step = await req.prisma.departmentStepTemplate.create({
        data: {
          department,
          stepNumber: parseInt(stepNumber),
          title,
          description,
          type,
          icon,
          isAuto: isAuto || false,
          dueDateOffset: dueDateOffset !== undefined ? parseInt(dueDateOffset) : null,
          priority: priority || 'MEDIUM',
          emailTemplateId: emailTemplateId || null
        },
        include: {
          emailTemplate: true
        }
      });
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
    const { title, description, type, icon, isAuto, dueDateOffset, priority, stepNumber, emailTemplateId } = req.body;

    // Validate: Email template is required
    if (emailTemplateId !== undefined && !emailTemplateId) {
      return res.status(400).json({ success: false, message: 'Email template is required for every step' });
    }

    const step = await req.prisma.departmentStepTemplate.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(type && { type }),
        ...(icon !== undefined && { icon }),
        ...(isAuto !== undefined && { isAuto }),
        ...(dueDateOffset !== undefined && { dueDateOffset: parseInt(dueDateOffset) }),
        ...(priority && { priority }),
        ...(stepNumber !== undefined && { stepNumber: parseInt(stepNumber) }),
        ...(emailTemplateId !== undefined && { emailTemplateId: emailTemplateId || null })
      },
      include: {
        emailTemplate: true
      }
    });

    res.json({ success: true, data: step });
  } catch (error) {
    logger.error('Error updating department step:', error);
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

    const defaultSteps = [
      { stepNumber: 1, title: 'Offer Letter Email', description: 'Upload and send offer letter with tracking', type: 'OFFER_LETTER', icon: '📄', isAuto: false, dueDateOffset: 0, priority: 'HIGH' },
      { stepNumber: 2, title: 'Offer Reminder (Auto)', description: 'Auto-sends if not signed in 3 days', type: 'OFFER_REMINDER', icon: '⏰', isAuto: true, dueDateOffset: 3, priority: 'MEDIUM' },
      { stepNumber: 3, title: 'Day -1 Welcome Email (Auto)', description: 'Sent automatically one day before joining', type: 'WELCOME_EMAIL', icon: '👋', isAuto: true, dueDateOffset: -1, priority: 'MEDIUM' },
      { stepNumber: 4, title: 'HR Induction (9:30 AM) (Auto)', description: 'Calendar invite on joining day', type: 'HR_INDUCTION', icon: '🏢', isAuto: true, dueDateOffset: 0, priority: 'HIGH' },
      { stepNumber: 5, title: 'WhatsApp Group Addition (Auto)', description: 'Send WhatsApp group URLs via email', type: 'WHATSAPP_ADDITION', icon: '💬', isAuto: true, dueDateOffset: 0, priority: 'HIGH' },
      { stepNumber: 6, title: 'Onboarding Form Email (Auto)', description: 'Sent within 1 hour of joining', type: 'ONBOARDING_FORM', icon: '📝', isAuto: true, dueDateOffset: 0, priority: 'HIGH' },
      { stepNumber: 7, title: 'Form Reminder (Auto)', description: 'Auto-sends if not completed in 24h', type: 'FORM_REMINDER', icon: '🔔', isAuto: true, dueDateOffset: 1, priority: 'MEDIUM' },
      { stepNumber: 8, title: 'CEO Induction', description: 'HR confirms time with CEO, then system sends invite', type: 'CEO_INDUCTION', icon: '👔', isAuto: false, dueDateOffset: 2, priority: 'MEDIUM' },
      { stepNumber: 9, title: `${department} Induction`, description: `HR confirms time with ${department} team, then system sends invite`, type: department === 'Sales' ? 'SALES_INDUCTION' : 'DEPARTMENT_INDUCTION', icon: '💼', isAuto: false, dueDateOffset: 3, priority: 'MEDIUM' },
      { stepNumber: 10, title: 'Training Plan Email (Auto)', description: 'Auto-sends on Day 3 with structured training', type: 'TRAINING_PLAN', icon: '📚', isAuto: true, dueDateOffset: 3, priority: 'MEDIUM' },
      { stepNumber: 11, title: 'HR Check-in Call (Day 7) (Auto)', description: 'Auto-scheduled 7 days after joining', type: 'CHECKIN_CALL', icon: '📞', isAuto: true, dueDateOffset: 7, priority: 'MEDIUM' }
    ];

    const created = await Promise.all(
      defaultSteps.map(step =>
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

// Test HR email - Send a test email to verify the HR email is working
router.post('/test-hr-email', requireAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;
    
    if (!testEmail || !testEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please provide a valid test email address' });
    }

    // Get current HR email and name from database
    const configs = await req.prisma.workflowConfig.findMany({
      where: {
        key: {
          in: ['hr_email', 'hr_name', 'company_name']
        }
      }
    });
    const configMap = {};
    configs.forEach(c => { configMap[c.key] = c.value; });
    
    const hrEmail = configMap.hr_email || process.env.HR_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_USER;
    const hrName = configMap.hr_name || process.env.HR_NAME || 'HR Team';
    const companyName = configMap.company_name || process.env.COMPANY_NAME || 'Company';
    
    if (!hrEmail) {
      return res.status(400).json({ success: false, message: 'HR email is not configured. Please set it in Settings first.' });
    }

    // Import email service
    const emailService = require('../services/emailService');
    const nodemailer = require('nodemailer');
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
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
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to send test email. Please check your SMTP configuration.' 
    });
  }
});

module.exports = router;
