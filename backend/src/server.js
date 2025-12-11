require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const logger = require('./utils/logger');
const { initScheduledJobs } = require('./jobs/scheduler');
const { initEmailMonitor } = require('./services/emailMonitor');

// Initialize Prisma Client
const prisma = new PrismaClient();

// Initialize Express App
const app = express();

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5000'
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Allow any Vercel preview/deployment URL
      if (origin.includes('.vercel.app')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Make prisma available in routes
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Import Routes
const authRoutes = require('./routes/auth');
const candidateRoutes = require('./routes/candidates');
const emailRoutes = require('./routes/emails');
const templateRoutes = require('./routes/templates');
const calendarRoutes = require('./routes/calendar');
const dashboardRoutes = require('./routes/dashboard');
const configRoutes = require('./routes/config');
const webhookRoutes = require('./routes/webhooks');
const taskRoutes = require('./routes/tasks');
const portalRoutes = require('./routes/candidate-portal');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/config', configRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/portal', portalRoutes);  // Candidate self-service portal

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Email tracking pixel
app.get('/api/track/open/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    await prisma.email.updateMany({
      where: { trackingId },
      data: { 
        status: 'OPENED',
        openedAt: new Date()
      }
    });

    // Also update candidate if offer was viewed
    const email = await prisma.email.findUnique({
      where: { trackingId },
      include: { candidate: true }
    });

    if (email && email.type === 'OFFER_LETTER' && email.candidate) {
      await prisma.candidate.update({
        where: { id: email.candidateId },
        data: { 
          status: 'OFFER_VIEWED',
          offerViewedAt: new Date()
        }
      });
    }

    logger.info(`Email opened: ${trackingId}`);
  } catch (error) {
    logger.error('Error tracking email open:', error);
  }

  // Return 1x1 transparent pixel
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.set('Content-Type', 'image/gif');
  res.send(pixel);
});

// Email link tracking
app.get('/api/track/click/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    const { url } = req.query;

    await prisma.email.updateMany({
      where: { trackingId },
      data: { 
        status: 'CLICKED',
        clickedAt: new Date()
      }
    });

    logger.info(`Email link clicked: ${trackingId}`);

    if (url) {
      res.redirect(decodeURIComponent(url));
    } else {
      res.redirect(process.env.FRONTEND_URL);
    }
  } catch (error) {
    logger.error('Error tracking email click:', error);
    res.redirect(process.env.FRONTEND_URL);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Serve frontend static files in production
const frontendPath = path.join(__dirname, '../../frontend/build');
app.use(express.static(frontendPath));

// Handle React routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Initialize scheduled jobs
    initScheduledJobs(prisma);
    logger.info('Scheduled jobs initialized');

    // Initialize email reply monitor (auto-detect signed offers)
    initEmailMonitor(prisma);
    logger.info('Email reply monitor initialized');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

module.exports = app;
