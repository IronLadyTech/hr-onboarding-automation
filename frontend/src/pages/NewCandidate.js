import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { candidateApi, configApi } from '../services/api';
import toast from 'react-hot-toast';

const NewCandidate = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({});
  
  const [formData, setFormData] = useState({});
  const [allFields, setAllFields] = useState([]); // All fields (standard + custom)

  useEffect(() => {
    fetchDepartments();
    fetchCustomFields();
  }, []);

  const fetchCustomFields = async () => {
    try {
      const response = await configApi.getAllCustomFields();
      if (response.data?.success) {
        const fields = response.data.data || [];
        // Filter only active fields and sort by order
        const activeFields = fields
          .filter(f => f.isActive)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        
        setAllFields(activeFields);
        setCustomFields(activeFields.filter(f => !f.isStandard));
        
        // Initialize form data with all field keys
        const initialFormData = {};
        const initialCustomValues = {};
        
        activeFields.forEach(field => {
          if (field.isStandard) {
            initialFormData[field.fieldKey] = '';
          } else {
            initialCustomValues[field.fieldKey] = '';
          }
        });
        
        setFormData(initialFormData);
        setCustomFieldValues(initialCustomValues);
      }
    } catch (error) {
      console.error('Failed to fetch fields:', error);
      // Fallback to default fields if API fails
      const defaultFields = [
        { fieldKey: 'firstName', label: 'First Name', fieldType: 'text', required: true, isStandard: true },
        { fieldKey: 'lastName', label: 'Last Name', fieldType: 'text', required: true, isStandard: true },
        { fieldKey: 'email', label: 'Email', fieldType: 'email', required: true, isStandard: true },
      ];
      setAllFields(defaultFields);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await configApi.getDepartments();
      setDepartments(response.data.data);
    } catch (error) {
      console.error('Failed to fetch departments');
      // Default departments if API fails
      setDepartments(['Engineering', 'Sales', 'Marketing', 'HR', 'Operations', 'Finance']);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFieldChange = (fieldKey, value, isStandard) => {
    if (isStandard) {
      setFormData(prev => ({ ...prev, [fieldKey]: value }));
    } else {
      setCustomFieldValues(prev => ({ ...prev, [fieldKey]: value }));
    }
  };


  const renderField = (field) => {
    const isStandard = field.isStandard || false;
    const value = isStandard 
      ? (formData[field.fieldKey] || '') 
      : (customFieldValues[field.fieldKey] || '');
    
    // Special handling for department field (select from departments)
    if (field.fieldKey === 'department' && field.fieldType === 'select') {
      return (
        <select
          value={value}
          onChange={(e) => handleFieldChange(field.fieldKey, e.target.value, isStandard)}
          className="input"
          required={field.required}
        >
          <option value="">{field.placeholder || 'Select Department'}</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>
      );
    }
    
    switch (field.fieldType) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
        return (
          <input
            type={field.fieldType === 'number' ? 'number' : field.fieldType === 'email' ? 'email' : field.fieldType === 'phone' ? 'tel' : 'text'}
            name={isStandard ? field.fieldKey : undefined}
            value={value}
            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value, isStandard)}
            className="input"
            placeholder={field.placeholder || ''}
            required={field.required}
          />
        );
      
      case 'date':
        return (
          <input
            type="date"
            name={isStandard ? field.fieldKey : undefined}
            value={value}
            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value, isStandard)}
            className="input"
            required={field.required}
          />
        );
      
      case 'select':
        const options = Array.isArray(field.options) ? field.options : [];
        return (
          <select
            name={isStandard ? field.fieldKey : undefined}
            value={value}
            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value, isStandard)}
            className="input"
            required={field.required}
          >
            <option value="">{field.placeholder || 'Select an option'}</option>
            {options.map((option, idx) => (
              <option key={idx} value={option.value || option}>
                {option.label || option}
              </option>
            ))}
          </select>
        );
      
      case 'textarea':
        return (
          <textarea
            name={isStandard ? field.fieldKey : undefined}
            value={value}
            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value, isStandard)}
            className="input"
            rows={3}
            placeholder={field.placeholder || ''}
            required={field.required}
          />
        );
      
      default:
        return (
          <input
            type="text"
            name={isStandard ? field.fieldKey : undefined}
            value={value}
            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value, isStandard)}
            className="input"
            placeholder={field.placeholder || ''}
            required={field.required}
          />
        );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Separate standard fields and custom fields
      const standardFieldsData = {};
      const customFieldsData = {};
      
      allFields.forEach(field => {
        const value = field.isStandard 
          ? formData[field.fieldKey] 
          : customFieldValues[field.fieldKey];
        
        if (value !== undefined && value !== null && value !== '') {
          if (field.isStandard) {
            standardFieldsData[field.fieldKey] = value;
          } else {
            customFieldsData[field.fieldKey] = value;
          }
        }
      });

      const submitData = {
        ...standardFieldsData,
        customFields: Object.keys(customFieldsData).length > 0 ? customFieldsData : null
      };

      const response = await candidateApi.create(submitData);
      toast.success('Candidate created successfully!');
      navigate(`/candidates/${response.data.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create candidate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-fadeIn">
      <div className="mb-6">
        <button 
          onClick={() => navigate('/candidates')}
          className="text-gray-500 hover:text-gray-700 text-sm mb-2"
        >
          ← Back to Candidates
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add New Candidate</h1>
        <p className="text-gray-500 mt-1">Enter the candidate details to start the onboarding process</p>
      </div>

      <form onSubmit={handleSubmit} className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Dynamically render all fields (standard + custom) */}
          {allFields.length > 0 ? (
            allFields.map((field) => (
              <div 
                key={field.id || field.fieldKey} 
                className={field.fieldType === 'textarea' ? 'md:col-span-2' : ''}
              >
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {renderField(field)}
              </div>
            ))
          ) : (
            // Fallback if no fields loaded
            <div className="md:col-span-2 text-center py-8 text-gray-500">
              <p>Loading form fields...</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/candidates')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? (
              <span className="flex items-center">
                <div className="spinner mr-2"></div>
                Creating...
              </span>
            ) : (
              'Create Candidate'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewCandidate;
