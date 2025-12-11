# 🚀 Deploy Custom Fields Feature - Quick Guide

## ⚠️ **Error You're Seeing:**
```
500 Internal Server Error on /api/config/custom-fields/all
```

**Reason:** The `CustomField` database table doesn't exist on your AWS server yet.

---

## ✅ **Solution: Deploy Database Schema**

### **Step 1: SSH into AWS Server**
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

### **Step 4: Update Database Schema**
```bash
# This will create the CustomField table
npx prisma db push
```

**Expected Output:**
```
✔ Generated Prisma Client
✔ Database schema updated successfully
```

### **Step 5: Restart Backend**
```bash
pm2 restart hr-onboarding-backend
```

### **Step 6: Check Logs**
```bash
pm2 logs hr-onboarding-backend --lines 20
```

### **Step 7: Verify It Works**
- Go to Settings page in your frontend
- Click on "Custom Form Fields" tab
- The error should be gone!

---

## 🔍 **If You Still Get Errors:**

### **Check Database Connection:**
```bash
# Make sure your .env file has correct DATABASE_URL
cat .env | grep DATABASE_URL
```

### **Check Prisma Client:**
```bash
# Regenerate Prisma client
npx prisma generate
pm2 restart hr-onboarding-backend
```

### **Check PM2 Status:**
```bash
pm2 status
pm2 logs hr-onboarding-backend --lines 50
```

---

## 📝 **What This Does:**

1. **Creates `CustomField` table** in your database
2. **Adds `customFields` JSON column** to `Candidate` table
3. **Enables custom form fields feature** in Settings

---

## ✅ **After Deployment:**

You should be able to:
- ✅ See "Custom Form Fields" tab in Settings (no errors)
- ✅ Create custom fields
- ✅ Use custom fields in candidate creation form
- ✅ View custom fields in candidate detail page

---

**That's it! The error will be resolved once you run `npx prisma db push` on your server.**

