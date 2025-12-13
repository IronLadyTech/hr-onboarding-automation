# Fix 401 Unauthorized Errors

## Problem
Getting 401 (Unauthorized) errors on:
- `/api/config/settings` 
- `/api/auth/login`

## Root Cause
The backend server on AWS hasn't been restarted with the latest code changes.

## Solution

### Step 1: SSH into AWS Server
```bash
ssh bitnami@your-server-ip
# OR
ssh ubuntu@your-server-ip
```

### Step 2: Navigate to Backend Directory
```bash
cd ~/hr-onboarding-automation/backend
# OR wherever your backend is located
```

### Step 3: Pull Latest Code
```bash
git pull origin main
```

### Step 4: Install Dependencies (if needed)
```bash
npm install
```

### Step 5: Restart Backend Server

**Option A: If using PM2**
```bash
pm2 restart all
# OR
pm2 restart hr-onboarding-backend
```

**Option B: If using systemd service**
```bash
sudo systemctl restart hr-onboarding-backend
# OR whatever your service name is
```

**Option C: If running directly with node**
```bash
# Find the process
ps aux | grep node

# Kill the process
kill -9 <PID>

# Restart
npm start
# OR
node src/server.js
```

**Option D: If using forever**
```bash
forever restartall
```

### Step 6: Verify Server is Running
```bash
# Check if server is listening on port 5000 (or your configured port)
netstat -tulpn | grep :5000

# Check logs
pm2 logs
# OR
tail -f /var/log/your-app.log
```

### Step 7: Test the Endpoints

Test from server:
```bash
# Test /config/settings (should return 200, not 401)
curl -X GET http://localhost:5000/api/config/settings

# Test /auth/login (should return 400 for missing credentials, not 401)
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'
```

## What Was Fixed

1. **`/api/config/settings` endpoint** - Made public (no authentication required)
   - Moved route definition BEFORE `router.use(authenticateToken)`
   - This allows login page and theme to load without authentication

2. **Error handling** - Added better error handling for database connection issues

## Verification

After restarting, you should see:
- ✅ No 401 errors on `/api/config/settings`
- ✅ Login page loads company name and logo
- ✅ Theme colors load correctly
- ✅ Login endpoint works (returns 400 for invalid credentials, not 401 for unauthorized)

## If Still Getting 401 Errors

1. **Check server logs** for any errors:
   ```bash
   pm2 logs
   # OR
   tail -f /var/log/your-app.log
   ```

2. **Verify the code was pulled**:
   ```bash
   cd ~/hr-onboarding-automation/backend
   git log -1
   # Should show: "Improve /config/settings error handling and make it more robust"
   ```

3. **Check if routes are registered correctly**:
   ```bash
   # Look for this in server.js
   grep -n "app.use('/api/config'" src/server.js
   ```

4. **Check nginx/reverse proxy** (if using):
   - Make sure nginx isn't blocking requests
   - Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`

5. **Clear browser cache** and hard refresh (Ctrl+Shift+R)

## Quick Test Commands

```bash
# From your local machine, test the endpoints:
curl https://hr-automation.iamironlady.com/api/config/settings
curl -X POST https://hr-automation.iamironlady.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ironlady.com","password":"admin123"}'
```

If these return 401, the server definitely needs to be restarted.

