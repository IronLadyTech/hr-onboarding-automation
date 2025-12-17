# Fix Scheduled Time Not Showing Issue

## Problem
The `scheduledTime` field is showing as `undefined` when editing steps because:
1. The Prisma schema had a duplicate `scheduledTime` field
2. The `schedulingMethod` field was missing from the schema

## Solution Applied
- Removed duplicate `scheduledTime` field from `DepartmentStepTemplate` model
- Added missing `schedulingMethod` field to the schema

## Steps to Fix on Server

1. **Pull the latest changes:**
   ```bash
   cd ~/hr-onboarding-automation/backend
   git pull origin main
   ```

2. **Update the database schema:**
   ```bash
   npx prisma db push
   ```
   This will:
   - Remove the duplicate `scheduledTime` column (if it exists)
   - Add the `schedulingMethod` column if it doesn't exist

3. **Regenerate Prisma Client:**
   ```bash
   npx prisma generate
   ```
   This is CRITICAL - the Prisma client must be regenerated to include the new/updated fields.

4. **Restart the backend:**
   ```bash
   pm2 restart hr-onboarding-backend
   ```

5. **Verify the fix:**
   - Open the Steps page in your browser
   - Edit a step and set `scheduledTime` to "14:00"
   - Save the step
   - Edit the same step again - the time should now show "14:00" instead of "--:--"
   - Check the browser console - `scheduledTime` should show "14:00" instead of `undefined`

## What This Fixes
- ✅ `scheduledTime` will now be saved correctly to the database
- ✅ `scheduledTime` will be returned when fetching steps
- ✅ The time input field will show the saved value when editing
- ✅ The scheduled time will display correctly in the candidate profile

## If Issues Persist
If after running these steps the issue still persists:
1. Check backend logs: `pm2 logs hr-onboarding-backend --lines 50`
2. Look for any Prisma errors related to `scheduledTime` or `schedulingMethod`
3. Verify the database has the correct columns by checking the `DepartmentStepTemplate` table structure

