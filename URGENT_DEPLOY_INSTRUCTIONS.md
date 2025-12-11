# 🚨 URGENT: Fix 500 Error - Deploy Database Schema

## ⚠️ **The Error:**
```
500 Internal Server Error on /api/config/custom-fields/all
```

**Root Cause:** The `CustomField` database table doesn't exist on your AWS server.

---

## ✅ **FIX IT NOW - Copy & Paste These Commands:**

### **Step 1: Connect to Your Server**
```bash
ssh bitnami@43.204.155.68
```

### **Step 2: Navigate to Backend**
```bash
cd ~/hr-onboarding-automation/backend
```

### **Step 3: Pull Latest Code**
```bash
git pull origin main
```

### **Step 4: Update Database Schema (THIS FIXES THE ERROR!)**
```bash
npx prisma db push
```

**You should see:**
```
✔ Generated Prisma Client
✔ Database schema updated successfully
```

### **Step 5: Restart Backend**
```bash
pm2 restart hr-onboarding-backend
```

### **Step 6: Verify It's Working**
```bash
pm2 logs hr-onboarding-backend --lines 20
```

**Look for:** No errors, server running normally.

---

## 🔍 **If `npx prisma db push` Fails:**

### **Check Database Connection:**
```bash
# Check your .env file
cat .env | grep DATABASE_URL
```

### **If DATABASE_URL is missing or wrong:**
```bash
# Edit .env file
nano .env

# Add or update:
# DATABASE_URL="your-neon-database-url-here"
```

### **Then try again:**
```bash
npx prisma db push
pm2 restart hr-onboarding-backend
```

---

## ✅ **After Running These Commands:**

1. ✅ Refresh your browser
2. ✅ Go to Settings page
3. ✅ Click "Custom Form Fields" tab
4. ✅ **Error should be GONE!**

---

## 📝 **What `npx prisma db push` Does:**

- Creates `CustomField` table in your database
- Adds `customFields` JSON column to `Candidate` table
- Makes the custom fields feature work

---

## 🆘 **Still Having Issues?**

### **Check PM2 Status:**
```bash
pm2 status
pm2 logs hr-onboarding-backend --lines 50
```

### **Check if Prisma is installed:**
```bash
npm list prisma
```

### **If Prisma is missing:**
```bash
npm install
npx prisma db push
pm2 restart hr-onboarding-backend
```

---

## ⏱️ **This Should Take Less Than 2 Minutes!**

Just run those 5 commands and the error will be fixed! 🚀

