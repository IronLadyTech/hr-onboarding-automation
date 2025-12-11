# 🔄 Update Backend on AWS Lightsail

## Quick Update Steps

### 1. SSH into your AWS Lightsail instance
```bash
ssh bitnami@43.204.155.68
# Or use your SSH key file
```

### 2. Navigate to the backend directory
```bash
cd ~/hr-onboarding-automation/backend
```

### 3. Pull latest changes from GitHub
```bash
git pull origin main
```

### 4. Install any new dependencies (if any)
```bash
npm install
```

### 5. Update database schema (if needed)
```bash
npx prisma db push
```

### 6. Restart the application with PM2
```bash
pm2 restart hr-onboarding-backend
# Or if using ecosystem.config.js:
pm2 restart ecosystem.config.js
```

### 7. Check application status
```bash
pm2 status
pm2 logs hr-onboarding-backend --lines 50
```

## What Changed?

### Backend Changes:
1. **Attachment Preview Fix** - `backend/src/routes/calendar.js`
   - Now preserves existing attachments when editing events
   - Merges new attachments with existing ones

2. **Company Name Replacement** - Multiple files:
   - `backend/src/services/emailService.js` - Uses company name from database
   - `backend/src/routes/config.js` - Settings endpoint returns DB config
   - `backend/src/routes/candidates.js` - Removed hardcoded "Iron Lady"

### Database Changes:
- **No schema changes** - All changes are code-only, no database migration needed

## Verify Update

After restarting, check the logs to ensure:
- ✅ Application started successfully
- ✅ No errors in the logs
- ✅ SMTP connection is working
- ✅ Database connection is working

```bash
pm2 logs hr-onboarding-backend --lines 100
```

## Troubleshooting

If you encounter issues:

1. **Check if git pull worked:**
   ```bash
   git log --oneline -5
   ```
   Should show latest commits including "Replace hardcoded company name..."

2. **If PM2 restart fails:**
   ```bash
   pm2 delete hr-onboarding-backend
   pm2 start ecosystem.config.js
   ```

3. **If database errors occur:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Check Nginx is still running:**
   ```bash
   sudo systemctl status nginx
   ```

---

**Note:** Frontend on Vercel will auto-deploy when you push to GitHub, so no manual action needed there.

