import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { taskApi, candidateApi, configApi, templateApi } from '../services/api';
import toast from 'react-hot-toast';

const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [overdueTasks, setOverdueTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [departments, setDepartments] = useState([]);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [newTask, setNewTask] = useState({
    candidateId: '',
    type: 'MANUAL',
    title: '',
    description: '',
    dueDate: ''
  });
  const [showStepsSection, setShowStepsSection] = useState(false);
  const [departmentSteps, setDepartmentSteps] = useState([]);
  const [showStepModal, setShowStepModal] = useState(false);
  const [editingStep, setEditingStep] = useState(null);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [stepForm, setStepForm] = useState({
    stepNumber: '',
    title: '',
    description: '',
    type: 'MANUAL',
    icon: '📋',
    isAuto: false,
    dueDateOffset: 0,
    priority: 'MEDIUM',
    emailTemplateId: ''
  });

  useEffect(() => {
    fetchDepartments();
    fetchCandidates();
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
    fetchData();
    if (showStepsSection && selectedDepartment !== 'all') {
      fetchDepartmentSteps();
    }
  }, [selectedDepartment, showStepsSection]);

  const fetchDepartments = async () => {
    try {
      const response = await configApi.getDepartments();
      setDepartments(response.data.data || []);
    } catch (error) {
      // Fallback to common departments
      setDepartments(['Sales', 'Engineering', 'Marketing', 'HR', 'Operations', 'Finance']);
    }
  };

  const fetchCandidates = async () => {
    try {
      const response = await candidateApi.getAll({ limit: 100 });
      setCandidates(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch candidates');
    }
  };

  const fetchData = async () => {
    try {
      const params = selectedDepartment !== 'all' ? { department: selectedDepartment } : {};
      const [tasksRes, overdueRes, statsRes] = await Promise.all([
        taskApi.getAll(params),
        taskApi.getOverdue(),
        taskApi.getStats()
      ]);
      setTasks(tasksRes.data.data || []);
      setOverdueTasks(overdueRes.data.data || []);
      setStats(statsRes.data.data);
    } catch (error) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (id) => {
    try {
      await taskApi.complete(id, {});
      toast.success('Task completed!');
      fetchData();
    } catch (error) {
      toast.error('Failed to complete task');
    }
  };

  const handleSnooze = async (id) => {
    try {
      await taskApi.snooze(id, { hours: 24 });
      toast.success('Task snoozed for 24 hours');
      fetchData();
    } catch (error) {
      toast.error('Failed to snooze task');
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'HIGH': return 'badge-danger';
      case 'MEDIUM': return 'badge-warning';
      case 'LOW': return 'badge-info';
      default: return 'badge-gray';
    }
  };

  const getTaskTypeIcon = (type) => {
    switch (type) {
      case 'OFFER_REMINDER': return '📄';
      case 'FORM_REMINDER': return '📝';
      case 'WHATSAPP_ADD': return '💬';
      case 'CHECKIN_REMINDER': return '📞';
      case 'MANUAL_TASK': return '✅';
      default: return '📋';
    }
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    try {
      await taskApi.create({
        ...newTask,
        candidateId: newTask.candidateId || null,
        dueDate: newTask.dueDate || null
      });
      toast.success('Task created successfully!');
      setShowNewTaskModal(false);
      setNewTask({
        candidateId: '',
        type: 'MANUAL',
        title: '',
        description: '',
        dueDate: ''
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create task');
    }
  };

  const handleInitDepartmentTasks = async () => {
    if (!selectedDepartment || selectedDepartment === 'all') {
      toast.error('Please select a department first');
      return;
    }
    
    try {
      setLoading(true);
      await candidateApi.initDepartmentTasks({ department: selectedDepartment });
      toast.success(`Initialized tasks for ${selectedDepartment} department!`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to initialize department tasks');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartmentSteps = async () => {
    if (!selectedDepartment || selectedDepartment === 'all') return;
    
    try {
      const response = await configApi.getDepartmentSteps(selectedDepartment);
      setDepartmentSteps(response.data.data || []);
    } catch (error) {
      // If no steps exist, initialize defaults
      if (error.response?.status === 404 || departmentSteps.length === 0) {
        // Steps will be empty, user can initialize
      } else {
        toast.error('Failed to load department steps');
      }
    }
  };

  const handleInitDefaultSteps = async () => {
    if (!selectedDepartment || selectedDepartment === 'all') {
      toast.error('Please select a department first');
      return;
    }
    
    try {
      await configApi.initDefaultSteps(selectedDepartment);
      toast.success(`Initialized default steps for ${selectedDepartment}!`);
      fetchDepartmentSteps();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to initialize default steps');
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
      isAuto: false,
      dueDateOffset: 0,
      priority: 'MEDIUM',
      emailTemplateId: ''
    });
    setShowStepModal(true);
  };

  const handleEditStep = (step) => {
    setEditingStep(step);
    setStepForm({
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description || '',
      type: step.type,
      icon: step.icon || '📋',
      isAuto: step.isAuto || false,
      dueDateOffset: step.dueDateOffset !== null ? step.dueDateOffset : 0,
      priority: step.priority || 'MEDIUM',
      emailTemplateId: step.emailTemplateId || ''
    });
    setShowStepModal(true);
  };

  const handleSaveStep = async (e) => {
    e.preventDefault();
    
    // Validate: Email template is required
    if (!stepForm.emailTemplateId) {
      toast.error('Please select an email template for this step. Every step must have an email template.');
      return;
    }
    
    try {
      if (editingStep) {
        await configApi.updateDepartmentStep(editingStep.id, {
          ...stepForm,
          department: selectedDepartment
        });
        toast.success('Step updated successfully!');
      } else {
        await configApi.createDepartmentStep({
          ...stepForm,
          department: selectedDepartment
        });
        toast.success('Step created successfully!');
      }
      setShowStepModal(false);
      fetchDepartmentSteps();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save step');
    }
  };

  const handleDeleteStep = async (stepId) => {
    if (!window.confirm('Are you sure you want to delete this step? This will affect all future candidates in this department.')) {
      return;
    }
    
    try {
      await configApi.deleteDepartmentStep(stepId);
      toast.success('Step deleted successfully!');
      fetchDepartmentSteps();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete step');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" style={{ width: 40, height: 40 }}></div>
      </div>
    );
  }

  const filteredTasks = filter === 'overdue' 
    ? overdueTasks 
    : filter === 'today'
      ? tasks.filter(t => {
          const today = new Date().toDateString();
          return new Date(t.dueDate).toDateString() === today;
        })
      : tasks;

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <div className="flex space-x-3">
          {selectedDepartment !== 'all' && (
            <button 
              onClick={handleInitDepartmentTasks}
              className="btn btn-secondary"
              disabled={loading}
            >
              Initialize {selectedDepartment} Tasks
            </button>
          )}
          <button 
            onClick={() => setShowNewTaskModal(true)}
            className="btn btn-primary"
          >
            + New Task
          </button>
        </div>
      </div>

      {/* Department Filter */}
      <div className="mb-4 flex items-end space-x-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Department
          </label>
          <select
            value={selectedDepartment}
            onChange={(e) => {
              setSelectedDepartment(e.target.value);
              setLoading(true);
            }}
            className="input w-full md:w-auto"
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
        {selectedDepartment !== 'all' && (
          <button
            onClick={() => setShowStepsSection(!showStepsSection)}
            className="btn btn-secondary"
          >
            {showStepsSection ? 'Hide' : 'Manage'} Steps
          </button>
        )}
      </div>

      {/* Department Steps Management Section */}
      {showStepsSection && selectedDepartment !== 'all' && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              📋 {selectedDepartment} Department Steps ({departmentSteps.length})
            </h2>
            <div className="flex space-x-2">
              {departmentSteps.length === 0 && (
                <button
                  onClick={handleInitDefaultSteps}
                  className="btn btn-secondary text-sm"
                >
                  Initialize Default Steps
                </button>
              )}
              <button
                onClick={handleCreateStep}
                className="btn btn-primary text-sm"
              >
                + Add Step
              </button>
            </div>
          </div>

          {departmentSteps.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No steps configured for {selectedDepartment} department</p>
              <button
                onClick={handleInitDefaultSteps}
                className="btn btn-primary"
              >
                Initialize Default 11 Steps
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {departmentSteps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center flex-1">
                    <span className="text-2xl mr-3">{step.icon || '📋'}</span>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-500">Step {step.stepNumber}:</span>
                        <p className="font-medium text-gray-900">{step.title}</p>
                        {step.isAuto && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">AUTO</span>
                        )}
                      </div>
                      {step.description && (
                        <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                      )}
                      <div className="flex items-center space-x-3 mt-2">
                        <span className="text-xs text-gray-500">Type: {step.type}</span>
                        <span className="text-xs text-gray-500">Priority: {step.priority}</span>
                        {step.dueDateOffset !== null && (
                          <span className="text-xs text-gray-500">
                            Due: {step.dueDateOffset < 0 ? `${Math.abs(step.dueDateOffset)} days before` : step.dueDateOffset === 0 ? 'On joining day' : `${step.dueDateOffset} days after`} joining
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleEditStep(step)}
                      className="text-indigo-600 hover:text-indigo-700 text-sm"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDeleteStep(step.id)}
                      className="text-red-600 hover:text-red-700 text-sm"
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-3xl font-bold text-indigo-600">{stats?.pending || 0}</p>
          <p className="text-sm text-gray-500">Pending</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-600">{stats?.overdue || 0}</p>
          <p className="text-sm text-gray-500">Overdue</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{stats?.completed || 0}</p>
          <p className="text-sm text-gray-500">Completed</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-600">{stats?.completionRate || 0}%</p>
          <p className="text-sm text-gray-500">Completion Rate</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
        >
          All ({tasks.length})
        </button>
        <button
          onClick={() => setFilter('today')}
          className={`btn ${filter === 'today' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Today
        </button>
        <button
          onClick={() => setFilter('overdue')}
          className={`btn ${filter === 'overdue' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Overdue ({overdueTasks.length})
        </button>
      </div>

      {/* Tasks List */}
      <div className="card">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {selectedDepartment !== 'all' 
                ? `No tasks found for ${selectedDepartment} department`
                : 'No tasks found'}
            </p>
            {selectedDepartment !== 'all' && (
              <button
                onClick={() => {
                  setSelectedDepartment('all');
                  setLoading(true);
                }}
                className="text-indigo-600 hover:text-indigo-700 mt-2 text-sm"
              >
                Show all tasks
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div 
                key={task.id} 
                className={`flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 ${
                  isOverdue(task.dueDate) ? 'border-red-200 bg-red-50' : ''
                }`}
              >
                <div className="flex items-center flex-1">
                  <button
                    onClick={() => handleComplete(task.id)}
                    className="w-6 h-6 border-2 border-gray-300 rounded mr-4 hover:border-green-500 hover:bg-green-50 flex items-center justify-center"
                  >
                    {task.status === 'COMPLETED' && <span className="text-green-500">✓</span>}
                  </button>
                  <div className="text-2xl mr-3">{getTaskTypeIcon(task.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{task.title || task.message}</p>
                    <div className="flex items-center space-x-3 mt-1">
                      {task.candidate && (
                        <>
                          <Link 
                            to={`/candidates/${task.candidate.id}`}
                            className="text-sm text-indigo-600 hover:text-indigo-700"
                          >
                            {task.candidate.firstName} {task.candidate.lastName}
                          </Link>
                          <span className="text-sm text-gray-400">•</span>
                          <span className="text-sm text-gray-500">
                            {task.candidate.department}
                          </span>
                        </>
                      )}
                      {task.dueDate && (
                        <>
                          <span className="text-sm text-gray-400">•</span>
                          <span className="text-sm text-gray-500">
                            Due: {new Date(task.dueDate).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`badge ${getPriorityBadge(task.metadata?.priority)}`}>
                    {task.metadata?.priority || 'MEDIUM'}
                  </span>
                  {isOverdue(task.dueDate) && task.status !== 'COMPLETED' && (
                    <span className="badge badge-danger">OVERDUE</span>
                  )}
                  {task.status !== 'COMPLETED' && (
                    <>
                      <button
                        onClick={() => handleSnooze(task.id)}
                        className="text-gray-500 hover:text-gray-700 text-sm"
                      >
                        Snooze
                      </button>
                      <button
                        onClick={() => handleComplete(task.id)}
                        className="text-green-600 hover:text-green-700 text-sm font-medium"
                      >
                        Complete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Create New Task</h2>
            <form onSubmit={handleCreateTask}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Candidate (Optional)
                  </label>
                  <select
                    value={newTask.candidateId}
                    onChange={(e) => setNewTask({ ...newTask, candidateId: e.target.value })}
                    className="input"
                  >
                    <option value="">Select a candidate (optional)</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.firstName} {candidate.lastName} - {candidate.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Task Type *
                  </label>
                  <select
                    value={newTask.type}
                    onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
                    className="input"
                    required
                  >
                    <option value="MANUAL">Manual Task</option>
                    <option value="OFFER_REMINDER">Offer Reminder</option>
                    <option value="FORM_REMINDER">Form Reminder</option>
                    <option value="WHATSAPP_ADD">WhatsApp Addition</option>
                    <option value="CHECKIN_REMINDER">Check-in Reminder</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="input"
                    placeholder="Enter task title"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="input"
                    rows={4}
                    placeholder="Enter task description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="datetime-local"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewTaskModal(false);
                    setNewTask({
                      candidateId: '',
                      type: 'MANUAL',
                      title: '',
                      description: '',
                      dueDate: ''
                    });
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Task
                </button>
              </div>
            </form>
          </div>
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Task Type *
                    </label>
                    <select
                      value={stepForm.type}
                      onChange={(e) => setStepForm({ ...stepForm, type: e.target.value })}
                      className="input"
                      required
                    >
                      <option value="OFFER_LETTER">Offer Letter</option>
                      <option value="OFFER_REMINDER">Offer Reminder</option>
                      <option value="WELCOME_EMAIL">Welcome Email</option>
                      <option value="HR_INDUCTION">HR Induction</option>
                      <option value="WHATSAPP_ADDITION">WhatsApp Addition</option>
                      <option value="ONBOARDING_FORM">Onboarding Form</option>
                      <option value="FORM_REMINDER">Form Reminder</option>
                      <option value="CEO_INDUCTION">CEO Induction</option>
                      <option value="SALES_INDUCTION">Sales Induction</option>
                      <option value="DEPARTMENT_INDUCTION">Department Induction</option>
                      <option value="TRAINING_PLAN">Training Plan</option>
                      <option value="CHECKIN_CALL">Check-in Call</option>
                      <option value="MANUAL">Manual Task</option>
                    </select>
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Due Date Offset (Days)
                    </label>
                    <input
                      type="number"
                      value={stepForm.dueDateOffset}
                      onChange={(e) => setStepForm({ ...stepForm, dueDateOffset: parseInt(e.target.value) || 0 })}
                      className="input"
                      placeholder="0 = on joining day, -1 = day before, 7 = 7 days after"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Negative = before joining, Positive = after joining, 0 = on joining day
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <select
                      value={stepForm.priority}
                      onChange={(e) => setStepForm({ ...stepForm, priority: e.target.value })}
                      className="input"
                    >
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={stepForm.isAuto}
                      onChange={(e) => setStepForm({ ...stepForm, isAuto: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Auto-scheduled</span>
                  </label>
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
                          emailTemplateId: e.target.value || ''
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
                <button type="submit" className="btn btn-primary">
                  {editingStep ? 'Update Step' : 'Create Step'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
