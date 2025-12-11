# Git Repository Setup Guide

## ✅ Git Repository Initialized

Your code has been initialized as a Git repository and committed locally.

## 📤 Push to GitHub

### Step 1: Create GitHub Repository

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon in the top right → **"New repository"**
3. Fill in the details:
   - **Repository name:** `hr-onboarding-automation`
   - **Description:** `HR Onboarding Automation System for Iron Lady`
   - **Visibility:** Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
4. Click **"Create repository"**

### Step 2: Add Remote and Push

After creating the repository, GitHub will show you commands. Use these:

```bash
# Navigate to your project directory
cd "C:\Users\OM PRAKASH GADHWAL\Downloads\hr-onboarding-automation (5)\hr-onboarding-automation"

# Add remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/hr-onboarding-automation.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

### Alternative: Using SSH (if you have SSH keys set up)

```bash
git remote add origin git@github.com:YOUR_USERNAME/hr-onboarding-automation.git
git branch -M main
git push -u origin main
```

### Step 3: Authentication

When you push, GitHub will ask for authentication:
- **Username:** Your GitHub username
- **Password:** Use a **Personal Access Token** (not your GitHub password)
  - Create token: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
  - Generate new token with `repo` scope
  - Copy and use it as password

## 🔄 Future Updates

After making changes to your code:

```bash
# Check what changed
git status

# Add all changes
git add .

# Commit changes
git commit -m "Description of changes"

# Push to GitHub
git push
```

## 📋 Current Repository Status

- ✅ Git initialized
- ✅ Initial commit created
- ✅ .gitignore configured
- ⏳ Ready to push to GitHub

## 🚫 Files Excluded from Git

The following are NOT tracked by Git (as per .gitignore):
- `node_modules/` - Dependencies
- `.env` - Environment variables (sensitive data)
- `uploads/**/*` - Uploaded files (PDFs, documents)
- `*.log` - Log files
- Build outputs
- IDE files

## 📝 Important Notes

1. **Never commit `.env` files** - They contain sensitive credentials
2. **Uploaded files are excluded** - Only code and documentation are tracked
3. **Use meaningful commit messages** - Describe what changed
4. **Push regularly** - Keep your remote repository up to date

## 🔐 Security Reminder

Before pushing, ensure:
- ✅ No `.env` files are committed
- ✅ No passwords or API keys in code
- ✅ No sensitive data in uploaded files
- ✅ `.gitignore` is properly configured

---

**Your code is ready to push to GitHub!** 🚀

