# Fix Nginx Redirect Issue for SSL

## Problem
Nginx has a redirect configuration that's interfering with Let's Encrypt verification.

## Solution

### Step 1: Check Current Nginx Configuration

```bash
# View the current configuration
sudo cat /etc/nginx/sites-available/hr-onboarding

# Check all enabled sites
ls -la /etc/nginx/sites-enabled/

# Check for any redirect rules
sudo grep -r "return\|rewrite" /etc/nginx/sites-enabled/
```

### Step 2: Check if There's a Default Redirect

```bash
# Check main nginx config
sudo cat /etc/nginx/nginx.conf | grep -A 10 "server"

# Check if there are other server blocks
sudo grep -r "server_name.*iamironlady" /etc/nginx/
```

### Step 3: Fix Nginx Configuration

```bash
# Edit the configuration
sudo nano /etc/nginx/sites-available/hr-onboarding
```

**Make sure the file contains ONLY this (no redirects, no extra rules):**

```
server {
    listen 80;
    server_name hr-automation.iamironlady.com iamironlady.com 43.204.155.68;

    client_max_body_size 10M;

    # Allow Let's Encrypt verification - MUST be before location /
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

### Step 4: Remove Any Other Conflicting Configs

```bash
# Check what's in sites-enabled
ls -la /etc/nginx/sites-enabled/

# Remove any other configs that might conflict
sudo rm -f /etc/nginx/sites-enabled/default
sudo rm -f /etc/nginx/sites-enabled/bitnami
sudo rm -f /etc/nginx/sites-enabled/*.conf

# Keep only your config
ls -la /etc/nginx/sites-enabled/
```

### Step 5: Test and Reload Nginx

```bash
# Test configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx

# Check Nginx status
sudo systemctl status nginx
```

### Step 6: Test .well-known Path

```bash
# Test if .well-known is accessible
curl http://hr-automation.iamironlady.com/.well-known/acme-challenge/test
curl http://iamironlady.com/.well-known/acme-challenge/test

# Should return 404 (which is fine, we just need the path to work)
```

### Step 7: Retry Certbot

```bash
# Retry SSL certificate
sudo certbot --nginx -d hr-automation.iamironlady.com -d iamironlady.com
```

## Alternative: Use Standalone Mode

If Nginx plugin still has issues, use standalone mode:

```bash
# Stop Nginx temporarily
sudo systemctl stop nginx

# Get certificate in standalone mode
sudo certbot certonly --standalone -d hr-automation.iamironlady.com -d iamironlady.com

# Start Nginx again
sudo systemctl start nginx

# Then manually configure SSL in Nginx (Certbot will show the certificate paths)
```

---

**Check the configuration first, then retry certbot!**

