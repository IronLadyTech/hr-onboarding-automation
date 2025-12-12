# Fix: Emails Still Coming From Old Email Address

## Problem
Even after changing the HR email in Settings, emails are still being sent from the old email address (`omprakashg2004@gmail.com` instead of `omprakashg2026@gmail.com`).

## Root Cause
The code has been fixed to use the HR email from the database, but there are a few possible issues:

1. **Code not deployed** - Latest changes not pulled on AWS server
2. **Database not updated** - HR email not saved in database
3. **SMTP Server Override** - Gmail SMTP might require "Send As" configuration
4. **Server not restarted** - Old code still running in memory

## Step-by-Step Fix

### Step 1: Pull Latest Code on AWS

```bash
# SSH into your AWS server
ssh your-aws-server

# Navigate to backend directory
cd /opt/hr-onboarding-automation/backend

# Pull latest code
git pull origin main

# Install any new dependencies (if needed)
npm install
```

### Step 2: Verify Database Has Correct HR Email

```bash
# Connect to your database
# For PostgreSQL:
psql -U your_user -d your_database

# Check the HR email value
SELECT key, value FROM "WorkflowConfig" WHERE key = 'hr_email';

# If it's wrong, update it:
UPDATE "WorkflowConfig" 
SET value = 'omprakashg2026@gmail.com' 
WHERE key = 'hr_email';

# Also check HR name:
SELECT key, value FROM "WorkflowConfig" WHERE key = 'hr_name';
```

**OR** verify in the Settings UI:
1. Go to Settings → Company tab
2. Check that HR Email shows `omprakashg2026@gmail.com`
3. If not, update it and click "Save All Changes"

### Step 3: Restart Backend Server

```bash
# Restart PM2 process
pm2 restart hr-onboarding-backend

# Check logs to see if it's using the correct email
pm2 logs hr-onboarding-backend --lines 50
```

### Step 4: Check Logs for Email Configuration

After restarting, check the logs. You should see:
```
📧 HR Email Configuration - Database hr_email: omprakashg2026@gmail.com, Using: omprakashg2026@gmail.com
📧 FROM ADDRESS: HR Team <omprakashg2026@gmail.com>
```

If you see `Database hr_email: NOT SET`, the database doesn't have the value saved.

### Step 5: Test Sending an Email

1. Send a test email from the application
2. Check the logs immediately:
   ```bash
   pm2 logs hr-onboarding-backend --lines 20
   ```
3. Look for:
   ```
   📧 FROM ADDRESS: HR Team <omprakashg2026@gmail.com>
   ```

### Step 6: Gmail "Send As" Configuration (IMPORTANT)

If emails are still coming from the old address, you need to configure Gmail to allow sending from the new email:

#### Option A: If using the same Gmail account
1. Go to Gmail → Settings → Accounts and Import
2. Under "Send mail as", click "Add another email address"
3. Add `omprakashg2026@gmail.com`
4. Verify the email address
5. Make it the default "Send mail as" address

#### Option B: If using different Gmail accounts
1. In the OLD Gmail account (`omprakashg2004@gmail.com`):
   - Go to Settings → Accounts and Import
   - Under "Send mail as", click "Add another email address"
   - Add `omprakashg2026@gmail.com`
   - Verify the email address

2. In the NEW Gmail account (`omprakashg2026@gmail.com`):
   - Go to Settings → Forwarding and POP/IMAP
   - Enable "Allow less secure app access" (if using app password)
   - Or use OAuth2 (recommended)

#### Option C: Update SMTP_USER Environment Variable

If you want to authenticate as the new email directly:

```bash
# Edit .env file
nano /opt/hr-onboarding-automation/backend/.env

# Update SMTP_USER to the new email
SMTP_USER=omprakashg2026@gmail.com

# Restart server
pm2 restart hr-onboarding-backend
```

**Note**: If you change `SMTP_USER`, you'll also need to update `SMTP_PASS` to the password/app password for the new email.

### Step 7: Verify Email is Being Sent Correctly

After making changes:
1. Send a test email
2. Check the recipient's inbox
3. Look at the "From" field in the email
4. It should show: `HR Team <omprakashg2026@gmail.com>`

## Debugging Commands

### Check what email is in database:
```sql
SELECT key, value FROM "WorkflowConfig" WHERE key IN ('hr_email', 'hr_name');
```

### Check backend logs:
```bash
pm2 logs hr-onboarding-backend --lines 100 | grep "HR Email Configuration"
```

### Check environment variables:
```bash
cd /opt/hr-onboarding-automation/backend
cat .env | grep SMTP_USER
cat .env | grep HR_EMAIL
```

### Test database connection and query:
```bash
cd /opt/hr-onboarding-automation/backend
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.workflowConfig.findMany({ where: { key: 'hr_email' } })
  .then(configs => {
    console.log('HR Email in database:', configs[0]?.value || 'NOT FOUND');
    prisma.\$disconnect();
  });
"
```

## Expected Behavior After Fix

1. ✅ Database has `hr_email = 'omprakashg2026@gmail.com'`
2. ✅ Logs show: `Database hr_email: omprakashg2026@gmail.com`
3. ✅ Logs show: `FROM ADDRESS: HR Team <omprakashg2026@gmail.com>`
4. ✅ Emails received show sender as `omprakashg2026@gmail.com`

## If Still Not Working

1. **Check Gmail SMTP Settings**: Gmail might be overriding the "from" address. Ensure "Send As" is configured.

2. **Check Email Headers**: In the received email, check the full headers. Look for:
   - `From:` header (should be new email)
   - `Return-Path:` header (might show old email if SMTP_USER is old)

3. **Try Using Gmail API Instead**: If SMTP continues to have issues, consider using Gmail API which has better support for "Send As".

4. **Contact Support**: If none of the above works, the issue might be with Gmail's SMTP server configuration or account permissions.

## Quick Checklist

- [ ] Pulled latest code from GitHub
- [ ] Verified HR email in database is `omprakashg2026@gmail.com`
- [ ] Restarted backend server (`pm2 restart hr-onboarding-backend`)
- [ ] Checked logs show correct email being used
- [ ] Configured Gmail "Send As" for new email
- [ ] Tested sending an email
- [ ] Verified received email shows correct sender

