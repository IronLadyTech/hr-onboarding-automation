# 📧 Gmail API Setup Guide (FREE)

## Overview

The HR Onboarding system uses **Gmail API** to automatically detect when candidates reply with signed offer letters. This is completely **FREE** with generous limits (15,000 requests/day).

## Cost: $0 (FREE)

| Feature | Limit | Our Usage |
|---------|-------|-----------|
| Gmail API Requests | 15,000/day | ~720/day (1 check every 2 min) |
| Attachment Downloads | Unlimited | As needed |
| Storage | Your Gmail storage | Minimal |

---

## Setup Steps (One-time, ~10 minutes)

### Step 1: Go to Google Cloud Console

1. Visit: https://console.cloud.google.com/
2. Sign in with your HR email account (e.g., hr@ironlady.in)

### Step 2: Create/Select Project

1. Click the project dropdown at the top
2. Click "New Project"
3. Name: "Iron Lady HR Automation"
4. Click "Create"

### Step 3: Enable Gmail API

1. Go to: APIs & Services → Library
2. Search for "Gmail API"
3. Click on it → Click "Enable"

### Step 4: Create OAuth Credentials

1. Go to: APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure OAuth consent screen:
   - User Type: Internal (for company use)
   - App name: "Iron Lady HR Automation"
   - User support email: Your email
   - Save and continue through all steps

4. Back to Credentials → Create OAuth client ID:
   - Application type: "Web application"
   - Name: "HR Onboarding"
   - Authorized redirect URIs: `http://localhost:5000/api/auth/google/callback`
   - Click "Create"

5. **Save these values:**
   - Client ID → `GOOGLE_CLIENT_ID`
   - Client Secret → `GOOGLE_CLIENT_SECRET`

### Step 5: Get Refresh Token

Run this script to get your refresh token:

```javascript
// save as get-token.js and run: node get-token.js
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',      // Replace with your Client ID
  'YOUR_CLIENT_SECRET',  // Replace with your Client Secret
  'http://localhost:3333/callback'
);

const scopes = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent'
});

console.log('Open this URL in browser:', authUrl);

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/callback')) {
    const code = new url.URL(req.url, 'http://localhost:3333').searchParams.get('code');
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n✅ Your Refresh Token:', tokens.refresh_token);
    console.log('\nAdd this to your .env file:');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    res.end('Success! Check your terminal for the refresh token.');
    server.close();
  }
}).listen(3333);
```

### Step 6: Update .env File

Add these to your `.env` file:

```env
# Gmail API (for auto-detecting signed offers)
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REFRESH_TOKEN=your-refresh-token-here
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
```

---

## How It Works

```
1. Candidate receives offer email from HR
                    ↓
2. Candidate replies with signed PDF attached
                    ↓
3. System checks HR inbox every 2 minutes
                    ↓
4. Finds email from candidate (matches by email address)
                    ↓
5. Downloads attachment automatically
                    ↓
6. Saves to: /uploads/signed-offers/signed-{id}-{date}.pdf
                    ↓
7. Updates candidate:
   - status → OFFER_SIGNED
   - offerSignedAt → timestamp
   - signedOfferPath → file location
                    ↓
8. Cancels reminder (no 3-day follow-up needed)
                    ↓
9. Shows on candidate profile with "View Document" link
```

---

## Verification

After setup, check the server logs:

```
✅ Gmail API connected: hr@ironlady.in
✅ Email reply monitor initialized (Gmail API)
```

If you see errors, check:
1. Client ID and Secret are correct
2. Refresh token is valid
3. Gmail API is enabled in Google Cloud Console

---

## Security Notes

- OAuth tokens are stored only in your .env file
- No passwords are stored
- Google manages authentication securely
- Tokens can be revoked anytime from Google Account settings

---

## Troubleshooting

### "Invalid Grant" Error
- Refresh token expired. Run the token script again.

### "API not enabled" Error
- Go to Google Cloud Console → APIs → Enable Gmail API

### "Insufficient Permission" Error
- Make sure you authorized both `gmail.readonly` and `gmail.modify` scopes

---

## Alternative: Skip Auto-Detection

If you don't want to set up Gmail API, the system will still work:
- Step 2 reminder will send after 3 days
- HR can manually upload signed offers via the UI
- Webhook endpoint available for external integrations

The Gmail API just adds convenience of automatic detection.
