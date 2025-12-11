#!/bin/bash

# Deployment Script for AWS Lightsail
# Run this script on your Lightsail instance after initial setup

echo "🚀 Starting deployment..."

# Navigate to backend directory
cd ~/hr-onboarding-backend/backend || exit

# Pull latest code (if using Git)
# git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npx prisma generate

# Run database migrations
echo "🗄️  Running database migrations..."
npx prisma db push

# Create uploads directories if they don't exist
echo "📁 Creating upload directories..."
mkdir -p uploads/offer-letters
mkdir -p uploads/signed-offers
mkdir -p uploads/calendar-attachments
chmod -R 755 uploads

# Restart application with PM2
echo "🔄 Restarting application..."
pm2 restart hr-onboarding-backend || pm2 start ecosystem.config.js

# Show status
echo "✅ Deployment complete!"
pm2 status
pm2 logs hr-onboarding-backend --lines 20

