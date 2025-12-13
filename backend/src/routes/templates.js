const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(authMiddleware);

// Get all templates
router.get('/', async (req, res) => {
  try {
    const templates = await req.prisma.emailTemplate.findMany({
      orderBy: { type: 'asc' }
    });
    res.json({ success: true, data: templates });
  } catch (error) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get template by ID
router.get('/:id', async (req, res) => {
  try {
    const template = await req.prisma.emailTemplate.findUnique({
      where: { id: req.params.id }
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    logger.error('Error fetching template:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get template by type
router.get('/type/:type', async (req, res) => {
  try {
    const template = await req.prisma.emailTemplate.findFirst({
      where: { type: req.params.type, isActive: true }
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    logger.error('Error fetching template by type:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create template
router.post('/', [
  body('name').notEmpty().trim(),
  body('type').notEmpty(),
  body('subject').notEmpty().trim(),
  body('body').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, type, subject, body, placeholders = [], customEmailType } = req.body;

    // Check for existing template with same name
    const existing = await req.prisma.emailTemplate.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Template with this name already exists' });
    }

    // Validate: If type is CUSTOM, customEmailType is required
    if (type === 'CUSTOM' && !customEmailType) {
      return res.status(400).json({ success: false, message: 'Custom email type name is required when type is CUSTOM' });
    }

    const template = await req.prisma.emailTemplate.create({
      data: { 
        name, 
        type, 
        subject, 
        body, 
        placeholders,
        customEmailType: type === 'CUSTOM' ? customEmailType : null
      }
    });

    logger.info(`Template created: ${template.name}`);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    logger.error('Error creating template:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update template
router.put('/:id', async (req, res) => {
  try {
    const { name, type, subject, body, placeholders, isActive, customEmailType } = req.body;

    // Validate: If type is CUSTOM, customEmailType is required
    if (type === 'CUSTOM' && !customEmailType) {
      return res.status(400).json({ success: false, message: 'Custom email type name is required when type is CUSTOM' });
    }

    const template = await req.prisma.emailTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(subject && { subject }),
        ...(body && { body }),
        ...(placeholders && { placeholders }),
        ...(isActive !== undefined && { isActive }),
        ...(type === 'CUSTOM' && customEmailType !== undefined && { customEmailType }),
        ...(type !== 'CUSTOM' && { customEmailType: null })
      }
    });

    logger.info(`Template updated: ${template.name}`);
    res.json({ success: true, data: template });
  } catch (error) {
    logger.error('Error updating template:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete template
router.delete('/:id', async (req, res) => {
  try {
    await req.prisma.emailTemplate.delete({ where: { id: req.params.id } });
    logger.info(`Template deleted: ${req.params.id}`);
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    logger.error('Error deleting template:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Preview template with sample data
router.post('/:id/preview', async (req, res) => {
  try {
    const template = await req.prisma.emailTemplate.findUnique({
      where: { id: req.params.id }
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    // Sample data for preview
    const sampleData = {
      '{{firstName}}': 'John',
      '{{lastName}}': 'Doe',
      '{{fullName}}': 'John Doe',
      '{{email}}': 'john.doe@example.com',
      '{{position}}': 'Software Engineer',
      '{{department}}': 'Engineering',
      '{{salary}}': '₹10,00,000',
      '{{joiningDate}}': new Date().toLocaleDateString(),
      '{{reportingManager}}': 'Jane Smith',
      '{{hrName}}': 'HR Team',
      '{{companyName}}': 'Iron Lady',
      '{{formLink}}': 'https://forms.iron-lady.in/onboarding',
      ...req.body
    };

    let previewSubject = template.subject;
    let previewBody = template.body;

    Object.entries(sampleData).forEach(([key, value]) => {
      previewSubject = previewSubject.replace(new RegExp(key, 'g'), value);
      previewBody = previewBody.replace(new RegExp(key, 'g'), value);
    });

    res.json({
      success: true,
      data: {
        subject: previewSubject,
        body: previewBody
      }
    });
  } catch (error) {
    logger.error('Error previewing template:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Initialize default templates
router.post('/init/defaults', async (req, res) => {
  try {
    const defaultTemplates = [
      {
        name: 'Offer Letter Email',
        type: 'OFFER_LETTER',
        subject: 'Offer Letter - {{position}} at {{companyName}}',
        body: `Dear {{candidateName}},

We are pleased to extend an offer for the position of <strong>{{position}}</strong> at {{companyName}}.

Please find attached your offer letter with complete details about your role, compensation, and benefits.

<strong>Key Details:</strong>
• Position: {{position}}
• Department: {{department}}
• Annual CTC: {{salary}}
• Expected Joining Date: {{joiningDate}}

Please review the offer letter carefully and reply to this email with the signed copy by <strong>{{offerDeadline}}</strong>.

If you have any questions, please don't hesitate to reach out.

Best regards,
{{hrName}}
HR Team, {{companyName}}
📞 {{hrPhone}}`,
        placeholders: ['candidateName', 'position', 'companyName', 'department', 'salary', 'joiningDate', 'offerDeadline', 'hrName', 'hrPhone'],
        isActive: true
      },
      {
        name: 'Offer Reminder Email',
        type: 'OFFER_REMINDER',
        subject: 'Reminder: Pending Offer Letter - {{companyName}}',
        body: `Dear {{candidateName}},

This is a gentle reminder regarding the offer letter sent for the <strong>{{position}}</strong> position at {{companyName}}.

We noticed that the offer letter is still pending your signature. Please review and reply with the signed copy at your earliest convenience.

<strong>Original Offer Date:</strong> {{offerDate}}
<strong>Deadline:</strong> {{offerDeadline}}

If you have any questions or concerns, please feel free to reach out.

Best regards,
{{hrName}}
HR Team, {{companyName}}`,
        placeholders: ['candidateName', 'position', 'companyName', 'hrName', 'offerDate', 'offerDeadline'],
        isActive: true
      },
      {
        name: 'Welcome Email Day Minus 1',
        type: 'WELCOME_DAY_MINUS_1',
        subject: 'Looking Forward to Starting Your Journey at {{companyName}}! 🎉',
        body: `Dear {{candidateName}},

Welcome to the {{companyName}} family! We are thrilled to have you join us.

Your journey with us begins <strong>tomorrow, {{joiningDate}}</strong>. Here's what you can expect on your first day:

<strong>📍 Office Location:</strong>
{{companyAddress}}

<strong>⏰ Office Timings:</strong>
{{companyTimings}}

<strong>📋 Day 1 Schedule:</strong>
• 9:30 AM - HR Induction Session
• You'll receive calendar invites for all scheduled sessions

<strong>📄 Documents to Bring:</strong>
{{day1Documents}}

<strong>📞 Contact:</strong>
{{hrName}}: {{hrPhone}}

We can't wait to see you tomorrow!

Warm regards,
{{hrName}}
HR Team, {{companyName}}`,
        placeholders: ['candidateName', 'companyName', 'joiningDate', 'companyAddress', 'companyTimings', 'day1Documents', 'hrName', 'hrPhone'],
        isActive: true
      },
      {
        name: 'HR Induction Invite',
        type: 'HR_INDUCTION_INVITE',
        subject: 'HR Induction Session - {{joiningDate}} | {{companyName}}',
        body: `Dear {{candidateName}},

Welcome aboard! Your HR Induction session has been scheduled.

<strong>📅 Meeting Details:</strong>
• Date: {{meetingDate}}
• Time: {{meetingTime}}
• Duration: 90 minutes
• Link: {{meetingLink}}

<strong>What we'll cover:</strong>
• Company overview and culture
• HR policies and procedures
• Benefits and perks
• Q&A session

Please join on time. See you there!

Best regards,
{{hrName}}
HR Team, {{companyName}}`,
        placeholders: ['candidateName', 'meetingDate', 'meetingTime', 'meetingLink', 'hrName', 'companyName', 'joiningDate'],
        isActive: true
      },
      {
        name: 'Onboarding Form Request',
        type: 'ONBOARDING_FORM',
        subject: 'Action Required: Complete Your Onboarding Form | {{companyName}}',
        body: `Dear {{candidateName}},

As part of your onboarding process, please complete the HR onboarding form at your earliest convenience.

<strong>📝 Form Link:</strong> {{formLink}}

This form collects essential information needed for:
• Employee records
• Payroll setup
• Benefits enrollment
• System access

<strong>⏰ Please complete this within 24 hours.</strong>

If you have any questions, feel free to reach out.

Thank you!

Best regards,
{{hrName}}
HR Team, {{companyName}}`,
        placeholders: ['candidateName', 'formLink', 'hrName', 'companyName'],
        isActive: true
      },
      {
        name: 'Form Completion Reminder',
        type: 'FORM_REMINDER',
        subject: '⚠️ Reminder: Onboarding Form Pending | {{companyName}}',
        body: `Dear {{candidateName}},

This is a friendly reminder to complete your HR onboarding form.

<strong>📝 Form Link:</strong> {{formLink}}

Your form is still pending and needs to be completed for smooth processing of your employee records and payroll.

Please complete this as soon as possible.

Best regards,
{{hrName}}
HR Team, {{companyName}}`,
        placeholders: ['candidateName', 'formLink', 'hrName', 'companyName'],
        isActive: true
      },
      {
        name: 'CEO Induction Invite',
        type: 'CEO_INDUCTION_INVITE',
        subject: 'CEO Induction Session with {{ceoName}} | {{companyName}}',
        body: `Dear {{candidateName}},

You are invited to a special CEO Induction session with our CEO, <strong>{{ceoName}}</strong>.

<strong>📅 Meeting Details:</strong>
• Date: {{meetingDate}}
• Time: {{meetingTime}}
• Duration: 60 minutes
• Link: {{meetingLink}}

This is a wonderful opportunity to:
• Learn about our company's vision and mission
• Understand our culture and values
• Hear directly from our leadership
• Ask questions

Looking forward to seeing you!

Best regards,
{{hrName}}
HR Team, {{companyName}}`,
        placeholders: ['candidateName', 'ceoName', 'meetingDate', 'meetingTime', 'meetingLink', 'hrName', 'companyName'],
        isActive: true
      },
      {
        name: 'Sales Induction Invite',
        type: 'SALES_INDUCTION_INVITE',
        subject: 'Sales Induction Session with {{salesHeadName}} | {{companyName}}',
        body: `Dear {{candidateName}},

Welcome to the team! Your Sales Induction session has been scheduled with <strong>{{salesHeadName}}</strong>.

<strong>📅 Meeting Details:</strong>
• Date: {{meetingDate}}
• Time: {{meetingTime}}
• Duration: 60 minutes
• Link: {{meetingLink}}

<strong>What we'll cover:</strong>
• Sales processes and methodologies
• Product knowledge
• Customer engagement strategies
• Team expectations

Please join on time. See you there!

Best regards,
{{hrName}}
HR Team, {{companyName}}`,
        placeholders: ['candidateName', 'salesHeadName', 'meetingDate', 'meetingTime', 'meetingLink', 'hrName', 'companyName'],
        isActive: true
      }
    ];

    // Check which templates already exist
    const existingTemplates = await req.prisma.emailTemplate.findMany({
      select: { name: true }
    });
    const existingNames = new Set(existingTemplates.map(t => t.name));

    // Create only templates that don't exist
    const templatesToCreate = defaultTemplates.filter(t => !existingNames.has(t.name));
    
    if (templatesToCreate.length === 0) {
      return res.json({ 
        success: true, 
        message: 'All default templates already exist',
        data: { created: 0, skipped: defaultTemplates.length }
      });
    }

    // Create templates
    const createdTemplates = await Promise.all(
      templatesToCreate.map(template => 
        req.prisma.emailTemplate.create({ data: template })
      )
    );

    logger.info(`Initialized ${createdTemplates.length} default email templates`);
    res.json({ 
      success: true, 
      message: `Successfully initialized ${createdTemplates.length} default templates`,
      data: { 
        created: createdTemplates.length, 
        skipped: defaultTemplates.length - createdTemplates.length 
      }
    });
  } catch (error) {
    logger.error('Error initializing default templates:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Get available placeholders
router.get('/meta/placeholders', async (req, res) => {
  try {
    // Standard placeholders
    const placeholders = [
      { key: '{{firstName}}', description: 'Candidate first name', category: 'Standard' },
      { key: '{{lastName}}', description: 'Candidate last name', category: 'Standard' },
      { key: '{{fullName}}', description: 'Candidate full name', category: 'Standard' },
      { key: '{{candidateName}}', description: 'Candidate full name (alias)', category: 'Standard' },
      { key: '{{email}}', description: 'Candidate email', category: 'Standard' },
      { key: '{{position}}', description: 'Job position', category: 'Standard' },
      { key: '{{department}}', description: 'Department', category: 'Standard' },
      { key: '{{salary}}', description: 'Salary package', category: 'Standard' },
      { key: '{{joiningDate}}', description: 'Expected joining date', category: 'Standard' },
      { key: '{{reportingManager}}', description: 'Reporting manager name', category: 'Standard' },
      { key: '{{hrName}}', description: 'HR representative name', category: 'Company' },
      { key: '{{companyName}}', description: 'Company name', category: 'Company' },
      { key: '{{formLink}}', description: 'Onboarding form link', category: 'Dynamic' },
      { key: '{{trainingPlanContent}}', description: 'Training plan details', category: 'Dynamic' }
    ];

    // Fetch custom fields from database and add them as placeholders
    try {
      const customFields = await req.prisma.customField.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' }
      });

      customFields.forEach(field => {
        // Only add custom fields (not standard fields, as they're already in the list above)
        if (!field.isStandard) {
          placeholders.push({
            key: `{{${field.fieldKey}}}`,
            description: `${field.label} (Custom Field)`,
            category: 'Custom'
          });
        }
      });
    } catch (error) {
      // If CustomField table doesn't exist yet, just skip custom fields
      logger.warn('Could not fetch custom fields for placeholders:', error.message);
    }

    // Fetch custom placeholders from database and add them
    try {
      const customPlaceholders = await req.prisma.customPlaceholder.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' }
      });

      customPlaceholders.forEach(placeholder => {
        placeholders.push({
          key: `{{${placeholder.placeholderKey}}}`,
          description: `${placeholder.name}${placeholder.description ? ` - ${placeholder.description}` : ''} (Custom Placeholder)`,
          category: 'Custom Placeholder'
        });
      });
    } catch (error) {
      // If CustomPlaceholder table doesn't exist yet, just skip
      logger.warn('Could not fetch custom placeholders:', error.message);
    }

    res.json({ success: true, data: placeholders });
  } catch (error) {
    logger.error('Error fetching placeholders:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
