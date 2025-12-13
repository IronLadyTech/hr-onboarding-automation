# Fix Login Issue - Step by Step

## Current Status
- Server restarted ✅
- Code pulled (but had divergent branches)
- Login still showing "Invalid Credentials"

## Step-by-Step Fix

### Step 1: Fix Git Divergent Branches

```bash
cd ~/hr-onboarding-automation/backend

# Reset to match remote (this will discard any local changes)
git fetch origin
git reset --hard origin/main
```

### Step 2: Check if Users Exist

```bash
cd ~/hr-onboarding-automation/backend

# Check users in database
npm run check-users
```

This will show you if users exist or not.

### Step 3: Create/Reset Admin User

**If no users exist or you want to reset password:**

```bash
cd ~/hr-onboarding-automation/backend

# This creates admin user or resets password to admin123
npm run reset-admin
```

### Step 4: Verify It Worked

```bash
# Check users again
npm run check-users
```

You should see:
- ✅ Admin user: admin@ironlady.com
- ✅ Active: Yes

### Step 5: Restart Server (if needed)

```bash
pm2 restart hr-onboarding-backend
```

### Step 6: Try Login

Use these credentials:
- **Email**: `admin@ironlady.com`
- **Password**: `admin123`

## Quick One-Liner Fix

If you want to do everything at once:

```bash
cd ~/hr-onboarding-automation/backend && \
git fetch origin && \
git reset --hard origin/main && \
npm install && \
npm run reset-admin && \
pm2 restart hr-onboarding-backend
```

Then try logging in with:
- Email: `admin@ironlady.com`
- Password: `admin123`

