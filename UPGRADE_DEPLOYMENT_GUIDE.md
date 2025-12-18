# 🚀 Upgrade & Deployment Guide
## Safe Process for Upgrading Production (Vercel + AWS)

This guide explains how to make changes and deploy upgrades to your production system without disrupting the current live version.

---

## 📋 Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Development Workflow](#development-workflow)
3. [Testing Process](#testing-process)
4. [Deployment Process](#deployment-process)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedures](#rollback-procedures)
7. [Best Practices](#best-practices)

---

## ✅ Pre-Deployment Checklist

Before making any changes, ensure you have:

- [ ] **Backup of Production Database** (AWS RDS snapshot or export)
- [ ] **Backup of Environment Variables** (`.env` files from both frontend and backend)
- [ ] **Current Git Commit Hash** (note the current production version)
- [ ] **Access to AWS Console** (for backend deployment)
- [ ] **Access to Vercel Dashboard** (for frontend deployment)
- [ ] **Database Migration Plan** (if schema changes are involved)
- [ ] **Downtime Window** (if required for major changes)

---

## 🔄 Development Workflow

### Step 1: Create a Feature Branch

```bash
# Pull latest changes from main
git pull origin main

# Create a new branch for your changes
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### Step 2: Make Your Changes

- Make code changes locally
- Test thoroughly in your local environment
- Commit changes with descriptive messages

```bash
# Make your changes in the codebase
# ... edit files ...

# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: add new feature description"
# or
git commit -m "fix: resolve issue description"
```

### Step 3: Test Locally

**Backend Testing:**
```bash
cd backend
npm install  # Install any new dependencies
npm run dev  # Start development server
# Test your changes locally
```

**Frontend Testing:**
```bash
cd frontend
npm install  # Install any new dependencies
npm start   # Start development server
# Test your changes in browser
```

### Step 4: Push to GitHub

```bash
# Push your branch to GitHub
git push origin feature/your-feature-name
```

---

## 🧪 Testing Process

### Local Testing Checklist

- [ ] **Backend API Endpoints** - Test all modified/new endpoints
- [ ] **Frontend UI** - Test all affected pages/components
- [ ] **Database Changes** - Test migrations (if any)
- [ ] **Email Functionality** - Test email sending (use test credentials)
- [ ] **File Uploads** - Test file upload/download
- [ ] **Authentication** - Test login/logout
- [ ] **Error Handling** - Test error scenarios

### Database Migration Testing

If you have Prisma schema changes:

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Test migration (dry run)
npx prisma migrate dev --create-only --name your_migration_name

# Review the generated migration file
# If it looks correct, apply it locally
npx prisma migrate dev
```

**⚠️ Important:** Always test migrations on a copy of production data if possible.

---

## 🚀 Deployment Process

### Option 1: Direct Deployment (Small Changes)

For small, low-risk changes (UI tweaks, bug fixes):

#### Backend (AWS):

```bash
# 1. SSH into your AWS server
ssh bitnami@your-aws-server-ip

# 2. Navigate to project directory
cd ~/hr-onboarding-automation

# 3. Pull latest changes
git pull origin main

# 4. Install new dependencies (if any)
cd backend
npm install

# 5. Run database migrations (if any)
npx prisma generate
npx prisma migrate deploy  # Use 'deploy' for production, not 'dev'

# 6. Restart the application
pm2 restart hr-onboarding-backend

# 7. Check logs
pm2 logs hr-onboarding-backend --lines 50
```

#### Frontend (Vercel):

Vercel automatically deploys when you push to `main` branch, but you can also:

1. **Via Vercel Dashboard:**
   - Go to Vercel Dashboard
   - Select your project
   - Click "Deployments"
   - Click "Redeploy" on the latest deployment

2. **Via Git Push:**
   ```bash
   # Merge your feature branch to main
   git checkout main
   git merge feature/your-feature-name
   git push origin main
   # Vercel will automatically deploy
   ```

### Option 2: Staged Deployment (Major Changes)

For major changes, use a staging environment:

#### Create Staging Branch:

```bash
# Create and push staging branch
git checkout -b staging
git push origin staging
```

#### Deploy Staging:

**Backend (AWS):**
- Create a separate PM2 process for staging: `pm2 start backend/src/server.js --name hr-onboarding-staging --env staging`
- Use different port (e.g., 5001)
- Use separate database or database prefix

**Frontend (Vercel):**
- Create a new Vercel project for staging
- Connect it to the `staging` branch
- Use staging environment variables

#### Test Staging:
- Test all functionality in staging
- Get stakeholder approval
- Then deploy to production

---

## 📊 Post-Deployment Verification

After deployment, verify everything works:

### Backend Verification:

```bash
# SSH into AWS server
ssh bitnami@your-aws-server-ip

# Check PM2 status
pm2 status

# Check logs for errors
pm2 logs hr-onboarding-backend --lines 100

# Test API endpoint
curl https://your-api-domain.com/api/health
```

### Frontend Verification:

1. **Check Vercel Deployment:**
   - Go to Vercel Dashboard
   - Verify deployment status is "Ready"
   - Check build logs for errors

2. **Test in Browser:**
   - Open production URL
   - Test login
   - Test key features
   - Check browser console for errors

### Database Verification:

```bash
# SSH into AWS server
cd ~/hr-onboarding-automation/backend

# Check database connection
npx prisma db pull  # Should succeed without errors

# Verify migrations applied
npx prisma migrate status
```

### Monitoring Checklist:

- [ ] **Application Logs** - No errors in PM2 logs
- [ ] **API Response Times** - Normal performance
- [ ] **Database Queries** - No slow queries
- [ ] **Email Sending** - Test email functionality
- [ ] **File Uploads** - Test file operations
- [ ] **User Authentication** - Test login/logout
- [ ] **Critical Features** - Test main workflows

---

## 🔙 Rollback Procedures

If something goes wrong, rollback immediately:

### Backend Rollback (AWS):

```bash
# SSH into AWS server
ssh bitnami@your-aws-server-ip

cd ~/hr-onboarding-automation

# Find the previous working commit
git log --oneline -10

# Checkout previous commit
git checkout <previous-commit-hash>

# Install dependencies (in case they changed)
cd backend
npm install

# Rollback database migrations (if any)
npx prisma migrate resolve --rolled-back <migration-name>

# Restart application
pm2 restart hr-onboarding-backend

# Verify it's working
pm2 logs hr-onboarding-backend --lines 50
```

### Frontend Rollback (Vercel):

1. **Via Vercel Dashboard:**
   - Go to Vercel Dashboard
   - Select your project
   - Click "Deployments"
   - Find the previous working deployment
   - Click "..." menu → "Promote to Production"

2. **Via Git:**
   ```bash
   # Revert to previous commit
   git revert HEAD
   git push origin main
   # Vercel will redeploy automatically
   ```

### Database Rollback:

**⚠️ Warning:** Database rollbacks are risky. Only do this if absolutely necessary.

```bash
cd backend

# If you need to rollback a migration
npx prisma migrate resolve --rolled-back <migration-name>

# Or manually revert schema changes
# Edit prisma/schema.prisma
# Then:
npx prisma migrate dev --name rollback_changes
```

---

## 🎯 Best Practices

### 1. **Always Test Locally First**
   - Never deploy untested code
   - Test all affected features
   - Test error scenarios

### 2. **Use Feature Branches**
   - One feature per branch
   - Descriptive branch names
   - Keep branches small and focused

### 3. **Commit Messages**
   - Use clear, descriptive messages
   - Follow conventional commits: `feat:`, `fix:`, `refactor:`, etc.
   - Reference issue numbers if applicable

### 4. **Database Migrations**
   - Always test migrations locally first
   - Use `prisma migrate deploy` in production (not `dev`)
   - Backup database before migrations
   - Test migrations on production data copy if possible

### 5. **Environment Variables**
   - Never commit `.env` files
   - Update environment variables in Vercel/AWS before deployment
   - Document required environment variables

### 6. **Deployment Timing**
   - Deploy during low-traffic hours if possible
   - Avoid deployments on critical business days
   - Have someone available to monitor after deployment

### 7. **Monitoring**
   - Monitor logs for 30-60 minutes after deployment
   - Set up alerts for errors
   - Check user reports immediately

### 8. **Documentation**
   - Document all changes in commit messages
   - Update README if needed
   - Document breaking changes

### 9. **Backup Strategy**
   - Backup database before major changes
   - Keep backups of previous code versions
   - Test restore procedures periodically

### 10. **Gradual Rollout**
   - For major changes, consider gradual rollout
   - Deploy to staging first
   - Test thoroughly before production

---

## 📝 Deployment Checklist Template

Copy this checklist for each deployment:

```
## Deployment: [Feature Name] - [Date]

### Pre-Deployment
- [ ] Code reviewed and tested locally
- [ ] Database backup created
- [ ] Environment variables updated (if needed)
- [ ] Dependencies checked (package.json)
- [ ] Migration files reviewed (if any)

### Deployment
- [ ] Backend deployed to AWS
- [ ] Frontend deployed to Vercel
- [ ] Database migrations applied (if any)
- [ ] PM2 restarted successfully
- [ ] Build completed without errors

### Post-Deployment
- [ ] API health check passed
- [ ] Frontend loads correctly
- [ ] Login/logout works
- [ ] Key features tested
- [ ] No errors in logs
- [ ] Database queries working
- [ ] Email functionality tested
- [ ] File uploads working

### Issues Found
- [ ] Issue 1: [Description]
- [ ] Issue 2: [Description]

### Rollback Plan
- [ ] Previous commit hash noted: [hash]
- [ ] Rollback procedure documented
- [ ] Team notified of deployment
```

---

## 🔧 Common Deployment Scenarios

### Scenario 1: Adding a New Feature

1. Create feature branch
2. Develop and test locally
3. Push to GitHub
4. Merge to `main`
5. Deploy backend (AWS)
6. Frontend auto-deploys (Vercel)
7. Verify in production

### Scenario 2: Database Schema Change

1. Create feature branch
2. Update `prisma/schema.prisma`
3. Generate migration: `npx prisma migrate dev --name migration_name`
4. Test migration locally
5. **Backup production database**
6. Deploy backend
7. Run `npx prisma migrate deploy` in production
8. Verify database structure
9. Deploy frontend

### Scenario 3: Bug Fix

1. Create fix branch
2. Fix the bug
3. Test fix locally
4. Push and merge to `main`
5. Deploy immediately (bug fixes are usually urgent)
6. Verify fix in production

### Scenario 4: Dependency Update

1. Update `package.json`
2. Run `npm install` locally
3. Test thoroughly (dependencies can break things)
4. Deploy backend
5. Deploy frontend
6. Monitor for issues

### Scenario 5: Environment Variable Change

1. Update `.env` file locally (for testing)
2. Update in Vercel Dashboard (frontend)
3. Update in AWS (backend - edit `.env` file or use AWS Systems Manager)
4. Restart backend: `pm2 restart hr-onboarding-backend`
5. Verify changes took effect

---

## 🆘 Emergency Procedures

### If Production is Down:

1. **Check Status:**
   ```bash
   ssh bitnami@your-aws-server-ip
   pm2 status
   pm2 logs hr-onboarding-backend --lines 100
   ```

2. **Quick Rollback:**
   ```bash
   cd ~/hr-onboarding-automation
   git checkout <previous-working-commit>
   cd backend
   npm install
   pm2 restart hr-onboarding-backend
   ```

3. **Check Database:**
   ```bash
   cd backend
   npx prisma db pull  # Check connection
   ```

4. **Check Frontend:**
   - Go to Vercel Dashboard
   - Check deployment status
   - Rollback if needed

### If Database Migration Fails:

1. **Stop the application:**
   ```bash
   pm2 stop hr-onboarding-backend
   ```

2. **Rollback migration:**
   ```bash
   cd backend
   npx prisma migrate resolve --rolled-back <migration-name>
   ```

3. **Restore from backup if needed**

4. **Restart application:**
   ```bash
   pm2 start hr-onboarding-backend
   ```

---

## 📞 Support Contacts

- **AWS Server Access:** [Your SSH details]
- **Vercel Dashboard:** [Your Vercel URL]
- **Database Access:** [Your RDS details]
- **GitHub Repository:** [Your repo URL]

---

## 🔄 Version Control Best Practices

### Branch Strategy:

```
main          → Production (always stable)
staging       → Staging environment (optional)
feature/*     → New features
fix/*         → Bug fixes
hotfix/*      → Urgent production fixes
```

### Commit Convention:

```
feat: Add new feature
fix: Fix bug
refactor: Code refactoring
docs: Documentation changes
style: Code style changes
test: Test additions
chore: Maintenance tasks
```

---

## 📚 Additional Resources

- [Prisma Migration Guide](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [PM2 Process Manager](https://pm2.keymetrics.io/)
- [Vercel Deployment Guide](https://vercel.com/docs/deployments/overview)
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)

---

## ✅ Quick Reference Commands

### Backend Deployment:
```bash
ssh bitnami@your-aws-server-ip
cd ~/hr-onboarding-automation
git pull origin main
cd backend
npm install
npx prisma generate
npx prisma migrate deploy  # If migrations exist
pm2 restart hr-onboarding-backend
pm2 logs hr-onboarding-backend --lines 50
```

### Frontend Deployment:
```bash
git checkout main
git merge feature/your-feature
git push origin main
# Vercel auto-deploys
```

### Rollback:
```bash
# Backend
git checkout <previous-commit>
cd backend && npm install
pm2 restart hr-onboarding-backend

# Frontend (via Vercel Dashboard)
# Promote previous deployment to production
```

---

**Last Updated:** [Current Date]
**Maintained By:** [Your Name/Team]

