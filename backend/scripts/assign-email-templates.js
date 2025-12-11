require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function assignTemplates() {
  try {
    console.log('🔍 Finding all departments...');
    
    // Get all unique departments
    const departments = await prisma.departmentStepTemplate.findMany({
      select: { department: true },
      distinct: ['department']
    });
    
    const uniqueDepartments = [...new Set(departments.map(d => d.department))];
    console.log(`📋 Found departments: ${uniqueDepartments.join(', ')}`);
    
    // Mapping of step types to email template types
    const typeMapping = {
      'OFFER_LETTER': 'OFFER_LETTER',
      'OFFER_REMINDER': 'OFFER_REMINDER',
      'WELCOME_EMAIL': 'WELCOME_EMAIL',
      'HR_INDUCTION': 'HR_INDUCTION_INVITE',
      'WHATSAPP_ADDITION': 'WHATSAPP_ADDITION',
      'ONBOARDING_FORM': 'ONBOARDING_FORM',
      'FORM_REMINDER': 'FORM_REMINDER',
      'CEO_INDUCTION': 'CEO_INDUCTION_INVITE',
      'SALES_INDUCTION': 'SALES_INDUCTION_INVITE',
      'DEPARTMENT_INDUCTION': 'DEPARTMENT_INDUCTION_INVITE',
      'TRAINING_PLAN': 'TRAINING_PLAN',
      'CHECKIN_CALL': 'CHECKIN_CALL_INVITE'
    };
    
    let totalAssigned = 0;
    let totalSkipped = 0;
    
    for (const dept of uniqueDepartments) {
      console.log(`\n📂 Processing department: ${dept}`);
      
      // Get all steps without email templates
      const steps = await prisma.departmentStepTemplate.findMany({
        where: {
          department: dept,
          isActive: true,
          emailTemplateId: null
        },
        orderBy: { stepNumber: 'asc' }
      });
      
      if (steps.length === 0) {
        console.log(`   ✅ All steps already have templates assigned`);
        continue;
      }
      
      console.log(`   Found ${steps.length} step(s) without templates`);
      
      for (const step of steps) {
        const emailType = typeMapping[step.type];
        
        if (!emailType) {
          console.log(`   ⚠️  Step ${step.stepNumber} (${step.title}): No mapping for type "${step.type}"`);
          totalSkipped++;
          continue;
        }
        
        // Find matching email template
        const template = await prisma.emailTemplate.findFirst({
          where: {
            type: emailType,
            isActive: true
          }
        });
        
        if (!template) {
          console.log(`   ⚠️  Step ${step.stepNumber} (${step.title}): No template found for type "${emailType}"`);
          totalSkipped++;
          continue;
        }
        
        // Assign template to step
        await prisma.departmentStepTemplate.update({
          where: { id: step.id },
          data: { emailTemplateId: template.id }
        });
        
        console.log(`   ✅ Step ${step.stepNumber} (${step.title}): Assigned template "${template.name}"`);
        totalAssigned++;
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Assigned: ${totalAssigned} step(s)`);
    console.log(`   ⚠️  Skipped: ${totalSkipped} step(s)`);
    console.log(`\n✨ Done!`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

assignTemplates();

