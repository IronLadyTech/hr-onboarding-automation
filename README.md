# HR Onboarding Automation System

A comprehensive HR onboarding automation system for **Iron Lady**, built to streamline the candidate onboarding workflow from offer letter to completion.

## Features

### 11-Step Automated Onboarding Workflow
1. **Offer Letter** - Upload and send offer letters with tracking
2. **Offer Follow-up** - Automated reminders for unsigned offers (3 days)
3. **Welcome Email** - Day -1 welcome email with joining details
4. **HR Induction** - Day 0 HR induction calendar invite (9:30 AM)
5. **WhatsApp Group** - Manual task notification for team group addition
6. **Onboarding Form** - Automated form email within first hour
7. **Form Reminder** - 24-hour follow-up for incomplete forms
8. **CEO Induction** - Leadership introduction scheduling
9. **Sales Induction** - Role-specific training (for Sales roles)
10. **Training Plan** - One-week customizable training program
11. **Check-in Call** - HR check-in 7 days after joining

### Key Features
- 📧 **Email Tracking** - Open and click tracking with pixel
- 📅 **Google Calendar Integration** - Automated event creation
- 📊 **Dashboard Analytics** - Pipeline visualization and metrics
- 📝 **Email Templates** - Customizable templates with placeholders
- ✅ **Task Management** - Manual and automated task tracking
- 🔔 **Reminder System** - Configurable automated reminders
- 📱 **WhatsApp Integration** - WATI webhook support
- 🔗 **Zoho CRM Integration** - Lead status sync

## Tech Stack

### Backend
- **Node.js** + **Express.js** - API server
- **Prisma ORM** - Database management
- **PostgreSQL** - Database
- **Nodemailer** - Email service
- **Node-cron** - Scheduled jobs
- **Google APIs** - Calendar integration
- **Winston** - Logging
- **JWT** - Authentication

### Frontend
- **React 18** - UI framework
- **React Router 6** - Navigation
- **Tailwind CSS** - Styling
- **Chart.js** - Analytics charts
- **Axios** - API client
- **React Hot Toast** - Notifications

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Google Cloud Console account (for Calendar API)
- SMTP server credentials

### Installation

1. **Clone and install dependencies**
```bash
cd hr-onboarding-automation

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

2. **Configure environment variables**
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
```

3. **Set up the database**
```bash
cd backend

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed default data
npm run db:seed
```

4. **Start the application**

Backend (port 5000):
```bash
cd backend
npm run dev
```

Frontend (port 3000):
```bash
cd frontend
npm start
```

5. **Access the application**
- Frontend: http://localhost:3000
- API: http://localhost:5000
- Prisma Studio: `npm run db:studio`

### Default Login Credentials
- **Email:** admin@ironlady.com
- **Password:** admin123

## Configuration

### Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/hr_onboarding

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=HR Team <hr@ironlady.com>

# Google Calendar
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Company
COMPANY_NAME=Iron Lady
CEO_NAME=Dr. Aparna Jain
HR_EMAIL=hr@ironlady.com
```

### Workflow Configuration
Configure timing and automation settings in **Settings → Workflow**:
- Offer reminder days
- Welcome email timing
- HR induction time
- Form reminder hours
- Check-in call days
- Auto-send toggles

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user

### Candidates
- `GET /api/candidates` - List all
- `POST /api/candidates` - Create
- `GET /api/candidates/:id` - Get one
- `PUT /api/candidates/:id` - Update
- `POST /api/candidates/:id/offer-letter` - Upload offer
- `POST /api/candidates/:id/send-offer` - Send offer
- `POST /api/candidates/:id/welcome-email` - Send welcome
- `POST /api/candidates/:id/onboarding-form` - Send form

### Calendar
- `GET /api/calendar` - List events
- `GET /api/calendar/today` - Today's events
- `GET /api/calendar/upcoming` - Upcoming events
- `POST /api/calendar` - Create event
- `POST /api/calendar/:id/complete` - Mark complete

### Tasks
- `GET /api/tasks` - List tasks
- `GET /api/tasks/my-tasks` - My tasks
- `GET /api/tasks/overdue` - Overdue tasks
- `POST /api/tasks/:id/complete` - Complete task

### Webhooks
- `POST /api/webhooks/signed-offer` - Receive signed offer
- `POST /api/webhooks/form/completed` - Form completion
- `POST /api/webhooks/calendar/response` - Calendar RSVP
- `GET /api/webhooks/email/open/:trackingId` - Email open tracking

## Project Structure

```
hr-onboarding-automation/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.js            # Seed data
│   ├── src/
│   │   ├── server.js          # Express app
│   │   ├── routes/            # API routes
│   │   ├── services/          # Business logic
│   │   ├── middleware/        # Auth, etc.
│   │   ├── jobs/              # Scheduled jobs
│   │   └── utils/             # Helpers
│   ├── uploads/               # File storage
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   ├── pages/             # Page components
│   │   ├── services/          # API services
│   │   ├── context/           # React context
│   │   ├── hooks/             # Custom hooks
│   │   └── utils/             # Helpers
│   └── package.json
└── README.md
```

## Deployment

### Production Build
```bash
# Build frontend
cd frontend
npm run build

# Start backend in production
cd ../backend
NODE_ENV=production npm start
```

### Docker (Optional)
```dockerfile
# Dockerfile example
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ .
RUN npx prisma generate
EXPOSE 5000
CMD ["npm", "start"]
```

## Customization

### Email Templates
1. Go to **Templates** in the dashboard
2. Select a template to edit
3. Use placeholders: `{{candidateName}}`, `{{position}}`, etc.
4. Preview and save

### Training Plans
1. Go to **Settings → Training Plans**
2. Create department-specific plans
3. Define daily modules
4. Assign to candidates by department

### Workflow Automation
Adjust automated actions in `backend/src/jobs/scheduler.js`:
- Reminder scheduling
- Email automation
- Task creation

## Support

For issues or feature requests, contact the development team.

---

Built with ❤️ for Iron Lady
