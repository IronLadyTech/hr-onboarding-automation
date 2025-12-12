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
