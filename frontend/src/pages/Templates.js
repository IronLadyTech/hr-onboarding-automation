import React, { useState, useEffect, useRef } from 'react';
import { templateApi } from '../services/api';
import toast from 'react-hot-toast';

const Templates = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', subject: '', body: '' });
  const [previewData, setPreviewData] = useState(null);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    type: 'OFFER_LETTER',
    subject: '',
    body: '',
    placeholders: [],
    customEmailType: ''
  });
  const [availablePlaceholders, setAvailablePlaceholders] = useState([]);
  const [loadingPlaceholders, setLoadingPlaceholders] = useState(false);
  const bodyTextareaRef = useRef(null);

  useEffect(() => {
    fetchTemplates();
    fetchPlaceholders();
  }, []);

  const fetchPlaceholders = async () => {
    setLoadingPlaceholders(true);
    try {
      const response = await templateApi.getPlaceholders();
      if (response.data?.success) {
        setAvailablePlaceholders(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch placeholders:', error);
      // Don't show error toast, just log it
    } finally {
      setLoadingPlaceholders(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await templateApi.getAll();
      setTemplates(response.data.data);
    } catch (error) {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (template) => {
    setSelectedTemplate(template);
    setEditData({
      name: template.name,
      subject: template.subject,
      body: template.body
    });
    setIsEditing(false);
    setPreviewData(null);
  };

  const handleSave = async () => {
    try {
      await templateApi.update(selectedTemplate.id, editData);
      toast.success('Template updated successfully');
      setIsEditing(false);
      fetchTemplates();
    } catch (error) {
      toast.error('Failed to update template');
    }
  };

  const handlePreview = async () => {
    try {
      const response = await templateApi.preview(selectedTemplate.id, {});
      setPreviewData(response.data.data);
    } catch (error) {
      toast.error('Failed to generate preview');
    }
  };

  const handleInitDefaults = async () => {
    try {
      await templateApi.initDefaults();
      toast.success('Default templates initialized');
      fetchTemplates();
    } catch (error) {
      toast.error('Failed to initialize templates');
    }
  };

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    try {
      await templateApi.create(newTemplate);
      toast.success('Template created successfully!');
      setShowNewTemplateModal(false);
      setNewTemplate({
        name: '',
        type: 'OFFER_LETTER',
        subject: '',
        body: '',
        placeholders: [],
        customEmailType: ''
      });
      fetchTemplates();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create template');
    }
  };

  const getTemplateTypeIcon = (type) => {
    switch (type) {
      case 'OFFER_LETTER': return '📄';
      case 'OFFER_REMINDER': return '⏰';
      case 'WELCOME_EMAIL': return '👋';
      case 'HR_INDUCTION': return '🏢';
      case 'CEO_INDUCTION': return '👔';
      case 'ONBOARDING_FORM': return '📝';
      case 'FORM_REMINDER': return '🔔';
      case 'CHECKIN_CALL': return '📞';
      default: return '📧';
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
        <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
        <div className="flex space-x-3">
          <button onClick={handleInitDefaults} className="btn btn-secondary">
            Initialize Defaults
          </button>
          <button 
            onClick={() => setShowNewTemplateModal(true)}
            className="btn btn-primary"
          >
            + New Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template List */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Templates ({templates.length})</h2>
          {templates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No templates found</p>
              <button 
                onClick={handleInitDefaults}
                className="text-indigo-600 hover:text-indigo-700 mt-2 text-sm"
              >
                Initialize default templates
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedTemplate?.id === template.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center">
                    <span className="text-xl mr-3">{getTemplateTypeIcon(template.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{template.name}</p>
                      <p className="text-xs text-gray-500">{template.type.replace(/_/g, ' ')}</p>
                    </div>
                    {template.isActive && (
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Template Editor */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">
                  {isEditing ? 'Edit Template' : 'Template Details'}
                </h2>
                <div className="flex space-x-2">
                  {!isEditing ? (
                    <>
                      <button onClick={handlePreview} className="btn btn-secondary text-sm">
                        Preview
                      </button>
                      <button onClick={() => setIsEditing(true)} className="btn btn-primary text-sm">
                        Edit
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setIsEditing(false)} className="btn btn-secondary text-sm">
                        Cancel
                      </button>
                      <button onClick={handleSave} className="btn btn-primary text-sm">
                        Save Changes
                      </button>
                    </>
                  )}
                </div>
              </div>

              {previewData ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-1">Subject Preview</p>
                    <p className="font-medium">{previewData.subject}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-2">Body Preview</p>
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: previewData.body.replace(/\n/g, '<br>') }}
                    />
                  </div>
                  <button 
                    onClick={() => setPreviewData(null)}
                    className="text-indigo-600 hover:text-indigo-700 text-sm"
                  >
                    ← Back to template
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Template Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                        className="input"
                      />
                    ) : (
                      <p className="text-gray-900">{selectedTemplate.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Type
                    </label>
                    <p className="text-gray-900">{selectedTemplate.type.replace(/_/g, ' ')}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Line
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.subject}
                        onChange={(e) => setEditData({ ...editData, subject: e.target.value })}
                        className="input"
                      />
                    ) : (
                      <p className="text-gray-900 bg-gray-50 p-3 rounded">{selectedTemplate.subject}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Body
                    </label>
                    {isEditing ? (
                      <div>
                        <textarea
                          ref={bodyTextareaRef}
                          value={editData.body}
                          onChange={(e) => setEditData({ ...editData, body: e.target.value })}
                          className="input font-mono text-sm"
                          rows={15}
                        />
                        {availablePlaceholders.length > 0 && (
                          <div className="mt-2 p-3 bg-gray-50 rounded border">
                            <p className="text-xs font-medium text-gray-700 mb-2">Click to insert placeholders:</p>
                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                              {availablePlaceholders.map((placeholder) => (
                                <code
                                  key={placeholder.key}
                                  className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs text-indigo-600 cursor-pointer hover:bg-indigo-50"
                                  title={placeholder.description}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const textarea = bodyTextareaRef.current;
                                    if (textarea) {
                                      const start = textarea.selectionStart || editData.body.length;
                                      const end = textarea.selectionEnd || editData.body.length;
                                      const text = editData.body;
                                      const newText = text.substring(0, start) + placeholder.key + text.substring(end);
                                      setEditData({ ...editData, body: newText });
                                      // Set cursor position after inserted placeholder
                                      setTimeout(() => {
                                        textarea.focus();
                                        textarea.setSelectionRange(start + placeholder.key.length, start + placeholder.key.length);
                                      }, 0);
                                    } else {
                                      // Fallback: just append to the end
                                      setEditData({ ...editData, body: editData.body + placeholder.key });
                                    }
                                  }}
                                >
                                  {placeholder.key}
                                </code>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <pre className="text-gray-900 bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap font-sans">
                        {selectedTemplate.body}
                      </pre>
                    )}
                  </div>

                  {/* Available Placeholders Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Available Placeholders
                      {loadingPlaceholders && <span className="text-xs text-gray-500 ml-2">(Loading...)</span>}
                    </label>
                    {availablePlaceholders.length > 0 ? (
                      <div className="space-y-3">
                        {/* Group by category */}
                        {['Standard', 'Company', 'Dynamic', 'Custom', 'Custom Placeholder'].map((category) => {
                          const categoryPlaceholders = availablePlaceholders.filter(p => p.category === category);
                          if (categoryPlaceholders.length === 0) return null;
                          
                          return (
                            <div key={category} className="border rounded-lg p-3 bg-gray-50">
                              <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                                {category} ({categoryPlaceholders.length})
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {categoryPlaceholders.map((placeholder) => (
                                  <div
                                    key={placeholder.key}
                                    className="group relative"
                                    title={placeholder.description}
                                  >
                                    <code className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-indigo-600 hover:bg-indigo-50 cursor-pointer">
                                      {placeholder.key}
                                    </code>
                                    {placeholder.description && (
                                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                                        <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap shadow-lg">
                                          {placeholder.description}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded">
                        {loadingPlaceholders ? 'Loading placeholders...' : 'No placeholders available'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <div className="text-center py-12">
                <p className="text-gray-500">Select a template to view or edit</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Template Modal */}
      {showNewTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Create New Template</h2>
            <form onSubmit={handleCreateTemplate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    className="input"
                    placeholder="e.g., Welcome Email Template"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Type *
                  </label>
                  <select
                    value={newTemplate.type}
                    onChange={(e) => setNewTemplate({ ...newTemplate, type: e.target.value, customEmailType: e.target.value === 'CUSTOM' ? newTemplate.customEmailType : '' })}
                    className="input"
                    required
                  >
                    <option value="OFFER_LETTER">Offer Letter</option>
                    <option value="OFFER_REMINDER">Offer Reminder</option>
                    <option value="WELCOME_DAY_MINUS_1">Welcome Email (Day -1)</option>
                    <option value="HR_INDUCTION_INVITE">HR Induction Invite</option>
                    <option value="CEO_INDUCTION_INVITE">CEO Induction Invite</option>
                    <option value="SALES_INDUCTION_INVITE">Sales Induction Invite</option>
                    <option value="ONBOARDING_FORM">Onboarding Form</option>
                    <option value="FORM_REMINDER">Form Reminder</option>
                    <option value="TRAINING_PLAN">Training Plan</option>
                    <option value="CHECKIN_INVITE">Check-in Invite</option>
                    <option value="WHATSAPP_TASK">WhatsApp Task</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>

                {/* Custom Email Type Field - Only shown when CUSTOM is selected */}
                {newTemplate.type === 'CUSTOM' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Custom Email Type Name *
                    </label>
                    <input
                      type="text"
                      value={newTemplate.customEmailType}
                      onChange={(e) => setNewTemplate({ ...newTemplate, customEmailType: e.target.value })}
                      className="input"
                      placeholder="e.g., DEPARTMENT_WELCOME, INTERNAL_ANNOUNCEMENT, etc."
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter a unique name for this custom email type. This will be used to identify this template type.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject Line *
                  </label>
                  <input
                    type="text"
                    value={newTemplate.subject}
                    onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                    className="input"
                    placeholder="Email subject line"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Body *
                  </label>
                  <textarea
                    value={newTemplate.body}
                    onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                    className="input font-mono text-sm"
                    rows={12}
                    placeholder="Enter email body. Use {{placeholder}} for dynamic content."
                    required
                  />
                  {availablePlaceholders.length > 0 && (
                    <div className="mt-2 p-3 bg-gray-50 rounded border">
                      <p className="text-xs font-medium text-gray-700 mb-2">Available Placeholders:</p>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {availablePlaceholders.map((placeholder) => (
                          <code
                            key={placeholder.key}
                            className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs text-indigo-600 cursor-pointer hover:bg-indigo-50"
                            title={placeholder.description}
                            onClick={() => {
                              const textarea = document.querySelector('textarea[placeholder*="Enter email body"]');
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const text = newTemplate.body;
                                const newText = text.substring(0, start) + placeholder.key + text.substring(end);
                                setNewTemplate({ ...newTemplate, body: newText });
                                // Set cursor position after inserted placeholder
                                setTimeout(() => {
                                  textarea.focus();
                                  textarea.setSelectionRange(start + placeholder.key.length, start + placeholder.key.length);
                                }, 0);
                              }
                            }}
                          >
                            {placeholder.key}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewTemplateModal(false);
                    setNewTemplate({
                      name: '',
                      type: 'OFFER_LETTER',
                      subject: '',
                      body: '',
                      placeholders: [],
                      customEmailType: ''
                    });
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Templates;
