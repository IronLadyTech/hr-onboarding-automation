# 🔧 Fix 500 Error - Step by Step

## ❌ **The Error:**
```
500 Internal Server Error on /api/config/custom-fields/all
```

## ✅ **The Solution:**

The `CustomField` table doesn't exist in your database yet. You need to create it.

---

## 🚀 **FIX IT NOW (Copy & Paste):**

```bash
# 1. Connect to your AWS server
ssh bitnami@43.204.155.68

# 2. Go to backend directory
cd ~/hr-onboarding-automation/backend

# 3. Pull latest code
git pull origin main

# 4. Create the database table (THIS FIXES THE ERROR!)
npx prisma db push

# 5. Restart the backend
pm2 restart hr-onboarding-backend

# 6. Check logs to verify
pm2 logs hr-onboarding-backend --lines 20
```

---

## 📋 **What Each Command Does:**

1. **`git pull origin main`** - Gets the latest code with the CustomField model
2. **`npx prisma db push`** - Creates the `CustomField` table in your database
3. **`pm2 restart hr-onboarding-backend`** - Restarts the server with new code

---

## ✅ **After Running These Commands:**

1. Refresh your browser
2. Go to Settings → Custom Form Fields
3. **Error will be GONE!** ✅

---

## 🔍 **If You Get Errors:**

### **Error: "Prisma Client not generated"**
```bash
npx prisma generate
npx prisma db push
pm2 restart hr-onboarding-backend
```

### **Error: "DATABASE_URL not found"**
```bash
# Check your .env file
cat .env | grep DATABASE_URL

# If missing, add it:
nano .env
# Add: DATABASE_URL="your-neon-database-url"
```

### **Error: "Permission denied"**
```bash
# Make sure you're in the right directory
pwd
# Should show: /home/bitnami/hr-onboarding-automation/backend
```

---

## ⏱️ **This Takes Less Than 2 Minutes!**

Just run those 6 commands and you're done! 🎉

---

## 📝 **Why This Happens:**

- The frontend code is trying to fetch custom fields
- The backend code exists and is running
- But the database table doesn't exist yet
- So the database query fails → 500 error

**Solution:** Create the table with `npx prisma db push`

---

**That's it! Run those commands and the error will be fixed!** 🚀

