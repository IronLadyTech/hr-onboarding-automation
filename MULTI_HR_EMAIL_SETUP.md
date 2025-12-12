# Multiple HR Email Support - Simple Setup Guide

## Overview

The system now supports using different HR emails for sending emails and creating calendar events, all using the **same Google Cloud API credentials**. Simply change the HR email in Settings, and the system will automatically use that email.

## How It Works

1. **Same Google Cloud API**: The system uses a single set of Google Cloud OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`) configured in your environment variables.

2. **Dynamic HR Email**: The HR email is stored in the database (`WorkflowConfig` table, key: `hr_email`) and can be changed from the Settings page.

3. **Automatic Usage**:
   - **Emails**: All emails sent by the system will use the configured HR email as the "from" address (formatted as "HR Name <hr@email.com>").
   - **Calendar Events**: Calendar events will be created in the HR email's calendar (if accessible) or the primary calendar, with the HR email added as an organizer.

## Setup Instructions

### 1. Configure Google Cloud API (One-Time Setup)

Ensure you have the following environment variables set in your `.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback
```

**Important**: The OAuth account used for these credentials should have:
- Permission to send emails as the HR email (Gmail "Send As" feature)
- Access to the HR email's calendar (shared calendar or domain-wide delegation in Google Workspace)

### 2. Change HR Email in Settings

1. Go to **Settings** → **Company** tab
2. Find the **HR Email** field
3. Enter the new HR email address
4. Click **Save All Changes**

The system will immediately start using this email for:
- All outgoing emails (as the "from" address)
- Calendar event creation (as the organizer)

## How It Works Technically

### Email Service
- Fetches `hr_email` from `WorkflowConfig` when sending emails
- Formats the "from" address as: `"HR Name <hr@email.com>"`
- Falls back to `EMAIL_FROM` or `SMTP_USER` environment variables if not set

### Calendar Service
- Fetches `hr_email` from `WorkflowConfig` when creating calendar events
- Attempts to use the HR email as the `calendarId` (if the OAuth account has access)
- Falls back to `'primary'` calendar if the HR email's calendar is not accessible
- Adds the HR email as an organizer/attendee to ensure invites come from the correct email

## Requirements

### For Gmail (Personal/Workspace)
- The OAuth account must have "Send As" permission for the HR email
- To set this up:
  1. In Gmail, go to Settings → Accounts and Import
  2. Add the HR email as a "Send mail as" address
  3. Verify the email address

### For Google Workspace (Recommended)
- Use domain-wide delegation for seamless access to any email in the domain
- Or share the HR email's calendar with the OAuth account

## Troubleshooting

### Emails not sending from HR email
- Check that the OAuth account has "Send As" permission for the HR email
- Verify `hr_email` is correctly set in Settings
- Check SMTP configuration (emails use SMTP, not Gmail API)

### Calendar events not appearing in HR email's calendar
- The system will fallback to the OAuth account's primary calendar if the HR email's calendar is not accessible
- Ensure the OAuth account has access to the HR email's calendar
- For Google Workspace, use domain-wide delegation or share the calendar

### "Calendar not accessible" warnings
- This is normal if the HR email's calendar is not shared with the OAuth account
- Events will still be created in the primary calendar
- The HR email will still be added as an organizer/attendee

## Benefits

✅ **Simple**: Just change the email in Settings, no code changes needed  
✅ **Flexible**: Switch between different HR emails easily  
✅ **No Additional Setup**: Uses existing Google Cloud API credentials  
✅ **Automatic**: System automatically uses the configured email for all operations  

## Notes

- The system uses the same Google Cloud API credentials for all HR emails
- Each HR email must be accessible by the OAuth account (via "Send As" or calendar sharing)
- For best results, use Google Workspace with domain-wide delegation

