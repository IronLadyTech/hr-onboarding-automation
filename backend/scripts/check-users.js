const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('🔍 Checking users in database...\n');
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    if (users.length === 0) {
      console.log('❌ No users found in database!');
      console.log('\n📝 You need to seed the database. Run:');
      console.log('   npm run db:seed\n');
      return;
    }

    console.log(`✅ Found ${users.length} user(s):\n`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Active: ${user.isActive ? '✅ Yes' : '❌ No'}`);
      console.log(`   Created: ${user.createdAt}\n`);
    });

    // Check for default admin user
    const adminUser = users.find(u => u.email === 'admin@ironlady.com');
    if (!adminUser) {
      console.log('⚠️  Default admin user (admin@ironlady.com) not found!');
    } else if (!adminUser.isActive) {
      console.log('⚠️  Admin user exists but is INACTIVE!');
    } else {
      console.log('✅ Admin user exists and is active');
    }

  } catch (error) {
    console.error('❌ Error checking users:', error.message);
    if (error.message.includes('does not exist') || error.message.includes('relation') || error.code === 'P2021') {
      console.log('\n⚠️  Database schema might not be up to date.');
      console.log('   Run: npx prisma db push');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();

