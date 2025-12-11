# 🚀 Deployment Update Guide - AWS & Vercel

This guide explains how to deploy the latest changes (attachment fixes and multiple attachment support) to your production environment.

---

## 📋 **Pre-Deployment Checklist**

- [ ] All changes committed and pushed to GitHub
- [ ] Database backup created (recommended)
- [ ] Tested locally (if possible)

---

## 🔧 **Backend Deployment (AWS Lightsail)**

### **Step 1: SSH into Your Lightsail Instance**

```bash
ssh bitnami@43.204.155.68
# Or use your SSH key method
```

### **Step 2: Navigate to Project Directory**

```bash
cd ~/hr-onboarding-automation
```

### **Step 3: Pull Latest Changes from GitHub**

```bash
git pull origin main
```

If you get conflicts, resolve them or use:
```bash
git fetch origin
git reset --hard origin/main
```

⚠️ **Warning:** `git reset --hard` will discard any local changes. Make sure you've committed everything first.

### **Step 4: Navigate to Backend Directory**

```bash
cd backend
```

### **Step 5: Install Dependencies (if package.json changed)**

```bash
npm install
```

### **Step 6: Run Database Migration**

This is **CRITICAL** - the schema has changed to support multiple attachments:

```bash
npx prisma generate
npx prisma db push
```

**Expected Output:**
```
✔ Generated Prisma Client
✔ Database schema updated successfully
```

If you see warnings about data loss, review them carefully. The changes should be safe (adding new optional fields).

### **Step 7: Restart PM2 Process**

```bash
pm2 restart hr-onboarding-backend
```

Or if you're using a different PM2 name:
```bash
pm2 restart all
```

### **Step 8: Check PM2 Status**

```bash
pm2 status
pm2 logs hr-onboarding-backend --lines 50
```

Look for:
- ✅ Process is running
- ✅ No errors in logs
- ✅ Database connection successful
- ✅ SMTP connection verified

### **Step 9: Test the API**

```bash
curl https://hr-automation.iamironlady.com/api/health
```

Should return:
```json
{"status":"ok","timestamp":"...","uptime":...}
```

---

## 🎨 **Frontend Deployment (Vercel)**

### **Option 1: Automatic Deployment (Recommended)**

If your Vercel project is connected to GitHub:

1. **Push changes to GitHub** (if not already done):
   ```bash
   git add .
   git commit -m "Fix attachment logic and add multiple attachment support"
   git push origin main
   ```

2. **Vercel will automatically deploy** when you push to `main` branch

3. **Check deployment status:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Find your project
   - Check the latest deployment status

### **Option 2: Manual Deployment**

If automatic deployment is disabled:

1. **Install Vercel CLI** (if not installed):
   ```bash
   npm install -g vercel
   ```

2. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

3. **Deploy:**
   ```bash
   vercel --prod
   ```

4. **Follow prompts** if needed

---

## ✅ **Post-Deployment Verification**

### **Backend Verification**

1. **Check API Health:**
   ```bash
   curl https://hr-automation.iamironlady.com/api/health
   ```

2. **Test Attachment Upload:**
   - Log into your HR dashboard
   - Create a new candidate
   - Schedule a step with an attachment
   - Verify the attachment is saved and email includes it

3. **Check Logs:**
   ```bash
   pm2 logs hr-onboarding-backend --lines 100
   ```
   
   Look for:
   - ✅ No errors
   - ✅ Attachment paths being logged correctly
   - ✅ Email sending working

### **Frontend Verification**

1. **Visit your Vercel URL:**
   - Check if the site loads correctly
   - Log in and test the UI

2. **Test Attachment Feature:**
   - Go to a candidate detail page
   - Try scheduling a step with an attachment
   - Verify the attachment uploads successfully

---

## 🔄 **Rollback Instructions (If Something Goes Wrong)**

### **Backend Rollback**

