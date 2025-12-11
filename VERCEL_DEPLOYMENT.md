# Vercel Frontend Deployment Guide

## Quick Deployment Steps

### Method 1: Deploy via Vercel CLI (Fastest)

**1. Install Vercel CLI:**
```bash
npm install -g vercel
```

**2. Login to Vercel:**
```bash
vercel login
```

**3. Navigate to frontend directory:**
```bash
cd frontend
```

**4. Deploy:**
```bash
vercel
```

**Follow the prompts:**
- Set up and deploy? **Y**
- Which scope? (Select your account)
- Link to existing project? **N** (first time) or **Y** (if updating)
- Project name: `hr-onboarding-frontend` (or your choice)
- Directory: `./` (current directory)
- Override settings? **N**

**5. Add Environment Variables:**
```bash
vercel env add REACT_APP_API_URL
```
- Value: `https://hr-automation.iamironlady.com`
- Environment: Select **Production**, **Preview**, and **Development**

**6. Redeploy with environment variables:**
```bash
vercel --prod
```

---

### Method 2: Deploy via Vercel Dashboard (Easier)

**1. Push your code to GitHub:**
```bash
# If not already done
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

**2. Go to Vercel Dashboard:**
- Visit: https://vercel.com
- Sign up/Login with GitHub

**3. Import Project:**
- Click **"Add New"** → **"Project"**
- Import your GitHub repository
- Select the repository containing your frontend

**4. Configure Project:**
- **Framework Preset:** Create React App
- **Root Directory:** `frontend` (if your repo has frontend folder)
- **Build Command:** `npm run build`
- **Output Directory:** `build`
- **Install Command:** `npm install`

**5. Add Environment Variables:**
Click **"Environment Variables"** and add:
- **Name:** `REACT_APP_API_URL`
- **Value:** `https://hr-automation.iamironlady.com` (the `/api` will be added automatically)
- **Environments:** Select all (Production, Preview, Development)

**Note:** The frontend code automatically appends `/api` to the base URL, so you can set it to just the domain.

**6. Deploy:**
- Click **"Deploy"**
- Wait for build to complete (2-3 minutes)

**7. Your app will be live at:**
- `https://your-project-name.vercel.app`

---

## Update Backend CORS Settings

**On your Lightsail server, update backend CORS:**

```bash
cd ~/hr-onboarding-automation/backend
nano .env
```

**Add/Update:**
```env
FRONTEND_URL=https://your-project-name.vercel.app
```

**Restart backend:**
```bash
pm2 restart hr-onboarding-backend
```

**Or update CORS in backend code** (if using hardcoded CORS):
```javascript
// backend/src/app.js or server.js
const cors = require('cors');

app.use(cors({
  origin: [
    'https://your-project-name.vercel.app',
    'https://hr-automation.iamironlady.com',
    'http://localhost:3000'
  ],
  credentials: true
}));
```

---

## Custom Domain (Optional)

**1. In Vercel Dashboard:**
- Go to your project → **Settings** → **Domains**
- Add your domain: `app.iamironlady.com` (or any subdomain)
- Follow DNS instructions

**2. Update Environment Variable:**
- Update `REACT_APP_API_URL` if needed
- Update backend `FRONTEND_URL` in `.env`

---

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Check for TypeScript/ESLint errors

### API Calls Fail (CORS Error)
- Verify `REACT_APP_API_URL` is set correctly
- Check backend CORS settings include your Vercel URL
- Check browser console for exact error

### Environment Variables Not Working
- Environment variables must start with `REACT_APP_`
- Redeploy after adding environment variables
- Check Vercel dashboard → Settings → Environment Variables

### 404 on Refresh
- Add `vercel.json` in frontend root:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## Quick Commands Reference

```bash
# Deploy to production
vercel --prod

# Deploy preview
vercel

# View logs
vercel logs

# List deployments
vercel ls

# Remove deployment
vercel remove
```

---

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Vercel project created
- [ ] Environment variable `REACT_APP_API_URL` set
- [ ] Build successful
- [ ] Backend CORS updated
- [ ] Test login functionality
- [ ] Test API calls
- [ ] Custom domain configured (optional)

---

**Your frontend will be live at:** `https://your-project-name.vercel.app`

