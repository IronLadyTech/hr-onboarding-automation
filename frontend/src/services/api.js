import axios from 'axios';
import toast from 'react-hot-toast';

// API Base URL - use environment variable or fallback to relative path
// If it's a full URL (starts with http), ensure it ends with /api
let API_URL = process.env.REACT_APP_API_URL || '/api';
if (API_URL.startsWith('http')) {
  // Remove trailing slash if present
  API_URL = API_URL.replace(/\/$/, '');
  // Append /api if not already present
  if (!API_URL.endsWith('/api')) {
    API_URL = `${API_URL}/api`;
  }
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || 'Something went wrong';
    
    // Only redirect to login on 401 if not already on login page and not checking auth
    if (error.response?.status === 401) {
      const isLoginPage = window.location.pathname === '/login';
      const isAuthCheck = error.config?.url?.includes('/auth/me') || error.config?.url?.includes('/auth/login');
      
      // Don't redirect if we're on login page or checking auth
      if (!isLoginPage && !isAuthCheck) {
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        // Use replace to avoid adding to history
        window.location.replace('/login');
      }
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    }
    
    return Promise.reject(error);
  }
);

// Candidate APIs
export const candidateApi = {
  getAll: (params) => api.get('/candidates', { params }),
  getById: (id) => api.get(`/candidates/${id}`),
  create: (data) => api.post('/candidates', data),
  update: (id, data) => api.put(`/candidates/${id}`, data),
  delete: (id) => api.delete(`/candidates/${id}`),
  
  // Step 1: Offer Letter
  uploadOffer: (id, formData) => api.post(`/candidates/${id}/offer-letter`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  sendOffer: (id) => api.post(`/candidates/${id}/send-offer`),
  
  // Step 2: Signed Offer (auto-reminder in scheduler)
  uploadSignedOffer: (id, formData) => api.post(`/candidates/${id}/signed-offer`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  sendOfferReminder: (id) => api.post(`/candidates/${id}/send-offer-reminder`),
  
  // Step 3: Welcome Email
  sendWelcomeEmail: (id) => api.post(`/candidates/${id}/welcome-email`),
  
  // Step 4: HR Induction
  scheduleHRInduction: (id, data) => api.post(`/candidates/${id}/schedule-hr-induction`, data),
  
  // Reschedule event
  rescheduleEvent: (eventId, data) => api.post(`/calendar/${eventId}/reschedule`, data),
  
  // Create generic calendar event
  createCalendarEvent: (data) => api.post('/calendar', data),
  
  // Step 5: WhatsApp Groups
  sendWhatsAppGroups: (id) => api.post(`/candidates/${id}/send-whatsapp-groups`),
  completeWhatsApp: (id, data) => api.post(`/candidates/${id}/whatsapp-complete`, data),
  
  // Step 6: Onboarding Form
  sendOnboardingForm: (id) => api.post(`/candidates/${id}/onboarding-form`),
  
  // Step 7: Form Completion
  markFormCompleted: (id) => api.post(`/candidates/${id}/form-completed`),
  
  // Step 8: CEO Induction
  scheduleCEOInduction: (id, data) => api.post(`/candidates/${id}/schedule-ceo-induction`, data),
  
  // Step 9: Sales Induction
  scheduleSalesInduction: (id, data) => api.post(`/candidates/${id}/schedule-sales-induction`, data),
  
  // Step 10: Training Plan
  sendTrainingPlan: (id) => api.post(`/candidates/${id}/send-training-plan`),
  
  // Step 11: Check-in Call
  scheduleCheckIn: (id, data) => api.post(`/candidates/${id}/schedule-checkin`, data),
  
  // Workflow Status
  getWorkflow: (id) => api.get(`/candidates/${id}/workflow`),
  
  // Joining
  confirmJoining: (id, data) => api.post(`/candidates/${id}/confirm-joining`, data),
  markJoined: (id) => api.post(`/candidates/${id}/mark-joined`),
  
  // Batch operations
  batchSchedule: (data) => api.post('/candidates/batch/schedule', data),
  
  // Complete step
  completeStep: (id, stepNumber) => api.post(`/candidates/${id}/complete-step`, { stepNumber }),
  
  // Initialize department tasks
  initDepartmentTasks: (data) => api.post('/candidates/init-department-tasks', data)
};

// Email APIs
export const emailApi = {
  getAll: (params) => api.get('/emails', { params }),
  getById: (id) => api.get(`/emails/${id}`),
  send: (data) => api.post('/emails/send', data),
  schedule: (data) => api.post('/emails/schedule', data),
  resend: (id) => api.post(`/emails/${id}/resend`),
  cancel: (id) => api.delete(`/emails/${id}/cancel`),
  getStats: () => api.get('/emails/stats/overview')
};

// Template APIs
export const templateApi = {
  getAll: (params) => api.get('/templates', { params }),
  getById: (id) => api.get(`/templates/${id}`),
  getByType: (type) => api.get(`/templates/type/${type}`),
  create: (data) => api.post('/templates', data),
  update: (id, data) => api.put(`/templates/${id}`, data),
  delete: (id) => api.delete(`/templates/${id}`),
  preview: (id, data) => api.post(`/templates/${id}/preview`, data),
  getPlaceholders: () => api.get('/templates/meta/placeholders'),
  initDefaults: () => api.post('/templates/init/defaults')
};

// Calendar APIs
export const calendarApi = {
  getAll: (params) => api.get('/calendar', { params }),
  getById: (id) => api.get(`/calendar/${id}`),
  getToday: () => api.get('/calendar/today'),
  getUpcoming: (days) => api.get('/calendar/upcoming', { params: { days } }),
  create: (data) => {
    // If FormData, don't set Content-Type header (browser will set it with boundary)
    // This handles both single attachment ('attachment') and multiple attachments ('attachments')
    if (data instanceof FormData) {
      return api.post('/calendar', data, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
    }
    return api.post('/calendar', data);
  },
  update: (id, data) => api.put(`/calendar/${id}`, data),
  reschedule: (id, data) => api.post(`/calendar/${id}/reschedule`, data),
  cancel: (id, data) => api.post(`/calendar/${id}/cancel`, data),
  complete: (id, data) => api.post(`/calendar/${id}/complete`, data),
  getStats: () => api.get('/calendar/stats/overview')
};

// Task APIs
export const taskApi = {
  getAll: (params) => api.get('/tasks', { params }),
  getMyTasks: () => api.get('/tasks/my-tasks'),
  getOverdue: () => api.get('/tasks/overdue'),
  getToday: () => api.get('/tasks/today'),
  getById: (id) => api.get(`/tasks/${id}`),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  complete: (id, data) => api.post(`/tasks/${id}/complete`, data),
  snooze: (id, data) => api.post(`/tasks/${id}/snooze`, data),
  cancel: (id, data) => api.post(`/tasks/${id}/cancel`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
  getStats: () => api.get('/tasks/stats/overview')
};

// Dashboard APIs
export const dashboardApi = {
  getOverview: () => api.get('/dashboard/overview'),
  getPipeline: () => api.get('/dashboard/pipeline'),
  getActivity: (limit) => api.get('/dashboard/activity', { params: { limit } }),
  getMetrics: (period) => api.get('/dashboard/metrics', { params: { period } }),
  getJoiningCalendar: (month) => api.get('/dashboard/joining-calendar', { params: { month } })
};

// Config APIs
// Config APIs
export const configApi = {
  getWorkflow: () => api.get('/config/workflow'),
  updateWorkflow: (data) => api.put('/config/workflow', data),
  getWhatsAppGroups: () => api.get('/config/whatsapp-groups'),
  createWhatsAppGroup: (data) => api.post('/config/whatsapp-groups', data),
  updateWhatsAppGroup: (id, data) => api.put(`/config/whatsapp-groups/${id}`, data),
  deleteWhatsAppGroup: (id) => api.delete(`/config/whatsapp-groups/${id}`),
  getTrainingPlans: () => api.get('/config/training-plans'),
  createTrainingPlan: (data) => api.post('/config/training-plans', data),
  getDepartments: () => api.get('/config/departments'),
  createDepartment: (data) => api.post('/config/departments', data),
  updateDepartment: (oldName, data) => api.put(`/config/departments/${encodeURIComponent(oldName)}`, data),
  deleteDepartment: (name) => api.delete(`/config/departments/${encodeURIComponent(name)}`),
  getSettings: () => api.get('/config/settings'),
  initWorkflow: () => api.post('/config/workflow/init'),
  initTrainingPlans: () => api.post('/config/training-plans/init'),
  
  // Department Step Templates
  getDepartmentSteps: (department) => api.get(`/config/department-steps/${department}`),
  createDepartmentStep: (data) => api.post('/config/department-steps', data),
  updateDepartmentStep: (id, data) => api.put(`/config/department-steps/${id}`, data),
  deleteDepartmentStep: (id) => api.delete(`/config/department-steps/${id}`),
  initDefaultSteps: (department) => api.post(`/config/department-steps/init-defaults/${department}`)
};

export default api;
