import React, { useState, useEffect } from 'react';
import { configApi, templateApi } from '../services/api';
import toast from 'react-hot-toast';

// Helper function to format time from HH:MM to readable format (e.g., "14:00" -> "2:00 PM")
const formatTime = (timeString) => {
  if (!timeString) return '';
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

const Steps = () => {
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [departmentSteps, setDepartmentSteps] = useState([]);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showStepModal, setShowStepModal] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [stepForm, setStepForm] = useState({
    stepNumber: '',
    title: '',
    description: '',
    type: 'MANUAL',
    icon: '📋',
    emailTemplateId: '',
    scheduledTime: '',
    dueDateOffset: 0,
    schedulingMethod: 'doj' // 'doj', 'offerLetter', or 'manual'
  });

  useEffect(() => {
    fetchDepartments();
    fetchEmailTemplates();
  }, []);

  const fetchEmailTemplates = async () => {
    try {
      const response = await templateApi.getAll();
      setEmailTemplates(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch email templates:', error);
    }
  };

  useEffect(() => {
    if (selectedDepartment) {
      fetchDepartmentSteps();
    } else {
      setDepartmentSteps([]);
    }
  }, [selectedDepartment]);

  const fetchDepartments = async () => {
    try {
      const response = await configApi.getDepartments();
      setDepartments(response.data.data || []);
      if (response.data.data && response.data.data.length > 0) {
        setSelectedDepartment(response.data.data[0]);
      }
    } catch (error) {
      toast.error('Failed to fetch departments');
    }
  };

  const fetchDepartmentSteps = async () => {
    if (!selectedDepartment) return;
    
    try {
      setLoading(true);
      const response = await configApi.getDepartmentSteps(selectedDepartment);
      setDepartmentSteps(response.data.data || []);
    } catch (error) {
      if (error.response?.status === 404 || departmentSteps.length === 0) {
        setDepartmentSteps([]);
      } else {
        toast.error('Failed to fetch department steps');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInitDefaultSteps = async () => {
    if (!selectedDepartment) {
      toast.error('Please select a department first');
      return;
    }
    
    try {
      setLoading(true);
      await configApi.initDefaultSteps(selectedDepartment);
      toast.success(`Initialized default steps for ${selectedDepartment}!`);
      fetchDepartmentSteps();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to initialize default steps');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStep = () => {
    setEditingStep(null);
    setStepForm({
      stepNumber: departmentSteps.length + 1,
      title: '',
      description: '',
      type: 'MANUAL',
      icon: '📋',
      emailTemplateId: '',
      scheduledTime: '',
      dueDateOffset: 0,
      schedulingMethod: 'doj' // Default to DOJ-based scheduling
    });
    setShowStepModal(true);
  };

  const handleEditStep = (step) => {
    setEditingStep(step);
    // Determine scheduling method based on step type
    let schedulingMethod = 'doj'; // Default
    if (step.type === 'OFFER_REMINDER') {
      schedulingMethod = 'offerLetter'; // Offer Reminder uses offer letter date
    } else if (!step.scheduledTime && step.dueDateOffset === undefined) {
      schedulingMethod = 'manual'; // Manual if no scheduling config
    }
    
    // Debug: Log the step data to see what we're getting
    console.log('Editing step:', {
      id: step.id,
      scheduledTime: step.scheduledTime,
      dueDateOffset: step.dueDateOffset,
      type: step.type
    });
    
    setStepForm({
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description || '',
      type: step.type,
      icon: step.icon || '📋',
      emailTemplateId: step.emailTemplateId || '',
      // CRITICAL: Use step.scheduledTime if it exists (even if it's an empty string, check for null/undefined)
      scheduledTime: (step.scheduledTime !== null && step.scheduledTime !== undefined) ? step.scheduledTime : '',
      dueDateOffset: step.dueDateOffset !== undefined ? step.dueDateOffset : 0,
      schedulingMethod: step.schedulingMethod || schedulingMethod
    });
    setShowStepModal(true);
  };

  const handleSaveStep = async (e) => {
    e.preventDefault();
    
    // Validate: Email template is required
    if (!stepForm.emailTemplateId) {
      toast.error('Please select an email template for this step');
      return;
    }
    
    // Validate: If scheduling method is not manual, scheduledTime is required
    if (stepForm.schedulingMethod !== 'manual' && !stepForm.scheduledTime) {
      toast.error('Please set a default scheduled time for this step');
      return;
    }
    
    // Prepare data to send - ensure scheduledTime is included even if empty
    const dataToSend = {
      ...stepForm,
      department: selectedDepartment,
      // Ensure scheduledTime is sent (even if empty string, backend will handle it)
      scheduledTime: stepForm.scheduledTime || null,
      // Only send dueDateOffset if scheduling method is not manual
      dueDateOffset: stepForm.schedulingMethod === 'manual' ? null : (stepForm.dueDateOffset !== undefined ? stepForm.dueDateOffset : 0)
    };
    
    // Debug: Log what we're sending
    console.log('Saving step with data:', {
      scheduledTime: dataToSend.scheduledTime,
      dueDateOffset: dataToSend.dueDateOffset,
      schedulingMethod: dataToSend.schedulingMethod
    });
    
    try {
      setLoading(true);
      let response;
      if (editingStep) {
        response = await configApi.updateDepartmentStep(editingStep.id, dataToSend);
        toast.success('Step updated successfully!');
      } else {
        response = await configApi.createDepartmentStep(dataToSend);
        toast.success('Step created successfully!');
      }
      
      // Debug: Log what we got back
      console.log('Step saved, response:', {
        scheduledTime: response.data?.data?.scheduledTime,
        dueDateOffset: response.data?.data?.dueDateOffset
      });
      
      setShowStepModal(false);
      setEditingStep(null);
      // Refresh the steps list to get updated values
      await fetchDepartmentSteps();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save step');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStep = async (stepId) => {
    if (!window.confirm('Are you sure you want to delete this step? This will affect all future candidates in this department.')) {
      return;
    }
    
    try {
      setLoading(true);
      await configApi.deleteDepartmentStep(stepId);
      toast.success('Step deleted successfully!');
      fetchDepartmentSteps();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete step');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveStep = async (stepId, direction) => {
    const step = departmentSteps.find(s => s.id === stepId);
    if (!step) return;

    const currentIndex = departmentSteps.findIndex(s => s.id === stepId);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= departmentSteps.length) return;

    const targetStep = departmentSteps[newIndex];
    
    try {
      setLoading(true);
      // Use the dedicated reorder endpoint to swap step numbers
      await configApi.reorderDepartmentSteps(step.id, targetStep.id);
      toast.success('Step moved successfully!');
      // Refresh to get updated step numbers
      await fetchDepartmentSteps();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to move step');
      // Refresh to get correct state in case of error
      fetchDepartmentSteps();
    } finally {
      setLoading(false);
    }
  };

  if (loading && departmentSteps.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" style={{ width: 40, height: 40 }}></div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Department Steps</h1>
        <div className="flex space-x-3">
          {selectedDepartment && (
            <>
              {departmentSteps.length === 0 && (
                <button
                  onClick={handleInitDefaultSteps}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  Initialize Default Steps
                </button>
              )}
              <button
                onClick={handleCreateStep}
                className="btn btn-primary"
                disabled={loading}
              >
                + Add Step
              </button>
            </>
          )}
        </div>
      </div>

      {/* Department Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Department
        </label>
        <select
          value={selectedDepartment}
          onChange={(e) => setSelectedDepartment(e.target.value)}
          className="input w-full md:w-auto"
        >
          <option value="">Select a department</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>
      </div>

      {!selectedDepartment ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Please select a department to view and manage steps</p>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              📋 {selectedDepartment} Department Steps ({departmentSteps.length})
            </h2>
            {departmentSteps.length === 0 && (
              <button
                onClick={handleInitDefaultSteps}
                className="btn btn-secondary text-sm"
                disabled={loading}
              >
                Initialize Default 11 Steps
              </button>
            )}
          </div>

          {departmentSteps.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No steps configured for {selectedDepartment} department</p>
              <button
                onClick={handleInitDefaultSteps}
                className="btn btn-primary"
                disabled={loading}
              >
                Initialize Default 11 Steps
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {departmentSteps
                .sort((a, b) => a.stepNumber - b.stepNumber)
                .map((step, index) => (
                <div
                  key={step.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center flex-1">
                    <div className="flex flex-col mr-3">
                      <button
                        onClick={() => handleMoveStep(step.id, 'up')}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMoveStep(step.id, 'down')}
                        disabled={index === departmentSteps.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
                    <span className="text-2xl mr-3">{step.icon || '📋'}</span>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-500">Step {step.stepNumber}:</span>
                        <p className="font-medium text-gray-900">{step.title}</p>
                        {step.isAuto && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-semibold">
                            AUTO
                          </span>
                        )}
                      </div>
                      {step.description && (
                        <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                      )}
                      {step.scheduledTime && step.dueDateOffset !== undefined && (
                        <div className="mt-2 bg-blue-50 p-2 rounded-md border border-blue-200">
                          <div className="flex items-center space-x-2 flex-wrap mb-1">
                            <span className="text-xs font-semibold text-gray-700">Default Scheduled Time:</span>
                            <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-md font-medium">
                              ⏰ {formatTime(step.scheduledTime)}
                            </span>
                            <span className="text-xs text-gray-600">
                              (Day {step.dueDateOffset > 0 ? '+' : ''}{step.dueDateOffset} from candidate's DOJ)
                            </span>
                            <button
                              onClick={() => handleEditStep(step)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                              title="Click Edit to change scheduled time"
                            >
                              (Edit)
                            </button>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            <strong>How it works:</strong> For each candidate, this step will be scheduled at <strong>{formatTime(step.scheduledTime)}</strong> on the date that is <strong>{step.dueDateOffset === 0 ? 'the same as' : step.dueDateOffset > 0 ? step.dueDateOffset + ' days after' : Math.abs(step.dueDateOffset) + ' days before'}</strong> their Date of Joining (DOJ).
                          </p>
                        </div>
                      )}
                      {step.scheduledTime && step.dueDateOffset === undefined && (
                        <div className="mt-2 flex items-center space-x-2">
                          <span className="text-xs font-semibold text-gray-700">Default Scheduled Time:</span>
                          <span className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-md font-medium border border-blue-200">
                            ⏰ {formatTime(step.scheduledTime)}
                          </span>
                          <button
                            onClick={() => handleEditStep(step)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                            title="Click Edit to change scheduled time"
                          >
                            (Edit)
                          </button>
                        </div>
                      )}
                      {!step.scheduledTime && step.isAuto && (
                        <div className="mt-2">
                          <span className="text-xs text-gray-500 italic">No scheduled time set - will use default time when scheduling</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleEditStep(step)}
                      className="text-indigo-600 hover:text-indigo-700 text-sm"
                      disabled={loading}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDeleteStep(step.id)}
                      className="text-red-600 hover:text-red-700 text-sm"
                      disabled={loading}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step Modal */}
      {showStepModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingStep ? 'Edit Step' : 'Create New Step'}
            </h2>
            <form onSubmit={handleSaveStep}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Step Number (Position) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={stepForm.stepNumber}
                    onChange={(e) => setStepForm({ ...stepForm, stepNumber: parseInt(e.target.value) || 1 })}
                    className="input"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Position in the workflow (1 = first step, 2 = second step, etc.)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Step Title *
                  </label>
                  <input
                    type="text"
                    value={stepForm.title}
                    onChange={(e) => setStepForm({ ...stepForm, title: e.target.value })}
                    className="input"
                    placeholder="e.g., Send Offer Letter - {{firstName}} {{lastName}}"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use {'{{firstName}}'}, {'{{lastName}}'}, {'{{position}}'}, {'{{department}}'} as placeholders
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={stepForm.description}
                    onChange={(e) => setStepForm({ ...stepForm, description: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="Step description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Icon (Emoji)
                  </label>
                  <input
                    type="text"
                    value={stepForm.icon}
                    onChange={(e) => setStepForm({ ...stepForm, icon: e.target.value })}
                    className="input"
                    placeholder="📋"
                    maxLength={2}
                  />
                </div>

                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">⏰ Default Scheduling Configuration</h3>
                  
                  {/* Scheduling Method Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Scheduling Method *
                    </label>
                    <div className="flex space-x-4">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="schedulingMethod"
                          value="doj"
                          checked={stepForm.schedulingMethod === 'doj'}
                          onChange={(e) => setStepForm({ ...stepForm, schedulingMethod: e.target.value })}
                          className="mr-2"
                        />
                        <span className="text-sm">Based on DOJ</span>
                      </label>
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="schedulingMethod"
                          value="offerLetter"
                          checked={stepForm.schedulingMethod === 'offerLetter'}
                          onChange={(e) => setStepForm({ ...stepForm, schedulingMethod: e.target.value })}
                          className="mr-2"
                        />
                        <span className="text-sm">Based on Offer Letter Date</span>
                      </label>
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="schedulingMethod"
                          value="manual"
                          checked={stepForm.schedulingMethod === 'manual'}
                          onChange={(e) => setStepForm({ ...stepForm, schedulingMethod: e.target.value })}
                          className="mr-2"
                        />
                        <span className="text-sm">Manual (Exact Date & Time)</span>
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      How this step should be scheduled by default. "Based on DOJ" calculates from candidate's joining date. "Based on Offer Letter Date" calculates from when Step 1 (Offer Letter) is sent/scheduled. "Manual" requires HR to set exact date/time each time.
                    </p>
                  </div>

                  {/* Show offset and time inputs for DOJ and Offer Letter methods */}
                  {(stepForm.schedulingMethod === 'doj' || stepForm.schedulingMethod === 'offerLetter') && (
                    <>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Days Offset {stepForm.schedulingMethod === 'doj' ? 'from DOJ' : 'from Offer Letter Date'} *
                        </label>
                        <input
                          type="number"
                          value={stepForm.dueDateOffset !== undefined ? stepForm.dueDateOffset : ''}
                          onChange={(e) => setStepForm({ ...stepForm, dueDateOffset: e.target.value ? parseInt(e.target.value) : 0 })}
                          className="input"
                          placeholder={stepForm.schedulingMethod === 'offerLetter' ? '1' : '0'}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {stepForm.schedulingMethod === 'doj' 
                            ? 'Days from Date of Joining (DOJ). Use negative numbers for before DOJ (e.g., -1 for day before), 0 for on DOJ, positive for after DOJ.'
                            : 'Days from when Offer Letter (Step 1) is sent/scheduled. Use 1 for next day, 0 for same day, etc.'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Default Scheduled Time (HH:mm) ⏰ *
                        </label>
                        <input
                          type="time"
                          value={stepForm.scheduledTime ? stepForm.scheduledTime : ''}
                          onChange={(e) => {
                            console.log('Time changed to:', e.target.value);
                            setStepForm({ ...stepForm, scheduledTime: e.target.value });
                          }}
                          className="input"
                          placeholder={stepForm.schedulingMethod === 'offerLetter' ? '14:00' : '09:00'}
                          required={stepForm.schedulingMethod !== 'manual'}
                        />
                        {stepForm.scheduledTime && (
                          <p className="text-xs text-blue-600 mt-1 font-medium">
                            ⏰ Default time: {formatTime(stepForm.scheduledTime)}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Default time for this step (e.g., 14:00 for 2:00 PM, 08:30 for 8:30 AM). This time will be used when scheduling calendar events automatically. 
                          {stepForm.schedulingMethod === 'doj' && ' The date will be calculated as: DOJ + Days Offset, at this time.'}
                          {stepForm.schedulingMethod === 'offerLetter' && ' The date will be calculated as: Offer Letter Date + Days Offset, at this time.'}
                        </p>
                      </div>
                    </>
                  )}

                  {/* Show message for manual mode */}
                  {stepForm.schedulingMethod === 'manual' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      <p className="text-xs text-yellow-800">
                        <strong>Manual Scheduling:</strong> This step will require HR to set the exact date and time each time it's scheduled. No default timing will be applied.
                      </p>
                    </div>
                  )}
                </div>

                {/* Email Template Selection - REQUIRED */}
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Email Template *</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    Select an email template to use when this step is completed. Every step must use an existing template.
                  </p>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Template *
                    </label>
                    <select
                      value={stepForm.emailTemplateId || ''}
                      onChange={(e) => {
                        setStepForm({ 
                          ...stepForm, 
                          emailTemplateId: e.target.value || '',
                          emailTemplateType: '' // Clear type when template is selected
                        });
                      }}
                      className="input"
                      required
                    >
                      <option value="">-- Select an email template --</option>
                      {emailTemplates
                        .filter(t => t.isActive)
                        .map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name} ({template.type}{template.customEmailType ? ` - ${template.customEmailType}` : ''})
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      <strong>Required:</strong> Every step must have an email template. Create templates in the Templates page if needed.
                    </p>
                    {emailTemplates.filter(t => t.isActive).length === 0 && (
                      <p className="text-xs text-red-600 mt-1">
                        ⚠️ No active templates found. Please create templates in the Templates page first.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowStepModal(false);
                    setEditingStep(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : editingStep ? 'Update Step' : 'Create Step'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Steps;

