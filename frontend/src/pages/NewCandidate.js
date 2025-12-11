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
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    position: '',
    department: '',
    expectedJoiningDate: '',
    salary: '',
    reportingManager: '',
    notes: ''
  });

  useEffect(() => {
    fetchDepartments();
    fetchCustomFields();
  }, []);

  const fetchCustomFields = async () => {
    try {
      const response = await configApi.getCustomFields();
      if (response.data?.success) {
        const fields = response.data.data || [];
        setCustomFields(fields);
        // Initialize custom field values
        const initialValues = {};
        fields.forEach(field => {
          initialValues[field.fieldKey] = '';
        });
        setCustomFieldValues(initialValues);
      }
    } catch (error) {
      console.error('Failed to fetch custom fields:', error);
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

  const handleCustomFieldChange = (fieldKey, value) => {
    setCustomFieldValues(prev => ({ ...prev, [fieldKey]: value }));
  };

  const renderCustomField = (field) => {
    const value = customFieldValues[field.fieldKey] || '';
    
    switch (field.fieldType) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
        return (
          <input
            type={field.fieldType === 'number' ? 'number' : field.fieldType === 'email' ? 'email' : field.fieldType === 'phone' ? 'tel' : 'text'}
            value={value}
            onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
            className="input"
            placeholder={field.placeholder || ''}
            required={field.required}
          />
        );
      
      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
            className="input"
            required={field.required}
          />
        );
      
      case 'select':
        const options = field.options || [];
        return (
          <select
            value={value}
            onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
            className="input"
            required={field.required}
          >
            <option value="">{field.placeholder || 'Select an option'}</option>
            {options.map((option, idx) => (
              <option key={idx} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
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
            value={value}
            onChange={(e) => handleCustomFieldChange(field.fieldKey, e.target.value)}
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
      // Merge custom fields into formData
      const customFieldsData = {};
      customFields.forEach(field => {
        const value = customFieldValues[field.fieldKey];
        if (value !== undefined && value !== null && value !== '') {
          customFieldsData[field.fieldKey] = value;
        }
      });

      const submitData = {
        ...formData,
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
          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              First Name *
            </label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className="input"
              placeholder="John"
              required
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Last Name *
            </label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className="input"
              placeholder="Doe"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="input"
              placeholder="john@example.com"
              required
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="input"
              placeholder="+91 98765 43210"
            />
          </div>

          {/* Position */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Position *
            </label>
            <input
              type="text"
              name="position"
              value={formData.position}
              onChange={handleChange}
              className="input"
              placeholder="Software Engineer"
              required
            />
          </div>

          {/* Department */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Department *
            </label>
            <select
              name="department"
              value={formData.department}
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">Select Department</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Joining Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expected Joining Date *
            </label>
            <input
              type="date"
              name="expectedJoiningDate"
              value={formData.expectedJoiningDate}
              onChange={handleChange}
              className="input"
              required
            />
          </div>

          {/* Salary */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Annual CTC (₹)
            </label>
            <input
              type="text"
              name="salary"
              value={formData.salary}
              onChange={handleChange}
              className="input"
              placeholder="10,00,000"
            />
          </div>

          {/* Reporting Manager */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reporting Manager
            </label>
            <input
              type="text"
              name="reportingManager"
              value={formData.reportingManager}
              onChange={handleChange}
              className="input"
              placeholder="Manager Name"
            />
          </div>

          {/* Notes */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="input"
              rows={3}
              placeholder="Any additional notes..."
            />
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <>
              <div className="md:col-span-2">
                <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-4 border-t pt-4">
                  Additional Information
                </h3>
              </div>
              {customFields
                .filter(field => field.isActive)
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((field) => (
                  <div key={field.id} className={field.fieldType === 'textarea' ? 'md:col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderCustomField(field)}
                  </div>
                ))}
            </>
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
