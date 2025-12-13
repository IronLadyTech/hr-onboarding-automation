# Fix "Invalid Credentials" Error

## Problem
Getting "Invalid Credentials" error when trying to login.

## Possible Causes

1. **Database not seeded** - No users exist in the database
2. **User doesn't exist** - The email you're using doesn't match any user
3. **Password incorrect** - The password doesn't match
4. **User is inactive** - The user account is deactivated
5. **Email case mismatch** - Email case sensitivity issue

## Solution

### Step 1: Check if Database is Seeded

SSH into your AWS server and check if users exist:

```bash
# SSH into server
ssh bitnami@your-server-ip

# Go to backend
cd ~/hr-onboarding-automation/backend

# Connect to database and check users
# If using PostgreSQL directly:
psql -U your_db_user -d hr_onboarding -c "SELECT email, name, role, \"isActive\" FROM \"User\";"

# OR use Prisma Studio
npx prisma studio
# Then navigate to User model
```

### Step 2: Seed the Database (if no users exist)

```bash
cd ~/hr-onboarding-automation/backend

# Make sure you're on the latest code
git pull origin main

# Run database migrations
npx prisma db push

# Seed the database (creates default users)
npm run db:seed
```

This will create:
- **Admin user**: `admin@ironlady.com` / `admin123`
- **HR user**: `hr@ironlady.com` / `admin123`

### Step 3: Verify Users Were Created

```bash
# Check users in database
npx prisma studio
# OR
psql -U your_db_user -d hr_onboarding -c "SELECT email, name, role, \"isActive\" FROM \"User\";"
```

### Step 4: Try Login Again

Use these credentials:
- **Email**: `admin@ironlady.com`
- **Password**: `admin123`

### Step 5: If Still Not Working - Reset Password

If the user exists but password doesn't work, you can reset it:

**Option A: Using Prisma Studio**
```bash
npx prisma studio
# Navigate to User model
# Find the user
# Edit and update the password (you'll need to hash it first)
```

**Option B: Create a reset script**

Create a file `reset-password.js`:
```javascript
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function resetPassword() {
  const email = 'admin@ironlady.com';
  const newPassword = 'admin123';
  
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  const user = await prisma.user.update({
    where: { email },
    data: { password: hashedPassword, isActive: true }
  });
  
  console.log('Password reset for:', user.email);
  await prisma.$disconnect();
}

resetPassword();
```

Run it:
```bash
node reset-password.js
```

## Default Credentials

After seeding, use:
- **Email**: `admin@ironlady.com`
- **Password**: `admin123`

OR

- **Email**: `hr@ironlady.com`
- **Password**: `admin123`

## Troubleshooting

### Check Server Logs
```bash
# If using PM2
pm2 logs

# Check for login attempts
grep "Login attempt" /path/to/logs
```

### Verify Database Connection
```bash
cd ~/hr-onboarding-automation/backend
npx prisma db pull
# Should connect successfully
```

### Check Environment Variables
```bash
# Make sure DATABASE_URL is set correctly
echo $DATABASE_URL
# OR
cat .env | grep DATABASE_URL
```

## Quick Fix Script

Run this on your AWS server to ensure everything is set up:

```bash
cd ~/hr-onboarding-automation/backend

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Push database schema
npx prisma db push

# Check if users exist
npm run check-users

# If no users exist, seed database
npm run db:seed

# OR reset admin password (creates user if doesn't exist)
npm run reset-admin

# Restart server
pm2 restart all
```

After this, try logging in with:
- Email: `admin@ironlady.com`
- Password: `admin123`

## Quick Diagnostic Commands

**Check if users exist:**
```bash
cd ~/hr-onboarding-automation/backend
npm run check-users
```

**Reset admin password (or create if doesn't exist):**
```bash
cd ~/hr-onboarding-automation/backend
npm run reset-admin
```

This will:
- Create admin user if it doesn't exist
- Reset password to `admin123`
- Ensure user is active

