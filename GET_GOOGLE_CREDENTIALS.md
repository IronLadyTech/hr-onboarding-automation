# 🔑 How to Get Google Client ID and Secret

## Step-by-Step Guide

### Step 1: Go to Google Cloud Console

1. Visit: **https://console.cloud.google.com/**
2. Sign in with your Google account (e.g., `ironladytech@gmail.com`)

### Step 2: Create or Select a Project

1. Click the **project dropdown** at the top of the page (next to "Google Cloud")
2. If you already have a project, select it. Otherwise:
   - Click **"New Project"**
   - Enter project name: **"HR Onboarding Automation"** (or any name you prefer)
   - Click **"Create"**
   - Wait a few seconds for the project to be created
   - Select the new project from the dropdown

### Step 3: Enable Required APIs

1. In the left sidebar, go to **"APIs & Services"** → **"Library"**
2. Search for **"Gmail API"** and click on it
3. Click **"Enable"** button
4. Go back to Library and search for **"Google Calendar API"**
5. Click on it and click **"Enable"**

### Step 4: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** (unless you have Google Workspace, then use "Internal")
3. Click **"Create"**
4. Fill in the required information:
   - **App name**: `HR Onboarding Automation`
   - **User support email**: Your email (e.g., `ironladytech@gmail.com`)
   - **Developer contact information**: Your email
5. Click **"Save and Continue"**
6. On **"Scopes"** page, click **"Add or Remove Scopes"**
7. Add these scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
8. Click **"Update"** → **"Save and Continue"**
9. On **"Test users"** page (if External):
   - Click **"Add Users"**
   - Add your email address (e.g., `ironladytech@gmail.com`)
   - Click **"Add"**
10. Click **"Save and Continue"** → **"Back to Dashboard"**

### Step 5: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**
4. If prompted, select **"Web application"** as the application type
5. Fill in the form:
   - **Name**: `HR Onboarding OAuth Client` (or any name)
   - **Authorized redirect URIs**: 
     - Click **"+ ADD URI"**
     - Enter: `http://localhost:3333/callback`
     - Click **"+ ADD URI"** again
     - Enter: `http://localhost:5000/api/auth/google/callback`
6. Click **"CREATE"**

### Step 6: Copy Your Credentials

After clicking "CREATE", a popup will appear with:
- **Your Client ID** (looks like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`)
- **Your Client Secret** (looks like: `GOCSPX-abcdefghijklmnopqrstuvwxyz`)

**⚠️ IMPORTANT:** Copy both values immediately! The Client Secret will only be shown once.

### Step 7: Add to Your .env File

Add these to your backend `.env` file:

```env
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3333/callback
```

**Note:** You'll also need to generate a `GOOGLE_REFRESH_TOKEN` using these credentials. See the Settings wizard or `FIX_EXPIRED_GMAIL_TOKEN.md` for instructions.

---

## Quick Reference

| Item | Where to Find |
|------|---------------|
| **Google Cloud Console** | https://console.cloud.google.com/ |
| **APIs & Services** | Left sidebar → APIs & Services |
| **OAuth Consent Screen** | APIs & Services → OAuth consent screen |
| **Credentials** | APIs & Services → Credentials |
| **Gmail API** | APIs & Services → Library → Search "Gmail API" |
| **Calendar API** | APIs & Services → Library → Search "Google Calendar API" |

---

## Troubleshooting

### "You don't have permission to create OAuth clients"
- Make sure you're signed in with the correct Google account
- Check if you have billing enabled (sometimes required for OAuth)
- Try creating the project under a different Google account

### "Redirect URI mismatch"
- Make sure the redirect URI in your `.env` file matches exactly what you entered in Google Cloud Console
- Common redirect URIs:
  - `http://localhost:3333/callback` (for token generation)
  - `http://localhost:5000/api/auth/google/callback` (for app)

### "Invalid client"
- Double-check that you copied the Client ID and Secret correctly
- Make sure there are no extra spaces or line breaks
- Regenerate the credentials if needed

### Can't find "Credentials" option
- Make sure you've selected a project (check the project dropdown at the top)
- You need to be in the correct project to create credentials

---

## Alternative: Use IMAP Instead

If you don't want to set up Google OAuth credentials, you can use **IMAP** instead:

1. Go to Settings → HR Email Configuration
2. Select **"GoDaddy / Other Professional Email Flow"**
3. Configure SMTP and IMAP (no Google credentials needed)
4. IMAP works with Gmail too! Just use:
   - IMAP Host: `imap.gmail.com`
   - IMAP Port: `993`
   - Use the same App Password as SMTP

This way, you don't need Google Client ID/Secret at all! 🎉

