# Quick Deployment Steps - Lightsail Instance

## ✅ You've Completed:
- [x] Cloned repository: `git clone https://github.com/IronLadyTech/hr-onboarding-automation`
- [x] Repository is at: `~/hr-onboarding-automation`
- [x] Lightsail Instance: `hr-automation` (IP: 43.204.155.68)
- [x] Domain: `iamironlady.com`
- [x] DNS Name: `hr-automation.iamironlady.com`
- [x] Domain: `iamironlady.com`
- [x] DNS Name: `hr-automation.iamironlady.com`

## 📋 Next Steps:

### Step 1: Navigate to Backend Directory

```bash
cd hr-onboarding-automation/backend
```

### Step 2: Install Node.js (if not already installed)

```bash
# Check if Node.js is installed
node --version

# If not installed, install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x
```

### Step 3: Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### Step 4: Install Build Tools (if needed)

```bash
sudo apt install -y build-essential
```

### Step 5: Install Dependencies

```bash
# Make sure you're in the backend directory
cd ~/hr-onboarding-automation/backend

# Install npm packages
npm install

# Generate Prisma Client
npx prisma generate
```

### Step 6: Create Environment Variables File

```bash
# Create .env file
nano .env
```

**Copy and paste this template, then fill in your values:**

```env
# Server Configuration
NODE_ENV=production
PORT=5000
FRONTEND_URL=http://43.204.155.68:3000
BACKEND_URL=http://43.204.155.68:5000
# Or use your domain if configured:
# FRONTEND_URL=https://iamironlady.com
# BACKEND_URL=https://hr-automation.iamironlady.com

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
# Or use your domain if configured:
# GOOGLE_REDIRECT_URI=https://hr-automation.iamironlady.com/auth/google/callback

# File Upload
MAX_FILE_SIZE=10485760

# Logging
LOG_LEVEL=info
```

**To save in nano:**
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

### Step 7: Set Up Database

```bash
# Push database schema to Neon
npx prisma db push
```

### Step 8: Create Upload Directories

```bash
# Create upload directories
mkdir -p uploads/offer-letters
mkdir -p uploads/signed-offers
mkdir -p uploads/calendar-attachments

# Set permissions
chmod -R 755 uploads
```

### Step 9: Start Application with PM2

```bash
# Start the application
pm2 start src/server.js --name hr-onboarding-backend

# Save PM2 configuration
pm2 save

# Setup PM2 to start on reboot
pm2 startup
# Copy and run the command it outputs (starts with 'sudo')

# Check status
pm2 status

# View logs
pm2 logs hr-onboarding-backend
```

### Step 10: Configure Lightsail Firewall

1. Go to AWS Lightsail Console
2. Click on your instance
3. Go to **"Networking"** tab
4. Click **"Add rule"**
5. Add:
   - **Application:** Custom
   - **Protocol:** TCP
   - **Port:** 5000
   - **Source:** Anywhere (0.0.0.0/0)
6. Click **"Create"**

### Step 11: Test Your Application

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

## ✅ Verification Checklist

### Basic Setup
- [ ] Node.js installed (v18.x)
- [ ] PM2 installed
- [ ] Dependencies installed (`npm install` completed)
- [ ] Prisma Client generated
- [ ] `.env` file created with all variables
- [ ] Database connected (`npx prisma db push` successful)
- [ ] Upload directories created
- [ ] Application running with PM2 (`pm2 status` shows "online")
- [ ] Firewall rule added for port 5000
- [ ] Health check endpoint working

### SSL Setup (Optional but Recommended)
- [ ] Domain name configured (A record pointing to Lightsail IP)
- [ ] Nginx installed and configured
- [ ] Nginx site enabled and tested
- [ ] Firewall rules added for ports 80 and 443
- [ ] SSL certificate obtained via Certbot
- [ ] HTTPS working (test with `curl https://your-domain.com/api/health`)
- [ ] Auto-renewal configured (automatic with Certbot)
- [ ] Environment variables updated with HTTPS URLs

## Step 12: Set Up SSL Certificate (HTTPS)

### Prerequisites
- You need a domain name pointing to your Lightsail IP (43.204.155.68)
- Domain should have an A record pointing to: `43.204.155.68`

### 12.1 Install Nginx and Certbot

```bash
# Update package list
sudo apt update

# Install Nginx
sudo apt install -y nginx

# Install Certbot (for SSL certificates)
sudo apt install -y certbot python3-certbot-nginx
```

### 12.2 Configure Nginx as Reverse Proxy

```bash
# Create Nginx configuration file
sudo nano /etc/nginx/sites-available/hr-onboarding
```

**Add this configuration:**

```
server {
    listen 80;
    server_name hr-automation.iamironlady.com iamironlady.com 43.204.155.68;

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

**Save and exit:**
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

### 12.3 Enable Nginx Site

```bash
# Create directory for ACME challenge
sudo mkdir -p /var/www/html/.well-known/acme-challenge
sudo chmod -R 755 /var/www/html

# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/hr-onboarding /etc/nginx/sites-enabled/

# Remove default Nginx site (optional)
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test is successful, start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx  # Enable on boot
```

### 12.4 Configure Lightsail Firewall for HTTP/HTTPS

1. Go to AWS Lightsail Console
2. Click on your instance
3. Go to **"Networking"** tab
4. Add these rules:
   - **HTTP (Port 80):** Allow from anywhere
   - **HTTPS (Port 443):** Allow from anywhere

### 12.5 Stop Conflicting Services (If Needed)

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

### 12.6 Get SSL Certificate

```bash
# Get SSL certificate for your domain
# Note: SSL requires a domain name - cannot use IP address directly
sudo certbot --nginx -d hr-automation.iamironlady.com -d iamironlady.com

# Follow the prompts:
# - Enter your email address: ironladytech@gmail.com
# - Agree to terms of service: Type Y
# - Share email with EFF: Type Y or N
# - Redirect HTTP to HTTPS: Type 2 (recommended)
```

**Certbot will automatically:**
- Obtain SSL certificate from Let's Encrypt
- Configure Nginx with SSL
- Set up auto-renewal

### 12.6 Verify SSL Certificate

```bash
# Test SSL certificate
sudo certbot certificates

# Test auto-renewal (dry run)
sudo certbot renew --dry-run
```

### 12.7 Update Environment Variables

After SSL is set up, update your `.env` file:

```bash
nano ~/hr-onboarding-automation/backend/.env
```

**Update these values:**
```env
FRONTEND_URL=https://iamironlady.com
BACKEND_URL=https://hr-automation.iamironlady.com
GOOGLE_REDIRECT_URI=https://hr-automation.iamironlady.com/auth/google/callback
```

**Restart the application:**
```bash
pm2 restart hr-onboarding-backend
```

### 12.8 Test HTTPS

```bash
# Test from server
curl https://hr-automation.iamironlady.com/api/health

# Or visit in browser
# https://hr-automation.iamironlady.com/api/health
```

### 12.9 Important Notes

- **IP Address:** Your instance IP is `43.204.155.68`
- **Hostname:** Your instance identifier is `hr-automation`
- **Domain:** `iamironlady.com`
- **Full DNS Name:** `hr-automation.iamironlady.com` (backend API)
- **SSL Requirement:** SSL certificates require a domain name. You cannot get SSL for an IP address directly.
- **Domain Setup:** Before getting SSL, ensure your domain DNS has:
  - **A record:** `hr-automation.iamironlady.com` → `43.204.155.68`
  - **A record:** `iamironlady.com` → `43.204.155.68` (optional, for root domain)

## 🎉 Success!

Your backend should now be running at:
- **Local:** `http://localhost:5000`
- **Public HTTP:** `http://43.204.155.68:5000`
- **Public HTTPS:** `https://hr-automation.iamironlady.com` ✅ (after SSL setup)

**Instance Details:**
- **Hostname:** hr-automation
- **IP Address:** 43.204.155.68
- **Domain:** iamironlady.com
- **Full DNS Name:** hr-automation.iamironlady.com
- **Region:** (check in Lightsail console)

## 📝 Useful Commands

```bash
# View logs
pm2 logs hr-onboarding-backend

# Restart application
pm2 restart hr-onboarding-backend

# Stop application
pm2 stop hr-onboarding-backend

# Check status
pm2 status

# Monitor resources
pm2 monit

# View recent logs (last 50 lines)
pm2 logs hr-onboarding-backend --lines 50
```

## 🚨 Troubleshooting

### Application won't start
```bash
# Check logs for errors
pm2 logs hr-onboarding-backend --err

# Check if port 5000 is in use
sudo netstat -tlnp | grep 5000
```

### Database connection error
```bash
# Verify DATABASE_URL in .env
cat .env | grep DATABASE_URL

# Test database connection
npx prisma db pull
```

### SSL Certificate Issues

**Certificate not obtained:**
```bash
# Check Nginx is running
sudo systemctl status nginx

# Check domain DNS
nslookup hr-automation.iamironlady.com
nslookup iamironlady.com

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Retry certificate
sudo certbot --nginx -d hr-automation.iamironlady.com -d iamironlady.com --force-renewal
```

**Nginx not starting:**
```bash
# Test configuration
sudo nginx -t

# Check for port conflicts
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443

# View Nginx logs
sudo tail -f /var/log/nginx/error.log
```

**Certificate renewal:**
```bash
# Certbot auto-renews, but you can manually renew:
sudo certbot renew

# Check renewal status
sudo certbot certificates
```

### Out of memory
- Your instance has limited RAM (512 MB)
- Monitor with: `pm2 monit`
- Consider upgrading to $5 plan if issues persist

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

---

**Continue with the steps above to complete your deployment!** 🚀

