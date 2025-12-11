# AWS Lightsail Deployment Guide - HR Onboarding Automation

## Complete Step-by-Step Guide to Deploy Backend on Lightsail $3.50 Plan

---

## 📋 Prerequisites

Before starting, ensure you have:
- ✅ AWS Account (create at [aws.amazon.com](https://aws.amazon.com))
- ✅ Neon Database account (already set up)
- ✅ Domain name (optional, can use Lightsail static IP)
- ✅ SSH client (Windows: PuTTY or WSL, Mac/Linux: Terminal)
- ✅ Your backend code ready

---

## Step 1: Create Lightsail Instance

### 1.1 Login to AWS Console
1. Go to [AWS Console](https://console.aws.amazon.com)
2. Search for "Lightsail" in the search bar
3. Click on "Lightsail"

### 1.2 Create Instance
1. Click **"Create instance"** button
2. Choose your instance location (closest to your users)
3. Select platform: **"Linux/Unix"**
4. Select blueprint: **"Node.js"** (or "OS Only" - Ubuntu)
5. Choose instance plan: **"$3.50 USD/month"**
   - 512 MB RAM
   - 1 vCPU
   - 20 GB SSD
   - 1 TB transfer
6. Name your instance: `hr-onboarding-backend`
7. Click **"Create instance"**

### 1.3 Wait for Instance to Start
- Wait 2-3 minutes for instance to be ready
- Status will change from "Pending" to "Running"

---

## Step 2: Connect to Your Instance

### 2.1 Get SSH Access
1. In Lightsail console, click on your instance
2. Click **"Connect using SSH"** button
3. This opens a browser-based terminal

**OR** Use SSH from your local machine:

1. Click **"Account"** → **"SSH keys"** → **"Download"** to get your private key
2. Save the key file (e.g., `lightsail-key.pem`)
3. Set permissions (Mac/Linux):
   ```bash
   chmod 400 lightsail-key.pem
   ```
4. Connect via SSH:
   ```bash
   ssh -i lightsail-key.pem ubuntu@YOUR_INSTANCE_IP
   ```
   (Replace `YOUR_INSTANCE_IP` with your instance's public IP)

---

## Step 3: Update System and Install Dependencies

Once connected via SSH, run these commands:




ssh -i "$HOME\Downloads\lightsail.pem" bitnami@43.204.155.68



```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Install Git (if not already installed)
sudo apt install -y git

# Install build tools (needed for some npm packages)
sudo apt install -y build-essential
```

---

## Step 4: Upload Your Backend Code

### Option A: Using Git (Recommended)

```bash
# Create app directory
mkdir -p ~/hr-onboarding-backend
cd ~/hr-onboarding-backend

# Clone your repository (if using Git)
git clone YOUR_REPOSITORY_URL .
# OR if you have a private repo:
# git clone https://YOUR_USERNAME:YOUR_TOKEN@github.com/YOUR_USERNAME/YOUR_REPO.git .

# Navigate to backend folder
cd hr-onboarding-automation/backend
```

### Option B: Using SCP (File Transfer)

From your local machine (in a new terminal):

```bash
# Navigate to your project folder
cd "C:\Users\OM PRAKASH GADHWAL\Downloads\hr-onboarding-automation (5)\hr-onboarding-automation"

# Upload backend folder
scp -i lightsail-key.pem -r backend ubuntu@YOUR_INSTANCE_IP:~/hr-onboarding-backend/
```

Then on the server:
```bash
cd ~/hr-onboarding-backend/backend
```

---

## Step 5: Install Node.js Dependencies

```bash
# Install all npm packages
npm install

# Generate Prisma Client
npx prisma generate
```

---

## Step 6: Configure Environment Variables

### 6.1 Create .env File

```bash
# Create .env file
nano .env
```

### 6.2 Add Your Environment Variables

Copy and paste this template, then fill in your values:

```env
# Server Configuration
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://your-frontend-domain.com
BACKEND_URL=http://YOUR_INSTANCE_IP:5000

# Database (Neon PostgreSQL)
DATABASE_URL=your_neon_database_connection_string

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here_min_32_characters

# SMTP Configuration (for sending emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=your_email@gmail.com

# Google Calendar API (if using)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://YOUR_INSTANCE_IP:5000/auth/google/callback

# File Upload
MAX_FILE_SIZE=10485760

# Logging
LOG_LEVEL=info
```

**Important Notes:**
- Replace `YOUR_INSTANCE_IP` with your Lightsail instance's public IP
- Get your Neon database URL from Neon dashboard
- Generate a strong JWT_SECRET (use: `openssl rand -base64 32`)
- For Gmail SMTP, use an [App Password](https://support.google.com/accounts/answer/185833)

### 6.3 Save and Exit
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

---

## Step 7: Set Up Database

```bash
# Push database schema to Neon
npx prisma db push

# (Optional) Run seed data
npm run db:seed
```

---

## Step 8: Create Uploads Directory

```bash
# Create uploads directory structure
mkdir -p uploads/offer-letters
mkdir -p uploads/signed-offers
mkdir -p uploads/calendar-attachments

# Set proper permissions
chmod -R 755 uploads
```

---

## Step 9: Start Application with PM2

```bash
# Start the application
pm2 start src/server.js --name hr-onboarding-backend

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system reboot
pm2 startup
# Copy and run the command it outputs (starts with 'sudo')

# Check application status
pm2 status

# View logs
pm2 logs hr-onboarding-backend
```

---

## Step 10: Configure Lightsail Firewall

1. In Lightsail console, go to your instance
2. Click **"Networking"** tab
3. Click **"Add rule"**
4. Add these rules:
   - **Application**: Custom
   - **Protocol**: TCP
   - **Port**: 5000
   - **Source**: Anywhere (0.0.0.0/0)
   - Click **"Create"**

---

## Step 11: Create Static IP (Optional but Recommended)

1. In Lightsail console, click **"Networking"** tab  43.204.155.68
2. Click **"Create static IP"**
3. Attach it to your instance
4. Note down the static IP address

**Update your .env file** with the static IP:
```bash
nano .env
# Update BACKEND_URL and GOOGLE_REDIRECT_URI with static IP
```

Restart PM2:
```bash
pm2 restart hr-onboarding-backend
```

---

## Step 12: Set Up Domain and SSL (Recommended)

### 12.1 Point Domain to Static IP
1. Go to your domain registrar
2. Add an A record:
   - **Type**: A
   - **Name**: api (or @ for root domain)
   - **Value**: Your Lightsail static IP
   - **TTL**: 3600

### 12.2 Install Certbot for SSL

```bash
# Install Certbot
sudo apt install -y certbot

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Stop Nginx (we'll configure it)
sudo systemctl stop nginx
```

### 12.3 Configure Nginx

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/hr-onboarding
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com api.your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # For file uploads
    client_max_body_size 10M;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/hr-onboarding /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl start nginx
```

### 12.4 Get SSL Certificate

```bash
# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d api.your-domain.com

# Auto-renewal is set up automatically
```

---

## Step 13: Update Frontend Configuration

Update your frontend's API URL to point to your Lightsail instance:

```javascript
// In your frontend .env or config
REACT_APP_API_URL=https://your-domain.com
// OR
REACT_APP_API_URL=http://YOUR_STATIC_IP:5000
```

---

## Step 14: Verify Deployment

### 14.1 Test API Endpoints

```bash
# Test health endpoint (if you have one)
curl http://YOUR_STATIC_IP:5000/health

# Or test from browser
# http://YOUR_STATIC_IP:5000/api/health
```

### 14.2 Check PM2 Status

```bash
pm2 status
pm2 logs hr-onboarding-backend --lines 50
```

### 14.3 Monitor Resources

```bash
# Check memory usage
free -h

# Check disk usage
df -h

# Check CPU usage
top
```

---

## Step 15: Set Up Monitoring (Optional)

### 15.1 Enable Lightsail Monitoring

1. In Lightsail console, go to your instance
2. Click **"Monitoring"** tab
3. Enable metrics you want to track

### 15.2 Set Up Alerts

1. Click **"Alarms"** tab
2. Create alarms for:
   - CPU utilization > 80%
   - Memory utilization > 80%
   - Disk usage > 80%

---

## 🔧 Useful Commands

### PM2 Commands
```bash
pm2 status                    # Check app status
pm2 logs hr-onboarding-backend # View logs
pm2 restart hr-onboarding-backend # Restart app
pm2 stop hr-onboarding-backend   # Stop app
pm2 delete hr-onboarding-backend # Remove from PM2
```

### Application Commands
```bash
# View logs
tail -f ~/.pm2/logs/hr-onboarding-backend-out.log
tail -f ~/.pm2/logs/hr-onboarding-backend-error.log

# Restart after code changes
cd ~/hr-onboarding-backend/backend
git pull  # If using Git
npm install  # If dependencies changed
npx prisma generate  # If schema changed
pm2 restart hr-onboarding-backend
```

### System Commands
```bash
# Check if port 5000 is in use
sudo netstat -tlnp | grep 5000

# Check system resources
htop  # (install with: sudo apt install htop)

# Check disk space
df -h
```

---

## 🚨 Troubleshooting

### Application Won't Start
```bash
# Check logs
pm2 logs hr-onboarding-backend --err

# Check if port is available
sudo lsof -i :5000

# Check environment variables
cat .env
```

### Out of Memory Issues
- 512 MB RAM is tight for Node.js
- Consider upgrading to $5 plan (1 GB RAM)
- Or optimize your application

### Database Connection Issues
```bash
# Test database connection
npx prisma db pull

# Check DATABASE_URL in .env
cat .env | grep DATABASE_URL
```

### File Upload Issues
```bash
# Check uploads directory permissions
ls -la uploads/
chmod -R 755 uploads/

# Check disk space
df -h
```

---

## 📊 Cost Summary

- **Lightsail Instance**: $3.50/month
- **Neon Database**: $0/month (Free tier)
- **Total**: **$3.50/month** ($42/year)

---

## ✅ Deployment Checklist

- [ ] Lightsail instance created
- [ ] SSH access configured
- [ ] Node.js and dependencies installed
- [ ] Code uploaded to server
- [ ] Environment variables configured
- [ ] Database connected (Neon)
- [ ] Application running with PM2
- [ ] Firewall rules configured
- [ ] Static IP assigned
- [ ] Domain configured (optional)
- [ ] SSL certificate installed (optional)
- [ ] Frontend updated with API URL
- [ ] Application tested and working

---

## 🎉 You're Done!

Your backend should now be running on AWS Lightsail. Access it at:
- `http://YOUR_STATIC_IP:5000`
- Or `https://your-domain.com` (if domain configured)

---

## 📞 Need Help?

If you encounter issues:
1. Check PM2 logs: `pm2 logs hr-onboarding-backend`
2. Check system logs: `sudo journalctl -u nginx` (if using Nginx)
3. Verify environment variables are set correctly
4. Ensure all firewall rules are configured
5. Check Neon database connection

---

**Good luck with your deployment! 🚀**

