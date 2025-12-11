# 📋 Requirements Review & Implementation Plan

## User Requirements Analysis

### ✅ **Requirement 1: UI Customization Section in Settings**

**Current State:**
- ✅ Company name exists in Settings (configurable)
- ❌ Company name NOT used everywhere (hardcoded "Iron Lady" in many places)
- ❌ No logo upload functionality
- ❌ UI colors hardcoded (indigo/purple theme)
- ❌ No theme customization UI

**What Needs to Be Done:**

#### 1.1 Company Name Customization
**Frontend:**
- ✅ Already has input field in Settings → Company tab
- ❌ Need to use `config.company_name` in all UI components
- ❌ Replace hardcoded "Iron Lady" in:
  - `Layout.js` (sidebar logo)
  - `Login.js` (login page title)
  - All other components

**Backend:**
- ✅ Already stored in database (`WorkflowConfig` table)
- ❌ Need to use `config.company_name` in all email templates, placeholders
- ❌ Replace hardcoded "Iron Lady" in:
  - `emailService.js` (placeholders)
  - `calendarService.js` (descriptions)
  - `candidate-portal.js` (HTML template)
  - All other services

**Database:**
- ✅ Already has `company_name` in `WorkflowConfig`
- ✅ No schema changes needed

---

#### 1.2 Company Logo Upload
**Frontend:**
- ❌ Add logo upload component in Settings → UI Customization
- ❌ Display logo in sidebar (`Layout.js`)
- ❌ Display logo in login page (`Login.js`)
- ❌ Display logo in candidate portal (if applicable)
- ❌ Display logo in email signatures (HTML emails)

**Backend:**
- ❌ Add logo upload endpoint (`POST /api/config/logo`)
- ❌ Store logo file in `uploads/company-logo/`
- ❌ Store logo path in database (`WorkflowConfig` table, new key: `company_logo_path`)
- ❌ Serve logo via static file route (`/api/uploads/company-logo/...`)
- ❌ Return logo URL in settings API response

**Database:**
- ✅ Can use existing `WorkflowConfig` table
- ✅ Add new config key: `company_logo_path`

**Questions:**
- Should logo be required or optional?
- What file formats? (PNG, JPG, SVG recommended)
- Max file size? (2MB recommended)
- Should there be logo dimensions/ratio requirements?

---

#### 1.3 UI Color Customization
**Frontend:**
- ❌ Add color pickers in Settings → UI Customization
- ❌ Store colors in database
- ❌ Apply colors dynamically via CSS variables or Tailwind config
- ❌ Update all hardcoded color classes to use dynamic values

**Backend:**
- ❌ Store color values in `WorkflowConfig` table
- ❌ Return colors in settings API response

