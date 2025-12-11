const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const crypto = require('crypto');

// Helper to convert absolute file path to relative path for storage
const getRelativeFilePath = (filePath) => {
  if (!filePath) return null;
  // Convert to relative path from uploads directory
  const uploadsDir = path.join(__dirname, '../../uploads');
  const relativePath = path.relative(uploadsDir, filePath);
  // Normalize to forward slashes for URLs (works on both Windows and Unix)
  return relativePath.split(path.sep).join('/');
};

// Configure multer for signed offer uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/signed-offers');
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'signed-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents, and images are allowed'));
    }
  }
});

// ============================================================
// CANDIDATE SELF-SERVICE PORTAL
// No authentication required - uses secure token
// ============================================================

// Generate secure upload token for candidate
// Called when sending offer email
const generateUploadToken = (candidateId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30); // Valid for 30 days
  return { token, expiry };
};

// Get candidate info by token (for portal page)
router.get('/offer/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const candidate = await req.prisma.candidate.findFirst({
      where: { 
        uploadToken: token,
        uploadTokenExpiry: { gte: new Date() }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        position: true,
        department: true,
        expectedJoiningDate: true,
        offerSignedAt: true,
        status: true
      }
    });

    if (!candidate) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invalid or expired link. Please contact HR.' 
      });
    }

    // Check if already signed
    if (candidate.offerSignedAt) {
      return res.json({
        success: true,
        alreadySigned: true,
        data: {
          firstName: candidate.firstName,
          signedAt: candidate.offerSignedAt
        }
      });
    }

    res.json({
      success: true,
      alreadySigned: false,
      data: candidate
    });
  } catch (error) {
    logger.error('Error fetching candidate for portal:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload signed offer (candidate self-service)
router.post('/offer/:token/upload', upload.single('signedOffer'), async (req, res) => {
  try {
    const { token } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Find candidate by token
    const candidate = await req.prisma.candidate.findFirst({
      where: { 
        uploadToken: token,
        uploadTokenExpiry: { gte: new Date() }
      }
    });

    if (!candidate) {
      // Clean up uploaded file
      await fs.unlink(file.path).catch(() => {});
      return res.status(404).json({ 
        success: false, 
        message: 'Invalid or expired link. Please contact HR.' 
      });
    }

    // Check if already signed
    if (candidate.offerSignedAt) {
      await fs.unlink(file.path).catch(() => {});
      return res.status(400).json({ 
        success: false, 
        message: 'Offer letter already signed!' 
      });
    }

    // Update candidate with signed offer
    await req.prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        signedOfferPath: getRelativeFilePath(file.path),
        offerSignedAt: new Date(),
        status: 'OFFER_SIGNED'
      }
    });

    // Log activity
    await req.prisma.activityLog.create({
      data: {
        candidateId: candidate.id,
        action: 'SIGNED_OFFER_UPLOADED',
        description: `Candidate uploaded signed offer letter via self-service portal`,
        metadata: { filename: file.originalname }
      }
    });

    // Cancel any pending offer reminders
    await req.prisma.reminder.updateMany({
      where: {
        candidateId: candidate.id,
        type: 'OFFER_FOLLOWUP',
        status: 'PENDING'
      },
      data: { status: 'CANCELLED' }
    });

    logger.info(`✅ Signed offer received from candidate: ${candidate.email}`);

    res.json({ 
      success: true, 
      message: 'Thank you! Your signed offer letter has been received.',
      data: {
        firstName: candidate.firstName,
        position: candidate.position,
        joiningDate: candidate.expectedJoiningDate
      }
    });
  } catch (error) {
    logger.error('Error processing signed offer upload:', error);
    res.status(500).json({ success: false, message: 'Upload failed. Please try again.' });
  }
});

