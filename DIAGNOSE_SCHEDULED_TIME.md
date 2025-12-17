# Comprehensive Diagnosis for ScheduledTime Issue

## The Problem
- `scheduledTime` shows as `undefined` when editing steps
- Value is not persisting after save
- Not showing in candidate profile

## Root Cause Analysis

The issue is likely one of these:

### 1. Database Column Doesn't Exist
If the Prisma migration wasn't run, the `scheduledTime` column doesn't exist in the database. Prisma will return `undefined` for non-existent fields.

### 2. Prisma Client Not Regenerated
If `npx prisma generate` wasn't run after schema changes, the Prisma client doesn't know about the new field.

### 3. Database Has NULL Values
If the column exists but all values are `NULL`, Prisma returns `null`, which JavaScript may treat as `undefined` in some contexts.

## Step-by-Step Fix

### Step 1: Verify Database Schema
Run this on your server to check if the column exists:

```bash
cd ~/hr-onboarding-automation/backend

# Connect to your database and check the table structure
# For PostgreSQL (Neon):
psql $DATABASE_URL -c "\d \"DepartmentStepTemplate\""
```

Look for:
- `scheduledTime` column (type: `text` or `varchar`, nullable)
- `schedulingMethod` column (type: `text` or `varchar`, default: 'doj')

### Step 2: Pull Latest Code
```bash
cd ~/hr-onboarding-automation/backend
git pull origin main
```

### Step 3: Update Database Schema
```bash
# This will add missing columns and remove duplicates
npx prisma db push

# IMPORTANT: Check the output for any errors
# It should show:
# - Adding column scheduledTime (if missing)
# - Adding column schedulingMethod (if missing)
# - Removing duplicate scheduledTime (if duplicate exists)
```

### Step 4: Regenerate Prisma Client (CRITICAL)
```bash
npx prisma generate

# This MUST complete successfully
# If it fails, the Prisma client won't know about scheduledTime
```

### Step 5: Restart Backend
```bash
pm2 restart hr-onboarding-backend

# Check logs for any errors
pm2 logs hr-onboarding-backend --lines 50
```

### Step 6: Test the Fix

1. **Open browser console (F12)**
2. **Go to Steps page**
3. **Edit a step and set time to "14:00"**
4. **Save the step**
5. **Check console for:**
   - "Saving step with data: { scheduledTime: '14:00', ... }"
   - "Step saved, response: { scheduledTime: '14:00', ... }"
6. **Edit the same step again**
7. **Check console for:**
   - "Editing step: { scheduledTime: '14:00', ... }" (should NOT be undefined)
8. **Check the time input field** - it should show "14:00" instead of "--:--"

### Step 7: Check Backend Logs
```bash
pm2 logs hr-onboarding-backend --lines 100 | grep -i "scheduledTime\|schedulingMethod"
```

You should see:
- "Updating step ... with data: { scheduledTime: '14:00', ... }"
- "Saving step ... with updateData: { scheduledTime: '14:00', ... }"
- "Step ... saved successfully: { scheduledTime: '14:00', ... }"
- "Fetching steps for ...: { scheduledTime: '14:00', ... }"

## If Still Not Working

### Option A: Manual Database Check
If `prisma db push` doesn't work, manually check the database:

```sql
-- Check if column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'DepartmentStepTemplate' 
AND column_name IN ('scheduledTime', 'schedulingMethod');

-- Check current values
SELECT id, stepNumber, title, "scheduledTime", "schedulingMethod" 
FROM "DepartmentStepTemplate" 
WHERE department = 'YourDepartmentName'
ORDER BY "stepNumber";
```

### Option B: Force Recreate Column
If the column exists but isn't working:

```sql
-- Backup first!
-- Then drop and recreate
ALTER TABLE "DepartmentStepTemplate" DROP COLUMN IF EXISTS "scheduledTime";
ALTER TABLE "DepartmentStepTemplate" ADD COLUMN "scheduledTime" TEXT;

ALTER TABLE "DepartmentStepTemplate" DROP COLUMN IF EXISTS "schedulingMethod";
ALTER TABLE "DepartmentStepTemplate" ADD COLUMN "schedulingMethod" TEXT DEFAULT 'doj';
```

Then run:
```bash
npx prisma generate
pm2 restart hr-onboarding-backend
```

### Option C: Check Prisma Client
Verify the Prisma client knows about the field:

```bash
cd ~/hr-onboarding-automation/backend
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); console.log(Object.keys(prisma.departmentStepTemplate.fields));"
```

This should list all fields including `scheduledTime` and `schedulingMethod`.

## Expected Behavior After Fix

1. **Steps Page:**
   - When you edit a step, `scheduledTime` shows the saved value (e.g., "14:00")
   - When you save, the value persists
   - Console shows `scheduledTime: "14:00"` (not `undefined`)

2. **Candidate Profile:**
   - Shows "Will be scheduled: [Date] at [Time]" based on DOJ + offset + scheduledTime
   - Time matches what you set in the Steps page

3. **Backend Logs:**
   - All logs show `scheduledTime` with actual values (not undefined/null)

## Common Mistakes

1. ❌ Running `prisma db push` but NOT running `prisma generate`
2. ❌ Running `prisma generate` but NOT restarting the backend
3. ❌ Not checking backend logs for errors
4. ❌ Assuming the database is updated when it's not

## Verification Checklist

- [ ] `git pull origin main` completed successfully
- [ ] `npx prisma db push` completed without errors
- [ ] `npx prisma generate` completed successfully
- [ ] `pm2 restart hr-onboarding-backend` completed
- [ ] Backend logs show no Prisma errors
- [ ] Browser console shows `scheduledTime: "14:00"` (not undefined)
- [ ] Time input field shows "14:00" when editing
- [ ] Value persists after save and reopen

