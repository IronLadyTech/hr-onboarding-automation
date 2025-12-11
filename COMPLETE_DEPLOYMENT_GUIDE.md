# Complete Deployment Guide - HR Onboarding Automation

**Instance:** hr-automation  
**IP Address:** 43.204.155.68  
**Domain:** iamironlady.com  
**DNS Name:** hr-automation.iamironlady.com

---

## 📋 Prerequisites

- ✅ AWS Lightsail instance created
- ✅ Domain `iamironlady.com` configured
- ✅ DNS A record: `hr-automation.iamironlady.com` → `43.204.155.68`
- ✅ SSH access to your Lightsail instance
- ✅ Neon database account (for PostgreSQL)

---




ssh -i "$HOME\Downloads\lightsail.pem" bitnami@43.204.155.68





## Step 1: Connect to Your Instance

```bash
# Connect via SSH (from your local machine)
ssh -i lightsail-key.pem bitnami@43.204.155.68

# Or use Lightsail console "Connect using SSH" button
```

---

## Step 2: Update System and Install Node.js

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs build-essential

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Install Git (if not already installed)
sudo apt install -y git
```

---

## Step 3: Clone Repository

```bash
# Clone the repository
cd ~
git clone https://github.com/IronLadyTech/hr-onboarding-automation

# Navigate to backend directory
cd hr-onboarding-automation/backend
```

---

## Step 4: Install Dependencies

```bash
# Install npm packages
npm install

# Generate Prisma Client
npx prisma generate
```

---

## Step 5: Create Environment Variables

```bash
# Create .env file
nano .env
```

**Copy and paste this configuration (replace with your actual values):**

```env
# Server Configuration
NODE_ENV=production
PORT=5000
FRONTEND_URL=http://43.204.155.68:3000
BACKEND_URL=http://43.204.155.68:5000

# Database (Neon PostgreSQL)
DATABASE_URL=your_neon_database_connection_string_here

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters_long

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=your_email@gmail.com

# Google Calendar API (optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://43.204.155.68:5000/auth/google/callback

# File Upload
MAX_FILE_SIZE=10485760

# Logging
LOG_LEVEL=info
```

**To save in nano:**
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

---

## Step 6: Set Up Database

```bash
# Push database schema to Neon
npx prisma db push

# (Optional) Run seed data
npm run db:seed
```

---

## Step 7: Create Upload Directories

```bash
# Create upload directories
mkdir -p uploads/offer-letters
mkdir -p uploads/signed-offers
mkdir -p uploads/calendar-attachments

# Set permissions
chmod -R 755 uploads
```

---

## Step 8: Start Application with PM2

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

## Step 9: Configure Lightsail Firewall

1. Go to AWS Lightsail Console
2. Click on your instance (`hr-automation`)
3. Go to **"Networking"** tab
4. Click **"Add rule"** and add:
   - **Application:** Custom
   - **Protocol:** TCP
   - **Port:** 5000
   - **Source:** Anywhere (0.0.0.0/0)
   - Click **"Create"**

---

## Step 10: Test Application

```bash
# Test from server
curl http://localhost:5000/api/health

# Or test from browser
# http://43.204.155.68:5000/api/health
```

You should see:
```json
{"status":"ok","timestamp":"...","uptime":...}
```

---

## Step 11: Install and Configure Nginx

```bash
# Install Nginx
sudo apt update
sudo apt install -y nginx

# Create Nginx configuration file
sudo nano /etc/nginx/sites-available/hr-onboarding
```

**Paste this configuration:**

```
server {
    listen 80;
    server_name hr-automation.iamironlady.com 43.204.155.68;

    client_max_body_size 10M;

    # Allow Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri =404;
    }

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
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

**Save:** `Ctrl + X`, then `Y`, then `Enter`

```bash
# Create directory for ACME challenge
sudo mkdir -p /var/www/html/.well-known/acme-challenge
sudo chmod -R 755 /var/www/html

# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/hr-onboarding /etc/nginx/sites-enabled/

# Remove default Nginx site (if exists)
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test passes, start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Step 12: Stop Conflicting Services (If Needed)

```bash
# Check what's using port 80
sudo lsof -i :80

# If Apache or another service is using port 80, stop it:
# For systemd services:
sudo systemctl stop apache2
sudo systemctl disable apache2

# For Bitnami services:
sudo /opt/bitnami/ctlscript.sh stop apache

# Kill any process on port 80 (if needed)
sudo fuser -k 80/tcp

# Verify port 80 is free
sudo lsof -i :80

# Start Nginx
sudo systemctl start nginx
sudo systemctl status nginx
```

---

## Step 13: Configure Lightsail Firewall for HTTP/HTTPS

1. Go to AWS Lightsail Console
2. Click on your instance
3. Go to **"Networking"** tab
4. Add these rules:
   - **HTTP (Port 80):** Allow from anywhere
   - **HTTPS (Port 443):** Allow from anywhere

---

## Step 14: Get SSL Certificate

**Important:** Since you only control the `hr-automation` subdomain DNS, we'll get SSL for that subdomain only.

```bash
# Install Certbot (if not already installed)
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate for subdomain only
sudo certbot --nginx -d hr-automation.iamironlady.com
```

**Follow the prompts:**
1. Enter email address: `ironladytech@gmail.com`
2. Agree to terms: Type `Y` and press Enter
3. Share email with EFF: Type `Y` or `N` and press Enter
4. Redirect HTTP to HTTPS: Type `2` and press Enter (recommended)

**Certbot will automatically:**
- Obtain SSL certificate from Let's Encrypt
- Configure Nginx with SSL
- Set up auto-renewal

**Note:** If you get an error about Apache still running, see Step 12 to stop it first.

---

## Step 15: Update Environment Variables for HTTPS

```bash
# Edit .env file
cd ~/hr-onboarding-automation/backend
nano .env
```

**Update these values (IMPORTANT - Replace with your actual Vercel URL):**

```env
# Frontend URL (your Vercel deployment URL)
FRONTEND_URL=https://your-project-name.vercel.app