// Accept offer (just confirmation, no file)
router.post('/offer/:token/accept', async (req, res) => {
  try {
    const { token } = req.params;
    const { accepted, declineReason } = req.body;

    const candidate = await req.prisma.candidate.findFirst({
      where: { 
        uploadToken: token,
        uploadTokenExpiry: { gte: new Date() }
      }
    });

    if (!candidate) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invalid or expired link' 
      });
    }

    if (accepted) {
      await req.prisma.candidate.update({
        where: { id: candidate.id },
        data: { status: 'OFFER_ACCEPTED' }
      });

      await req.prisma.activityLog.create({
        data: {
          candidateId: candidate.id,
          action: 'OFFER_ACCEPTED',
          description: 'Candidate accepted offer via portal'
        }
      });
    } else {
      await req.prisma.candidate.update({
        where: { id: candidate.id },
        data: { 
          status: 'REJECTED',
          notes: declineReason ? `Declined: ${declineReason}` : 'Candidate declined offer'
        }
      });

      await req.prisma.activityLog.create({
        data: {
          candidateId: candidate.id,
          action: 'OFFER_DECLINED',
          description: `Candidate declined offer: ${declineReason || 'No reason provided'}`
        }
      });
    }

    res.json({ 
      success: true, 
      message: accepted ? 'Offer accepted!' : 'Response recorded.' 
    });
  } catch (error) {
    logger.error('Error processing offer response:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Serve the candidate portal HTML page
router.get('/page/:token', async (req, res) => {
  const { token } = req.params;
  const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
  
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Iron Lady - Offer Response</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
  </style>
</head>
<body class="min-h-screen gradient-bg flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
    <div id="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading...</p>
    </div>
    
    <div id="content" class="hidden">
      <div class="text-center mb-6">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='45' fill='%23667eea'/%3E%3Ctext x='50' y='60' text-anchor='middle' fill='white' font-size='24' font-weight='bold'%3EIL%3C/text%3E%3C/svg%3E" 
             alt="Iron Lady" class="h-16 w-16 mx-auto mb-4">
        <h1 class="text-2xl font-bold text-gray-800">Iron Lady</h1>
        <p class="text-gray-500">Offer Response Portal</p>
      </div>
      
      <div id="candidate-info" class="bg-purple-50 rounded-lg p-4 mb-6">
        <p class="text-sm text-purple-600 font-medium">Welcome,</p>
        <p class="text-xl font-bold text-gray-800" id="candidate-name"></p>
        <p class="text-gray-600" id="candidate-position"></p>
      </div>
      
      <div id="upload-section">
        <h2 class="text-lg font-semibold mb-4">Upload Signed Offer Letter</h2>
        <p class="text-gray-600 text-sm mb-4">
          Please upload your signed offer letter. Accepted formats: PDF, Word, or Image.
        </p>
        
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors">
          <input type="file" id="fileInput" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" class="hidden">
          <label for="fileInput" class="cursor-pointer">
            <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <p class="mt-2 text-sm text-gray-600">Click to select file or drag and drop</p>
            <p class="text-xs text-gray-400 mt-1">Max 10MB</p>
          </label>
        </div>
        
        <div id="file-preview" class="hidden mt-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
          <span id="file-name" class="text-sm text-gray-700"></span>
          <button onclick="clearFile()" class="text-red-500 hover:text-red-700">✕</button>
        </div>
        
        <button id="uploadBtn" onclick="uploadFile()" disabled
                class="w-full mt-6 py-3 px-4 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
          Upload Signed Offer
        </button>
      </div>
      
      <div id="already-signed" class="hidden text-center py-8">
        <div class="text-6xl mb-4">✅</div>
        <h2 class="text-xl font-bold text-green-600 mb-2">Already Submitted!</h2>
        <p class="text-gray-600">Your signed offer letter has been received.</p>
        <p class="text-sm text-gray-500 mt-2">We'll be in touch with next steps soon!</p>
      </div>
      
      <div id="success" class="hidden text-center py-8">
        <div class="text-6xl mb-4">🎉</div>
        <h2 class="text-xl font-bold text-green-600 mb-2">Thank You!</h2>
        <p class="text-gray-600">Your signed offer letter has been received.</p>
        <p class="text-sm text-gray-500 mt-4">
          Expected joining date: <span id="joining-date" class="font-medium"></span>
        </p>
        <p class="text-sm text-gray-500 mt-2">
          You'll receive a welcome email one day before joining.
        </p>
      </div>
      
      <div id="error" class="hidden text-center py-8">
        <div class="text-6xl mb-4">❌</div>
        <h2 class="text-xl font-bold text-red-600 mb-2">Link Expired</h2>
        <p class="text-gray-600">This link is no longer valid.</p>
        <p class="text-sm text-gray-500 mt-2">Please contact HR for assistance.</p>
      </div>
    </div>
  </div>
  
  <script>
    const token = '${token}';
    const apiBase = '${baseUrl}';
    let selectedFile = null;
    
    async function init() {
      try {
        const response = await fetch(apiBase + '/api/portal/offer/' + token);
        const data = await response.json();
        
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('content').classList.remove('hidden');
        
        if (!data.success) {
          document.getElementById('error').classList.remove('hidden');
          document.getElementById('upload-section').classList.add('hidden');
          return;
        }
        
        if (data.alreadySigned) {
          document.getElementById('already-signed').classList.remove('hidden');
          document.getElementById('upload-section').classList.add('hidden');
          document.getElementById('candidate-name').textContent = data.data.firstName;
          return;
        }
        
        document.getElementById('candidate-name').textContent = 
          data.data.firstName + ' ' + data.data.lastName;
        document.getElementById('candidate-position').textContent = 
          data.data.position + ' • ' + data.data.department;
          
      } catch (error) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('content').classList.remove('hidden');
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('upload-section').classList.add('hidden');
      }
    }
    
    document.getElementById('fileInput').addEventListener('change', (e) => {
      selectedFile = e.target.files[0];
      if (selectedFile) {
        document.getElementById('file-name').textContent = selectedFile.name;
        document.getElementById('file-preview').classList.remove('hidden');
        document.getElementById('uploadBtn').disabled = false;
      }
    });
    
    function clearFile() {
      selectedFile = null;
      document.getElementById('fileInput').value = '';
      document.getElementById('file-preview').classList.add('hidden');
      document.getElementById('uploadBtn').disabled = true;
    }
    
    async function uploadFile() {
      if (!selectedFile) return;
      
      const btn = document.getElementById('uploadBtn');
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      
      const formData = new FormData();
      formData.append('signedOffer', selectedFile);
      
      try {
        const response = await fetch(apiBase + '/api/portal/offer/' + token + '/upload', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
          document.getElementById('upload-section').classList.add('hidden');
          document.getElementById('success').classList.remove('hidden');
          if (data.data?.joiningDate) {
            document.getElementById('joining-date').textContent = 
              new Date(data.data.joiningDate).toLocaleDateString('en-IN', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
              });
          }
        } else {
          alert(data.message || 'Upload failed');
          btn.disabled = false;
          btn.textContent = 'Upload Signed Offer';
        }
      } catch (error) {
        alert('Upload failed. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Upload Signed Offer';
      }
    }
    
    init();
  </script>
</body>
</html>
  `);
});

module.exports = router;
module.exports.generateUploadToken = generateUploadToken;
