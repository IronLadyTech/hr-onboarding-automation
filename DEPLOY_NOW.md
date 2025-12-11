# 🚨 DEPLOY NOW - Fix 500 Error

## ⚠️ **You're getting a 500 error because the database table doesn't exist!**

---

## ✅ **FIX IT - Run These Commands on Your AWS Server:**

```bash
# Step 1: Connect to your server
ssh bitnami@43.204.155.68

# Step 2: Go to backend directory
cd ~/hr-onboarding-automation/backend

# Step 3: Pull latest code
git pull origin main

# Step 4: Create the database table (THIS IS THE FIX!)
npx prisma db push

# Step 5: Restart the backend
pm2 restart hr-onboarding-backend

# Step 6: Check if it's working
pm2 logs hr-onboarding-backend --lines 30
```

---

## 📋 **What You Should See:**

### **After `npx prisma db push`:**
```
✔ Generated Prisma Client
✔ Database schema updated successfully
```

### **After `pm2 restart`:**
```
[PM2] Successfully restarted hr-onboarding-backend
```

---

## ✅ **After Running These Commands:**

1. **Refresh your browser**
2. **Go to Settings → Custom Form Fields**
3. **The error will be GONE!** ✅

---

## 🔍 **If You Get Errors:**

### **"Command not found: npx"**
```bash
# Install Node.js/npm first
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install node
```

### **"DATABASE_URL not found"**
```bash
# Check your .env file
cat .env

# If DATABASE_URL is missing, add it:
nano .env
# Add: DATABASE_URL="your-neon-database-url-here"
```

### **"Permission denied"**
```bash
# Make sure you're in the right directory
pwd
# Should show: /home/bitnami/hr-onboarding-automation/backend
```

---

## ⏱️ **This Takes 2 Minutes!**

Just copy and paste those 6 commands and you're done! 🚀

---

## 📝 **Why This Happens:**

- ✅ Frontend code: Ready
- ✅ Backend code: Ready  
- ❌ Database table: **NOT CREATED YET**

**Solution:** Run `npx prisma db push` to create the table!

---

**DO THIS NOW and the error will be fixed!** 🎯

