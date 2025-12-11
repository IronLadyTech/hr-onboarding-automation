const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create default admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@ironlady.com' },
    update: {},
    create: {
      email: 'admin@ironlady.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN',
      isActive: true
    }
  });
  console.log('✅ Created admin user:', adminUser.email);

  // Create HR user
  const hrUser = await prisma.user.upsert({
    where: { email: 'hr@ironlady.com' },
    update: {},
    create: {
      email: 'hr@ironlady.com',
      password: hashedPassword,
      name: 'HR Manager',
      role: 'HR',
      isActive: true
    }
  });
  console.log('✅ Created HR user:', hrUser.email);

  // ============ COMPREHENSIVE WORKFLOW CONFIGURATIONS ============
  const workflowConfigs = [
    // Company Information
    { key: 'company_name', value: 'Iron Lady', description: 'Company name for emails' },
    { key: 'company_address', value: 'Whitefield, Bangalore', description: 'Office address' },
    { key: 'company_phone', value: '6375834047', description: 'HR contact number' },
    { key: 'office_timings', value: '9:30 AM - 6:30 PM', description: 'Office working hours' },
    
    // HR Configuration
    { key: 'hr_name', value: 'HR Team', description: 'HR person name for emails' },
    { key: 'hr_email', value: 'omprakashg2004@gmail.com', description: 'HR email for sending' },
    { key: 'hr_phone', value: '6375834047', description: 'HR contact phone' },
    
    // CEO Configuration
    { key: 'ceo_name', value: 'Dr. Aparna Jain', description: 'CEO name' },
    { key: 'ceo_email', value: 'omgjat21@gmail.com', description: 'CEO email for invites' },
    
    // Sales Head Configuration (Brunda)
    { key: 'sales_head_name', value: 'Brunda', description: 'Sales head name' },
    { key: 'sales_head_email', value: 'omgjat24@gmail.com', description: 'Sales head email' },
    
    // Step 1: Offer Letter Settings
    { key: 'step1_offer_deadline_days', value: '7', description: 'Days to sign offer letter' },
    
    // Step 2: Offer Reminder Settings
    { key: 'step2_reminder_days', value: '3', description: 'Days after which to send reminder' },
    { key: 'step2_offer_reminder_enabled', value: 'true', description: 'Auto-send offer reminders' },
    
    // Step 3: Welcome Email Settings
    { key: 'step3_days_before', value: '1', description: 'Days before joining to send welcome' },
    { key: 'step3_welcome_email_enabled', value: 'true', description: 'Auto-send welcome email' },
    
    // Step 4: HR Induction Settings
    { key: 'step4_hr_induction_time', value: '09:30', description: 'Default HR induction time' },
    { key: 'step4_hr_induction_duration', value: '90', description: 'Duration in minutes' },
    { key: 'step4_hr_induction_link', value: '', description: 'HR Induction meeting link' },
    { key: 'step4_hr_induction_enabled', value: 'true', description: 'Auto-schedule HR induction' },
    
    // Step 5: WhatsApp Task Settings
    { key: 'step5_whatsapp_task_enabled', value: 'true', description: 'Auto-create WhatsApp task' },
    { key: 'step5_whatsapp_intro_template', value: 'Hi everyone! 👋\n\nPlease welcome *{{firstName}} {{lastName}}* who joins us today as *{{position}}* in the {{department}} team.\n\nLet\'s give them a warm welcome! 🎉', description: 'WhatsApp intro message template' },
    
    // Step 6: Onboarding Form Settings
    { key: 'step6_onboarding_form_url', value: '', description: 'Onboarding form URL (Zoho/Google Forms)' },
    { key: 'step6_delay_hours', value: '1', description: 'Hours after induction to send form' },
    { key: 'step6_onboarding_form_enabled', value: 'true', description: 'Auto-send onboarding form' },
    
    // Step 7: Form Reminder Settings
    { key: 'step7_reminder_hours', value: '24', description: 'Hours after which to remind for form' },
    { key: 'step7_form_reminder_enabled', value: 'true', description: 'Auto-send form reminders' },
    
    // Step 8: CEO Induction Settings
    { key: 'step8_ceo_induction_day', value: '1', description: 'Day after joining for CEO induction' },
    { key: 'step8_ceo_induction_time', value: '11:00', description: 'Default CEO induction time' },
    { key: 'step8_ceo_induction_duration', value: '60', description: 'Duration in minutes' },
    { key: 'step8_ceo_induction_enabled', value: 'true', description: 'Enable CEO induction' },
    
    // Step 9: Sales Induction Settings
    { key: 'step9_sales_induction_day', value: '2', description: 'Day after joining for sales induction' },
    { key: 'step9_sales_induction_time', value: '14:00', description: 'Default sales induction time' },
    { key: 'step9_sales_induction_duration', value: '90', description: 'Duration in minutes' },
    { key: 'step9_sales_induction_departments', value: 'Sales,Business Development,Marketing', description: 'Departments requiring sales induction' },
    { key: 'step9_sales_induction_enabled', value: 'true', description: 'Enable sales induction' },
    
    // Step 10: Training Plan Settings
    { key: 'step10_training_day', value: '3', description: 'Day after joining to send training plan' },
    { key: 'step10_training_plan_enabled', value: 'true', description: 'Auto-send training plan' },
    
    // Step 11: Check-in Call Settings
    { key: 'step11_checkin_day', value: '7', description: 'Days after joining for check-in' },
    { key: 'step11_checkin_time', value: '10:00', description: 'Default check-in call time' },
    { key: 'step11_checkin_duration', value: '30', description: 'Duration in minutes' },
    { key: 'step11_checkin_call_enabled', value: 'true', description: 'Auto-schedule check-in call' },
    
    // Day 1 Requirements (Documents to bring)
    { key: 'day1_documents', value: 'Aadhaar Card, PAN Card, Educational Certificates, Previous Employment Documents, Passport Size Photos, Bank Account Details', description: 'Documents to bring on Day 1' },
    
    // Email Tracking
    { key: 'email_tracking_enabled', value: 'true', description: 'Track email opens and clicks' },
    
    // Automation Master Switch
    { key: 'automation_master_enabled', value: 'true', description: 'Master switch for all automations' }
  ];

  // Delete existing and create new
  await prisma.workflowConfig.deleteMany({});
  
  for (const config of workflowConfigs) {
    await prisma.workflowConfig.create({ data: config });
  }
  console.log('✅ Created', workflowConfigs.length, 'workflow configurations');

  // ============ EMAIL TEMPLATES ============
  const templates = [
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
• Duration: 90 minutes
• Link: {{meetingLink}}

<strong>What we'll cover:</strong>
• Sales processes and methodology
• CRM and tools training
• Product knowledge
• Best practices and expectations

Looking forward to seeing you!

Best regards,
{{hrName}}
HR Team, {{companyName}}`,
      placeholders: ['candidateName', 'salesHeadName', 'meetingDate', 'meetingTime', 'meetingLink', 'hrName', 'companyName'],
      isActive: true
    },
    {
      name: 'Training Plan Email',
      type: 'TRAINING_PLAN',
      subject: 'Your Training Plan - First Week at {{companyName}}',
      body: `Dear {{candidateName}},

Here's your structured training plan for the first week at {{companyName}}.

<strong>📚 Training Plan:</strong>

{{trainingContent}}

Please reach out if you have any questions or need any support.

Best regards,
{{hrName}}
HR Team, {{companyName}}`,
      placeholders: ['candidateName', 'trainingContent', 'hrName', 'companyName'],
      isActive: true
    },
    {
      name: 'Check-in Call Invite',
      type: 'CHECKIN_INVITE',
      subject: "HR Check-in: How's Your First Week Going? | {{companyName}}",
      body: `Dear {{candidateName}},

Hope you're settling in well! I'd like to schedule a quick check-in call to see how your first week is going.

<strong>📅 Meeting Details:</strong>
• Date: {{meetingDate}}
• Time: {{meetingTime}}
• Duration: 30 minutes
• Link: {{meetingLink}}

This is an informal chat to:
• Understand your experience so far
• Address any questions or concerns
• Get your feedback on the onboarding process
• Ensure you have everything you need

Looking forward to speaking with you!

Best regards,
{{hrName}}
HR Team, {{companyName}}`,
      placeholders: ['candidateName', 'meetingDate', 'meetingTime', 'meetingLink', 'hrName', 'companyName'],
      isActive: true
    }
  ];

  // Delete existing templates first, then create new ones
  await prisma.emailTemplate.deleteMany({});
  
  for (const template of templates) {
    await prisma.emailTemplate.create({ data: template });
  }
  console.log('✅ Created', templates.length, 'email templates');

  // ============ WHATSAPP GROUPS ============
  const whatsappGroups = [
    { name: 'All Hands', department: 'ALL', description: 'Company-wide updates and announcements', isActive: true },
    { name: 'Engineering Team', department: 'Engineering', description: 'Engineering team discussions', isActive: true },
    { name: 'Sales Team', department: 'Sales', description: 'Sales team updates', isActive: true },
    { name: 'Marketing Team', department: 'Marketing', description: 'Marketing team discussions', isActive: true },
    { name: 'HR Team', department: 'HR', description: 'HR team internal', isActive: true },
    { name: 'Operations Team', department: 'Operations', description: 'Operations team updates', isActive: true },
    { name: 'Finance Team', department: 'Finance', description: 'Finance team discussions', isActive: true },
    { name: 'Leadership Team', department: 'Leadership', description: 'Leadership and management', isActive: true },
    { name: 'New Joiners', department: 'ALL', description: 'Support group for new employees', isActive: true }
  ];

  // Delete existing and create new
  await prisma.whatsAppGroup.deleteMany({});
  
  for (const group of whatsappGroups) {
    await prisma.whatsAppGroup.create({ data: group });
  }
  console.log('✅ Created', whatsappGroups.length, 'WhatsApp groups');

  // ============ TRAINING PLANS ============
  const trainingPlans = [
    {
      name: 'General Onboarding',
      department: 'ALL',
      dayWiseContent: {
        duration: 7,
        description: 'Standard one-week onboarding for all new employees',
        days: [
          { day: 1, title: 'Company Overview', description: 'Introduction to company history, mission, vision, and values. Meet the team and understand organizational structure.' },
          { day: 2, title: 'Policies & Procedures', description: 'HR policies, code of conduct, leave policies, compliance training, and workplace guidelines.' },
          { day: 3, title: 'Tools & Systems', description: 'Setting up email, Slack, project management tools, and internal systems access.' },
          { day: 4, title: 'Department Introduction', description: 'Deep dive into your department, understand processes, meet team members, and learn workflows.' },
          { day: 5, title: 'Role-Specific Training', description: 'Detailed training on your specific role responsibilities and expectations.' },
          { day: 6, title: 'Shadowing & Practice', description: 'Shadow experienced team members and start working on initial tasks with guidance.' },
          { day: 7, title: 'Review & Feedback', description: 'Week 1 review, feedback session, goal setting, and clarifying any doubts.' }
        ]
      },
      isActive: true
    },
    {
      name: 'Sales Onboarding',
      department: 'Sales',
      dayWiseContent: {
        duration: 14,
        description: 'Two-week intensive sales training program',
        days: [
          { day: 1, title: 'Company & Product Overview', description: 'Understanding our products, services, and value proposition.' },
          { day: 2, title: 'Sales Process & CRM', description: 'End-to-end sales process, CRM training, and pipeline management.' },
          { day: 3, title: 'Product Deep Dive', description: 'Detailed product knowledge, features, benefits, and use cases.' },
          { day: 4, title: 'Competitor Analysis', description: 'Understanding competitive landscape, differentiators, and positioning.' },
          { day: 5, title: 'Sales Tools & Resources', description: 'Sales enablement tools, proposal templates, and resources.' },
          { day: 6, title: 'Discovery Call Training', description: 'Practice discovery calls, asking the right questions, understanding needs.' },
          { day: 7, title: 'Demo Training', description: 'Product demonstration best practices and practice sessions.' },
          { day: 8, title: 'Objection Handling', description: 'Common objections and how to handle them effectively.' },
          { day: 9, title: 'Proposal & Negotiation', description: 'Creating proposals, pricing discussions, and negotiation techniques.' },
          { day: 10, title: 'Live Call Shadowing', description: 'Shadow senior sales reps on live calls.' },
          { day: 11, title: 'First Calls (Supervised)', description: 'Make your first calls with guidance.' },
          { day: 12, title: 'CRM & Reporting', description: 'CRM best practices, reporting, and pipeline hygiene.' },
          { day: 13, title: 'Account Management', description: 'Post-sale relationship management and upselling.' },
          { day: 14, title: 'Review & Certification', description: 'Final assessment, feedback, and sales certification.' }
        ]
      },
      isActive: true
    },
    {
      name: 'Engineering Onboarding',
      department: 'Engineering',
      dayWiseContent: {
        duration: 7,
        description: 'One-week technical onboarding for engineers',
        days: [
          { day: 1, title: 'Company & Team Overview', description: 'Company intro, engineering team structure, and culture.' },
          { day: 2, title: 'Development Environment', description: 'Setting up development environment, repositories, and tools.' },
          { day: 3, title: 'Architecture Overview', description: 'System architecture, tech stack, and infrastructure overview.' },
          { day: 4, title: 'Codebase Walkthrough', description: 'Understanding the codebase, coding standards, and conventions.' },
          { day: 5, title: 'First Task', description: 'Pick up your first task with guidance from buddy/mentor.' },
          { day: 6, title: 'Code Review & Deployment', description: 'Code review process, CI/CD pipelines, and deployment procedures.' },
          { day: 7, title: 'Review & Planning', description: 'Week 1 review, feedback, and sprint planning.' }
        ]
      },
      isActive: true
    },
    {
      name: 'Marketing Onboarding',
      department: 'Marketing',
      dayWiseContent: {
        duration: 7,
        description: 'One-week marketing team onboarding',
        days: [
          { day: 1, title: 'Company & Brand Overview', description: 'Brand guidelines, messaging, and company positioning.' },
          { day: 2, title: 'Marketing Strategy', description: 'Current marketing strategy, campaigns, and goals.' },
          { day: 3, title: 'Tools & Platforms', description: 'Marketing tools, analytics platforms, and automation systems.' },
          { day: 4, title: 'Content & Creative', description: 'Content strategy, creative assets, and style guides.' },
          { day: 5, title: 'Campaigns Deep Dive', description: 'Ongoing campaigns, processes, and workflows.' },
          { day: 6, title: 'Analytics & Reporting', description: 'KPIs, reporting dashboards, and performance tracking.' },
          { day: 7, title: 'Review & Assignment', description: 'Week 1 review, feedback, and first project assignment.' }
        ]
      },
      isActive: true
    }
  ];

  // Delete existing and create new
  await prisma.trainingPlan.deleteMany({});
  
  for (const plan of trainingPlans) {
    await prisma.trainingPlan.create({ data: plan });
  }
  console.log('✅ Created', trainingPlans.length, 'training plans');

  console.log('\n🎉 Database seed completed successfully!');
  console.log('\n📋 Summary:');
  console.log('   - Users: 2 (admin@ironlady.com, hr@ironlady.com)');
  console.log('   - Password: admin123');
  console.log('   - Workflow Configs:', workflowConfigs.length);
  console.log('   - Email Templates:', templates.length);
  console.log('   - WhatsApp Groups:', whatsappGroups.length);
  console.log('   - Training Plans:', trainingPlans.length);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
