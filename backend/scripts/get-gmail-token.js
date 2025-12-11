/**
 * GET NEW REFRESH TOKEN WITH GMAIL + CALENDAR SCOPES
 * 
 * Usage:
 *   cd backend
 *   npm install googleapis
 *   node scripts/get-gmail-token.js
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');

// Your existing credentials from .env
const CLIENT_ID = '21606536668-3qejvq29elgre2ueg3ns5kqdq6feeiep.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3333/callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Scopes needed for both Gmail and Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent'
});

console.log('\n========================================');
console.log('  GET GMAIL + CALENDAR REFRESH TOKEN');
console.log('========================================\n');
console.log('Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n');
console.log('Waiting for authorization...\n');

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
        process.exit(0);
      }, 60000);
      
    } catch (error) {
      console.error('Error getting token:', error.message);
      res.end('Error: ' + error.message);
    }
  }
}).listen(3333, () => {
  console.log('Server listening on http://localhost:3333');
});