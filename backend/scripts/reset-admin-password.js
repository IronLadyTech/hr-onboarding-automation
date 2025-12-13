const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function resetAdminPassword() {
  try {
    const email = 'admin@ironlady.com';
    const newPassword = 'admin123';
    
    console.log(`🔐 Resetting password for ${email}...\n`);
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (!existingUser) {
      console.log(`❌ User ${email} not found!`);
      console.log('\n📝 Creating admin user...\n');
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: 'Admin User',
          role: 'ADMIN',
          isActive: true
        }
      });
      
      console.log('✅ Admin user created successfully!');
      console.log(`   Email: ${user.email}`);
      console.log(`   Password: ${newPassword}`);
    } else {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const user = await prisma.user.update({
        where: { email },
        data: { 
          password: hashedPassword,
          isActive: true // Ensure user is active
        }
      });
      
      console.log('✅ Password reset successfully!');
      console.log(`   Email: ${user.email}`);
      console.log(`   New Password: ${newPassword}`);
      console.log(`   Active: ${user.isActive ? 'Yes' : 'No'}`);
    }
    
    console.log('\n📋 You can now login with:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}\n`);
    
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
    if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === 'P2021') {
      console.log('\n⚠️  Database schema might not be up to date.');
      console.log('   Run: npx prisma db push');
    }
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminPassword();

