# 🧪 Backend Testing Guide - Custom Form Fields

## 📋 What Was Added

### 1. **Database Schema Changes**
- ✅ New `CustomField` model in Prisma schema
- ✅ `customFields` JSON field added to `Candidate` model

### 2. **New API Endpoints**
- ✅ `GET /api/config/custom-fields` - Get all active custom fields
- ✅ `GET /api/config/custom-fields/all` - Get all custom fields (including inactive) - Admin only
- ✅ `POST /api/config/custom-fields` - Create new custom field - Admin only
- ✅ `PUT /api/config/custom-fields/:id` - Update custom field - Admin only
- ✅ `DELETE /api/config/custom-fields/:id` - Delete custom field - Admin only

### 3. **Updated Endpoints**
- ✅ `POST /api/candidates` - Now accepts `customFields` in request body
- ✅ `PUT /api/candidates/:id` - Now accepts `customFields` in request body

---

## 🚀 Deployment Steps on AWS

### Step 1: SSH into AWS Instance
```bash
ssh bitnami@43.204.155.68
```

### Step 2: Navigate to Backend Directory
```bash
cd ~/hr-onboarding-automation/backend
```

### Step 3: Pull Latest Changes
```bash
git pull origin main
```

### Step 4: Install Dependencies (if any new ones)
```bash
npm install
```

### Step 5: Update Database Schema
**⚠️ IMPORTANT: This will add new tables and fields**
```bash
npx prisma db push
```

You should see:
```
✔ Generated Prisma Client
✔ Database schema updated successfully
```

### Step 6: Restart Application
```bash
pm2 restart hr-onboarding-backend
```

### Step 7: Check Application Status
```bash
pm2 status
pm2 logs hr-onboarding-backend --lines 50
```

---

## 🧪 Testing the Backend

### Test 1: Check Database Schema
```bash
# SSH into your database (if using Neon or external DB)
# Or check via Prisma Studio
npx prisma studio
```

Verify:
- ✅ `CustomField` table exists
- ✅ `Candidate` table has `customFields` column (JSON type)

### Test 2: Create a Custom Field (via API)

**Using cURL:**
```bash
# First, get your auth token (login first)
TOKEN="your_jwt_token_here"

# Create a text field
curl -X POST https://hr-automation.iamironlady.com/api/config/custom-fields \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Emergency Contact",
    "fieldKey": "emergencyContact",
    "fieldType": "text",
    "placeholder": "Enter emergency contact name",
    "required": false,
    "order": 1
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "label": "Emergency Contact",
    "fieldKey": "emergencyContact",
    "fieldType": "text",
    "placeholder": "Enter emergency contact name",
    "required": false,
    "validation": null,
    "options": null,
    "order": 1,
    "isActive": true,
    "createdAt": "2025-01-XX...",
    "updatedAt": "2025-01-XX..."
  }
}
```

### Test 3: Create a Select Field
```bash
curl -X POST https://hr-automation.iamironlady.com/api/config/custom-fields \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Work Experience",
    "fieldKey": "workExperience",
    "fieldType": "select",
    "placeholder": "Select experience level",
    "required": true,
    "options": [
      {"label": "0-2 years", "value": "0-2"},
      {"label": "2-5 years", "value": "2-5"},
      {"label": "5-10 years", "value": "5-10"},
      {"label": "10+ years", "value": "10+"}
    ],
    "order": 2
  }'
```

### Test 4: Get All Custom Fields
```bash
curl -X GET https://hr-automation.iamironlady.com/api/config/custom-fields \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "label": "Emergency Contact",
      "fieldKey": "emergencyContact",
      "fieldType": "text",
      ...
    },
    {
      "id": "uuid-2",
      "label": "Work Experience",
      "fieldKey": "workExperience",
      "fieldType": "select",
      ...
    }
  ]
}
```

### Test 5: Create Candidate with Custom Fields
```bash
curl -X POST https://hr-automation.iamironlady.com/api/candidates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "phone": "+91 98765 43210",
    "position": "Software Engineer",
    "department": "Engineering",
    "expectedJoiningDate": "2025-02-01",
    "customFields": {
      "emergencyContact": "John Doe",
      "workExperience": "2-5"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "candidate-uuid",
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "customFields": {
      "emergencyContact": "John Doe",
      "workExperience": "2-5"
    },
    ...
  }
}
```

### Test 6: Update Candidate Custom Fields
```bash
curl -X PUT https://hr-automation.iamironlady.com/api/candidates/CANDIDATE_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customFields": {
      "emergencyContact": "Jane Doe",
      "workExperience": "5-10"
    }
  }'
```

