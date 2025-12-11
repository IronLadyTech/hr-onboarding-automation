# 🔄 Git Workflow Guide - Push & Pull

## 📋 Quick Reference

### **Backend (AWS Server)**
```bash
# SSH into server
ssh bitnami@43.204.155.68

# Navigate to backend
cd ~/hr-onboarding-automation/backend

# Pull latest changes
git pull origin main

# If you have local changes to push (usually not needed on server)
git add .
git commit -m "Your commit message"
git push origin main
```

### **Frontend (Local Development)**
```bash
# Navigate to frontend
cd frontend

# Pull latest changes
git pull origin main

# Push your changes
git add .
git commit -m "Your commit message"
git push origin main
```

---

## 🖥️ **Backend (AWS Lightsail Server)**

### **Step 1: SSH into Your Server**
```bash
ssh bitnami@43.204.155.68
```

### **Step 2: Navigate to Backend Directory**
```bash
cd ~/hr-onboarding-automation/backend
```

### **Step 3: Check Current Status**
```bash
# See current branch and status
git status

# See recent commits
git log --oneline -5
```

### **Step 4: Pull Latest Changes**
```bash
# Pull latest code from GitHub
git pull origin main
```

**If you get conflicts:**
```bash
# See what files have conflicts
git status

# If you want to discard local changes and use remote version
git reset --hard origin/main

# Then pull again
git pull origin main
```

### **Step 5: After Pulling - Update Dependencies (if needed)**
```bash
# Install any new npm packages
npm install

# Update database schema (if schema changed)
npx prisma db push

# Regenerate Prisma client
npx prisma generate
```

### **Step 6: Restart Application**
```bash
# Restart PM2 process
pm2 restart hr-onboarding-backend

# Check status
pm2 status

# View logs
pm2 logs hr-onboarding-backend --lines 50
```

### **⚠️ Important: Usually DON'T Push from Server**
The server is typically a "pull-only" environment. You should:
- ✅ **Pull** code from GitHub
- ❌ **Don't push** from server (push from your local machine instead)

---

## 💻 **Frontend (Local Development)**

### **Step 1: Navigate to Frontend Directory**
```bash
cd frontend
```

### **Step 2: Check Current Status**
```bash
# See what files have changed
git status

# See recent commits
git log --oneline -5
```

### **Step 3: Pull Latest Changes**
```bash
# Pull latest code from GitHub
git pull origin main
```

**If you have uncommitted changes:**
```bash
# Option 1: Stash your changes, pull, then reapply
git stash
git pull origin main
git stash pop

# Option 2: Commit your changes first
git add .
git commit -m "Your changes"
git pull origin main  # This will merge or create a merge commit
```

### **Step 4: Push Your Changes**
```bash
# Stage all changes
git add .

# Or stage specific files
git add src/pages/Settings.js

# Commit with a message
git commit -m "Add custom fields feature"

# Push to GitHub
git push origin main
```

**If push is rejected (someone else pushed first):**
```bash
# Pull first to merge remote changes
git pull origin main

# Resolve any conflicts, then push
git push origin main
```

### **Step 5: After Pulling - Update Dependencies (if needed)**
```bash
# Install any new npm packages
npm install

# Test locally
npm start
```

---

## 🔀 **Handling Merge Conflicts**

### **When Pulling:**
```bash
# If you see conflicts
git pull origin main

# Git will show conflicted files
# Example output:
# Auto-merging src/pages/Settings.js
# CONFLICT (content): Merge conflict in src/pages/Settings.js

# Open the file and look for conflict markers:
# <<<<<<< HEAD
# Your local changes
# =======
# Remote changes
# >>>>>>> origin/main

# Edit the file to resolve conflicts, then:
git add src/pages/Settings.js
git commit -m "Resolve merge conflict"
git push origin main
```

### **Using VS Code or Your Editor:**
Most editors (VS Code, Cursor) have built-in conflict resolution:
- Click "Accept Current Change"
- Click "Accept Incoming Change"
- Click "Accept Both Changes"
- Or manually edit

---

## 📦 **Complete Workflow Example**

### **Scenario: You made changes locally and want to deploy**

#### **1. Local Frontend:**
```bash
cd frontend
git add .
git commit -m "Add new feature"
git push origin main
```

#### **2. AWS Backend:**
```bash
# SSH into server
ssh bitnami@43.204.155.68

# Navigate to backend
cd ~/hr-onboarding-automation/backend

# Pull latest changes
git pull origin main

# Update database (if schema changed)
npx prisma db push

# Restart app
pm2 restart hr-onboarding-backend

# Check logs
pm2 logs hr-onboarding-backend --lines 20
```

#### **3. Frontend Auto-Deploys on Vercel**
- Vercel automatically detects pushes to `main` branch
- It will build and deploy automatically
- Check Vercel dashboard for deployment status

---

## 🚨 **Common Issues & Solutions**

### **Issue 1: "Your local changes would be overwritten"**
```bash
# Solution: Stash your changes
git stash
git pull origin main
git stash pop
```

### **Issue 2: "Permission denied (publickey)"**
```bash
# Solution: Make sure your SSH key is added to GitHub
# Or use HTTPS instead:
git remote set-url origin https://github.com/IronLadyTech/hr-onboarding-automation.git
```

### **Issue 3: "Branch is behind remote"**
```bash
# Solution: Pull first, then push
git pull origin main
git push origin main
```

### **Issue 4: "Database schema out of sync"**
```bash
# On AWS server:
cd ~/hr-onboarding-automation/backend
npx prisma db push
npx prisma generate
pm2 restart hr-onboarding-backend
```

### **Issue 5: "PM2 process not found"**
```bash
# Start the process
cd ~/hr-onboarding-automation/backend
pm2 start ecosystem.config.js
pm2 save
```

---

## 📝 **Best Practices**

### **✅ DO:**
- Always `git pull` before starting work
- Commit frequently with clear messages
- Test locally before pushing
- Pull on server before restarting
- Use descriptive commit messages

### **❌ DON'T:**
- Don't push directly from production server
- Don't force push to main branch
- Don't commit sensitive data (.env files)
- Don't skip testing after pulling

---

## 🔐 **Git Configuration (One-time Setup)**

### **Set Your Name and Email:**
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### **Check Current Config:**
```bash
git config --list
```

---

## 📊 **Useful Git Commands**

```bash
# See what changed
git diff

# See commit history
git log --oneline --graph

# See remote repository info
git remote -v

# Create a new branch (for features)
git checkout -b feature-name
git push origin feature-name

# Switch back to main
git checkout main

# Delete a branch
git branch -d feature-name
```

---

## 🎯 **Quick Commands Cheat Sheet**

### **Backend (AWS):**
```bash
ssh bitnami@43.204.155.68
cd ~/hr-onboarding-automation/backend
git pull origin main
npx prisma db push  # If schema changed
npm install  # If package.json changed
pm2 restart hr-onboarding-backend
pm2 logs hr-onboarding-backend
```

### **Frontend (Local):**
```bash
cd frontend
git pull origin main
npm install  # If package.json changed
npm start  # Test locally
git add .
git commit -m "Description"
git push origin main
```

---

## 📞 **Need Help?**

If you encounter issues:
1. Check `git status` to see current state
2. Check `git log` to see recent commits
3. Check PM2 logs: `pm2 logs hr-onboarding-backend`
4. Check Vercel deployment logs in dashboard

---

**Note:** The frontend on Vercel will automatically deploy when you push to the `main` branch. No manual deployment needed!

