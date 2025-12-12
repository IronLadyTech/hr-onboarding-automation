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
  
  // UI Customization state
  const [settings, setSettings] = useState({});
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingColors, setSavingColors] = useState(false);
  
  // Custom Fields state
  const [customFields, setCustomFields] = useState([]);
  const [showCustomFieldModal, setShowCustomFieldModal] = useState(false);
  const [editingCustomField, setEditingCustomField] = useState(null);
  const [customFieldForm, setCustomFieldForm] = useState({
    label: '',
    fieldKey: '',
    fieldType: 'text',
    placeholder: '',
    required: false,
    validation: null,
    options: [],
    order: 0
  });
  const [customFieldLoading, setCustomFieldLoading] = useState(false);
  const [newOption, setNewOption] = useState({ label: '', value: '' });
  
  // Custom Placeholders state
  const [customPlaceholders, setCustomPlaceholders] = useState([]);
  const [showPlaceholderModal, setShowPlaceholderModal] = useState(false);
  const [editingPlaceholder, setEditingPlaceholder] = useState(null);
  const [placeholderForm, setPlaceholderForm] = useState({
    name: '',
    placeholderKey: '',
    value: '',
    description: '',
    order: 0
  });
  const [placeholderLoading, setPlaceholderLoading] = useState(false);

  useEffect(() => {
    fetchData();
    fetchDepartments();
    fetchSettings();
    fetchCustomFields();
    fetchCustomPlaceholders();
  }, []);

  const fetchCustomPlaceholders = async () => {
    try {
      const response = await configApi.getAllCustomPlaceholders();
      if (response.data?.success) {
        setCustomPlaceholders(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch custom placeholders:', error);
      if (error.response?.status === 500) {
        console.warn('Custom placeholders table may not exist yet. Please deploy database schema.');
        setCustomPlaceholders([]);
      }
    }
  };

  const fetchCustomFields = async () => {
    try {
      const response = await configApi.getAllCustomFields();
      if (response.data?.success) {
        setCustomFields(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch custom fields:', error);
      // If it's a 500 error, the table probably doesn't exist yet
      // Set empty array to prevent UI errors
      if (error.response?.status === 500) {
        console.warn('Custom fields table may not exist yet. Please deploy database schema.');
        setCustomFields([]);
      }
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await configApi.getSettings();
      if (response.data?.success) {
        const settingsData = response.data.data || {};
        setSettings(settingsData);
        // Always update logo preview from settings
        if (settingsData.companyLogoUrl) {
          setLogoPreview(settingsData.companyLogoUrl);
        } else {
          setLogoPreview(null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile) return;
    
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', logoFile);
      
      const response = await configApi.uploadLogo(formData);
      if (response.data?.success) {
        toast.success('Logo uploaded successfully!');
        // Update logo preview immediately with the returned URL
        if (response.data.data?.logoUrl) {
          setLogoPreview(response.data.data.logoUrl);
        }
        setLogoFile(null);
        // Refresh settings to get updated logo URL
        await fetchSettings();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!window.confirm('Are you sure you want to delete the logo?')) return;
    
    try {
      const response = await configApi.deleteLogo();
      if (response.data?.success) {
        toast.success('Logo deleted successfully!');
        setLogoPreview(null);
        setLogoFile(null);
        await fetchSettings();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete logo');
    }
  };

  const handleSaveColors = async () => {
    setSavingColors(true);
    try {
      await configApi.updateUIColors({
        primaryColor: settings.uiPrimaryColor,
        secondaryColor: settings.uiSecondaryColor,
        accentColor: settings.uiAccentColor || null
      });
      toast.success('Colors saved successfully! Please refresh the page to see changes.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save colors');
    } finally {
      setSavingColors(false);
    }
  };

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

  // Custom Fields handlers
  const handleCreateCustomField = async () => {
    if (!customFieldForm.label.trim() || !customFieldForm.fieldKey.trim()) {
      toast.error('Label and Field Key are required');
      return;
    }

    setCustomFieldLoading(true);
    try {
      const data = {
        ...customFieldForm,
        options: customFieldForm.fieldType === 'select' && customFieldForm.options.length > 0 
          ? customFieldForm.options 
          : null,
        order: customFields.length
      };
      
      if (editingCustomField) {
        await configApi.updateCustomField(editingCustomField.id, data);
        toast.success('Custom field updated successfully!');
      } else {
        await configApi.createCustomField(data);
        toast.success('Custom field created successfully!');
      }
      
      setShowCustomFieldModal(false);
      setEditingCustomField(null);
      setCustomFieldForm({
        label: '',
        fieldKey: '',
        fieldType: 'text',
        placeholder: '',
        required: false,
        validation: null,
        options: [],
        order: 0
      });
      setNewOption({ label: '', value: '' });
      fetchCustomFields();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save custom field');
    } finally {
      setCustomFieldLoading(false);
    }
  };

  const handleEditCustomField = (field) => {
    setEditingCustomField(field);
    setCustomFieldForm({
      label: field.label,
      fieldKey: field.fieldKey,
      fieldType: field.fieldType,
      placeholder: field.placeholder || '',
      required: field.required || false,
      validation: field.validation,
      options: field.options || [],
      order: field.order || 0,
      isStandard: field.isStandard || false
    });
    setShowCustomFieldModal(true);
  };

  const handleDeleteCustomField = async (id) => {
    if (!window.confirm('Are you sure you want to delete this custom field?')) return;
    
    try {
      await configApi.deleteCustomField(id);
      toast.success('Custom field deleted successfully!');
      fetchCustomFields();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete custom field');
    }
  };

  const handleToggleCustomFieldActive = async (field) => {
    try {
      await configApi.updateCustomField(field.id, { isActive: !field.isActive });
      toast.success(`Field ${!field.isActive ? 'activated' : 'deactivated'} successfully!`);
      fetchCustomFields();
    } catch (error) {
      toast.error('Failed to update field status');
    }
  };

  // Custom Placeholders handlers
  const handleCreatePlaceholder = async () => {
    if (!placeholderForm.name.trim() || !placeholderForm.placeholderKey.trim() || !placeholderForm.value.trim()) {
      toast.error('Name, Placeholder Key, and Value are required');
      return;
    }

    setPlaceholderLoading(true);
    try {
      if (editingPlaceholder) {
        await configApi.updateCustomPlaceholder(editingPlaceholder.id, placeholderForm);
        toast.success('Placeholder updated successfully!');
      } else {
        await configApi.createCustomPlaceholder(placeholderForm);
        toast.success('Placeholder created successfully!');
      }
      setShowPlaceholderModal(false);
      setEditingPlaceholder(null);
      setPlaceholderForm({ name: '', placeholderKey: '', value: '', description: '', order: 0 });
      fetchCustomPlaceholders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save placeholder');
    } finally {
      setPlaceholderLoading(false);
    }
  };

  const handleEditPlaceholder = (placeholder) => {
    setEditingPlaceholder(placeholder);
    setPlaceholderForm({
      name: placeholder.name,
      placeholderKey: placeholder.placeholderKey,
      value: placeholder.value,
      description: placeholder.description || '',
      order: placeholder.order || 0
    });
    setShowPlaceholderModal(true);
  };

  const handleDeletePlaceholder = async (id) => {
    if (!window.confirm('Are you sure you want to delete this placeholder?')) return;
    
    try {
      await configApi.deleteCustomPlaceholder(id);
      toast.success('Placeholder deleted successfully!');
      fetchCustomPlaceholders();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete placeholder');
    }
  };

  const handleTogglePlaceholderActive = async (placeholder) => {
    try {
      await configApi.updateCustomPlaceholder(placeholder.id, { isActive: !placeholder.isActive });
      toast.success(`Placeholder ${!placeholder.isActive ? 'activated' : 'deactivated'} successfully!`);
      fetchCustomPlaceholders();
    } catch (error) {
      toast.error('Failed to update placeholder status');
    }
  };

  const handleAddOption = () => {
    if (!newOption.label.trim() || !newOption.value.trim()) {
      toast.error('Option label and value are required');
      return;
    }
    setCustomFieldForm({
      ...customFieldForm,
      options: [...customFieldForm.options, { ...newOption }]
    });
    setNewOption({ label: '', value: '' });
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
    { id: 'ui', label: 'UI Customization', icon: '🎨' },
    { id: 'custom-fields', label: 'Custom Form Fields', icon: '📝' },
    { id: 'placeholders', label: 'Custom Placeholders', icon: '🔖' },
    { id: 'departments', label: 'Departments', icon: '🏛️' },
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

      {/* UI Customization */}
      {activeTab === 'ui' && (
        <div className="space-y-6">
          {/* Logo Upload */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">🎨 Company Logo</h2>
            <div className="space-y-4">
              {(logoPreview || settings.companyLogoUrl) && (
                <div className="flex items-center space-x-4">
                  <img 
                    src={logoPreview || settings.companyLogoUrl} 
                    alt="Company Logo" 
                    className="h-20 w-auto object-contain border rounded p-2 bg-white"
                    onError={(e) => {
                      console.error('Failed to load logo image:', logoPreview || settings.companyLogoUrl);
                      e.target.style.display = 'none';
                    }}
                  />
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Current Logo</p>
                    <p className="text-xs text-gray-400 mt-1 break-all max-w-xs">
                      URL: {logoPreview || settings.companyLogoUrl}
                    </p>
                    <button
                      onClick={handleDeleteLogo}
                      className="text-sm text-red-600 hover:text-red-700 mt-2"
                    >
                      Delete Logo
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload New Logo
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/gif"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setLogoFile(file);
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setLogoPreview(reader.result);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Supported formats: PNG, JPG, JPEG, SVG, GIF (Max 2MB)
                </p>
              </div>
              {logoFile && (
                <button
                  onClick={handleUploadLogo}
                  disabled={uploadingLogo}
                  className="btn btn-primary"
                >
                  {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                </button>
              )}
            </div>
          </div>

          {/* Color Customization */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">🎨 UI Colors</h2>
            <p className="text-sm text-gray-600 mb-4">
              Customize the primary, secondary, and accent colors for your application theme.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Color
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={settings.uiPrimaryColor || '#4F46E5'}
                    onChange={(e) => setSettings({ ...settings, uiPrimaryColor: e.target.value })}
                    className="h-10 w-20 rounded border"
                  />
                  <input
                    type="text"
                    value={settings.uiPrimaryColor || '#4F46E5'}
                    onChange={(e) => setSettings({ ...settings, uiPrimaryColor: e.target.value })}
                    className="input flex-1"
                    placeholder="#4F46E5"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Secondary Color
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={settings.uiSecondaryColor || '#7C3AED'}
                    onChange={(e) => setSettings({ ...settings, uiSecondaryColor: e.target.value })}
                    className="h-10 w-20 rounded border"
                  />
                  <input
                    type="text"
                    value={settings.uiSecondaryColor || '#7C3AED'}
                    onChange={(e) => setSettings({ ...settings, uiSecondaryColor: e.target.value })}
                    className="input flex-1"
                    placeholder="#7C3AED"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Accent Color (Optional)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={settings.uiAccentColor || '#10B981'}
                    onChange={(e) => setSettings({ ...settings, uiAccentColor: e.target.value })}
                    className="h-10 w-20 rounded border"
                  />
                  <input
                    type="text"
                    value={settings.uiAccentColor || '#10B981'}
                    onChange={(e) => setSettings({ ...settings, uiAccentColor: e.target.value })}
                    className="input flex-1"
                    placeholder="#10B981"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <button
                onClick={handleSaveColors}
                disabled={savingColors}
                className="btn btn-primary"
              >
                {savingColors ? 'Saving...' : 'Save Colors'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Form Fields */}
      {activeTab === 'custom-fields' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">📝 Custom Form Fields</h2>
              <button
                onClick={() => {
                  setEditingCustomField(null);
                  setCustomFieldForm({
                    label: '',
                    fieldKey: '',
                    fieldType: 'text',
                    placeholder: '',
                    required: false,
                    validation: null,
                    options: [],
                    order: customFields.length
                  });
                  setNewOption({ label: '', value: '' });
                  setShowCustomFieldModal(true);
                }}
                className="btn btn-primary text-sm"
              >
                + Add Custom Field
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Manage all candidate form fields. Edit standard fields (First Name, Email, etc.) or add new custom fields. Changes will appear in the candidate creation form.
            </p>
            
            {customFields.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No fields configured yet.</p>
                <p className="text-sm mt-2">Click "Add Custom Field" to create your first field, or initialize standard fields.</p>
                <button
                  onClick={async () => {
                    try {
                      await configApi.initStandardFields();
                      toast.success('Standard fields initialized!');
                      fetchCustomFields();
                    } catch (error) {
                      toast.error('Failed to initialize standard fields');
                    }
                  }}
                  className="btn btn-secondary mt-4"
                >
                  Initialize Standard Fields
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Standard Fields Section */}
                {customFields.filter(f => f.isStandard).length > 0 && (
                  <>
                    <h3 className="text-md font-semibold text-gray-700 mb-2">Standard Fields</h3>
                    {customFields
                      .filter(f => f.isStandard)
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((field) => (
                        <div
                          key={field.id}
                          className={`flex items-center justify-between p-4 border rounded-lg ${
                            field.isActive ? 'bg-white' : 'bg-gray-50 opacity-60'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <span className="font-medium">{field.label}</span>
                              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
                                Standard
                              </span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                {field.fieldType}
                              </span>
                              {!field.isActive && (
                                <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                                  Hidden
                                </span>
                              )}
                              {field.required && (
                                <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-1 rounded">
                                  Required
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              Key: <code className="bg-gray-100 px-1 rounded">{field.fieldKey}</code>
                              {field.placeholder && ` • Placeholder: ${field.placeholder}`}
                              {field.order !== undefined && ` • Order: ${field.order}`}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleToggleCustomFieldActive(field)}
                              className="text-sm text-blue-600 hover:text-blue-700"
                              title={field.isActive ? 'Hide' : 'Show'}
                            >
                              {field.isActive ? '👁️' : '👁️‍🗨️'}
                            </button>
                            <button
                              onClick={() => handleEditCustomField(field)}
                              className="text-sm text-indigo-600 hover:text-indigo-700"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      ))}
                  </>
                )}

                {/* Custom Fields Section */}
                {customFields.filter(f => !f.isStandard).length > 0 && (
                  <>
                    <h3 className="text-md font-semibold text-gray-700 mb-2 mt-4">Custom Fields</h3>
                    {customFields
                      .filter(f => !f.isStandard)
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((field) => (
                        <div
                          key={field.id}
                          className={`flex items-center justify-between p-4 border rounded-lg ${
                            field.isActive ? 'bg-white' : 'bg-gray-50 opacity-60'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <span className="font-medium">{field.label}</span>
                              <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded">
                                Custom
                              </span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                {field.fieldType}
                              </span>
                              {!field.isActive && (
                                <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                                  Inactive
                                </span>
                              )}
                              {field.required && (
                                <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-1 rounded">
                                  Required
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              Key: <code className="bg-gray-100 px-1 rounded">{field.fieldKey}</code>
                              {field.placeholder && ` • Placeholder: ${field.placeholder}`}
                              {field.order !== undefined && ` • Order: ${field.order}`}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleToggleCustomFieldActive(field)}
                              className="text-sm text-blue-600 hover:text-blue-700"
                              title={field.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {field.isActive ? '👁️' : '👁️‍🗨️'}
                            </button>
                            <button
                              onClick={() => handleEditCustomField(field)}
                              className="text-sm text-indigo-600 hover:text-indigo-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteCustomField(field.id)}
                              className="text-sm text-red-600 hover:text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Department Management */}
      {/* Custom Placeholders */}
      {activeTab === 'placeholders' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">🔖 Custom Placeholders</h2>
              <button
                onClick={() => {
                  setEditingPlaceholder(null);
                  setPlaceholderForm({ name: '', placeholderKey: '', value: '', description: '', order: 0 });
                  setShowPlaceholderModal(true);
                }}
                className="btn btn-primary text-sm"
              >
                + Add Placeholder
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Create custom placeholders that can be used in email templates. Use the format <code className="bg-gray-100 px-1 rounded">{'{{placeholderKey}}'}</code> in your templates.
            </p>

            {customPlaceholders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No custom placeholders yet. Click "Add Placeholder" to create one.</p>
                <p className="text-xs mt-2">Example: Name: "Google Meet Link", Key: "googleMeetLink", Value: "https://meet.google.com/..."</p>
              </div>
            ) : (
              <div className="space-y-3">
                {customPlaceholders.map((placeholder) => (
                  <div
                    key={placeholder.id}
                    className={`p-4 border rounded-lg ${placeholder.isActive ? 'bg-white' : 'bg-gray-50 opacity-60'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium">{placeholder.name}</h3>
                          {!placeholder.isActive && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Inactive</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          <code className="bg-gray-100 px-1 rounded">{`{{${placeholder.placeholderKey}}}`}</code>
                        </p>
                        {placeholder.description && (
                          <p className="text-xs text-gray-500 mt-1">{placeholder.description}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2 break-all">
                          Value: {placeholder.value.length > 100 ? `${placeholder.value.substring(0, 100)}...` : placeholder.value}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleTogglePlaceholderActive(placeholder)}
                          className={`text-xs px-2 py-1 rounded ${placeholder.isActive ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
                        >
                          {placeholder.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleEditPlaceholder(placeholder)}
                          className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeletePlaceholder(placeholder.id)}
                          className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Automation Settings (11 Steps) - REMOVED */}
      {false && activeTab === 'automation' && (
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

      {/* WhatsApp Groups - REMOVED */}
      {false && activeTab === 'whatsapp' && (
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

      {/* Training Plans - REMOVED */}
      {false && activeTab === 'training' && (
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

      {/* Custom Field Modal */}
      {showCustomFieldModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingCustomField ? 'Edit Custom Field' : 'Create Custom Field'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Label *
                </label>
                <input
                  type="text"
                  value={customFieldForm.label}
                  onChange={(e) => setCustomFieldForm({ ...customFieldForm, label: e.target.value })}
                  className="input"
                  placeholder="e.g., Emergency Contact"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Key *
                </label>
                <input
                  type="text"
                  value={customFieldForm.fieldKey}
                  onChange={(e) => setCustomFieldForm({ ...customFieldForm, fieldKey: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                  className="input"
                  placeholder="e.g., emergencyContact"
                  required
                  disabled={!!editingCustomField || customFieldForm.isStandard}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {customFieldForm.isStandard 
                    ? 'Standard field key cannot be changed.'
                    : 'Only letters, numbers, and underscores allowed. Cannot be changed after creation.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Type *
                </label>
                <select
                  value={customFieldForm.fieldType}
                  onChange={(e) => setCustomFieldForm({ ...customFieldForm, fieldType: e.target.value, options: e.target.value === 'select' ? customFieldForm.options : [] })}
                  className="input"
                  required
                  disabled={customFieldForm.isStandard}
                >
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="select">Select (Dropdown)</option>
                  <option value="textarea">Textarea</option>
                </select>
                {customFieldForm.isStandard && (
                  <p className="text-xs text-gray-500 mt-1">
                    Standard field type cannot be changed.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Placeholder
                </label>
                <input
                  type="text"
                  value={customFieldForm.placeholder}
                  onChange={(e) => setCustomFieldForm({ ...customFieldForm, placeholder: e.target.value })}
                  className="input"
                  placeholder="Enter placeholder text"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="required"
                  checked={customFieldForm.required}
                  onChange={(e) => setCustomFieldForm({ ...customFieldForm, required: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="required" className="text-sm font-medium text-gray-700">
                  Required Field
                </label>
              </div>

              {customFieldForm.fieldType === 'select' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Options *
                  </label>
                  <div className="space-y-2">
                    {customFieldForm.options.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={option.label}
                          onChange={(e) => {
                            const newOptions = [...customFieldForm.options];
                            newOptions[index].label = e.target.value;
                            setCustomFieldForm({ ...customFieldForm, options: newOptions });
                          }}
                          className="input flex-1"
                          placeholder="Display Label"
                        />
                        <input
                          type="text"
                          value={option.value}
                          onChange={(e) => {
                            const newOptions = [...customFieldForm.options];
                            newOptions[index].value = e.target.value;
                            setCustomFieldForm({ ...customFieldForm, options: newOptions });
                          }}
                          className="input flex-1"
                          placeholder="Value"
                        />
                        <button
                          onClick={() => {
                            const newOptions = customFieldForm.options.filter((_, i) => i !== index);
                            setCustomFieldForm({ ...customFieldForm, options: newOptions });
                          }}
                          className="text-red-600 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={newOption.label}
                        onChange={(e) => setNewOption({ ...newOption, label: e.target.value })}
                        className="input flex-1"
                        placeholder="Display Label"
                      />
                      <input
                        type="text"
                        value={newOption.value}
                        onChange={(e) => setNewOption({ ...newOption, value: e.target.value })}
                        className="input flex-1"
                        placeholder="Value"
                      />
                      <button
                        onClick={handleAddOption}
                        className="btn btn-secondary text-sm"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Order
                </label>
                <input
                  type="number"
                  value={customFieldForm.order}
                  onChange={(e) => setCustomFieldForm({ ...customFieldForm, order: parseInt(e.target.value) || 0 })}
                  className="input"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Lower numbers appear first in the form
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCustomFieldModal(false);
                  setEditingCustomField(null);
                  setCustomFieldForm({
                    label: '',
                    fieldKey: '',
                    fieldType: 'text',
                    placeholder: '',
                    required: false,
                    validation: null,
                    options: [],
                    order: 0
                  });
                  setNewOption({ label: '', value: '' });
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomField}
                disabled={customFieldLoading}
                className="btn btn-primary"
              >
                {customFieldLoading ? 'Saving...' : editingCustomField ? 'Update Field' : 'Create Field'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Placeholder Modal */}
      {showPlaceholderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingPlaceholder ? 'Edit Placeholder' : 'Add Custom Placeholder'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={placeholderForm.name}
                  onChange={(e) => setPlaceholderForm({ ...placeholderForm, name: e.target.value })}
                  className="input w-full"
                  placeholder="e.g., Google Meet Link"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Display name for this placeholder</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Placeholder Key *
                </label>
                <input
                  type="text"
                  value={placeholderForm.placeholderKey}
                  onChange={(e) => setPlaceholderForm({ ...placeholderForm, placeholderKey: e.target.value })}
                  className="input w-full"
                  placeholder="e.g., googleMeetLink"
                  required
                  disabled={!!editingPlaceholder}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Used as <code className="bg-gray-100 px-1 rounded">{`{{${placeholderForm.placeholderKey || 'key'}}}`}</code> in templates. Must be camelCase (e.g., googleMeetLink, companyWebsite)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value *
                </label>
                <textarea
                  value={placeholderForm.value}
                  onChange={(e) => setPlaceholderForm({ ...placeholderForm, value: e.target.value })}
                  className="input w-full"
                  rows={4}
                  placeholder="e.g., https://meet.google.com/..."
                  required
                />
                <p className="text-xs text-gray-500 mt-1">The value that will replace the placeholder in emails</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={placeholderForm.description}
                  onChange={(e) => setPlaceholderForm({ ...placeholderForm, description: e.target.value })}
                  className="input w-full"
                  placeholder="Brief description of what this placeholder is for"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Order
                </label>
                <input
                  type="number"
                  value={placeholderForm.order}
                  onChange={(e) => setPlaceholderForm({ ...placeholderForm, order: parseInt(e.target.value) || 0 })}
                  className="input"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Lower numbers appear first in the placeholders list
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowPlaceholderModal(false);
                  setEditingPlaceholder(null);
                  setPlaceholderForm({ name: '', placeholderKey: '', value: '', description: '', order: 0 });
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaceholder}
                disabled={placeholderLoading}
                className="btn btn-primary"
              >
                {placeholderLoading ? 'Saving...' : editingPlaceholder ? 'Update Placeholder' : 'Create Placeholder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
