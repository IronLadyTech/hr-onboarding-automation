import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { candidateApi, calendarApi, configApi } from '../services/api';
import toast from 'react-hot-toast';

// Helper function to format time (HH:mm to 12-hour format)
const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

const statusColors = {
  OFFER_PENDING: 'bg-gray-100 text-gray-800',
  OFFER_SENT: 'bg-yellow-100 text-yellow-800',
  OFFER_VIEWED: 'bg-yellow-100 text-yellow-800',
  OFFER_SIGNED: 'bg-blue-100 text-blue-800',
  JOINING_PENDING: 'bg-blue-100 text-blue-800',
  READY_TO_JOIN: 'bg-indigo-100 text-indigo-800',
  JOINED: 'bg-green-100 text-green-800',
  ONBOARDING: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-green-100 text-green-800',
  WITHDRAWN: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800'
};

const CandidateDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [scheduleDuration, setScheduleDuration] = useState(60);
  const [editingEventId, setEditingEventId] = useState(null);
  const [scheduleMode, setScheduleMode] = useState('exact'); // 'exact', 'doj', or 'offerLetter'
  const [scheduleOffsetDays, setScheduleOffsetDays] = useState(0); // Days offset for DOJ or Offer Letter Date
  const [scheduleOffsetTime, setScheduleOffsetTime] = useState('09:00'); // Time for offset calculation
  const [scheduleAttachment, setScheduleAttachment] = useState(null);
  const [scheduleAttachments, setScheduleAttachments] = useState([]); // Multiple attachments (new files)
  const [existingAttachmentPaths, setExistingAttachmentPaths] = useState([]); // Existing attachment paths from event
  const [scheduleAttachmentPreview, setScheduleAttachmentPreview] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingStep, setPendingStep] = useState(null);
  const [departmentSteps, setDepartmentSteps] = useState([]);
  const [schedulingStepType, setSchedulingStepType] = useState(null);
  const [schedulingStepNumber, setSchedulingStepNumber] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCandidate();
  }, [id]);

  useEffect(() => {
    if (candidate?.department) {
      fetchDepartmentSteps();
    }
  }, [candidate?.department]);

  const fetchCandidate = async () => {
    try {
      const response = await candidateApi.getById(id);
      setCandidate(response.data.data);
    } catch (error) {
      toast.error('Failed to load candidate');
      navigate('/candidates');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartmentSteps = async () => {
    if (!candidate?.department) return;
    try {
      const response = await configApi.getDepartmentSteps(candidate.department);
      const steps = response.data.data || [];
      // Sort by stepNumber
      steps.sort((a, b) => a.stepNumber - b.stepNumber);
      setDepartmentSteps(steps);
    } catch (error) {
      // If no steps found, use empty array (will fall back to default behavior)
      setDepartmentSteps([]);
    }
  };

  const getFullName = () => {
    if (!candidate) return '';
    return `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim();
  };

  const getInitials = () => {
    if (!candidate) return '';
    const first = candidate.firstName ? candidate.firstName.charAt(0) : '';
    const last = candidate.lastName ? candidate.lastName.charAt(0) : '';
    return (first + last).toUpperCase() || '?';
  };

  // Helper function to update attachment preview (existing + new files)
  const updateAttachmentPreview = (existingFileNames, newFiles) => {
    const allFileNames = [...existingFileNames, ...newFiles.map(f => f.name)];
    if (allFileNames.length > 0) {
      const previewText = allFileNames.length > 3 
        ? `${allFileNames.slice(0, 3).join(', ')}... (${allFileNames.length} files)`
        : allFileNames.join(', ');
      setScheduleAttachmentPreview(previewText);
    } else {
      setScheduleAttachmentPreview(null);
    }
  };

  const handleSendClick = (stepNumber) => {
    setPendingStep(stepNumber);
    setPendingAction('send');
    setShowConfirmDialog(true);
  };

  const handleConfirmAction = async () => {
    if (!pendingStep) return;
    
    setShowConfirmDialog(false);
    setActionLoading(`completeStep${pendingStep}`);
    
    try {
      // Complete step (backend will send email if needed and mark as completed)
      await candidateApi.completeStep(id, pendingStep);
      toast.success(`Step ${pendingStep} completed! Email sent to candidate.`);
      fetchCandidate();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to complete step');
    } finally {
      setActionLoading('');
      setPendingStep(null);
      setPendingAction(null);
    }
  };

  const handleDeleteCandidate = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteCandidate = async () => {
    setDeleting(true);
    try {
      await candidateApi.delete(id);
      toast.success('Candidate deleted successfully');
      navigate('/candidates');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete candidate');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Auto-schedule Offer Reminder when offer letter is sent/scheduled
  const autoScheduleOfferReminder = async () => {
    try {
      // Find Offer Reminder step template
      const offerReminderStep = departmentSteps.find(s => s.type === 'OFFER_REMINDER');
      if (!offerReminderStep) return;
      
      // Check if already scheduled
      const existingEvent = candidate.scheduledEvents?.find(e => e.type === 'OFFER_REMINDER');
      if (existingEvent) return;
      
      // Get offer letter date (from scheduled event or sent date)
      const offerLetterEvent = candidate.scheduledEvents?.find(e => e.type === 'OFFER_LETTER' && e.status !== 'COMPLETED');
      const offerLetterDate = offerLetterEvent?.startTime || candidate.offerSentAt || new Date();
      
      // Calculate date using step template's dueDateOffset and scheduledTime
      const offerDate = new Date(offerLetterDate);
      const reminderDate = new Date(offerDate);
      const offset = offerReminderStep.dueDateOffset !== undefined ? offerReminderStep.dueDateOffset : 1; // Default to 1 day
      reminderDate.setDate(reminderDate.getDate() + offset);
      
      // Use step template's scheduledTime (should be '14:00' for 2:00 PM)
      if (offerReminderStep.scheduledTime) {
        const [hours, minutes] = offerReminderStep.scheduledTime.split(':');
        reminderDate.setHours(parseInt(hours) || 14, parseInt(minutes) || 0, 0, 0);
      } else {
        reminderDate.setHours(14, 0, 0, 0); // Fallback to 2:00 PM
      }
      
      // Convert to UTC for backend (IST is UTC+5:30)
      const istOffset = 5.5 * 60 * 60 * 1000;
      const startTime = new Date(reminderDate.getTime() - istOffset);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 15); // 15 minutes duration
      
      // Create the reminder event
      const formData = new FormData();
      formData.append('candidateId', id);
      formData.append('type', 'OFFER_REMINDER');
      formData.append('stepNumber', offerReminderStep.stepNumber.toString());
      const replacePlaceholders = (text) => {
        if (!text) return '';
        return text
          .replace(/{{firstName}}/g, candidate.firstName || '')
          .replace(/{{lastName}}/g, candidate.lastName || '')
          .replace(/{{position}}/g, candidate.position || '')
          .replace(/{{department}}/g, candidate.department || '');
      };
      formData.append('title', replacePlaceholders(offerReminderStep.title));
      formData.append('description', replacePlaceholders(offerReminderStep.description || 'Auto-scheduled offer reminder'));
      formData.append('startTime', startTime.toISOString());
      formData.append('endTime', endTime.toISOString());
      formData.append('attendees', JSON.stringify([candidate.email]));
      
      await calendarApi.create(formData);
      toast.success('Offer Reminder auto-scheduled for next day at 2:00 PM!');
      // Refresh candidate data to show the new event
      fetchCandidate();
    } catch (error) {
      console.error('Failed to auto-schedule offer reminder:', error);
      // Don't show error to user - this is automatic
    }
  };

  const handleAction = async (action, data = {}) => {
    setActionLoading(action);
    try {
      switch (action) {
        case 'sendOffer':
          await candidateApi.sendOffer(id);
          toast.success('Step 1: Offer letter sent!');
          // Auto-schedule Offer Reminder for next day at 2:00 PM
          await autoScheduleOfferReminder();
          break;
        case 'sendOfferReminder':
          await candidateApi.sendOfferReminder(id);
          toast.success('Step 2: Offer reminder sent!');
          break;
        case 'sendWelcome':
          await candidateApi.sendWelcomeEmail(id);
          toast.success('Step 3: Welcome email sent!');
          break;
        case 'sendForm':
          await candidateApi.sendOnboardingForm(id);
          toast.success('Step 6: Onboarding form sent!');
          break;
        case 'markFormComplete':
          await candidateApi.markFormCompleted(id);
          toast.success('Step 7: Form marked as completed!');
          break;
        case 'scheduleHRInduction':
        case 'scheduleCEOInduction':
        case 'scheduleSalesInduction':
        case 'scheduleCheckin':
          // Convert to generic calendar event creation to support attachments universally
          // Extract values from FormData or regular object
          let hrEventId, hrDateTime, hrDuration;
          if (data instanceof FormData) {
            hrEventId = data.get('eventId');
            hrDateTime = data.get('dateTime');
            hrDuration = parseInt(data.get('duration') || '60');
          } else {
            hrEventId = data.eventId;
            hrDateTime = data.dateTime || data.startTime;
            hrDuration = data.duration || 60;
          }
          
          if (hrEventId) {
            await candidateApi.rescheduleEvent(hrEventId, data);
            toast.success('Event rescheduled!');
          } else {
            if (!hrDateTime) {
              toast.error('Date and time are required');
              return;
            }
            
            // Use generic calendar API which supports attachments
            const eventTypeMap = {
              'scheduleHRInduction': 'HR_INDUCTION',
              'scheduleCEOInduction': 'CEO_INDUCTION',
              'scheduleSalesInduction': 'SALES_INDUCTION',
              'scheduleCheckin': 'CHECKIN_CALL'
            };
            const eventType = eventTypeMap[action] || 'CUSTOM';
            
            // Get title and description from step template
            const stepTemplate = departmentSteps.find(s => s.type === eventType);
            const replacePlaceholders = (text) => {
              if (!text) return '';
              return text
                .replace(/{{firstName}}/g, candidate.firstName || '')
                .replace(/{{lastName}}/g, candidate.lastName || '')
                .replace(/{{position}}/g, candidate.position || '')
                .replace(/{{department}}/g, candidate.department || '');
            };
            
            let title = `${eventType.replace(/_/g, ' ')} - ${candidate.firstName} ${candidate.lastName}`;
            let description = `Calendar event scheduled for ${candidate.firstName} ${candidate.lastName}`;
            
            if (stepTemplate) {
              title = replacePlaceholders(stepTemplate.title);
              description = replacePlaceholders(stepTemplate.description || description);
            }
            
            // Parse datetime-local as IST (UTC+5:30) - India timezone
            // datetime-local input doesn't include timezone, so we treat it as IST
            const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30 in milliseconds
            const localDate = new Date(hrDateTime);
            // Create date in IST by subtracting the offset, then add it back when converting to UTC
            const startTime = new Date(localDate.getTime() - istOffset);
            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + hrDuration);
            
            // Extract data from FormData if needed
            let requestData;
            if (data instanceof FormData) {
              // Create new FormData with all required fields
              requestData = new FormData();
              // Copy existing FormData entries (including attachment)
              for (let [key, value] of data.entries()) {
                requestData.append(key, value);
              }
              // Add/update required fields
              requestData.set('candidateId', id);
              requestData.set('type', eventType);
              requestData.set('title', title);
              requestData.set('description', description);
              requestData.set('startTime', startTime.toISOString());
              requestData.set('endTime', endTime.toISOString());
              requestData.set('attendees', JSON.stringify([candidate.email]));
            } else {
              requestData = { 
                ...data, 
                candidateId: id, 
                type: eventType,
                title: title,
                description: description,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                attendees: [candidate.email]
              };
            }
            
            await calendarApi.create(requestData);
            toast.success('Event scheduled!');
          }
          break;
        case 'sendTrainingPlan':
          await candidateApi.sendTrainingPlan(id);
          toast.success('Step 10: Training plan sent!');
          break;
        case 'scheduleOfferLetter':
        case 'scheduleOfferReminder':
        case 'scheduleWelcomeEmail':
        case 'scheduleWhatsAppTask':
        case 'scheduleOnboardingForm':
        case 'scheduleFormReminder':
        case 'scheduleTrainingPlan':
        case 'scheduleGeneric':
          // Generic calendar event creation for other steps
          // Extract values from FormData or regular object
          let dateTime, duration, eventId, eventTypeFromData;
          if (data instanceof FormData) {
            dateTime = data.get('dateTime');
            duration = parseInt(data.get('duration') || '30');
            eventId = data.get('eventId');
            eventTypeFromData = data.get('eventType');
          } else {
            dateTime = data.dateTime;
            duration = data.duration || 30;
            eventId = data.eventId;
            eventTypeFromData = data.eventType;
          }
          
          if (eventId) {
            await candidateApi.rescheduleEvent(eventId, data);
            toast.success('Event rescheduled!');
          } else {
            if (!dateTime) {
              toast.error('Date and time are required');
              return;
            }
            
            // Parse datetime-local as IST (UTC+5:30) - India timezone
            // datetime-local input doesn't include timezone, so we treat it as IST
            const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30 in milliseconds
            const localDate = new Date(dateTime);
            // Create date in IST by subtracting the offset, then add it back when converting to UTC
            const startTime = new Date(localDate.getTime() - istOffset);
            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + duration);
            
            // Map schedule action names to event types
            const eventTypeMap = {
              'scheduleOfferLetter': 'OFFER_LETTER',
              'scheduleOfferReminder': 'OFFER_REMINDER',
              'scheduleWelcomeEmail': 'WELCOME_EMAIL',
              'scheduleWhatsAppTask': 'WHATSAPP_TASK',
              'scheduleOnboardingForm': 'ONBOARDING_FORM',
              'scheduleFormReminder': 'FORM_REMINDER',
              'scheduleTrainingPlan': 'TRAINING_PLAN',
              'scheduleHRInduction': 'HR_INDUCTION',
              'scheduleCEOInduction': 'CEO_INDUCTION',
              'scheduleSalesInduction': 'SALES_INDUCTION',
              'scheduleCheckin': 'CHECKIN_CALL'
            };
            
            // Get event type from data.eventType first (most reliable), then from action name
            let eventType = eventTypeFromData || eventTypeMap[showScheduleModal];
            
            // If eventType not found, try to get it from the step template based on the action
            if (!eventType) {
              // Try to find step by matching the schedule action to step type
              const actionToTypeMap = {
                'scheduleHRInduction': 'HR_INDUCTION',
                'scheduleCEOInduction': 'CEO_INDUCTION',
                'scheduleSalesInduction': 'SALES_INDUCTION',
                'scheduleCheckin': 'CHECKIN_CALL'
              };
              const mappedType = actionToTypeMap[showScheduleModal];
              if (mappedType) {
                const stepTemplate = departmentSteps.find(s => s.type === mappedType);
                if (stepTemplate) {
                  eventType = stepTemplate.type;
                } else {
                  eventType = mappedType;
                }
              }
            }
            
            // If still no eventType, use CUSTOM as fallback
            if (!eventType) {
              eventType = 'CUSTOM';
            }
            
            // Find step number from data first (most reliable)
            let stepNumber = null;
            if (data instanceof FormData) {
              stepNumber = data.get('stepNumber');
            } else {
              stepNumber = data.stepNumber;
            }
            
            // Find the step template to get title and description
            // If stepNumber is available, use it to find the exact step (handles multiple steps with same type)
            let stepTemplate = null;
            if (stepNumber) {
              stepTemplate = departmentSteps.find(s => s.stepNumber === parseInt(stepNumber));
            }
            // Fallback: find by type if stepNumber not available
            if (!stepTemplate) {
              stepTemplate = departmentSteps.find(s => s.type === eventType);
            }
            
            let title = `${eventType.replace(/_/g, ' ')} - ${candidate.firstName} ${candidate.lastName}`;
            let description = `Calendar event scheduled for ${candidate.firstName} ${candidate.lastName}`;
            
            if (stepTemplate) {
              title = replacePlaceholders(stepTemplate.title);
              description = replacePlaceholders(stepTemplate.description || description);
              // If stepNumber wasn't in data, get it from step template
              if (!stepNumber) {
                stepNumber = stepTemplate.stepNumber;
              }
            }
            
            // Check if data is FormData (has attachment) or regular object
            let requestData;
            if (data instanceof FormData) {
              // If FormData, create a new one with all required fields
              requestData = new FormData();
              // Copy existing FormData entries (including attachment)
              for (let [key, value] of data.entries()) {
                requestData.append(key, value);
              }
              // Add/update required fields
              requestData.set('candidateId', id);
              requestData.set('type', eventType);
              requestData.set('title', title);
              requestData.set('description', description);
              requestData.set('startTime', startTime.toISOString());
              requestData.set('endTime', endTime.toISOString());
              requestData.set('attendees', JSON.stringify([candidate.email]));
              if (stepNumber) requestData.set('stepNumber', stepNumber.toString());
            } else {
              // Regular object - check if we need to create FormData for attachment
              if (data.attachment) {
                requestData = new FormData();
                Object.keys(data).forEach(key => {
                  if (key === 'attendees') {
                    requestData.append(key, JSON.stringify(data[key]));
                  } else if (key !== 'dateTime' && key !== 'duration' && key !== 'eventType') {
                    // Don't copy dateTime, duration, eventType as we'll set them below
                    requestData.append(key, data[key]);
                  }
                });
                requestData.append('candidateId', id);
                requestData.append('type', eventType);
                requestData.append('title', title);
                requestData.append('description', description);
                requestData.append('startTime', startTime.toISOString());
                requestData.append('endTime', endTime.toISOString());
                requestData.append('attendees', JSON.stringify([candidate.email]));
                if (stepNumber) requestData.append('stepNumber', stepNumber.toString());
              } else {
                requestData = {
                  candidateId: id,
                  type: eventType,
                  title: title,
                  description: description,
                  startTime: startTime.toISOString(),
                  endTime: endTime.toISOString(),
                  attendees: [candidate.email],
                  ...(stepNumber && { stepNumber: parseInt(stepNumber) })
                };
              }
            }
            
            await calendarApi.create(requestData);
            toast.success('Calendar event scheduled!');
            
            // If this is an Offer Letter event, auto-schedule Offer Reminder
            if (eventType === 'OFFER_LETTER') {
              // Refresh candidate data first to get the new offer letter event
              await fetchCandidate();
              // Then auto-schedule the reminder
              await autoScheduleOfferReminder();
            }
          }
          break;
        case 'sendWhatsAppGroups':
          await candidateApi.sendWhatsAppGroups(id);
          toast.success('Step 5: WhatsApp group URLs sent via email!');
          break;
        case 'completeWhatsApp':
          await candidateApi.completeWhatsApp(id);
          toast.success('Step 5: WhatsApp groups marked as added!');
          break;
        default:
          break;
      }
      fetchCandidate();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleFileUpload = async (type) => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }
    const formData = new FormData();
    formData.append(type === 'offer' ? 'offerLetter' : 'signedOffer', selectedFile);
    setActionLoading(type);
    try {
      if (type === 'offer') {
        await candidateApi.uploadOffer(id, formData);
        toast.success('Offer letter uploaded!');
      } else {
        await candidateApi.uploadSignedOffer(id, formData);
        toast.success('Signed offer uploaded! (Step 2 auto-reminder active)');
      }
      setShowUploadModal(false);
      setSelectedFile(null);
      fetchCandidate();
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleScheduleSubmit = async () => {
    if (!scheduleDateTime) {
      toast.error('Please select date and time');
      return;
    }
    
    // Use the stored step type if available, otherwise try to find it
    let eventType = schedulingStepType;
    if (!eventType && showScheduleModal === 'scheduleGeneric') {
      // Find the step that matches the current schedule action
      const currentStep = workflowSteps.find(s => {
        const action = getScheduleActionName(s.stepType || 'MANUAL');
        return action === showScheduleModal;
      });
      if (currentStep && currentStep.stepType) {
        eventType = currentStep.stepType;
      }
    }
    
    // Find the step number for this event
    let stepNumber = schedulingStepNumber;
    if (!stepNumber) {
      // Try to find step number from workflow steps
      const currentStep = workflowSteps.find(s => {
        const action = getScheduleActionName(s.stepType || 'MANUAL');
        return action === showScheduleModal;
      });
      if (currentStep) {
        stepNumber = currentStep.step;
      }
    }
    
    // Create FormData if attachment(s) exist
    const formData = new FormData();
    formData.append('dateTime', scheduleDateTime);
    formData.append('duration', scheduleDuration.toString());
    if (editingEventId) formData.append('eventId', editingEventId);
    if (eventType) formData.append('eventType', eventType);
    if (stepNumber) formData.append('stepNumber', stepNumber.toString());
    
    // Support both single attachment (backward compatibility) and multiple attachments
    // Include both existing attachment paths and new files
    if (scheduleAttachments && scheduleAttachments.length > 0) {
      // Multiple new attachments
      scheduleAttachments.forEach((file) => {
        formData.append('attachments', file);
      });
    } else if (scheduleAttachment) {
      // Single new attachment (backward compatibility)
      formData.append('attachment', scheduleAttachment);
    }
    
    // If editing and there are existing attachments, we need to handle them
    // The backend will merge existing and new attachments
    if (editingEventId && existingAttachmentPaths.length > 0) {
      formData.append('existingAttachmentPaths', JSON.stringify(existingAttachmentPaths));
    }

    handleAction(showScheduleModal, formData);
    setShowScheduleModal(null);
    setScheduleDateTime('');
    setScheduleDuration(60);
    setEditingEventId(null);
    setSchedulingStepType(null);
    setSchedulingStepNumber(null);
    setScheduleAttachment(null);
    setScheduleAttachments([]);
    setExistingAttachmentPaths([]);
    setScheduleAttachmentPreview(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" style={{ width: 40, height: 40 }}></div>
      </div>
    );
  }

  if (!candidate) return null;

  // Helper to get scheduled event for a step by event type AND step number
  // This ensures each step has its own unique event, even if they share the same type
  const getScheduledEventByType = (eventType, stepNumber = null) => {
    if (!candidate?.calendarEvents) return null;
    
    // Map step type to event type (MANUAL -> CUSTOM, WHATSAPP_ADDITION -> WHATSAPP_TASK)
    let searchEventType = eventType;
    if (eventType === 'MANUAL') {
      searchEventType = 'CUSTOM';
    } else if (eventType === 'WHATSAPP_ADDITION') {
      searchEventType = 'WHATSAPP_TASK';
    }
    
    // If stepNumber is provided, match by both type and stepNumber
    if (stepNumber !== null && stepNumber !== undefined) {
      // Ensure both are numbers for comparison
      const searchStepNumber = typeof stepNumber === 'number' ? stepNumber : parseInt(stepNumber);
      return candidate.calendarEvents.find(e => 
        e.type === searchEventType && 
        e.stepNumber !== null &&
        e.stepNumber !== undefined &&
        (typeof e.stepNumber === 'number' ? e.stepNumber : parseInt(e.stepNumber)) === searchStepNumber &&
        e.status !== 'CANCELLED'
      );
    }
    // Fallback: match by type only (for backward compatibility)
    return candidate.calendarEvents.find(e => e.type === searchEventType && e.status !== 'CANCELLED');
  };

  // Helper to get scheduled event for a step (uses stepNumber for unique identification)
  const getScheduledEvent = (stepNumber) => {
    if (!candidate?.calendarEvents || !departmentSteps.length) return null;
    const step = departmentSteps.find(s => s.stepNumber === stepNumber);
    if (!step) return null;
    // Use stepNumber to uniquely identify the event
    return getScheduledEventByType(step.type, stepNumber);
  };

  // Helper to check if previous step is completed
  const isPreviousStepCompleted = (stepNumber) => {
    if (stepNumber === 1) return true; // First step is always available
    
    // Find previous step
    const currentStepIndex = departmentSteps.findIndex(s => s.stepNumber === stepNumber);
    if (currentStepIndex <= 0) return true;
    
    const previousStep = departmentSteps[currentStepIndex - 1];
    if (!previousStep) return true;
    
    // Check if previous step is completed based on its type
    return isStepCompleted(previousStep);
  };

  // Helper to check if a step is completed based on its type and step number
  const isStepCompleted = (stepTemplate) => {
    // Use stepNumber to uniquely identify the event for this specific step
    const event = getScheduledEventByType(stepTemplate.type, stepTemplate.stepNumber);
    if (event && event.status === 'COMPLETED') return true;
    
    // Check candidate fields based on step type
    switch(stepTemplate.type) {
      case 'OFFER_LETTER': return !!candidate.offerSentAt;
      case 'OFFER_REMINDER': return !!candidate.offerReminderSent || !!candidate.offerSignedAt;
      case 'WELCOME_EMAIL': return !!candidate.welcomeEmailSentAt;
      case 'HR_INDUCTION': return event?.status === 'COMPLETED';
      case 'WHATSAPP_ADDITION': return !!candidate.whatsappGroupsAdded;
      case 'ONBOARDING_FORM': return !!candidate.onboardingFormSentAt;
      case 'FORM_REMINDER': return !!candidate.onboardingFormCompletedAt;
      case 'CEO_INDUCTION': return event?.status === 'COMPLETED';
      case 'SALES_INDUCTION': return event?.status === 'COMPLETED';
      case 'DEPARTMENT_INDUCTION': return event?.status === 'COMPLETED';
      case 'TRAINING_PLAN': return !!candidate.trainingPlanSent;
      case 'CHECKIN_CALL': return event?.status === 'COMPLETED';
      default: return event?.status === 'COMPLETED';
    }
  };

  // Helper to get action handler for each step type
  const getStepActionHandler = (stepType) => {
    const actionMap = {
      'OFFER_LETTER': 'sendOffer',
      'OFFER_REMINDER': 'sendOfferReminder',
      'WELCOME_EMAIL': 'sendWelcome',
      'HR_INDUCTION': 'scheduleHRInduction',
      'WHATSAPP_ADDITION': 'sendWhatsAppGroups',
      'ONBOARDING_FORM': 'sendForm',
      'FORM_REMINDER': 'markFormComplete',
      'CEO_INDUCTION': 'scheduleCEOInduction',
      'SALES_INDUCTION': 'scheduleSalesInduction',
      'DEPARTMENT_INDUCTION': 'scheduleGeneric', // Use generic handler to preserve correct type
      'TRAINING_PLAN': 'sendTrainingPlan',
      'CHECKIN_CALL': 'scheduleCheckin'
    };
    return actionMap[stepType] || 'scheduleGeneric';
  };

  // Helper to get schedule action name for a step type
  const getScheduleActionName = (stepType) => {
    const actionMap = {
      'OFFER_LETTER': 'scheduleOfferLetter',
      'OFFER_REMINDER': 'scheduleOfferReminder',
      'WELCOME_EMAIL': 'scheduleWelcomeEmail',
      'HR_INDUCTION': 'scheduleHRInduction',
      'WHATSAPP_ADDITION': 'scheduleWhatsAppTask',
      'ONBOARDING_FORM': 'scheduleOnboardingForm',
      'FORM_REMINDER': 'scheduleFormReminder',
      'CEO_INDUCTION': 'scheduleCEOInduction',
      'SALES_INDUCTION': 'scheduleSalesInduction',
      'DEPARTMENT_INDUCTION': 'scheduleGeneric', // Use generic handler to preserve correct type
      'TRAINING_PLAN': 'scheduleTrainingPlan',
      'CHECKIN_CALL': 'scheduleCheckin'
    };
    return actionMap[stepType] || 'scheduleGeneric';
  };

  // Helper to format date/time for display
  const formatScheduleDate = (dateTime) => {
    if (!dateTime) return null;
    const date = new Date(dateTime);
    return date.toLocaleString('en-IN', { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });
  };

  // Helper to convert date to local datetime-local format (YYYY-MM-DDTHH:mm)
  // Converts from UTC (stored in DB) to IST (India Standard Time - UTC+5:30) for display
  const formatDateForInput = (dateTime) => {
    if (!dateTime) return '';
    const date = new Date(dateTime);
    // Convert UTC to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
    const istDate = new Date(date.getTime() + istOffset);
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Helper to replace placeholders in text
  const replacePlaceholders = (text) => {
    if (!text || !candidate) return text;
    return text
      .replace(/{{firstName}}/g, candidate.firstName || '')
      .replace(/{{lastName}}/g, candidate.lastName || '')
      .replace(/{{position}}/g, candidate.position || '')
      .replace(/{{department}}/g, candidate.department || '');
  };

  // Helper to get step status based on type
  const getStepStatus = (stepTemplate) => {
    // Use stepNumber to uniquely identify the event for this specific step
    const event = getScheduledEventByType(stepTemplate.type, stepTemplate.stepNumber);
    
    // If completed
    if (event && event.status === 'COMPLETED') return 'completed';
    if (isStepCompleted(stepTemplate)) return 'completed';
    
    // If scheduled
    if (event) return 'scheduled';
    
    // Check candidate fields for completion
    switch(stepTemplate.type) {
      case 'OFFER_LETTER':
        return candidate.offerSentAt ? 'completed' : 'waiting';
      case 'OFFER_REMINDER':
        return (candidate.offerReminderSent || candidate.offerSignedAt) ? 'completed' : 'waiting';
      case 'WELCOME_EMAIL':
        return candidate.welcomeEmailSentAt ? 'completed' : 'waiting';
      case 'WHATSAPP_ADDITION':
        return candidate.whatsappGroupsAdded ? 'completed' : candidate.whatsappTaskCreated ? 'pending' : 'waiting';
      case 'ONBOARDING_FORM':
        return candidate.onboardingFormSentAt ? 'completed' : 'waiting';
      case 'FORM_REMINDER':
        return candidate.onboardingFormCompletedAt ? 'completed' : candidate.onboardingFormSentAt ? 'waiting' : 'pending';
      case 'TRAINING_PLAN':
        return candidate.trainingPlanSent ? 'completed' : 'waiting';
      default:
        return 'waiting';
    }
  };

  // Helper to get step description
  const getStepDescription = (stepTemplate) => {
    // Use stepNumber to uniquely identify the event for this specific step
    const event = getScheduledEventByType(stepTemplate.type, stepTemplate.stepNumber);
    
    if (event) {
      return `Scheduled: ${formatScheduleDate(event.startTime)}`;
    }
    
    // Use template description or generate based on type
    let desc = stepTemplate.description || '';
    
    // Add type-specific details
    switch(stepTemplate.type) {
      case 'OFFER_LETTER':
        if (event) {
          desc = `Scheduled: ${formatScheduleDate(event.startTime)}`;
        } else if (candidate.offerSentAt) {
          desc = `Sent on ${new Date(candidate.offerSentAt).toLocaleDateString('en-IN')}`;
        } else {
          desc = desc || 'Upload and send offer letter with tracking';
        }
        break;
      case 'OFFER_REMINDER':
        if (candidate.offerSignedAt) {
          desc = `✅ Signed offer auto-detected on ${new Date(candidate.offerSignedAt).toLocaleDateString('en-IN')}`;
        } else if (candidate.offerReminderSent) {
          desc = 'Reminder sent';
        } else {
          desc = desc || 'Auto-sends if not signed in 3 days (or auto-detects email reply)';
        }
        break;
      case 'WELCOME_EMAIL':
        if (candidate.welcomeEmailSentAt) {
          desc = `Sent on ${new Date(candidate.welcomeEmailSentAt).toLocaleDateString('en-IN')}`;
        } else {
          desc = desc || 'Sent automatically one day before joining';
        }
        break;
      case 'WHATSAPP_ADDITION':
        if (candidate.whatsappGroupsAdded) {
          desc = 'WhatsApp groups sent via email';
        } else if (candidate.whatsappTaskCreated) {
          desc = 'Email sent with WhatsApp group URLs';
        } else {
          desc = desc || 'Send WhatsApp group URLs via email';
        }
        break;
      case 'ONBOARDING_FORM':
        if (candidate.onboardingFormSentAt) {
          desc = `Sent on ${new Date(candidate.onboardingFormSentAt).toLocaleDateString('en-IN')}`;
        } else {
          desc = desc || 'Sent within 1 hour of joining';
        }
        break;
      case 'FORM_REMINDER':
        if (candidate.onboardingFormCompletedAt) {
          desc = `Completed on ${new Date(candidate.onboardingFormCompletedAt).toLocaleDateString()}`;
        } else {
          desc = desc || 'Auto-sends if not completed in 24h';
        }
        break;
      case 'TRAINING_PLAN':
        if (candidate.trainingPlanSent) {
          desc = `Sent on ${new Date().toLocaleDateString('en-IN')}`;
        } else {
          desc = desc || 'Auto-sends on Day 3 with structured training';
        }
        break;
    }
    
    return replacePlaceholders(desc);
  };

  // Build workflow steps dynamically from department steps
  const buildWorkflowSteps = () => {
    // If no department steps, use default hardcoded steps (backward compatibility)
    if (!departmentSteps || departmentSteps.length === 0) {
      return [
    {
      step: 1,
      icon: '📄',
      title: 'Offer Letter Email',
      description: (() => {
        const event = getScheduledEvent(1);
        if (event) return `Scheduled: ${formatScheduleDate(event.startTime)}`;
        return candidate.offerSentAt 
          ? `Sent on ${new Date(candidate.offerSentAt).toLocaleDateString('en-IN')}`
          : 'Upload and send offer letter with tracking';
      })(),
      status: (() => {
        const event = getScheduledEvent(1);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return candidate.offerSentAt ? 'completed' : 'waiting';
      })(),
      date: candidate.offerSentAt,
      scheduledEvent: getScheduledEvent(1),
      actions: null, // No special actions - follows same pattern as other steps
      auto: false,
      stepType: 'OFFER_LETTER'
    },
    {
      step: 2,
      icon: '⏰',
      title: 'Offer Reminder (Auto)',
      description: (() => {
        const event = getScheduledEvent(2);
        if (event) return `Scheduled: ${formatScheduleDate(event.startTime)}`;
        return candidate.offerSignedAt 
          ? `✅ Signed offer auto-detected on ${new Date(candidate.offerSignedAt).toLocaleDateString('en-IN')}`
          : candidate.offerReminderSent 
            ? 'Reminder sent' 
            : 'Auto-sends if not signed in 3 days (or auto-detects email reply)';
      })(),
      status: (() => {
        const event = getScheduledEvent(2);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return candidate.offerReminderSent ? 'completed' : 'waiting';
      })(),
      scheduledEvent: getScheduledEvent(2),
      auto: true
    },
    {
      step: 3,
      icon: '👋',
      title: 'Day -1 Welcome Email',
      description: (() => {
        const event = getScheduledEvent(3);
        if (event) return `Scheduled: ${formatScheduleDate(event.startTime)}`;
        return candidate.welcomeEmailSentAt 
          ? `Sent on ${new Date(candidate.welcomeEmailSentAt).toLocaleDateString('en-IN')}`
          : 'Sent automatically one day before joining';
      })(),
      status: (() => {
        const event = getScheduledEvent(3);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return candidate.welcomeEmailSentAt ? 'completed' : 'waiting';
      })(),
      date: candidate.welcomeEmailSentAt,
      scheduledEvent: getScheduledEvent(3),
      auto: true
    },
    {
      step: 4,
      icon: '🏢',
      title: 'HR Induction (9:30 AM)',
      description: (() => {
        const event = getScheduledEvent(4);
        return event 
          ? `Scheduled: ${formatScheduleDate(event.startTime)}`
          : 'Calendar invite on joining day';
      })(),
      status: (() => {
        const event = getScheduledEvent(4);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return 'waiting';
      })(),
      scheduledEvent: getScheduledEvent(4),
      auto: true
    },
    {
      step: 5,
      icon: '💬',
      title: 'WhatsApp Group Addition',
      description: (() => {
        const event = getScheduledEvent(5);
        if (event) return `Scheduled: ${formatScheduleDate(event.startTime)}`;
        return candidate.whatsappGroupsAdded 
          ? 'WhatsApp groups sent via email'
          : candidate.whatsappTaskCreated 
            ? 'Email sent with WhatsApp group URLs'
            : 'Send WhatsApp group URLs via email';
      })(),
      status: candidate.whatsappGroupsAdded ? 'completed' : candidate.whatsappTaskCreated ? 'pending' : 'waiting',
      scheduledEvent: getScheduledEvent(5),
      auto: true
    },
    {
      step: 6,
      icon: '📝',
      title: 'Onboarding Form Email',
      description: (() => {
        const event = getScheduledEvent(6);
        if (event) return `Scheduled: ${formatScheduleDate(event.startTime)}`;
        return candidate.onboardingFormSentAt 
          ? `Sent on ${new Date(candidate.onboardingFormSentAt).toLocaleDateString('en-IN')}`
          : 'Sent within 1 hour of joining';
      })(),
      status: (() => {
        const event = getScheduledEvent(6);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return candidate.onboardingFormSentAt ? 'completed' : 'waiting';
      })(),
      date: candidate.onboardingFormSentAt,
      scheduledEvent: getScheduledEvent(6),
      auto: true
    },
    {
      step: 7,
      icon: '🔔',
      title: 'Form Reminder (Auto)',
      description: candidate.onboardingFormCompletedAt 
        ? `Completed on ${new Date(candidate.onboardingFormCompletedAt).toLocaleDateString()}`
        : 'Auto-sends if not completed in 24h',
      status: (() => {
        const event = getScheduledEvent(7);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return candidate.onboardingFormCompletedAt ? 'completed' : candidate.onboardingFormSentAt ? 'waiting' : 'pending';
      })(),
      scheduledEvent: getScheduledEvent(7),
      auto: true
    },
    {
      step: 8,
      icon: '👔',
      title: 'CEO Induction',
      description: (() => {
        const event = getScheduledEvent(8);
        return event 
          ? `Scheduled: ${formatScheduleDate(event.startTime)}`
          : 'HR confirms time with CEO, then system sends invite';
      })(),
      status: (() => {
        const event = getScheduledEvent(8);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return 'waiting';
      })(),
      scheduledEvent: getScheduledEvent(8),
      auto: false
    },
    {
      step: 9,
      icon: '💼',
      title: 'Sales Induction (Brunda)',
      description: (() => {
        const event = getScheduledEvent(9);
        if (event) return `Scheduled: ${formatScheduleDate(event.startTime)}`;
        return 'HR confirms time with Sales team, then system sends invite';
      })(),
      status: (() => {
        const event = getScheduledEvent(9);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return 'waiting';
      })(),
      scheduledEvent: getScheduledEvent(9),
      auto: false
    },
    {
      step: 10,
      icon: '📚',
      title: 'Training Plan Email',
      description: (() => {
        const event = getScheduledEvent(10);
        if (event) return `Scheduled: ${formatScheduleDate(event.startTime)}`;
        return candidate.trainingPlanSent 
          ? `Sent on ${new Date().toLocaleDateString('en-IN')}`
          : 'Auto-sends on Day 3 with structured training';
      })(),
      status: (() => {
        const event = getScheduledEvent(10);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return candidate.trainingPlanSent ? 'completed' : 'waiting';
      })(),
      scheduledEvent: getScheduledEvent(10),
      auto: true
    },
    {
      step: 11,
      icon: '📞',
      title: 'HR Check-in Call (Day 7)',
      description: (() => {
        const event = getScheduledEvent(11);
        return event 
          ? `Scheduled: ${formatScheduleDate(event.startTime)}`
          : 'Auto-scheduled 7 days after joining';
      })(),
      status: (() => {
        const event = getScheduledEvent(11);
        if (event && event.status === 'COMPLETED') return 'completed';
        if (event) return 'scheduled';
        return 'waiting';
      })(),
      scheduledEvent: getScheduledEvent(11),
      auto: true
    }
      ];
    }

    // Build steps from department templates
    return departmentSteps.map((stepTemplate) => {
      // Use stepNumber to uniquely identify the event for this specific step
      // Ensure stepNumber is a number for comparison
      const stepNum = typeof stepTemplate.stepNumber === 'number' 
        ? stepTemplate.stepNumber 
        : parseInt(stepTemplate.stepNumber);
      const event = getScheduledEventByType(stepTemplate.type, stepNum);
      const status = getStepStatus(stepTemplate);
      const description = getStepDescription(stepTemplate);
      const title = replacePlaceholders(stepTemplate.title);
      
      // Calculate scheduled time based on candidate's DOJ + step template configuration
      let calculatedScheduledTime = null;
      if (candidate.expectedJoiningDate && stepTemplate.scheduledTime && stepTemplate.dueDateOffset !== undefined) {
        const doj = new Date(candidate.expectedJoiningDate);
        const scheduledDate = new Date(doj);
        scheduledDate.setDate(scheduledDate.getDate() + (stepTemplate.dueDateOffset || 0));
        
        const [hours, minutes] = stepTemplate.scheduledTime.split(':');
        scheduledDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
        
        calculatedScheduledTime = scheduledDate;
      }
      
      // All steps now follow the same pattern - no special actions
      return {
        step: stepTemplate.stepNumber,
        icon: stepTemplate.icon || '📋',
        title: title,
        description: description,
        status: status,
        date: event?.startTime || (stepTemplate.type === 'OFFER_LETTER' ? candidate.offerSentAt : null),
        scheduledEvent: event,
        auto: stepTemplate.isAuto || false,
        actions: null, // No special actions - all steps use calendar + send pattern
        stepType: stepTemplate.type,
        calculatedScheduledTime: calculatedScheduledTime, // Calculated time based on DOJ (not actually scheduled)
        stepTemplate: stepTemplate // Store template for reference
      };
    });
  };

  const workflowSteps = buildWorkflowSteps();

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed': return <span className="badge badge-success">✓ Done</span>;
      case 'ready': return <span className="badge badge-info">Ready</span>;
      case 'sent': return <span className="badge badge-warning">Sent</span>;
      case 'pending': return <span className="badge badge-warning">Pending</span>;
      case 'waiting': return <span className="badge badge-gray">Waiting</span>;
      case 'skipped': return <span className="badge badge-gray">Skipped</span>;
      default: return null;
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => navigate('/candidates')} className="text-gray-500 hover:text-gray-700 text-sm mb-2">
          ← Back to Candidates
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-2xl font-bold">
              {getInitials()}
            </div>
            <div className="ml-4">
              <h1 className="text-2xl font-bold text-gray-900">{getFullName()}</h1>
              <p className="text-gray-500">{candidate.position} • {candidate.department}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${statusColors[candidate.status] || 'bg-gray-100 text-gray-800'}`}>
              {(candidate.status || 'NEW').replace(/_/g, ' ')}
            </span>
            <button
              onClick={handleDeleteCandidate}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              title="Delete candidate"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Candidate Info */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Candidate Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-gray-500">Email</p><p className="font-medium">{candidate.email}</p></div>
              <div><p className="text-sm text-gray-500">Phone</p><p className="font-medium">{candidate.phone || '-'}</p></div>
              <div><p className="text-sm text-gray-500">Position</p><p className="font-medium">{candidate.position}</p></div>
              <div><p className="text-sm text-gray-500">Department</p><p className="font-medium">{candidate.department}</p></div>
              <div><p className="text-sm text-gray-500">Expected Joining</p><p className="font-medium">{candidate.expectedJoiningDate ? new Date(candidate.expectedJoiningDate).toLocaleDateString('en-IN') : '-'}</p></div>
              <div><p className="text-sm text-gray-500">Reporting Manager</p><p className="font-medium">{candidate.reportingManager || '-'}</p></div>
              <div><p className="text-sm text-gray-500">Salary</p><p className="font-medium">{candidate.salary ? `₹${candidate.salary}` : '-'}</p></div>
              <div><p className="text-sm text-gray-500">Created</p><p className="font-medium">{new Date(candidate.createdAt).toLocaleDateString('en-IN')}</p></div>
            </div>
            
            {/* Custom Fields */}
            {candidate.customFields && Object.keys(candidate.customFields).length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-md font-semibold mb-3">Additional Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(candidate.customFields).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-sm text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                      <p className="font-medium">{value || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Documents Section */}
            <div className="mt-6 pt-4 border-t">
              <h3 className="text-md font-semibold mb-3">📎 Documents</h3>
              <div className="space-y-2">
                {/* Offer Letter */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-xl mr-2">📄</span>
                    <div>
                      <p className="font-medium text-sm">Offer Letter</p>
                      <p className="text-xs text-gray-500">
                        {candidate.offerLetterPath ? 'Uploaded' : 'Not uploaded'}
                      </p>
                    </div>
                  </div>
                  {candidate.offerLetterPath && (
                    <a 
                      href={`${(() => {
                        // Get API URL same way as api.js does
                        let apiUrl = process.env.REACT_APP_API_URL || '/api';
                        if (apiUrl.startsWith('http')) {
                          apiUrl = apiUrl.replace(/\/$/, '');
                          if (!apiUrl.endsWith('/api')) {
                            apiUrl = `${apiUrl}/api`;
                          }
                        }
                        return apiUrl;
                      })()}/uploads/${candidate.offerLetterPath.replace(/\\/g, '/')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                      onClick={(e) => {
                        // Prevent React Router from intercepting the link
                        e.stopPropagation();
                      }}
                    >
                      View →
                    </a>
                  )}
                </div>
                
                {/* Signed Offer Letter */}
                <div className={`flex items-center justify-between p-3 rounded-lg ${candidate.signedOfferPath ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <div className="flex items-center">
                    <span className="text-xl mr-2">{candidate.signedOfferPath ? '✅' : '📝'}</span>
                    <div>
                      <p className="font-medium text-sm">Signed Offer Letter</p>
                      <p className="text-xs text-gray-500">
                        {candidate.signedOfferPath 
                          ? `Auto-captured on ${candidate.offerSignedAt ? new Date(candidate.offerSignedAt).toLocaleString('en-IN') : 'N/A'}`
                          : 'Waiting for candidate response'
                        }
                      </p>
                    </div>
                  </div>
                  {candidate.signedOfferPath ? (
                    <a 
                      href={`${(() => {
                        // Get API URL same way as api.js does
                        let apiUrl = process.env.REACT_APP_API_URL || '/api';
                        if (apiUrl.startsWith('http')) {
                          apiUrl = apiUrl.replace(/\/$/, '');
                          if (!apiUrl.endsWith('/api')) {
                            apiUrl = `${apiUrl}/api`;
                          }
                        }
                        return apiUrl;
                      })()}/uploads/${candidate.signedOfferPath.replace(/\\/g, '/')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:text-green-800 text-sm font-medium"
                      onClick={(e) => {
                        // Prevent React Router from intercepting the link
                        e.stopPropagation();
                      }}
                    >
                      View Document →
                    </a>
                  ) : (
                    <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded">Pending</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Workflow Steps */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">📋 {workflowSteps.length}-Step Onboarding Workflow</h2>
            <div className="space-y-3">
              {workflowSteps.map((step) => (
                <div key={step.step} className={`p-4 border rounded-lg ${step.status === 'completed' ? 'bg-green-50 border-green-200' : step.status === 'skipped' ? 'bg-gray-50 border-gray-200' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1">
                      <span className="text-2xl mr-3">{step.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center">
                          <p className="font-medium">Step {step.step}: {step.title}</p>
                          {step.auto && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">AUTO</span>}
                        </div>
                        <p className="text-sm text-gray-500">{step.description}</p>
                        {step.date && <p className="text-xs text-gray-400 mt-1">Done: {new Date(step.date).toLocaleString('en-IN')}</p>}
                        {step.calculatedScheduledTime && !step.scheduledEvent && (
                          <div className="mt-2 flex items-center space-x-2 flex-wrap">
                            <span className="text-xs font-semibold text-gray-600">Will be scheduled:</span>
                            <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-md font-medium border border-green-200">
                              ⏰ {step.calculatedScheduledTime.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} at {step.calculatedScheduledTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                            <span className="text-xs text-gray-500">
                              (Based on DOJ: {candidate.expectedJoiningDate ? new Date(candidate.expectedJoiningDate).toLocaleDateString('en-IN') : 'Not set'})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      {step.actions}
                      {/* If step is completed, show completed badge only - no calendar */}
                      {step.status === 'completed' ? (
                        <span className="badge badge-success">✓ Completed</span>
                      ) : step.scheduledEvent && step.scheduledEvent.status !== 'COMPLETED' ? (
                        /* If scheduled, show "Scheduled" button for editing + "Send" button */
                        <>
                          <button
                            onClick={() => {
                              const scheduleAction = getScheduleActionName(step.stepType || 'MANUAL');
                              const durationMap = { 
                                'OFFER_LETTER': 30, 
                                'OFFER_REMINDER': 15, 
                                'WELCOME_EMAIL': 30, 
                                'HR_INDUCTION': 60, 
                                'WHATSAPP_ADDITION': 15, 
                                'ONBOARDING_FORM': 30, 
                                'FORM_REMINDER': 15, 
                                'CEO_INDUCTION': 60, 
                                'SALES_INDUCTION': 90, 
                                'DEPARTMENT_INDUCTION': 90,
                                'TRAINING_PLAN': 30, 
                                'CHECKIN_CALL': 30 
                              };
                              const event = step.scheduledEvent;
                              setEditingEventId(event?.id || null);
                              
                              // If editing, use event time; otherwise calculate default from step template
                              let defaultDateTime = '';
                              if (event) {
                                defaultDateTime = formatDateForInput(event.startTime);
                              } else {
                                const stepTemplate = departmentSteps.find(s => s.stepNumber === step.step);
                                if (stepTemplate) {
                                  const referenceDate = candidate.expectedJoiningDate || candidate.actualJoiningDate || new Date();
                                  const baseDate = new Date(referenceDate);
                                  
                                  // Apply dueDateOffset (days from joining date)
                                  if (stepTemplate.dueDateOffset !== null && stepTemplate.dueDateOffset !== undefined) {
                                    baseDate.setDate(baseDate.getDate() + stepTemplate.dueDateOffset);
                                  }
                                  
                                  // Apply scheduledTime (default time like "14:00")
                                  if (stepTemplate.scheduledTime) {
                                    const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                                    baseDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                                  }
                                  
                                  // Format as datetime-local (YYYY-MM-DDTHH:mm)
                                  const year = baseDate.getFullYear();
                                  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
                                  const day = String(baseDate.getDate()).padStart(2, '0');
                                  const hour = String(baseDate.getHours()).padStart(2, '0');
                                  const minute = String(baseDate.getMinutes()).padStart(2, '0');
                                  defaultDateTime = `${year}-${month}-${day}T${hour}:${minute}`;
                                }
                              }
                              
                              setScheduleDateTime(defaultDateTime);
                              // Set duration but don't show it in UI - use default based on step type
                              setScheduleDuration(event ? Math.round((new Date(event.endTime) - new Date(event.startTime)) / 60000) : durationMap[step.stepType] || 30);
                              // Load existing attachment(s) if event has any
                              if (event?.attachmentPaths && Array.isArray(event.attachmentPaths) && event.attachmentPaths.length > 0) {
                                // Multiple attachments - store paths for display
                                setExistingAttachmentPaths(event.attachmentPaths);
                                const fileNames = event.attachmentPaths.map(path => path.split('/').pop() || path);
                                updateAttachmentPreview(fileNames, []);
                              } else if (event?.attachmentPath) {
                                // Single attachment (backward compatibility)
                                setExistingAttachmentPaths([event.attachmentPath]);
                                const fileName = event.attachmentPath.split('/').pop() || event.attachmentPath;
                                updateAttachmentPreview([fileName], []);
                              } else {
                                setScheduleAttachment(null);
                                setScheduleAttachments([]);
                                setExistingAttachmentPaths([]);
                                setScheduleAttachmentPreview(null);
                              }
                              setSchedulingStepType(step.stepType); // Store step type for generic handler
                              setSchedulingStepNumber(step.step); // Store step number for unique identification
                              setShowScheduleModal(scheduleAction);
                            }}
                            className="badge badge-info"
                            title="Already scheduled"
                          >
                            ⏰ Scheduled: {new Date(step.scheduledEvent.startTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} at {new Date(step.scheduledEvent.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </button>
                          <button
                            onClick={() => {
                              const scheduleAction = getScheduleActionName(step.stepType || 'MANUAL');
                              const durationMap = { 
                                'OFFER_LETTER': 30, 
                                'OFFER_REMINDER': 15, 
                                'WELCOME_EMAIL': 30, 
                                'HR_INDUCTION': 60, 
                                'WHATSAPP_ADDITION': 15, 
                                'ONBOARDING_FORM': 30, 
                                'FORM_REMINDER': 15, 
                                'CEO_INDUCTION': 60, 
                                'SALES_INDUCTION': 90, 
                                'DEPARTMENT_INDUCTION': 90,
                                'TRAINING_PLAN': 30, 
                                'CHECKIN_CALL': 30 
                              };
                              const event = step.scheduledEvent;
                              setEditingEventId(event?.id || null);
                              
                              // If editing, use event time; otherwise calculate default from step template
                              let defaultDateTime = '';
                              if (event) {
                                defaultDateTime = formatDateForInput(event.startTime);
                              } else {
                                const stepTemplate = departmentSteps.find(s => s.stepNumber === step.step);
                                if (stepTemplate) {
                                  const referenceDate = candidate.expectedJoiningDate || candidate.actualJoiningDate || new Date();
                                  const baseDate = new Date(referenceDate);
                                  
                                  // Apply dueDateOffset (days from joining date)
                                  if (stepTemplate.dueDateOffset !== null && stepTemplate.dueDateOffset !== undefined) {
                                    baseDate.setDate(baseDate.getDate() + stepTemplate.dueDateOffset);
                                  }
                                  
                                  // Apply scheduledTime (default time like "14:00")
                                  if (stepTemplate.scheduledTime) {
                                    const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                                    baseDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                                  }
                                  
                                  // Format as datetime-local (YYYY-MM-DDTHH:mm)
                                  const year = baseDate.getFullYear();
                                  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
                                  const day = String(baseDate.getDate()).padStart(2, '0');
                                  const hour = String(baseDate.getHours()).padStart(2, '0');
                                  const minute = String(baseDate.getMinutes()).padStart(2, '0');
                                  defaultDateTime = `${year}-${month}-${day}T${hour}:${minute}`;
                                }
                              }
                              
                              setScheduleDateTime(defaultDateTime);
                              // Set duration but don't show it in UI - use default based on step type
                              setScheduleDuration(event ? Math.round((new Date(event.endTime) - new Date(event.startTime)) / 60000) : durationMap[step.stepType] || 30);
                              // Load existing attachment(s) if event has any
                              if (event?.attachmentPaths && Array.isArray(event.attachmentPaths) && event.attachmentPaths.length > 0) {
                                // Multiple attachments - store paths for display
                                setExistingAttachmentPaths(event.attachmentPaths);
                                const fileNames = event.attachmentPaths.map(path => path.split('/').pop() || path);
                                updateAttachmentPreview(fileNames, []);
                              } else if (event?.attachmentPath) {
                                // Single attachment (backward compatibility)
                                setExistingAttachmentPaths([event.attachmentPath]);
                                const fileName = event.attachmentPath.split('/').pop() || event.attachmentPath;
                                updateAttachmentPreview([fileName], []);
                              } else {
                                setScheduleAttachment(null);
                                setScheduleAttachments([]);
                                setExistingAttachmentPaths([]);
                                setScheduleAttachmentPreview(null);
                              }
                              setSchedulingStepType(step.stepType); // Store step type for generic handler
                              setSchedulingStepNumber(step.step); // Store step number for unique identification
                              // Set schedule mode and initialize offset/time based on step type and available dates
                              const stepTemplate = departmentSteps.find(s => s.stepNumber === step.step);
                              if (step.stepType === 'OFFER_REMINDER' && (candidate.offerSentAt || candidate.scheduledEvents?.find(e => e.type === 'OFFER_LETTER'))) {
                                setScheduleMode('offerLetter');
                                setScheduleOffsetDays(stepTemplate?.dueDateOffset !== undefined ? stepTemplate.dueDateOffset : 1);
                                setScheduleOffsetTime(stepTemplate?.scheduledTime || '14:00');
                              } else if (candidate.expectedJoiningDate && stepTemplate) {
                                setScheduleMode('doj');
                                setScheduleOffsetDays(stepTemplate.dueDateOffset || 0);
                                setScheduleOffsetTime(stepTemplate.scheduledTime || '09:00');
                              } else {
                                setScheduleMode('exact');
                                setScheduleOffsetDays(0);
                                setScheduleOffsetTime('09:00');
                              }
                              setShowScheduleModal(scheduleAction);
                            }}
                            className="btn btn-sm btn-secondary"
                            title="Edit scheduled time"
                          >
                            ✏️ Edit
                          </button>
                          {/* Undo scheduled step button */}
                          <button
                            onClick={async () => {
                              if (!window.confirm('Are you sure you want to unschedule this step? The calendar event will be cancelled.')) {
                                return;
                              }
                              setActionLoading(`undoStep${step.step}`);
                              try {
                                await candidateApi.undoScheduledStep(candidate.id, step.step);
                                toast.success('Step unscheduled successfully');
                                fetchCandidate();
                              } catch (error) {
                                toast.error(error.response?.data?.message || 'Failed to unschedule step');
                              } finally {
                                setActionLoading('');
                              }
                            }}
                            className="btn btn-danger text-sm"
                            disabled={actionLoading === `undoStep${step.step}`}
                            title="Undo scheduled step"
                          >
                            {actionLoading === `undoStep${step.step}` ? 'Undoing...' : 'Undo'}
                          </button>
                          {/* Send button next to Scheduled - available for all steps including Step 1 */}
                          {!step.actions && (
                            <button
                              onClick={() => {
                                // Special check for Step 1 (Offer Letter) - must have offer letter uploaded or scheduled with attachment
                                const hasOfferLetter = candidate.offerLetterPath || (step.scheduledEvent && step.scheduledEvent.attachmentPath);
                                if (step.stepType === 'OFFER_LETTER' && !hasOfferLetter) {
                                  toast.error('Please upload an offer letter first. You can attach it when scheduling or upload it separately.');
                                  setShowUploadModal('offer');
                                  return;
                                }
                                handleSendClick(step.step);
                              }}
                              className={`btn text-sm ${(step.stepType !== 'OFFER_LETTER' || candidate.offerLetterPath || (step.scheduledEvent && step.scheduledEvent.attachmentPath)) ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'}`}
                              disabled={actionLoading === `completeStep${step.step}` || (step.stepType === 'OFFER_LETTER' && !candidate.offerLetterPath && !(step.scheduledEvent && step.scheduledEvent.attachmentPath))}
                              title={
                                step.stepType === 'OFFER_LETTER' && !candidate.offerLetterPath && !(step.scheduledEvent && step.scheduledEvent.attachmentPath)
                                  ? 'Upload offer letter first or schedule with attachment' 
                                  : 'Mark as completed'
                              }
                            >
                              {actionLoading === `completeStep${step.step}` ? 'Completing...' : 'Send'}
                            </button>
                          )}
                        </>
                      ) : (
                        /* If not completed and not scheduled, show "Schedule" button for auto steps or calendar for manual */
                        <>
                          {step.auto ? (
                            /* For auto steps, show "Schedule" button that uses scheduledTime from template */
                            <button
                              onClick={() => {
                                const scheduleAction = getScheduleActionName(step.stepType || 'MANUAL');
                                const durationMap = { 
                                  'OFFER_LETTER': 30, 
                                  'OFFER_REMINDER': 15, 
                                  'WELCOME_EMAIL': 30, 
                                  'HR_INDUCTION': 60, 
                                  'WHATSAPP_ADDITION': 15, 
                                  'ONBOARDING_FORM': 30, 
                                  'FORM_REMINDER': 15, 
                                  'CEO_INDUCTION': 60, 
                                  'SALES_INDUCTION': 90, 
                                  'DEPARTMENT_INDUCTION': 90,
                                  'TRAINING_PLAN': 30, 
                                  'CHECKIN_CALL': 30 
                                };
                                
                                // Calculate default dateTime from step template using scheduledTime and dueDateOffset
                                let defaultDateTime = '';
                                const stepTemplate = departmentSteps.find(s => s.stepNumber === step.step);
                                
                                // Set schedule mode and initialize based on step type
                                if (step.stepType === 'OFFER_REMINDER') {
                                  // Always use offerLetter mode for OFFER_REMINDER
                                  setScheduleMode('offerLetter');
                                  setScheduleOffsetDays(stepTemplate?.dueDateOffset !== undefined ? stepTemplate.dueDateOffset : 1);
                                  setScheduleOffsetTime(stepTemplate?.scheduledTime || '14:00');
                                  
                                  // Calculate based on offer letter date if available
                                  const offerLetterEvent = candidate.scheduledEvents?.find(e => e.type === 'OFFER_LETTER' && e.status !== 'COMPLETED');
                                  const offerLetterDate = offerLetterEvent?.startTime || candidate.offerSentAt;
                                  if (offerLetterDate) {
                                    const offerDate = new Date(offerLetterDate);
                                    const scheduledDate = new Date(offerDate);
                                    const offset = stepTemplate?.dueDateOffset !== undefined ? stepTemplate.dueDateOffset : 1;
                                    scheduledDate.setDate(scheduledDate.getDate() + offset);
                                    if (stepTemplate?.scheduledTime) {
                                      const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                                      scheduledDate.setHours(parseInt(hours) || 14, parseInt(minutes) || 0, 0, 0);
                                    } else {
                                      scheduledDate.setHours(14, 0, 0, 0);
                                    }
                                    const year = scheduledDate.getFullYear();
                                    const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                                    const day = String(scheduledDate.getDate()).padStart(2, '0');
                                    const hour = String(scheduledDate.getHours()).padStart(2, '0');
                                    const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                                    defaultDateTime = `${year}-${month}-${day}T${hour}:${minute}`;
                                  } else {
                                    // If offer letter not sent, use current date + offset + time
                                    const now = new Date();
                                    const scheduledDate = new Date(now);
                                    const offset = stepTemplate?.dueDateOffset !== undefined ? stepTemplate.dueDateOffset : 1;
                                    scheduledDate.setDate(scheduledDate.getDate() + offset);
                                    if (stepTemplate?.scheduledTime) {
                                      const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                                      scheduledDate.setHours(parseInt(hours) || 14, parseInt(minutes) || 0, 0, 0);
                                    } else {
                                      scheduledDate.setHours(14, 0, 0, 0);
                                    }
                                    const year = scheduledDate.getFullYear();
                                    const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                                    const day = String(scheduledDate.getDate()).padStart(2, '0');
                                    const hour = String(scheduledDate.getHours()).padStart(2, '0');
                                    const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                                    defaultDateTime = `${year}-${month}-${day}T${hour}:${minute}`;
                                  }
                                } else if (stepTemplate && candidate.expectedJoiningDate) {
                                  // Use DOJ mode for other steps
                                  setScheduleMode('doj');
                                  setScheduleOffsetDays(stepTemplate.dueDateOffset || 0);
                                  setScheduleOffsetTime(stepTemplate.scheduledTime || '09:00');
                                  
                                  const doj = new Date(candidate.expectedJoiningDate);
                                  const offset = stepTemplate.dueDateOffset || 0;
                                  
                                  // Calculate date based on offset
                                  const scheduledDate = new Date(doj);
                                  scheduledDate.setDate(scheduledDate.getDate() + offset);
                                  
                                  // ALWAYS use scheduledTime from template - never default to 9 AM
                                  if (stepTemplate.scheduledTime) {
                                    const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                                    scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                                  } else {
                                    // Only fallback to 9:00 AM if template doesn't have scheduledTime (shouldn't happen)
                                    scheduledDate.setHours(9, 0, 0, 0);
                                  }
                                  
                                  // Format as datetime-local (YYYY-MM-DDTHH:mm)
                                  const year = scheduledDate.getFullYear();
                                  const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                                  const day = String(scheduledDate.getDate()).padStart(2, '0');
                                  const hour = String(scheduledDate.getHours()).padStart(2, '0');
                                  const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                                  defaultDateTime = `${year}-${month}-${day}T${hour}:${minute}`;
                                } else {
                                  // Fallback to exact mode if no DOJ
                                  setScheduleMode('exact');
                                  setScheduleOffsetDays(0);
                                  setScheduleOffsetTime(stepTemplate?.scheduledTime || '09:00');
                                }
                                
                                setScheduleDuration(durationMap[step.stepType] || 60);
                                setScheduleDateTime(defaultDateTime);
                                setSchedulingStepType(step.stepType);
                                setSchedulingStepNumber(step.step);
                                setShowScheduleModal(scheduleAction);
                              }}
                              className="btn btn-sm btn-primary"
                              disabled={!candidate.expectedJoiningDate}
                              title={!candidate.expectedJoiningDate ? 'Set expected joining date first' : 'Schedule using default time from step configuration'}
                            >
                              ⏰ Schedule
                            </button>
                          ) : (
                            /* For manual steps, show calendar icon */
                          <button
                            onClick={() => {
                              const scheduleAction = getScheduleActionName(step.stepType || 'MANUAL');
                              const durationMap = { 
                                'OFFER_LETTER': 30, 
                                'OFFER_REMINDER': 15, 
                                'WELCOME_EMAIL': 30, 
                                'HR_INDUCTION': 60, 
                                'WHATSAPP_ADDITION': 15, 
                                'ONBOARDING_FORM': 30, 
                                'FORM_REMINDER': 15, 
                                'CEO_INDUCTION': 60, 
                                'SALES_INDUCTION': 90, 
                                'DEPARTMENT_INDUCTION': 90,
                                'TRAINING_PLAN': 30, 
                                'CHECKIN_CALL': 30 
                              };
                              
                              // Calculate default dateTime from step template
                              let defaultDateTime = '';
                              const stepTemplate = departmentSteps.find(s => s.stepNumber === step.step);
                              if (stepTemplate) {
                                const referenceDate = candidate.expectedJoiningDate || candidate.actualJoiningDate || new Date();
                                const baseDate = new Date(referenceDate);
                                
                                // Apply dueDateOffset (days from joining date)
                                if (stepTemplate.dueDateOffset !== null && stepTemplate.dueDateOffset !== undefined) {
                                  baseDate.setDate(baseDate.getDate() + stepTemplate.dueDateOffset);
                                }
                                
                                // Apply scheduledTime (default time like "14:00")
                                if (stepTemplate.scheduledTime) {
                                  const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                                  baseDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                                }
                                
                                // Format as datetime-local (YYYY-MM-DDTHH:mm)
                                const year = baseDate.getFullYear();
                                const month = String(baseDate.getMonth() + 1).padStart(2, '0');
                                const day = String(baseDate.getDate()).padStart(2, '0');
                                const hour = String(baseDate.getHours()).padStart(2, '0');
                                const minute = String(baseDate.getMinutes()).padStart(2, '0');
                                defaultDateTime = `${year}-${month}-${day}T${hour}:${minute}`;
                              }
                              
                              setEditingEventId(null);
                              setScheduleDateTime(defaultDateTime);
                              setScheduleDuration(durationMap[step.stepType] || 30);
                              setScheduleAttachment(null);
                              setScheduleAttachmentPreview(null);
                              setSchedulingStepType(step.stepType); // Store step type for generic handler
                              setSchedulingStepNumber(step.step); // Store step number for unique identification
                              // Set schedule mode and initialize offset/time based on step type and available dates
                              // stepTemplate is already declared above, so we reuse it
                              if (step.stepType === 'OFFER_REMINDER') {
                                // Always use offerLetter mode for OFFER_REMINDER, even if offer letter not sent yet
                                setScheduleMode('offerLetter');
                                setScheduleOffsetDays(stepTemplate?.dueDateOffset !== undefined ? stepTemplate.dueDateOffset : 1);
                                setScheduleOffsetTime(stepTemplate?.scheduledTime || '14:00');
                                // Calculate initial scheduleDateTime based on offer letter date if available, otherwise use current date + offset
                                const offerLetterEvent = candidate.scheduledEvents?.find(e => e.type === 'OFFER_LETTER' && e.status !== 'COMPLETED');
                                const offerLetterDate = offerLetterEvent?.startTime || candidate.offerSentAt;
                                if (offerLetterDate) {
                                  const offerDate = new Date(offerLetterDate);
                                  const scheduledDate = new Date(offerDate);
                                  const offset = stepTemplate?.dueDateOffset !== undefined ? stepTemplate.dueDateOffset : 1;
                                  scheduledDate.setDate(scheduledDate.getDate() + offset);
                                  if (stepTemplate?.scheduledTime) {
                                    const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                                    scheduledDate.setHours(parseInt(hours) || 14, parseInt(minutes) || 0, 0, 0);
                                  } else {
                                    scheduledDate.setHours(14, 0, 0, 0);
                                  }
                                  const year = scheduledDate.getFullYear();
                                  const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                                  const day = String(scheduledDate.getDate()).padStart(2, '0');
                                  const hour = String(scheduledDate.getHours()).padStart(2, '0');
                                  const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                                  setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                                } else {
                                  // If offer letter not sent, use current date + offset + time
                                  const now = new Date();
                                  const scheduledDate = new Date(now);
                                  const offset = stepTemplate?.dueDateOffset !== undefined ? stepTemplate.dueDateOffset : 1;
                                  scheduledDate.setDate(scheduledDate.getDate() + offset);
                                  if (stepTemplate?.scheduledTime) {
                                    const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                                    scheduledDate.setHours(parseInt(hours) || 14, parseInt(minutes) || 0, 0, 0);
                                  } else {
                                    scheduledDate.setHours(14, 0, 0, 0);
                                  }
                                  const year = scheduledDate.getFullYear();
                                  const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                                  const day = String(scheduledDate.getDate()).padStart(2, '0');
                                  const hour = String(scheduledDate.getHours()).padStart(2, '0');
                                  const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                                  setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                                }
                              } else if (candidate.expectedJoiningDate && stepTemplate) {
                                setScheduleMode('doj');
                                setScheduleOffsetDays(stepTemplate.dueDateOffset || 0);
                                setScheduleOffsetTime(stepTemplate.scheduledTime || '09:00');
                              } else {
                                setScheduleMode('exact');
                                setScheduleOffsetDays(0);
                                setScheduleOffsetTime(stepTemplate?.scheduledTime || '09:00');
                              }
                              setShowScheduleModal(scheduleAction);
                            }}
                            className="text-indigo-600 hover:text-indigo-800 text-xl p-1 hover:bg-indigo-50 rounded"
                            title="Schedule calendar event"
                          >
                            📅
                          </button>
                          )}
                          {/* Show "Send" button for all steps (disabled if previous step not completed) */}
                          {!step.actions && (
                            <button
                              onClick={() => {
                                // Special check for Step 1 (Offer Letter) - must have offer letter uploaded or scheduled with attachment
                                const hasOfferLetter = candidate.offerLetterPath || (step.scheduledEvent && step.scheduledEvent.attachmentPath);
                                if (step.stepType === 'OFFER_LETTER' && !hasOfferLetter) {
                                  toast.error('Please upload an offer letter first. You can attach it when scheduling or upload it separately.');
                                  setShowUploadModal('offer');
                                  return;
                                }
                                
                                if (!isPreviousStepCompleted(step.step)) {
                                  toast.error('Please complete the previous step first');
                                  return;
                                }
                                handleSendClick(step.step);
                              }}
                              className={`btn text-sm ${isPreviousStepCompleted(step.step) && (step.stepType !== 'OFFER_LETTER' || candidate.offerLetterPath || (step.scheduledEvent && step.scheduledEvent.attachmentPath)) ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'}`}
                              disabled={actionLoading === `completeStep${step.step}` || !isPreviousStepCompleted(step.step) || (step.stepType === 'OFFER_LETTER' && !candidate.offerLetterPath && !(step.scheduledEvent && step.scheduledEvent.attachmentPath))}
                              title={
                                step.stepType === 'OFFER_LETTER' && !candidate.offerLetterPath && !(step.scheduledEvent && step.scheduledEvent.attachmentPath)
                                  ? 'Upload offer letter first or schedule with attachment' 
                                  : !isPreviousStepCompleted(step.step) 
                                    ? 'Complete previous step first' 
                                    : 'Mark as completed'
                              }
                            >
                              {actionLoading === `completeStep${step.step}` ? 'Completing...' : 'Send'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Activity Timeline */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Activity Timeline</h2>
            {(!candidate.activityLogs || candidate.activityLogs.length === 0) ? (
              <p className="text-gray-500 text-sm">No activity yet</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {candidate.activityLogs.slice(0, 15).map((item, index) => (
                  <div key={item.id || index} className="flex items-start">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 mr-3"></div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{item.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{new Date(item.createdAt).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Upload {showUploadModal === 'offer' ? 'Offer Letter' : 'Signed Offer'}
            </h3>
            <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setSelectedFile(e.target.files[0])} className="w-full mb-4" />
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setShowUploadModal(false); setSelectedFile(null); }} className="btn btn-secondary">Cancel</button>
              <button onClick={() => handleFileUpload(showUploadModal)} disabled={!selectedFile || actionLoading} className="btn btn-primary">
                {actionLoading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {(() => {
                // Get step title dynamically
                const currentStep = workflowSteps.find(s => {
                  const action = getScheduleActionName(s.stepType || 'MANUAL');
                  return action === showScheduleModal;
                });
                const stepTitle = currentStep ? currentStep.title : 'Event';
                return editingEventId ? `Edit ${stepTitle}` : `Schedule ${stepTitle}`;
              })()}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Scheduling Method *</label>
              <div className="flex space-x-4 mb-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleMode"
                    value="exact"
                    checked={scheduleMode === 'exact'}
                    onChange={(e) => {
                      setScheduleMode(e.target.value);
                      // If switching to exact, keep current value or clear
                      if (!scheduleDateTime) {
                        const now = new Date();
                        const year = now.getFullYear();
                        const month = String(now.getMonth() + 1).padStart(2, '0');
                        const day = String(now.getDate()).padStart(2, '0');
                        const hour = String(now.getHours()).padStart(2, '0');
                        const minute = String(now.getMinutes()).padStart(2, '0');
                        setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                      }
                    }}
                    className="mr-2"
                  />
                  <span className="text-sm">Exact Date & Time</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleMode"
                    value="doj"
                    checked={scheduleMode === 'doj'}
                    onChange={(e) => {
                      setScheduleMode(e.target.value);
                      // Calculate based on DOJ when switching to DOJ mode
                      const currentStep = workflowSteps.find(s => {
                        const action = getScheduleActionName(s.stepType || 'MANUAL');
                        return action === showScheduleModal;
                      });
                      if (currentStep && candidate.expectedJoiningDate) {
                        const stepTemplate = departmentSteps.find(s => s.stepNumber === currentStep.step);
                        if (stepTemplate) {
                          // Initialize offset and time from step template
                          setScheduleOffsetDays(stepTemplate.dueDateOffset || 0);
                          setScheduleOffsetTime(stepTemplate.scheduledTime || '09:00');
                          
                          // Calculate and update scheduleDateTime
                          const doj = new Date(candidate.expectedJoiningDate);
                          const scheduledDate = new Date(doj);
                          scheduledDate.setDate(scheduledDate.getDate() + (stepTemplate.dueDateOffset || 0));
                          
                          if (stepTemplate.scheduledTime) {
                            const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                            scheduledDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                          } else {
                            // Fallback to 9:00 AM only if template doesn't have scheduledTime (shouldn't happen)
                            scheduledDate.setHours(9, 0, 0, 0);
                          }
                          
                          const year = scheduledDate.getFullYear();
                          const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                          const day = String(scheduledDate.getDate()).padStart(2, '0');
                          const hour = String(scheduledDate.getHours()).padStart(2, '0');
                          const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                          setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                        }
                      }
                    }}
                    className="mr-2"
                    disabled={!candidate.expectedJoiningDate}
                  />
                  <span className={`text-sm ${!candidate.expectedJoiningDate ? 'text-gray-400' : ''}`}>
                    Based on DOJ {!candidate.expectedJoiningDate && '(DOJ not set)'}
                  </span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleMode"
                    value="offerLetter"
                    checked={scheduleMode === 'offerLetter'}
                    onChange={(e) => {
                      setScheduleMode(e.target.value);
                      // Calculate based on Offer Letter date when switching to offerLetter mode
                      const currentStep = workflowSteps.find(s => {
                        const action = getScheduleActionName(s.stepType || 'MANUAL');
                        return action === showScheduleModal;
                      });
                      // Find offer letter event or sent date
                      const offerLetterEvent = candidate.scheduledEvents?.find(e => e.type === 'OFFER_LETTER' && e.status !== 'COMPLETED');
                      const offerLetterDate = offerLetterEvent?.startTime || candidate.offerSentAt;
                      
                      const stepTemplate = currentStep ? departmentSteps.find(s => s.stepNumber === currentStep.step) : null;
                      if (stepTemplate) {
                        // If offer letter date exists, calculate from it
                        if (offerLetterDate) {
                          const offerDate = new Date(offerLetterDate);
                          const scheduledDate = new Date(offerDate);
                          const offset = stepTemplate.dueDateOffset !== undefined ? stepTemplate.dueDateOffset : 1;
                          scheduledDate.setDate(scheduledDate.getDate() + offset);
                          
                          if (stepTemplate.scheduledTime) {
                            const [hours, minutes] = stepTemplate.scheduledTime.split(':');
                            scheduledDate.setHours(parseInt(hours) || 14, parseInt(minutes) || 0, 0, 0);
                          } else {
                            scheduledDate.setHours(14, 0, 0, 0);
                          }
                          
                          // Set exact date/time first (source of truth)
                          const year = scheduledDate.getFullYear();
                          const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                          const day = String(scheduledDate.getDate()).padStart(2, '0');
                          const hour = String(scheduledDate.getHours()).padStart(2, '0');
                          const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                          setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                          
                          // Then initialize offset and time
                          setScheduleOffsetDays(offset);
                                // Use step template's scheduledTime for Offer Reminder (should be 14:00)
                                setScheduleOffsetTime(stepTemplate.scheduledTime || '14:00');
                        } else {
                          // Offer letter not sent yet - use default offset/time, calculate from current date
                          const offset = stepTemplate.dueDateOffset !== undefined ? stepTemplate.dueDateOffset : 1;
                          const defaultTime = stepTemplate.scheduledTime || '14:00';
                          setScheduleOffsetDays(offset);
                          setScheduleOffsetTime(defaultTime);
                          
                          // Calculate from today as placeholder
                          const today = new Date();
                          const scheduledDate = new Date(today);
                          scheduledDate.setDate(scheduledDate.getDate() + offset);
                          const [hours, minutes] = defaultTime.split(':');
                          scheduledDate.setHours(parseInt(hours) || 14, parseInt(minutes) || 0, 0, 0);
                          const year = scheduledDate.getFullYear();
                          const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                          const day = String(scheduledDate.getDate()).padStart(2, '0');
                          const hour = String(scheduledDate.getHours()).padStart(2, '0');
                          const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                          setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                        }
                      }
                    }}
                    className="mr-2"
                    disabled={!candidate.offerSentAt && !candidate.scheduledEvents?.find(e => e.type === 'OFFER_LETTER')}
                  />
                  <span className="text-sm">
                    Based on Offer Letter Date {(!candidate.offerSentAt && !candidate.scheduledEvents?.find(e => e.type === 'OFFER_LETTER')) && '(Will calculate when Step 1 is scheduled/completed)'}
                  </span>
                </label>
              </div>
              
              {scheduleMode === 'doj' && candidate.expectedJoiningDate && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-3">
                  <p className="text-xs text-blue-600 mb-2">
                    <strong>Base Date:</strong> {new Date(candidate.expectedJoiningDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Days Offset *</label>
                      <input
                        type="number"
                        value={scheduleOffsetDays}
                        onChange={(e) => {
                          const offset = parseInt(e.target.value) || 0;
                          setScheduleOffsetDays(offset);
                          // Recalculate and update scheduleDateTime
                          const doj = new Date(candidate.expectedJoiningDate);
                          const scheduledDate = new Date(doj);
                          scheduledDate.setDate(scheduledDate.getDate() + offset);
                          const [hours, minutes] = scheduleOffsetTime.split(':');
                          scheduledDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                          const year = scheduledDate.getFullYear();
                          const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                          const day = String(scheduledDate.getDate()).padStart(2, '0');
                          const hour = String(scheduledDate.getHours()).padStart(2, '0');
                          const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                          setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                        }}
                        className="input text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Time (HH:mm) *</label>
                      <input
                        type="time"
                        value={scheduleOffsetTime}
                        onChange={(e) => {
                          setScheduleOffsetTime(e.target.value);
                          // Recalculate and update scheduleDateTime
                          const doj = new Date(candidate.expectedJoiningDate);
                          const scheduledDate = new Date(doj);
                          scheduledDate.setDate(scheduledDate.getDate() + scheduleOffsetDays);
                          const [hours, minutes] = e.target.value.split(':');
                          scheduledDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                          const year = scheduledDate.getFullYear();
                          const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                          const day = String(scheduledDate.getDate()).padStart(2, '0');
                          const hour = String(scheduledDate.getHours()).padStart(2, '0');
                          const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                          setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                        }}
                        className="input text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {scheduleMode === 'offerLetter' && (() => {
                const offerLetterEvent = candidate.scheduledEvents?.find(e => e.type === 'OFFER_LETTER' && e.status !== 'COMPLETED');
                const offerLetterDate = offerLetterEvent?.startTime || candidate.offerSentAt;
                // If offer letter not sent yet, show warning message
                if (!offerLetterDate) {
                  return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-3">
                      <p className="text-xs text-yellow-800 mb-2">
                        ⚠️ Offer letter not sent yet. This will calculate automatically when Step 1 (Offer Letter) is scheduled or completed. You can still set offset and time now.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Days Offset *</label>
                          <input
                            type="number"
                            value={scheduleOffsetDays}
                            onChange={(e) => {
                              const offset = parseInt(e.target.value) || 0;
                              setScheduleOffsetDays(offset);
                              // Update scheduleDateTime based on current value
                              if (scheduleDateTime) {
                                const baseDate = new Date(scheduleDateTime);
                                const scheduledDate = new Date(baseDate);
                                scheduledDate.setDate(scheduledDate.getDate() + (offset - scheduleOffsetDays));
                                const [hours, minutes] = scheduleOffsetTime.split(':');
                                scheduledDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                                const year = scheduledDate.getFullYear();
                                const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                                const day = String(scheduledDate.getDate()).padStart(2, '0');
                                const hour = String(scheduledDate.getHours()).padStart(2, '0');
                                const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                                setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                              }
                            }}
                            className="input text-sm"
                            placeholder="1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Time (HH:mm) *</label>
                          <input
                            type="time"
                            value={scheduleOffsetTime}
                            onChange={(e) => {
                              setScheduleOffsetTime(e.target.value);
                              // Update time in scheduleDateTime
                              if (scheduleDateTime) {
                                const scheduledDate = new Date(scheduleDateTime);
                                const [hours, minutes] = e.target.value.split(':');
                                scheduledDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                                const year = scheduledDate.getFullYear();
                                const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                                const day = String(scheduledDate.getDate()).padStart(2, '0');
                                const hour = String(scheduledDate.getHours()).padStart(2, '0');
                                const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                                setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                              }
                            }}
                            className="input text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-3">
                    <p className="text-xs text-green-600 mb-2">
                      <strong>Base Date:</strong> {new Date(offerLetterDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} {offerLetterEvent?.startTime ? `at ${new Date(offerLetterEvent.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}` : ''}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Days Offset *</label>
                        <input
                          type="number"
                          value={scheduleOffsetDays}
                          onChange={(e) => {
                            const offset = parseInt(e.target.value) || 0;
                            setScheduleOffsetDays(offset);
                            // Recalculate and update scheduleDateTime
                            const offerDate = new Date(offerLetterDate);
                            const scheduledDate = new Date(offerDate);
                            scheduledDate.setDate(scheduledDate.getDate() + offset);
                            const [hours, minutes] = scheduleOffsetTime.split(':');
                            scheduledDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                            const year = scheduledDate.getFullYear();
                            const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                            const day = String(scheduledDate.getDate()).padStart(2, '0');
                            const hour = String(scheduledDate.getHours()).padStart(2, '0');
                            const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                            setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                          }}
                          className="input text-sm"
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Time (HH:mm) *</label>
                        <input
                          type="time"
                          value={scheduleOffsetTime}
                          onChange={(e) => {
                            setScheduleOffsetTime(e.target.value);
                            // Recalculate and update scheduleDateTime
                            // Use current scheduleDateTime as base if offer letter not sent yet
                            const baseDate = offerLetterDate ? new Date(offerLetterDate) : (scheduleDateTime ? new Date(scheduleDateTime) : new Date());
                            const scheduledDate = new Date(baseDate);
                            if (offerLetterDate) {
                              scheduledDate.setDate(scheduledDate.getDate() + scheduleOffsetDays);
                            }
                            const [hours, minutes] = e.target.value.split(':');
                            scheduledDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                            const year = scheduledDate.getFullYear();
                            const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
                            const day = String(scheduledDate.getDate()).padStart(2, '0');
                            const hour = String(scheduledDate.getHours()).padStart(2, '0');
                            const minute = String(scheduledDate.getMinutes()).padStart(2, '0');
                            setScheduleDateTime(`${year}-${month}-${day}T${hour}:${minute}`);
                          }}
                          className="input text-sm"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              {/* Only show Exact Date & Time field in option 1 (exact mode) */}
              {scheduleMode === 'exact' && (
                <>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Exact Date & Time *</label>
              <input 
                type="datetime-local" 
                value={scheduleDateTime}
                    onChange={(e) => {
                      setScheduleDateTime(e.target.value);
                      
                      // Recalculate offset and time from the new exact date/time
                      const exactDate = new Date(e.target.value);
                      
                      // If we have DOJ, calculate offset from DOJ
                      if (candidate.expectedJoiningDate) {
                        const doj = new Date(candidate.expectedJoiningDate);
                        const diffTime = exactDate.getTime() - doj.getTime();
                        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                        setScheduleOffsetDays(diffDays);
                      }
                      
                      // Extract time
                      const hours = String(exactDate.getHours()).padStart(2, '0');
                      const minutes = String(exactDate.getMinutes()).padStart(2, '0');
                      setScheduleOffsetTime(`${hours}:${minutes}`);
                    }}
                className="input w-full"
                required
              />
                </>
              )}
              
              {/* Show calculated date/time display for options 2 and 3 */}
              {(scheduleMode === 'doj' || scheduleMode === 'offerLetter') && scheduleDateTime && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-md p-3 mb-3">
                  <p className="text-sm text-indigo-800">
                    <strong>Calculated Date & Time:</strong> {new Date(scheduleDateTime).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at {new Date(scheduleDateTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </p>
                  <p className="text-xs text-indigo-600 mt-1">
                    This is calculated from your offset and time settings above. Switch to "Exact Date & Time" mode to manually edit.
                  </p>
                  {/* Hidden input to ensure scheduleDateTime is set for form validation */}
                  <input type="hidden" value={scheduleDateTime} required />
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Attachments (Optional) - Multiple files supported
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const newFiles = Array.from(e.target.files || []);
                  if (newFiles.length > 0) {
                    // Append new files to existing ones (don't replace)
                    const updatedFiles = [...scheduleAttachments, ...newFiles];
                    setScheduleAttachments(updatedFiles);
                    // For backward compatibility, also set single file (first one)
                    setScheduleAttachment(updatedFiles[0]);
                    // Show preview of existing + new files
                    const existingFileNames = existingAttachmentPaths.map(path => path.split('/').pop() || path);
                    updateAttachmentPreview(existingFileNames, updatedFiles);
                  }
                  // Reset file input to allow selecting same file again
                  e.target.value = '';
                }}
                className="input w-full"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              />
              {(existingAttachmentPaths.length > 0 || scheduleAttachments.length > 0) && (
                <div className="mt-2 space-y-1">
                  {/* Show existing attachments (from event) */}
                  {existingAttachmentPaths.map((path, index) => {
                    const fileName = path.split('/').pop() || path;
                    return (
                      <div key={`existing-${index}`} className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded">
                        <div className="flex items-center flex-1">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded mr-2">Existing</span>
                          <span className="text-sm text-gray-700 truncate flex-1">{fileName}</span>
                        </div>
                        <button
                          onClick={() => {
                            const updated = existingAttachmentPaths.filter((_, i) => i !== index);
                            setExistingAttachmentPaths(updated);
                            const existingFileNames = updated.map(p => p.split('/').pop() || p);
                            updateAttachmentPreview(existingFileNames, scheduleAttachments);
                          }}
                          className="text-red-500 hover:text-red-700 ml-2"
                          title="Remove existing attachment"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  
                  {/* Show new attachments (just uploaded) */}
                  {scheduleAttachments.map((file, index) => (
                    <div key={`new-${index}`} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center flex-1">
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded mr-2">New</span>
                        <span className="text-sm text-gray-600 truncate flex-1">{file.name}</span>
                      </div>
                      <button
                        onClick={() => {
                          const newFiles = scheduleAttachments.filter((_, i) => i !== index);
                          setScheduleAttachments(newFiles);
                          if (newFiles.length > 0) {
                            setScheduleAttachment(newFiles[0]);
                          } else if (existingAttachmentPaths.length === 0) {
                            setScheduleAttachment(null);
                          }
                          const existingFileNames = existingAttachmentPaths.map(p => p.split('/').pop() || p);
                          updateAttachmentPreview(existingFileNames, newFiles);
                        }}
                        className="text-red-500 hover:text-red-700 ml-2"
                        title="Remove new attachment"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Supported formats: PDF, DOC, DOCX, JPG, PNG (Max 10MB per file, up to 10 files)
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => { 
                  setShowScheduleModal(null); 
                  setScheduleDateTime(''); 
                  setScheduleDuration(60);
                  setEditingEventId(null);
                  setScheduleAttachment(null);
                  setScheduleAttachments([]);
                  setScheduleAttachmentPreview(null);
                }} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={handleScheduleSubmit} 
                disabled={!scheduleDateTime || actionLoading} 
                className="btn btn-primary"
              >
                {actionLoading ? 'Saving...' : editingEventId ? 'Update' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Confirm Action</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to mark Step {pendingStep} as completed? This action will update the candidate's workflow status.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setPendingStep(null);
                  setPendingAction(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className="btn btn-primary"
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : 'Yes, Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Candidate Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="ml-3 text-lg font-medium text-gray-900">Delete Candidate?</h3>
            </div>
            <div className="mb-6">
              <p className="text-sm text-gray-500">
                Are you sure you want to permanently delete <span className="font-medium text-gray-900">{candidate?.firstName} {candidate?.lastName}</span>?
              </p>
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs font-medium text-red-800 mb-2">⚠️ This action will permanently delete:</p>
                <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                  <li>Candidate profile and all information</li>
                  <li>All associated emails and email history</li>
                  <li>All calendar events and schedules</li>
                  <li>All tasks and reminders</li>
                  <li>All uploaded files (offer letters, signed offers, attachments)</li>
                  <li>All activity logs</li>
                </ul>
                <p className="text-xs font-medium text-red-800 mt-2">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                }}
                className="btn btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCandidate}
                className="btn bg-red-600 hover:bg-red-700 text-white"
                disabled={deleting}
              >
                {deleting ? (
                  <span className="flex items-center">
                    <div className="spinner mr-2" style={{ width: 16, height: 16 }}></div>
                    Deleting...
                  </span>
                ) : (
                  'Delete Permanently'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateDetail;