# Backend URL (your Lightsail backend URL)
BACKEND_URL=https://hr-automation.iamironlady.com

# API Base URL (same as BACKEND_URL, used for candidate portal)
API_BASE_URL=https://hr-automation.iamironlady.com

# Google OAuth redirect (if using Google Calendar)
GOOGLE_REDIRECT_URI=https://hr-automation.iamironlady.com/auth/google/callback
```

**Important Notes:**
- `FRONTEND_URL`: Your Vercel frontend URL (e.g., `https://hr-onboarding.vercel.app`)
- `BACKEND_URL`: Your backend URL (e.g., `https://hr-automation.iamironlady.com`)
- `API_BASE_URL`: Same as `BACKEND_URL` (used for generating links in emails and candidate portal)

**Save:** `Ctrl + X`, then `Y`, then `Enter`

```bash
# Restart application
pm2 restart hr-onboarding-backend

# Check logs to ensure it started correctly
pm2 logs hr-onboarding-backend --lines 20
```

---

## Step 16: Verify SSL Certificate

```bash
# Test SSL certificate
sudo certbot certificates

# Test auto-renewal (dry run)
sudo certbot renew --dry-run

# Test HTTPS endpoint
curl https://hr-automation.iamironlady.com/api/health

# Or visit in browser
# https://hr-automation.iamironlady.com/api/health
```

---

## ✅ Deployment Complete!

Your backend is now running at:
- **Local:** `http://localhost:5000`
- **Public HTTP:** `http://43.204.155.68:5000`
- **Public HTTPS:** `https://hr-automation.iamironlady.com` ✅

---

## 📝 Useful Commands

### PM2 Commands
```bash
pm2 status                    # Check app status
pm2 logs hr-onboarding-backend # View logs
pm2 restart hr-onboarding-backend # Restart app
pm2 stop hr-onboarding-backend   # Stop app
pm2 monit                     # Monitor resources
```

### Nginx Commands
```bash
sudo systemctl status nginx   # Check Nginx status
sudo systemctl restart nginx  # Restart Nginx
sudo nginx -t                 # Test configuration
sudo tail -f /var/log/nginx/error.log # View error logs
```

### SSL Certificate Commands
```bash
sudo certbot certificates     # List certificates
sudo certbot renew            # Renew certificates
sudo certbot renew --dry-run  # Test renewal
```

### Application Commands
```bash
# View logs
pm2 logs hr-onboarding-backend --lines 50

# Restart after code changes
cd ~/hr-onboarding-automation/backend
git pull
npm install
npx prisma generate
pm2 restart hr-onboarding-backend
```

---

## 🚨 Troubleshooting

### Application Won't Start
```bash
# Check logs
pm2 logs hr-onboarding-backend --err

# Check if port 5000 is in use
sudo netstat -tlnp | grep 5000

# Check environment variables
cat .env
```

### Database Connection Error
```bash
# Verify DATABASE_URL in .env
cat .env | grep DATABASE_URL

# Test database connection
npx prisma db pull
```

### Port 80 Already in Use
```bash
# Find what's using port 80
sudo lsof -i :80

# Stop conflicting service
sudo systemctl stop apache2
sudo fuser -k 80/tcp

# Start Nginx
sudo systemctl start nginx
```

### SSL Certificate Issues
```bash
# Check Nginx is running
sudo systemctl status nginx

# Check domain DNS
nslookup hr-automation.iamironlady.com

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Retry certificate
sudo certbot --nginx -d hr-automation.iamironlady.com -d iamironlady.com --force-renewal
```

### Nginx 502 Bad Gateway
```bash
# Check if Node.js app is running
pm2 status

# Check if app is listening on port 5000
sudo netstat -tlnp | grep 5000

# Restart application
pm2 restart hr-onboarding-backend

# Check Nginx proxy settings
sudo nano /etc/nginx/sites-available/hr-onboarding
```

### Out of Memory
- Your instance has 512 MB RAM (limited)
- Monitor with: `pm2 monit`
- Consider upgrading to $5 plan (1 GB RAM) if issues persist

---

## 📊 Deployment Checklist

### Basic Setup
- [ ] Node.js installed (v18.x)
- [ ] PM2 installed
- [ ] Repository cloned
- [ ] Dependencies installed
- [ ] Prisma Client generated
- [ ] `.env` file created with all variables
- [ ] Database connected
- [ ] Upload directories created
- [ ] Application running with PM2
- [ ] Firewall rule added for port 5000
- [ ] Health check endpoint working

### SSL Setup
- [ ] Domain DNS configured (A record pointing to 43.204.155.68)
- [ ] Nginx installed and configured
- [ ] Nginx site enabled
- [ ] Port 80 conflict resolved
- [ ] Firewall rules added for ports 80 and 443
- [ ] SSL certificate obtained
- [ ] HTTPS working
- [ ] Environment variables updated with HTTPS URLs
- [ ] Application restarted with new URLs

---

## 🎉 Success!

Your HR Onboarding Automation backend is now fully deployed and secured with SSL!

**Access your API at:**
- `https://hr-automation.iamironlady.com`

**Next Steps:**
1. Deploy your frontend
2. Update frontend API URL to `https://hr-automation.iamironlady.com`
3. Test the complete application

---

**Good luck with your deployment! 🚀**