```bash
# SSH into Lightsail
ssh bitnami@43.204.155.68

# Navigate to project
cd ~/hr-onboarding-automation

# Check git log for previous commit
git log --oneline -10

# Reset to previous commit (replace COMMIT_HASH with actual hash)
git reset --hard COMMIT_HASH

# Navigate to backend
cd backend

# Restore database (if needed - be careful!)
# npx prisma db push --force-reset  # ⚠️ This will delete all data!

# Restart PM2
pm2 restart hr-onboarding-backend
```

### **Frontend Rollback**

1. Go to Vercel Dashboard
2. Find your project
3. Go to "Deployments" tab
4. Find the previous working deployment
5. Click "..." menu → "Promote to Production"

---

## 📝 **Database Migration Details**

### **What Changed:**

1. **CalendarEvent Model:**
   - Added `attachmentPaths Json?` field (for multiple attachments)
   - Kept `attachmentPath String?` (backward compatibility)

2. **Email Model:**
   - Added `attachmentPaths Json?` field (for multiple attachments)
   - Kept `attachmentPath String?` (backward compatibility)

### **Migration Safety:**

✅ **Safe Changes:**
- Adding new optional fields doesn't break existing data
- Old single attachments will continue to work
- New multiple attachments are optional

⚠️ **No Data Loss:**
- Existing `attachmentPath` values are preserved
- No existing records are modified

---

## 🐛 **Troubleshooting**

### **Issue: Database Migration Fails**

**Error:** `Error: P3005 - Database schema is out of sync`

**Solution:**
```bash
# Reset Prisma client
npx prisma generate

# Try again
npx prisma db push
```

### **Issue: PM2 Process Won't Start**

**Error:** `Process failed to start`

**Solution:**
```bash
# Check PM2 logs
pm2 logs hr-onboarding-backend --err

# Check if port is in use
sudo netstat -tlnp | grep :5000

# Kill process if needed
pm2 delete hr-onboarding-backend
pm2 start ecosystem.config.js
```

### **Issue: Frontend Build Fails on Vercel**

**Error:** Build errors in Vercel

**Solution:**
1. Check Vercel build logs
2. Verify all dependencies are in `package.json`
3. Check for environment variables:
   - `REACT_APP_API_URL` should be set to `https://hr-automation.iamironlady.com`

### **Issue: Attachments Not Working After Deployment**

**Check:**
1. Database migration completed successfully
2. PM2 restarted
3. Check backend logs for attachment-related errors
4. Verify file uploads directory exists:
   ```bash
   ls -la ~/hr-onboarding-automation/backend/uploads/calendar-attachments
   ```

---

## 📞 **Quick Reference Commands**

### **Backend (AWS Lightsail)**

```bash
# SSH into server
ssh bitnami@43.204.155.68

# Navigate and pull
cd ~/hr-onboarding-automation && git pull origin main

# Update backend
cd backend
npm install
npx prisma generate
npx prisma db push
pm2 restart hr-onboarding-backend

# Check status
pm2 status
pm2 logs hr-onboarding-backend --lines 50
```

### **Frontend (Vercel)**

```bash
# Push to GitHub (auto-deploys)
git add .
git commit -m "Update frontend"
git push origin main

# Or manual deploy
cd frontend
vercel --prod
```

---

## 🎯 **Next Steps After Deployment**

1. ✅ Test attachment upload for existing steps
2. ✅ Test attachment upload for newly created steps
3. ✅ Verify emails include attachments
4. ✅ Test multiple attachments (when frontend UI is updated)

---

## 📚 **Additional Notes**

- **Multiple Attachments:** The backend now supports multiple attachments, but the frontend UI still only allows single file selection. This will be updated in a future release. For now, single attachments work perfectly.

- **Backward Compatibility:** All existing functionality remains unchanged. The new features are additive and optional.

- **Performance:** Multiple attachments may increase email sending time. Monitor email delivery times.

---

*Last Updated: $(date)*
*Deployment Guide Version: 1.0*

