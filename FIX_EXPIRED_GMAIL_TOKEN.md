# 🔧 Fix Expired Gmail Refresh Token

## Problem
Your server logs show:
```
❌ Gmail API initialization failed: invalid_grant
Token has been expired or revoked.
```

This means your `GOOGLE_REFRESH_TOKEN` in the `.env` file is expired or invalid.

## Solution: Get a New Refresh Token

### Step 1: SSH into your AWS server

```bash
ssh bitnami@your-server-ip
cd /home/bitnami/hr-onboarding-automation/backend
```

### Step 2: Check your current credentials

Check your `.env` file for:
```bash
cat .env | grep GOOGLE
```

You should see:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN` (this is expired)
- `GOOGLE_REDIRECT_URI`

### Step 3: Create token generation script

Create a file `get-new-token.js` in the `backend` directory:

```bash
nano get-new-token.js
```

Paste this code (replace with YOUR credentials from .env):

```javascript
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const readline = require('readline');

// Get credentials from .env or replace manually
const CLIENT_ID = 'YOUR_CLIENT_ID_FROM_ENV';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_FROM_ENV';
const REDIRECT_URI = 'http://localhost:3333/callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Scopes needed for Gmail API
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // Force consent to get refresh token
});

console.log('\n========================================');
console.log('  GET NEW GMAIL REFRESH TOKEN');
console.log('========================================\n');
console.log('1. Open this URL in your browser:');
console.log('\n' + authUrl + '\n');
console.log('2. Sign in with your Gmail account');
console.log('3. Click "Allow" to grant permissions');
console.log('4. Copy the code from the URL after redirect\n');
console.log('Waiting for authorization code...\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Start local server to receive callback
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/callback')) {
    try {
      const queryParams = new url.URL(req.url, 'http://localhost:3333').searchParams;
      const code = queryParams.get('code');
      
      if (!code) {
        res.end('Error: No authorization code received');
        return;
      }

      const { tokens } = await oauth2Client.getToken(code);
      
      console.log('\n========================================');
      console.log('  ✅ SUCCESS! NEW REFRESH TOKEN');
      console.log('========================================\n');
      console.log('Copy this and update your .env file:\n');
      console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('\n========================================\n');
      console.log('Full token details:');
      console.log(JSON.stringify(tokens, null, 2));
      console.log('\n========================================\n');
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Success!</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1 style="color: green;">✅ Authorization Successful!</h1>
            <p>Check your terminal for the new refresh token.</p>
            <p>You can close this window.</p>
            <h3>Your new token:</h3>
            <textarea style="width: 100%; height: 100px; font-family: monospace;">${tokens.refresh_token}</textarea>
          </body>
        </html>
      `);
      
      setTimeout(() => {
        server.close();
        rl.close();
        process.exit(0);
      }, 60000);
      
    } catch (error) {
      console.error('Error getting token:', error.message);
      res.end('Error: ' + error.message);
    }
  }
}).listen(3333, () => {
  console.log('Server listening on http://localhost:3333');
  console.log('Make sure port 3333 is accessible or use SSH tunnel\n');
});
```

### Step 4: Update the script with your credentials

Edit the file and replace:
- `YOUR_CLIENT_ID_FROM_ENV` with your actual `GOOGLE_CLIENT_ID`
- `YOUR_CLIENT_SECRET_FROM_ENV` with your actual `GOOGLE_CLIENT_SECRET`

### Step 5: Run the script

```bash
node get-new-token.js
```

### Step 6: Authorize in browser

1. The script will print a URL - open it in your browser
2. Sign in with the Gmail account you want to monitor
3. Click "Allow" to grant permissions
4. You'll be redirected to `http://localhost:3333/callback`
5. The script will display your new refresh token

### Step 7: Update .env file

```bash
nano .env
```

Find the line:
```
GOOGLE_REFRESH_TOKEN=old_expired_token
```

Replace with:
```
GOOGLE_REFRESH_TOKEN=new_token_from_script
```

Save and exit (Ctrl+X, then Y, then Enter)

### Step 8: Restart the server

```bash
pm2 restart hr-onboarding-backend
```

### Step 9: Verify it's working

Check the logs:
```bash
pm2 logs hr-onboarding-backend
```

You should see:
```
✅ Gmail API connected: your-email@gmail.com
✅ Email reply monitor initialized (Gmail API)
📧 Automatic email detection is ACTIVE - checking every 30 seconds
```

## Alternative: Use SSH Tunnel (if localhost doesn't work)

If you can't access `localhost:3333` from your browser, use SSH tunnel:

```bash
# On your local machine
ssh -L 3333:localhost:3333 bitnami@your-server-ip

# Then in another terminal, run the script on server
# And access http://localhost:3333 in your local browser
```

## Troubleshooting

### "Port 3333 already in use"
```bash
# Find and kill the process
lsof -ti:3333 | xargs kill -9
```

### "Invalid client"
- Make sure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Check Google Cloud Console → Credentials

### "Redirect URI mismatch"
- Make sure `GOOGLE_REDIRECT_URI` in `.env` matches the redirect URI in Google Cloud Console
- Should be: `http://localhost:3333/callback` (or your server's callback URL)

## After Fixing

Once the refresh token is updated:
- ✅ Automatic email detection will work
- ✅ System will check for signed offers every 30 seconds
- ✅ No manual intervention needed