### Test 7: Update Custom Field
```bash
curl -X PUT https://hr-automation.iamironlady.com/api/config/custom-fields/FIELD_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Emergency Contact (Updated)",
    "required": true
  }'
```

### Test 8: Delete Custom Field
```bash
curl -X DELETE https://hr-automation.iamironlady.com/api/config/custom-fields/FIELD_ID \
  -H "Authorization: Bearer $TOKEN"
```

---

## ✅ Testing Checklist

### Database
- [ ] `CustomField` table created successfully
- [ ] `Candidate.customFields` column added (JSON type)
- [ ] Can insert custom field records
- [ ] Can query custom fields

### API Endpoints
- [ ] `GET /api/config/custom-fields` - Returns active fields
- [ ] `GET /api/config/custom-fields/all` - Returns all fields (admin only)
- [ ] `POST /api/config/custom-fields` - Creates new field (admin only)
- [ ] `PUT /api/config/custom-fields/:id` - Updates field (admin only)
- [ ] `DELETE /api/config/custom-fields/:id` - Deletes field (admin only)
- [ ] `POST /api/candidates` - Accepts `customFields` JSON
- [ ] `PUT /api/candidates/:id` - Accepts `customFields` JSON

### Field Types Supported
- [ ] `text` - Text input
- [ ] `email` - Email input
- [ ] `phone` - Phone input
- [ ] `number` - Number input
- [ ] `date` - Date input
- [ ] `select` - Dropdown with options
- [ ] `textarea` - Multi-line text
- [ ] `file` - File upload (future)

### Validation
- [ ] Field key must be unique
- [ ] Field key must be alphanumeric + underscore only
- [ ] Required fields are enforced
- [ ] Options work for select fields

---

## 🐛 Troubleshooting

### Error: "Table 'CustomField' does not exist"
**Solution:** Run `npx prisma db push` again

### Error: "Column 'customFields' does not exist on 'Candidate'"
**Solution:** Run `npx prisma db push` again

### Error: "Prisma Client not generated"
**Solution:** Run `npx prisma generate`

### Error: "401 Unauthorized" on custom fields endpoints
**Solution:** Make sure you're logged in and using a valid JWT token. Custom field endpoints require admin access.

### Error: "Field key already exists"
**Solution:** Field keys must be unique. Use a different `fieldKey` value.

### Error: "Invalid field key format"
**Solution:** Field key must contain only letters, numbers, and underscores (e.g., `emergency_contact`, `workExperience`)

---

## 📝 Test Data Examples

### Example 1: Text Field
```json
{
  "label": "Previous Company",
  "fieldKey": "previousCompany",
  "fieldType": "text",
  "placeholder": "Enter previous company name",
  "required": false,
  "order": 1
}
```

### Example 2: Email Field
```json
{
  "label": "Alternate Email",
  "fieldKey": "alternateEmail",
  "fieldType": "email",
  "placeholder": "alternate@example.com",
  "required": false,
  "order": 2
}
```

### Example 3: Select Field
```json
{
  "label": "Education Level",
  "fieldKey": "educationLevel",
  "fieldType": "select",
  "placeholder": "Select education level",
  "required": true,
  "options": [
    {"label": "High School", "value": "high_school"},
    {"label": "Bachelor's", "value": "bachelors"},
    {"label": "Master's", "value": "masters"},
    {"label": "PhD", "value": "phd"}
  ],
  "order": 3
}
```

### Example 4: Date Field
```json
{
  "label": "Date of Birth",
  "fieldKey": "dateOfBirth",
  "fieldType": "date",
  "required": false,
  "order": 4
}
```

### Example 5: Number Field
```json
{
  "label": "Years of Experience",
  "fieldKey": "yearsOfExperience",
  "fieldType": "number",
  "placeholder": "Enter years",
  "required": false,
  "validation": {
    "min": 0,
    "max": 50
  },
  "order": 5
}
```

---

## 🎯 Next Steps After Testing

Once backend testing is complete:
1. ✅ Verify all endpoints work correctly
2. ✅ Test with different field types
3. ✅ Verify customFields are saved in Candidate records
4. ✅ Check database to ensure data is stored correctly

Then we'll proceed with:
- Frontend form builder UI in Settings
- Dynamic form rendering in NewCandidate.js
- Display custom fields in CandidateDetail.js

---

**Note:** If you encounter any issues during testing, check the PM2 logs:
```bash
pm2 logs hr-onboarding-backend --lines 100
```