**Database:**
- ✅ Can use existing `WorkflowConfig` table
- ✅ Add config keys:
  - `ui_primary_color` (default: #4F46E5 - indigo)
  - `ui_secondary_color` (default: #7C3AED - purple)
  - `ui_accent_color` (optional)

**Implementation Approach:**
- Option A: Use CSS variables (recommended)
  - Store hex colors in database
  - Inject CSS variables in `index.html` or via inline styles
  - Update Tailwind config to use CSS variables
- Option B: Generate dynamic CSS file
  - Create CSS file on-the-fly based on stored colors
  - Serve via API endpoint

**Questions:**
- Should we allow full color customization or preset themes?
- Should colors be applied immediately or require page refresh?
- Do we need dark mode support?

---

### ✅ **Requirement 2: Department Management Section**

**Current State:**
- ✅ Departments are fetched from candidates (`GET /api/config/departments`)
- ❌ Hardcoded default departments in code
- ❌ No way to create/delete departments via UI
- ❌ Departments are just strings, not a proper entity

**What Needs to Be Done:**

#### 2.1 Department Management UI
**Frontend:**
- ❌ Add "Departments" tab in Settings
- ❌ List all departments with delete button
- ❌ Add "Create Department" form
- ❌ Show department usage count (how many candidates use it)
- ❌ Prevent deletion if department is in use

**Backend:**
- ✅ Already has `GET /api/config/departments` endpoint
- ❌ Add `POST /api/config/departments` (create)
- ❌ Add `DELETE /api/config/departments/:name` (delete)
- ❌ Add validation: check if department is in use before deletion

**Database:**
- **Option A (Recommended):** Create `Department` model
  ```prisma
  model Department {
    id          String   @id @default(uuid())
    name        String   @unique
    description String?
    isActive    Boolean  @default(true)
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt
    
    candidates  Candidate[]
  }
  ```
  - Change `Candidate.department` from `String` to relation
  - Migration required (data migration needed)
  
- **Option B (Simpler):** Keep as string, manage via `WorkflowConfig`
  - Store departments as JSON array in config
  - Less robust, but no migration needed

**Questions:**
- Should departments be soft-deleted or hard-deleted?
- Should we allow editing department names? (would require updating all candidates)
- Do we need department descriptions/metadata?

---

### ✅ **Requirement 3: Customizable Candidate Form**

**Current State:**
- ❌ Form has fixed fields (firstName, lastName, email, phone, position, department, salary, reportingManager, expectedJoiningDate, notes)
- ❌ Backend validation is hardcoded
- ❌ Database schema is fixed

**What Needs to Be Done:**

#### 3.1 Custom Fields System
**Frontend:**
- ❌ Create "Form Builder" UI in Settings
- ❌ Drag-and-drop or form-based field builder
- ❌ Support field types: text, email, phone, number, date, select, textarea, file
- ❌ Field properties: label, placeholder, required, validation rules, default value
- ❌ Field ordering/reordering
- ❌ Preview form before saving
- ❌ Dynamically render form in `NewCandidate.js` based on field definitions

**Backend:**
- ❌ Create `CustomField` model
  ```prisma
  model CustomField {
    id          String   @id @default(uuid())
    name        String   // Internal field name (e.g., "custom_field_1")
    label       String   // Display label
    type        String   // text, email, phone, number, date, select, textarea, file
    isRequired  Boolean  @default(false)
    placeholder String?
    options     Json?    // For select fields: ["Option 1", "Option 2"]
    validation  Json?    // { min: 0, max: 100, pattern: "..." }
    order       Int      @default(0)
    isActive    Boolean  @default(true)
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt
    
    values      CandidateCustomFieldValue[]
  }
  
  model CandidateCustomFieldValue {
    id          String   @id @default(uuid())
    candidateId String
    fieldId     String
    value       String   @db.Text
    
    candidate   Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
    field       CustomField @relation(fields: [fieldId], references: [id])
    
    @@unique([candidateId, fieldId])
  }
  ```
- ❌ Add `Candidate.customFieldValues` relation
- ❌ Dynamic validation based on field definitions
- ❌ Store custom field values separately (not in Candidate model)

**Alternative Approach (Simpler):**
- Store custom fields as JSON in `Candidate` model
  ```prisma
  model Candidate {
    // ... existing fields
    customFields Json? // { "field1": "value1", "field2": "value2" }
  }
  ```
- Less flexible but easier to implement
- No separate table needed

**Questions:**
- Should we keep standard fields (firstName, lastName, email) as required, or make everything customizable?
- Do we need field-level permissions (some fields only visible to certain roles)?
- Should custom fields be department-specific?
- Do we need field dependencies/conditional logic?

---

### ✅ **Requirement 4: Attachment Logic for All Steps**

**Current State:**
- ✅ Calendar events support attachments (`attachmentPath` field)
- ✅ `stepService.completeStep` searches for calendar event with attachment
- ✅ `sendUniversalEmail` accepts and processes `attachmentPath`
- ⚠️ **ISSUE:** Attachment search logic might not work for newly created custom steps

**Problem Analysis:**

Looking at `stepService.js` (lines 182-224):
1. It determines `eventTypeToSearch` from `stepTemplate.type` or hardcoded map
2. Searches for calendar event with matching `type` and `stepNumber`
3. If found, uses `calendarEvent.attachmentPath`

**Potential Issues:**
1. **New custom steps:** If step type is `CUSTOM` or `MANUAL`, the `eventTypeToSearch` might be `CUSTOM`, but calendar event type might be different
2. **Type mismatch:** Calendar event `type` might not match step template `type` for custom steps
3. **Scheduler logic:** Need to verify scheduler also passes attachment correctly

**What Needs to Be Done:**

#### 4.1 Fix Attachment Logic
**Backend:**
- ✅ Verify `stepService.completeStep` correctly finds attachments for all step types
- ⚠️ **Fix:** Ensure `eventTypeToSearch` logic works for custom steps
- ⚠️ **Fix:** When creating calendar event, ensure `type` matches what `stepService` expects
- ✅ Verify `scheduler.js` passes `attachmentPath` to `stepService.completeStep`
- ✅ Verify `sendUniversalEmail` correctly processes attachments

**Key Fixes Needed:**
1. In `stepService.js`, improve `eventTypeToSearch` logic:
   - For custom steps, search by `stepNumber` only (not type)
   - Or ensure calendar event type matches step template type exactly

2. In `calendar.js`, when creating event:
   - Ensure `type` field matches `stepTemplate.type` if stepNumber is provided
   - For custom steps, use `CUSTOM` or step-specific type

3. In `scheduler.js`:
   - Verify it correctly finds calendar events with attachments
   - Ensure it passes `attachmentPath` when calling `stepService.completeStep`

**Questions:**
- Should attachments be required for certain step types?
- Should we support multiple attachments per step?
- Should attachments be stored per step or per calendar event?

---

## 🎯 Implementation Priority

### **Phase 1: Critical Fixes (Week 1)**
1. ✅ Fix attachment logic for all steps (Requirement 4)
2. ✅ Replace all hardcoded "Iron Lady" with `config.company_name` (Requirement 1.1)

### **Phase 2: UI Customization (Week 2)**
3. ✅ Logo upload functionality (Requirement 1.2)
4. ✅ UI color customization (Requirement 1.3)

### **Phase 3: Department Management (Week 3)**
5. ✅ Department CRUD operations (Requirement 2)

### **Phase 4: Custom Fields (Week 4+)**
6. ✅ Custom candidate form fields (Requirement 3)

---

## ❓ Questions for User

### **UI Customization:**
1. **Logo:**
   - Required or optional?
   - File formats? (PNG, JPG, SVG)
   - Max file size?
   - Dimensions/ratio requirements?

2. **Colors:**
   - Full customization or preset themes?
   - Apply immediately or require refresh?
   - Need dark mode?

### **Department Management:**
3. **Departments:**
   - Soft-delete or hard-delete?
   - Allow editing names? (would update all candidates)
   - Need descriptions/metadata?

### **Custom Fields:**
4. **Form Fields:**
   - Keep standard fields (firstName, lastName, email) as required?
   - Need field-level permissions?
   - Department-specific fields?
   - Field dependencies/conditional logic?

5. **Storage:**
   - Separate table (more flexible) or JSON in Candidate (simpler)?

### **Attachments:**
6. **Attachments:**
   - Required for certain step types?
   - Support multiple attachments?
   - Store per step or per calendar event?

---

## 📝 Recommendations

### **1. Company Name (Requirement 1.1)**
✅ **Recommendation:** Use `config.company_name` everywhere with fallback chain:
- Database config → Environment variable → 'Company'
- This ensures it works even if config is missing

### **2. Logo Upload (Requirement 1.2)**
✅ **Recommendation:**
- Store in `uploads/company-logo/`
- Support PNG, JPG, SVG (max 2MB)
- Optional (show placeholder if not set)
- Display in sidebar, login, emails

### **3. UI Colors (Requirement 1.3)**
✅ **Recommendation:**
- Use CSS variables approach
- Store hex colors in database
- Apply via inline styles or dynamic CSS
- Preset themes + custom option

### **4. Departments (Requirement 2)**
✅ **Recommendation:**
- Create `Department` model (proper entity)
- Soft-delete (isActive flag)
- Show usage count before deletion
- Prevent deletion if in use

### **5. Custom Fields (Requirement 3)**
✅ **Recommendation:**
- Start with JSON approach (simpler)
- Keep standard fields required
- Add separate table later if needed
- Support common field types first

### **6. Attachments (Requirement 4)**
✅ **Recommendation:**
- Fix search logic to work for all step types
- Search by `stepNumber` primarily, `type` as fallback
- Ensure calendar event type matches step type
- Support single attachment per step (can extend later)

---

## 🚀 Next Steps

1. **User Review:** Review this document and answer questions
2. **Clarifications:** Discuss any unclear requirements
3. **Implementation:** Start with Phase 1 (critical fixes)
4. **Iterative Development:** Implement phase by phase with testing

---

*Generated: $(date)*
*Review Version: 1.0*

