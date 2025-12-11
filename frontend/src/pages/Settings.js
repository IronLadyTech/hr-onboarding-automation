import React, { useState, useEffect } from 'react';
import { configApi } from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Settings = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [config, setConfig] = useState({});
  const [whatsappGroups, setWhatsappGroups] = useState([]);
  const [trainingPlans, setTrainingPlans] = useState([]);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [newGroup, setNewGroup] = useState({ name: '', department: '', description: '' });
  const [showAddGroup, setShowAddGroup] = useState(false);
  
  // Department management state
  const [departments, setDepartments] = useState([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [editingDepartmentName, setEditingDepartmentName] = useState('');
  const [departmentLoading, setDepartmentLoading] = useState(false);

  useEffect(() => {
    fetchData();
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await configApi.getDepartments();
      setDepartments(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch departments:', error);
      toast.error('Failed to load departments');
    }
  };

  const fetchData = async () => {
    try {
      const [workflowRes, groupsRes, plansRes] = await Promise.all([
        configApi.getWorkflow(),
        configApi.getWhatsAppGroups(),
        configApi.getTrainingPlans()
      ]);
      
      // Convert array to object for easier access
      const configObj = {};
      if (Array.isArray(workflowRes.data.data)) {
        workflowRes.data.data.forEach(item => {
          configObj[item.key] = item.value;
        });
      } else {
        Object.assign(configObj, workflowRes.data.data);
      }
      
      setConfig(configObj);
      setWhatsappGroups(groupsRes.data.data || []);
      setTrainingPlans(plansRes.data.data || []);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await configApi.updateWorkflow(config);
      toast.success('Settings saved successfully!');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleAddGroup = async () => {
    try {
      await configApi.createWhatsAppGroup(newGroup);
      toast.success('WhatsApp group added');
      setNewGroup({ name: '', department: '', description: '' });
      setShowAddGroup(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to add group');
    }
  };

  const handleDeleteGroup = async (id) => {
    if (!window.confirm('Delete this group?')) return;
    try {
      await configApi.deleteWhatsAppGroup(id);
      toast.success('Group deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete group');
    }
  };

  const handleCreateDepartment = async () => {
    if (!newDepartmentName.trim()) {
      toast.error('Please enter a department name');
      return;
    }

    setDepartmentLoading(true);
    try {
      await configApi.createDepartment({ name: newDepartmentName.trim() });
      toast.success('Department created successfully!');
      setNewDepartmentName('');
      fetchDepartments();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create department');
    } finally {
      setDepartmentLoading(false);
    }
  };

  const handleUpdateDepartment = async (oldName) => {
    if (!editingDepartmentName.trim() || editingDepartmentName === oldName) {
      return;
    }

    setDepartmentLoading(true);
    try {
      await configApi.updateDepartment(oldName, { newName: editingDepartmentName.trim() });
      toast.success('Department updated successfully!');
      setEditingDepartment(null);
      setEditingDepartmentName('');
      fetchDepartments();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update department');
    } finally {
      setDepartmentLoading(false);
    }
  };

  const handleDeleteDepartment = async (name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    setDepartmentLoading(true);
    try {
      await configApi.deleteDepartment(name);
      toast.success('Department deleted successfully!');
      fetchDepartments();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete department');
    } finally {
      setDepartmentLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" style={{ width: 40, height: 40 }}></div>
      </div>
    );
  }

  const tabs = [
    { id: 'company', label: 'Company', icon: '🏢' },
    { id: 'departments', label: 'Departments', icon: '🏛️' },
    { id: 'automation', label: 'Automation (11 Steps)', icon: '⚡' },
    { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
    { id: 'training', label: 'Training Plans', icon: '📚' },
  ];

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? 'Saving...' : '💾 Save All Changes'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Company Settings */}
      {activeTab === 'company' && (
        <div className="space-y-6">
          {/* Company Information */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">🏢 Company Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={config.company_name || ''}
                  onChange={(e) => updateConfig('company_name', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Office Address</label>
                <input
                  type="text"
                  value={config.company_address || ''}
                  onChange={(e) => updateConfig('company_address', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Office Timings</label>
                <input
                  type="text"
                  value={config.company_timings || ''}
                  onChange={(e) => updateConfig('company_timings', e.target.value)}
                  className="input"
                  placeholder="9:30 AM - 6:30 PM"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HR Contact Phone</label>
                <input
                  type="text"
                  value={config.company_phone || ''}
                  onChange={(e) => updateConfig('company_phone', e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* HR Configuration */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">👤 HR Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HR Name (for emails)</label>
                <input
                  type="text"
                  value={config.hr_name || ''}
                  onChange={(e) => updateConfig('hr_name', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HR Email</label>
                <input
                  type="email"
                  value={config.hr_email || ''}
                  onChange={(e) => updateConfig('hr_email', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HR Phone</label>
                <input
                  type="text"
                  value={config.hr_phone || ''}
                  onChange={(e) => updateConfig('hr_phone', e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* CEO Configuration */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">👔 CEO Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CEO Name</label>
                <input
                  type="text"
                  value={config.ceo_name || ''}
                  onChange={(e) => updateConfig('ceo_name', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CEO Email</label>
                <input
                  type="email"
                  value={config.ceo_email || ''}
                  onChange={(e) => updateConfig('ceo_email', e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Sales Head Configuration */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">📈 Sales Head Configuration (Brunda)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sales Head Name</label>
                <input
                  type="text"
                  value={config.sales_head_name || ''}
                  onChange={(e) => updateConfig('sales_head_name', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sales Head Email</label>
                <input
                  type="email"
                  value={config.sales_head_email || ''}
                  onChange={(e) => updateConfig('sales_head_email', e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Day 1 Documents */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">📄 Day 1 Documents (for Welcome Email)</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Documents to bring on Day 1 (comma-separated)
              </label>
              <textarea
                value={config.day1_documents || ''}
                onChange={(e) => updateConfig('day1_documents', e.target.value)}
                className="input"
                rows={3}
                placeholder="Aadhaar Card,PAN Card,Educational Certificates..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Department Management */}
      {activeTab === 'departments' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">🏛️ Department Management</h2>
            <p className="text-sm text-gray-600 mb-4">
              Create, edit, and delete departments. New departments work exactly like existing ones.
            </p>

            {/* Create New Department */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium mb-3">Create New Department</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newDepartmentName}
                  onChange={(e) => setNewDepartmentName(e.target.value)}
                  placeholder="Enter department name (e.g., Product, Design)"
                  className="input flex-1"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateDepartment();
                    }
                  }}
                />
                <button
                  onClick={handleCreateDepartment}
                  disabled={!newDepartmentName.trim() || departmentLoading}
                  className="btn btn-primary"
                >
                  {departmentLoading ? 'Creating...' : '+ Create'}
                </button>
              </div>
            </div>

            {/* Departments List */}
            <div>
              <h3 className="font-medium mb-3">Existing Departments</h3>
              {departments.length === 0 ? (
                <p className="text-gray-500 text-sm">No departments found. Create one above.</p>
              ) : (
                <div className="space-y-2">
                  {departments.map((dept) => (
                    <div
                      key={dept}
                      className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-gray-50"
                    >
                      {editingDepartment === dept ? (
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="text"
                            value={editingDepartmentName}
                            onChange={(e) => setEditingDepartmentName(e.target.value)}
                            className="input flex-1"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdateDepartment(dept);
                              } else if (e.key === 'Escape') {
                                setEditingDepartment(null);
                                setEditingDepartmentName('');
                              }
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateDepartment(dept)}
                            disabled={!editingDepartmentName.trim() || editingDepartmentName === dept || departmentLoading}
                            className="btn btn-primary text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingDepartment(null);
                              setEditingDepartmentName('');
                            }}
                            className="btn btn-secondary text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium">{dept}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingDepartment(dept);
                                setEditingDepartmentName(dept);
                              }}
                              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteDepartment(dept)}
                              disabled={departmentLoading}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Automation Settings (11 Steps) */}
      {activeTab === 'automation' && (
        <div className="space-y-6">
          {/* Master Switch */}
          <div className="card bg-indigo-50 border-indigo-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-indigo-900">🔌 Master Automation Switch</h2>
                <p className="text-sm text-indigo-700">Enable/disable all automations</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.automation_enabled === 'true'}
                  onChange={(e) => updateConfig('automation_enabled', e.target.checked ? 'true' : 'false')}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all"></div>
              </label>
            </div>
          </div>

          {/* Step 1: Offer Letter */}
          <div className="card">
            <h3 className="text-md font-semibold mb-3 flex items-center">
              <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">1</span>
              Offer Letter Email
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Offer Deadline (days to sign)</label>
                <input
                  type="number"
                  value={config.offer_deadline_days || '7'}
                  onChange={(e) => updateConfig('offer_deadline_days', e.target.value)}
                  className="input"
                  min="1" max="30"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">HR uploads offer letter → clicks Send → Email sent automatically</p>
          </div>

          {/* Step 2: Offer Reminder */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">2</span>
                Offer Reminder (Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.offer_reminder_enabled === 'true'}
                  onChange={(e) => updateConfig('offer_reminder_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send reminder after (days)</label>
                <input
                  type="number"
                  value={config.offer_reminder_days || '3'}
                  onChange={(e) => updateConfig('offer_reminder_days', e.target.value)}
                  className="input"
                  min="1" max="14"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">If offer not signed within X days, auto-send reminder</p>
          </div>

          {/* Step 3: Welcome Email */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">3</span>
                Welcome Email - Day Minus 1 (Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.welcome_email_enabled === 'true'}
                  onChange={(e) => updateConfig('welcome_email_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send (days before joining)</label>
                <input
                  type="number"
                  value={config.welcome_email_days_before || '1'}
                  onChange={(e) => updateConfig('welcome_email_days_before', e.target.value)}
                  className="input"
                  min="1" max="7"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Auto-sends welcome email with Day 1 details</p>
          </div>

          {/* Step 4: HR Induction */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">4</span>
                HR Induction Calendar Invite (Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.hr_induction_enabled === 'true'}
                  onChange={(e) => updateConfig('hr_induction_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Time</label>
                <input
                  type="time"
                  value={config.hr_induction_time || '09:30'}
                  onChange={(e) => updateConfig('hr_induction_time', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={config.hr_induction_duration || '90'}
                  onChange={(e) => updateConfig('hr_induction_duration', e.target.value)}
                  className="input"
                  min="15" max="180"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Link (optional)</label>
                <input
                  type="text"
                  value={config.hr_induction_link || ''}
                  onChange={(e) => updateConfig('hr_induction_link', e.target.value)}
                  className="input"
                  placeholder="Leave empty to auto-create"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Auto-schedules on joining day at specified time</p>
          </div>

          {/* Step 5: WhatsApp Task */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">5</span>
                WhatsApp Group Task (Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.whatsapp_task_enabled === 'true'}
                  onChange={(e) => updateConfig('whatsapp_task_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Introduction Message Template</label>
              <textarea
                value={config.whatsapp_intro_template || ''}
                onChange={(e) => updateConfig('whatsapp_intro_template', e.target.value)}
                className="input"
                rows={4}
                placeholder="Hi everyone! 👋 Please welcome *{{candidateName}}*..."
              />
              <p className="text-xs text-gray-500 mt-1">Variables: {'{{candidateName}}'}, {'{{position}}'}, {'{{department}}'}</p>
            </div>
          </div>

          {/* Step 6: Onboarding Form */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">6</span>
                Onboarding Form Email (Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.onboarding_form_enabled === 'true'}
                  onChange={(e) => updateConfig('onboarding_form_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Form URL (Zoho/Google Forms)</label>
                <input
                  type="text"
                  value={config.onboarding_form_link || ''}
                  onChange={(e) => updateConfig('onboarding_form_link', e.target.value)}
                  className="input"
                  placeholder="https://forms.google.com/..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send after induction (hours)</label>
                <input
                  type="number"
                  value={config.onboarding_form_delay_hours || '1'}
                  onChange={(e) => updateConfig('onboarding_form_delay_hours', e.target.value)}
                  className="input"
                  min="0" max="24"
                />
              </div>
            </div>
          </div>

          {/* Step 7: Form Reminder */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">7</span>
                Form Reminder (Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.form_reminder_enabled === 'true'}
                  onChange={(e) => updateConfig('form_reminder_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send reminder after (hours)</label>
                <input
                  type="number"
                  value={config.form_reminder_hours || '24'}
                  onChange={(e) => updateConfig('form_reminder_hours', e.target.value)}
                  className="input"
                  min="1" max="72"
                />
              </div>
            </div>
          </div>

          {/* Step 8: CEO Induction */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">8</span>
                CEO Induction (Semi-Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.ceo_induction_enabled === 'true'}
                  onChange={(e) => updateConfig('ceo_induction_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Day</label>
                <select
                  value={config.ceo_induction_day || '1'}
                  onChange={(e) => updateConfig('ceo_induction_day', e.target.value)}
                  className="input"
                >
                  <option value="1">Day 1 (Joining Day)</option>
                  <option value="2">Day 2</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Time</label>
                <input
                  type="time"
                  value={config.ceo_induction_time || '11:00'}
                  onChange={(e) => updateConfig('ceo_induction_time', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={config.ceo_induction_duration || '60'}
                  onChange={(e) => updateConfig('ceo_induction_duration', e.target.value)}
                  className="input"
                  min="15" max="120"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">HR confirms timing with CEO → clicks Schedule → Invite sent</p>
          </div>

          {/* Step 9: Sales Induction */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">9</span>
                Sales Induction with Brunda (Semi-Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.sales_induction_enabled === 'true'}
                  onChange={(e) => updateConfig('sales_induction_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Day</label>
                <select
                  value={config.sales_induction_day || '2'}
                  onChange={(e) => updateConfig('sales_induction_day', e.target.value)}
                  className="input"
                >
                  <option value="1">Day 1</option>
                  <option value="2">Day 2</option>
                  <option value="3">Day 3</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Time</label>
                <input
                  type="time"
                  value={config.sales_induction_time || '14:00'}
                  onChange={(e) => updateConfig('sales_induction_time', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={config.sales_induction_duration || '90'}
                  onChange={(e) => updateConfig('sales_induction_duration', e.target.value)}
                  className="input"
                  min="15" max="180"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Applicable Departments (comma-separated)</label>
              <input
                type="text"
                value={config.sales_induction_departments || ''}
                onChange={(e) => updateConfig('sales_induction_departments', e.target.value)}
                className="input"
                placeholder="Sales,Business Development,Marketing"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">Only for specified departments. HR confirms → Schedule → Invite sent</p>
          </div>

          {/* Step 10: Training Plan */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">10</span>
                Training Plan Email (Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.training_plan_enabled === 'true'}
                  onChange={(e) => updateConfig('training_plan_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send on Day</label>
                <select
                  value={config.training_plan_day || '3'}
                  onChange={(e) => updateConfig('training_plan_day', e.target.value)}
                  className="input"
                >
                  <option value="1">Day 1</option>
                  <option value="2">Day 2</option>
                  <option value="3">Day 3</option>
                  <option value="4">Day 4</option>
                  <option value="5">Day 5</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Uses department-specific training plan from Training Plans tab</p>
          </div>

          {/* Step 11: Check-in Call */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">11</span>
                HR Check-in Call (Auto)
              </h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.checkin_call_enabled === 'true'}
                  onChange={(e) => updateConfig('checkin_call_enabled', e.target.checked ? 'true' : 'false')}
                  className="mr-2 h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule on Day</label>
                <input
                  type="number"
                  value={config.checkin_call_day || '7'}
                  onChange={(e) => updateConfig('checkin_call_day', e.target.value)}
                  className="input"
                  min="1" max="30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Time</label>
                <input
                  type="time"
                  value={config.checkin_call_time || '10:00'}
                  onChange={(e) => updateConfig('checkin_call_time', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={config.checkin_call_duration || '30'}
                  onChange={(e) => updateConfig('checkin_call_duration', e.target.value)}
                  className="input"
                  min="15" max="60"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Auto-schedules check-in call on specified day after joining</p>
          </div>

          {/* Email Tracking */}
          <div className="card">
            <h3 className="text-md font-semibold mb-3">📊 Email Tracking</h3>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.email_tracking_enabled === 'true'}
                onChange={(e) => updateConfig('email_tracking_enabled', e.target.checked ? 'true' : 'false')}
                className="mr-2 h-4 w-4 text-indigo-600 rounded"
              />
              <span className="text-sm">Track email opens and clicks</span>
            </label>
          </div>
        </div>
      )}

      {/* WhatsApp Groups */}
      {activeTab === 'whatsapp' && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">💬 WhatsApp Groups</h2>
            <button 
              onClick={() => setShowAddGroup(true)} 
              className="btn btn-primary text-sm"
            >
              + Add Group
            </button>
          </div>

          {/* Add Group Form */}
          {showAddGroup && (
            <div className="mb-6 p-4 border rounded-lg bg-gray-50">
              <h3 className="font-medium mb-3">Add New Group</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="text"
                  placeholder="Group Name"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  className="input"
                />
                <select
                  value={newGroup.department}
                  onChange={(e) => setNewGroup({ ...newGroup, department: e.target.value })}
                  className="input"
                >
                  <option value="">Select Department</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Description"
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  className="input"
                />
              </div>
              <div className="mt-3 flex space-x-2">
                <button onClick={handleAddGroup} className="btn btn-primary text-sm">Save</button>
                <button onClick={() => setShowAddGroup(false)} className="btn btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600 mb-4">
            Configure which WhatsApp groups new employees should be added to based on their department.
            Groups marked as "ALL" apply to all new joiners.
          </p>

          {whatsappGroups.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No WhatsApp groups configured</p>
          ) : (
            <div className="space-y-3">
              {whatsappGroups.map((group) => (
                <div key={group.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-sm text-gray-500">
                      Department: {group.department || 'ALL'} • {group.description}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    {group.isActive && (
                      <span className="badge badge-success">Active</span>
                    )}
                    <button 
                      onClick={() => handleDeleteGroup(group.id)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Training Plans */}
      {activeTab === 'training' && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">📚 Training Plans</h2>
            <button className="btn btn-primary text-sm">+ Add Training Plan</button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Configure department-specific training plans. Each plan contains day-wise content that will be sent to new employees.
          </p>

          {trainingPlans.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No training plans configured</p>
          ) : (
            <div className="space-y-4">
              {trainingPlans.map((plan) => (
                <div key={plan.id} className="border rounded-lg overflow-hidden">
                  <div className="p-4 bg-gray-50 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{plan.name}</p>
                      <p className="text-sm text-gray-500">
                        Department: {plan.department || 'ALL'} • 
                        {plan.dayWiseContent?.duration || '7'} days • 
                        {plan.dayWiseContent?.days?.length || 0} modules
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      {plan.isActive && <span className="badge badge-success">Active</span>}
                      <button className="text-indigo-600 hover:text-indigo-700 text-sm">Edit</button>
                    </div>
                  </div>
                  {plan.dayWiseContent?.days && plan.dayWiseContent.days.length > 0 && (
                    <div className="p-4 border-t bg-white">
                      <p className="text-sm font-medium mb-2">Training Modules:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {plan.dayWiseContent.days.slice(0, 7).map((day, idx) => (
                          <div key={idx} className="text-xs bg-gray-100 p-2 rounded">
                            <span className="font-medium text-indigo-600">Day {day.day}:</span> {day.title}
                            <p className="text-gray-500 mt-1 truncate">{day.description}</p>
                          </div>
                        ))}
                        {plan.dayWiseContent.days.length > 7 && (
                          <div className="text-xs text-gray-500 p-2 flex items-center">
                            +{plan.dayWiseContent.days.length - 7} more days
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save Button (Fixed at bottom) */}
      <div className="fixed bottom-6 right-6">
        <button 
          onClick={handleSave} 
          disabled={saving} 
          className="btn btn-primary shadow-lg"
        >
          {saving ? 'Saving...' : '💾 Save All Changes'}
        </button>
      </div>
    </div>
  );
};

export default Settings;
