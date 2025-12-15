import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { calendarApi, candidateApi, configApi } from '../services/api';
import toast from 'react-hot-toast';

const Calendar = () => {
  const [events, setEvents] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('upcoming');
  const [stats, setStats] = useState(null);
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [showBatchScheduleModal, setShowBatchScheduleModal] = useState(false);
  const [batchScheduleData, setBatchScheduleData] = useState({
    eventType: '',
    dateTime: '',
    duration: 60
  });
  const [batchAttachments, setBatchAttachments] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [departmentSteps, setDepartmentSteps] = useState([]);
  // Removed single schedule mode - only batch mode is available
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState(null);

  useEffect(() => {
    fetchDepartments();
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedDepartment) {
      fetchDepartmentSteps();
      // Filter candidates by department
      fetchData();
    } else {
      setDepartmentSteps([]);
      fetchData();
    }
  }, [selectedDepartment]);

  const fetchDepartments = async () => {
    try {
      const response = await configApi.getDepartments();
      const depts = response.data.data || [];
      setDepartments(depts);
      if (depts.length > 0 && !selectedDepartment) {
        setSelectedDepartment(depts[0]);
      }
    } catch (error) {
      toast.error('Failed to fetch departments');
    }
  };

  const fetchDepartmentSteps = async () => {
    if (!selectedDepartment) return;
    
    try {
      const response = await configApi.getDepartmentSteps(selectedDepartment);
      const steps = response.data.data || [];
      steps.sort((a, b) => a.stepNumber - b.stepNumber);
      setDepartmentSteps(steps);
    } catch (error) {
      // If no steps found, use empty array
      setDepartmentSteps([]);
    }
  };

  const fetchData = async () => {
    try {
      const [todayRes, upcomingRes, statsRes, candidatesRes] = await Promise.all([
        calendarApi.getToday(),
        calendarApi.getUpcoming(14),
        calendarApi.getStats(),
        candidateApi.getAll({ limit: 1000 }) // Get all candidates for selection
      ]);
      setTodayEvents(todayRes.data.data);
      setUpcomingEvents(upcomingRes.data.data);
      setStats(statsRes.data.data);
      
      // Filter candidates by selected department
      let allCandidates = candidatesRes.data.data || [];
      if (selectedDepartment) {
        allCandidates = allCandidates.filter(c => c.department === selectedDepartment);
      }
      setCandidates(allCandidates);
    } catch (error) {
      toast.error('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (id) => {
    try {
      await calendarApi.complete(id, {});
      toast.success('Event marked as completed');
      fetchData();
    } catch (error) {
      toast.error('Failed to complete event');
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this event? The step will be reverted to unscheduled state.')) {
      return;
    }
    try {
      await calendarApi.cancel(id, { reason: 'Cancelled by user' });
      toast.success('Event cancelled and step reverted to unscheduled state');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel event');
    }
  };

  const getEventTypeIcon = (type) => {
    switch (type) {
      case 'HR_INDUCTION': return '🏢';
      case 'CEO_INDUCTION': return '👔';
      case 'CHECKIN_CALL': return '📞';
      case 'SALES_INDUCTION': return '📊';
      case 'TRAINING': return '📚';
      default: return '📅';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SCHEDULED': return 'badge-info';
      case 'COMPLETED': return 'badge-success';
      case 'CANCELLED': return 'badge-danger';
      case 'RESCHEDULED': return 'badge-warning';
      default: return 'badge-gray';
    }
  };

  const handleSelectCandidate = (candidateId) => {
    setSelectedCandidates(prev => 
      prev.includes(candidateId) 
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    );
  };

  const handleDeleteCandidate = (candidateId) => {
    const candidate = candidates.find(c => c.id === candidateId);
    setCandidateToDelete({ id: candidateId, name: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'this candidate' });
    setShowDeleteConfirm(true);
  };

  const confirmDeleteCandidate = () => {
    if (candidateToDelete) {
      setSelectedCandidates(prev => prev.filter(id => id !== candidateToDelete.id));
      setShowDeleteConfirm(false);
      setCandidateToDelete(null);
      toast.success('Participant removed');
    }
  };

  const handleSelectAll = () => {
    if (selectedCandidates.length === candidates.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(candidates.map(c => c.id));
    }
  };

  const handleBatchSchedule = async () => {
    if (!selectedDepartment) {
      toast.error('Please select a department first');
      return;
    }
    if (selectedCandidates.length === 0) {
      toast.error('Please select at least one candidate');
      return;
    }
    if (!batchScheduleData.eventType || !batchScheduleData.dateTime) {
      toast.error('Please fill in all required fields');
      return;
    }

    setBatchLoading(true);
    try {
      // Create FormData to handle file attachments
      const formData = new FormData();
      formData.append('candidateIds', JSON.stringify(selectedCandidates));
      formData.append('eventType', batchScheduleData.eventType);
      formData.append('dateTime', batchScheduleData.dateTime);
      formData.append('duration', batchScheduleData.duration.toString());
      
      // Append all attachments
      batchAttachments.forEach((file) => {
        formData.append('attachments', file);
      });

      // Batch mode only - schedule all at once
      await candidateApi.batchSchedule(formData);
      toast.success(`Successfully scheduled ${batchScheduleData.eventType} for ${selectedCandidates.length} candidate(s)`);
      setShowBatchScheduleModal(false);
      setSelectedCandidates([]);
      setBatchScheduleData({ eventType: '', dateTime: '', duration: 60 });
      setBatchAttachments([]);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to schedule events');
    } finally {
      setBatchLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" style={{ width: 40, height: 40 }}></div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <div className="flex gap-3">
          {selectedCandidates.length > 0 && (
            <button 
              onClick={() => setShowBatchScheduleModal(true)}
              className="btn btn-primary"
            >
              📅 Batch Schedule ({selectedCandidates.length})
            </button>
          )}
        </div>
      </div>

      {/* Department Selection */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Department Selection</h2>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Department *
          </label>
          <select
            value={selectedDepartment}
            onChange={(e) => {
              setSelectedDepartment(e.target.value);
              setSelectedCandidates([]); // Clear selection when department changes
            }}
            className="input w-full md:w-auto"
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Select a department to filter candidates and view department-specific steps
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-3xl font-bold text-indigo-600">{stats?.totalThisMonth || 0}</p>
          <p className="text-sm text-gray-500">This Month</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{stats?.completed || 0}</p>
          <p className="text-sm text-gray-500">Completed</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-blue-600">{stats?.upcoming || 0}</p>
          <p className="text-sm text-gray-500">Upcoming</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-600">{stats?.cancelled || 0}</p>
          <p className="text-sm text-gray-500">Cancelled</p>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex space-x-2 mb-6">
        <button
          onClick={() => setView('today')}
          className={`btn ${view === 'today' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Today ({todayEvents.length})
        </button>
        <button
          onClick={() => setView('upcoming')}
          className={`btn ${view === 'upcoming' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Upcoming ({upcomingEvents.length})
        </button>
      </div>

      {/* Candidate Selection for Scheduling */}
      {selectedDepartment && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Select Candidates for Batch Scheduling
              {selectedDepartment && <span className="text-sm font-normal text-gray-500 ml-2">({selectedDepartment})</span>}
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAll}
                className="btn btn-secondary text-sm"
                disabled={candidates.length === 0}
              >
                {selectedCandidates.length === candidates.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-sm text-gray-500">
                {selectedCandidates.length} selected
              </span>
            </div>
          </div>
        <div className="max-h-64 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {candidates.map((candidate) => {
              const isSelected = selectedCandidates.includes(candidate.id);
              return (
                <div
                  key={candidate.id}
                  className={`flex items-center p-3 border rounded-lg ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-gray-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectCandidate(candidate.id)}
                    className="mr-3 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {candidate.firstName} {candidate.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{candidate.email}</p>
                    <p className="text-xs text-gray-400">{candidate.position} • {candidate.department}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    {isSelected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCandidate(candidate.id);
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors"
                        title="Remove participant"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    <Link
                      to={`/candidates/${candidate.id}`}
                      className="text-indigo-600 hover:text-indigo-800 text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          {candidates.length === 0 && (
            <p className="text-gray-500 text-center py-4">
              {selectedDepartment 
                ? `No candidates found in ${selectedDepartment} department` 
                : 'Please select a department to view candidates'}
            </p>
          )}
        </div>
      </div>
      )}

      {/* Events List */}
      <div className="card">
        {view === 'today' && (
          <>
            <h2 className="text-lg font-semibold mb-4">Today's Events</h2>
            {todayEvents.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No events scheduled for today</p>
            ) : (
              <div className="space-y-4">
                {todayEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center">
                      <div className="text-3xl mr-4">{getEventTypeIcon(event.type)}</div>
                      <div>
                        <p className="font-medium">{event.title}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(event.startTime).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })} - {new Date(event.endTime).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        {event.candidate && (
                          <p className="text-sm text-indigo-600">{event.candidate.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`badge ${getStatusBadge(event.status)}`}>
                        {event.status}
                      </span>
                      {event.status === 'SCHEDULED' && (
                        <>
                          <button
                            onClick={() => handleComplete(event.id)}
                            className="text-green-600 hover:text-green-700 text-sm"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => handleCancel(event.id)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {event.meetingLink && (
                        <a
                          href={event.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary text-sm"
                        >
                          Join
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'upcoming' && (
          <>
            <h2 className="text-lg font-semibold mb-4">Upcoming Events (Next 14 Days)</h2>
            {upcomingEvents.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No upcoming events</p>
            ) : (
              <div className="space-y-4">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center">
                      <div className="text-3xl mr-4">{getEventTypeIcon(event.type)}</div>
                      <div>
                        <p className="font-medium">{event.title}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(event.startTime).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })} at {new Date(event.startTime).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        {event.candidate && (
                          <p className="text-sm text-indigo-600">{event.candidate.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`badge ${getStatusBadge(event.status)}`}>
                        {event.status}
                      </span>
                      {event.status === 'SCHEDULED' && (
                        <button
                          onClick={() => handleCancel(event.id)}
                          className="text-red-600 hover:text-red-700 text-sm"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Schedule Modal */}
      {showBatchScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              Batch Schedule Calendar Event
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Scheduling for {selectedCandidates.length} candidate(s)
              {selectedDepartment && (
                <span className="block text-xs text-gray-500 mt-1">Department: {selectedDepartment}</span>
              )}
            </p>
            
            {!selectedDepartment && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-sm text-yellow-800">
                  ⚠️ Please select a department first to see department-specific steps
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Event Type * {selectedDepartment && <span className="text-xs text-gray-500">({selectedDepartment} steps)</span>}
              </label>
              <select
                value={batchScheduleData.eventType}
                onChange={(e) => setBatchScheduleData({ ...batchScheduleData, eventType: e.target.value })}
                className="input w-full"
                disabled={!selectedDepartment || departmentSteps.length === 0}
              >
                <option value="">
                  {!selectedDepartment 
                    ? 'Select department first' 
                    : departmentSteps.length === 0 
                      ? 'No steps configured for this department' 
                      : 'Select event type'}
                </option>
                {departmentSteps.map((step) => (
                  <option key={step.id} value={step.type}>
                    Step {step.stepNumber}: {step.title} {step.isAuto && '(Auto)'}
                  </option>
                ))}
              </select>
              {selectedDepartment && departmentSteps.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  No steps configured for {selectedDepartment}. Please configure steps in the Steps section.
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date & Time *
              </label>
              <input
                type="datetime-local"
                value={batchScheduleData.dateTime}
                onChange={(e) => setBatchScheduleData({ ...batchScheduleData, dateTime: e.target.value })}
                className="input w-full"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (minutes)
              </label>
              <select
                value={batchScheduleData.duration}
                onChange={(e) => setBatchScheduleData({ ...batchScheduleData, duration: parseInt(e.target.value) })}
                className="input w-full"
              >
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Attachments (Optional)
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files);
                  setBatchAttachments(files);
                }}
                className="input w-full"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              />
              {batchAttachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {batchAttachments.map((file, index) => (
                    <div key={index} className="text-xs text-gray-600 flex items-center justify-between bg-gray-50 p-2 rounded">
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newFiles = [...batchAttachments];
                          newFiles.splice(index, 1);
                          setBatchAttachments(newFiles);
                        }}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Attach files that will be included in the email sent to candidates
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowBatchScheduleModal(false);
                  setBatchScheduleData({ eventType: '', dateTime: '', duration: 60 });
                  setBatchAttachments([]);
                }}
                className="btn btn-secondary"
                disabled={batchLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleBatchSchedule}
                className="btn btn-primary"
                disabled={batchLoading}
              >
                {batchLoading ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Participant Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="ml-3 text-lg font-medium text-gray-900">Remove Participant?</h3>
            </div>
            <div className="mb-6">
              <p className="text-sm text-gray-500">
                Are you sure you want to remove <span className="font-medium text-gray-900">{candidateToDelete?.name}</span> from the selected participants?
              </p>
              <p className="text-xs text-gray-400 mt-2">This action cannot be undone. You can re-select them later if needed.</p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setCandidateToDelete(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCandidate}
                className="btn bg-red-600 hover:bg-red-700 text-white"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
