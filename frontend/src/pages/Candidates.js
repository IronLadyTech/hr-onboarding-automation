import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { candidateApi } from '../services/api';
import toast from 'react-hot-toast';

const statusColors = {
  NEW: 'badge-info',
  OFFER_SENT: 'badge-warning',
  OFFER_VIEWED: 'badge-warning',
  OFFER_ACCEPTED: 'badge-success',
  OFFER_REJECTED: 'badge-danger',
  DOCUMENTS_PENDING: 'badge-warning',
  READY_TO_JOIN: 'badge-info',
  JOINED: 'badge-success',
  ONBOARDING_COMPLETE: 'badge-success',
  WITHDRAWN: 'badge-gray'
};

const Candidates = () => {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [showBatchScheduleModal, setShowBatchScheduleModal] = useState(false);
  const [batchScheduleData, setBatchScheduleData] = useState({
    eventType: '',
    dateTime: '',
    duration: 60
  });
  const [batchLoading, setBatchLoading] = useState(false);
  
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || '',
    department: searchParams.get('department') || '',
    page: parseInt(searchParams.get('page')) || 1
  });

  useEffect(() => {
    fetchCandidates();
  }, [filters]);

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const params = {
        page: filters.page,
        limit: 10,
        ...(filters.search && { search: filters.search }),
        ...(filters.status && { status: filters.status }),
        ...(filters.department && { department: filters.department })
      };
      
      const response = await candidateApi.getAll(params);
      setCandidates(response.data.data);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error('Failed to load candidates');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value, page: 1 };
    setFilters(newFilters);
    
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    setSearchParams(params);
  };

  const handlePageChange = (page) => {
    handleFilterChange('page', page);
  };

  const handleSelectCandidate = (candidateId) => {
    setSelectedCandidates(prev => 
      prev.includes(candidateId) 
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    );
  };

  const handleSelectAll = () => {
    if (selectedCandidates.length === candidates.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(candidates.map(c => c.id));
    }
  };

  const handleBatchSchedule = async () => {
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
      await candidateApi.batchSchedule({
        candidateIds: selectedCandidates,
        ...batchScheduleData
      });
      toast.success(`Successfully scheduled ${batchScheduleData.eventType} for ${selectedCandidates.length} candidates`);
      setShowBatchScheduleModal(false);
      setSelectedCandidates([]);
      setBatchScheduleData({ eventType: '', dateTime: '', duration: 60 });
      fetchCandidates();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to schedule events');
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
        <div className="flex gap-3 mt-4 sm:mt-0">
          {selectedCandidates.length > 0 && (
            <button 
              onClick={() => setShowBatchScheduleModal(true)}
              className="btn btn-primary"
            >
              📅 Batch Schedule ({selectedCandidates.length})
            </button>
          )}
          <Link to="/candidates/new" className="btn btn-primary">
          + Add Candidate
        </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search by name or email..."
            className="input"
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
          <select
            className="input"
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="OFFER_SENT">Offer Sent</option>
            <option value="OFFER_VIEWED">Offer Viewed</option>
            <option value="OFFER_ACCEPTED">Offer Accepted</option>
            <option value="READY_TO_JOIN">Ready to Join</option>
            <option value="JOINED">Joined</option>
            <option value="ONBOARDING_COMPLETE">Onboarding Complete</option>
          </select>
          <select
            className="input"
            value={filters.department}
            onChange={(e) => handleFilterChange('department', e.target.value)}
          >
            <option value="">All Departments</option>
            <option value="Engineering">Engineering</option>
            <option value="Sales">Sales</option>
            <option value="Marketing">Marketing</option>
            <option value="Operations">Operations</option>
            <option value="HR">HR</option>
          </select>
          <button 
            onClick={() => {
              setFilters({ search: '', status: '', department: '', page: 1 });
              setSearchParams({});
            }}
            className="btn btn-secondary"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="spinner" style={{ width: 40, height: 40 }}></div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No candidates found</p>
            <Link to="/candidates/new" className="text-indigo-600 hover:text-indigo-700 mt-2 inline-block">
              Add your first candidate →
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="w-12 px-4">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.length === candidates.length && candidates.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joining Date</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {candidates.map((candidate) => {
                    const fullName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Unknown';
                    const initials = ((candidate.firstName?.[0] || '') + (candidate.lastName?.[0] || '')).toUpperCase() || '?';
                    return (
                      <tr key={candidate.id} className="hover:bg-gray-50">
                        <td className="px-4">
                          <input
                            type="checkbox"
                            checked={selectedCandidates.includes(candidate.id)}
                            onChange={() => handleSelectCandidate(candidate.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td>
                          <div className="flex items-center">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-medium">
                              {initials}
                            </div>
                            <div className="ml-3">
                              <p className="font-medium text-gray-900">{fullName}</p>
                              <p className="text-sm text-gray-500">{candidate.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-sm text-gray-900">{candidate.position}</td>
                        <td className="text-sm text-gray-500">{candidate.department}</td>
                        <td className="text-sm text-gray-500">
                          {candidate.expectedJoiningDate 
                            ? new Date(candidate.expectedJoiningDate).toLocaleDateString('en-IN')
                            : '-'
                          }
                        </td>
                        <td>
                          <span className={`badge ${statusColors[candidate.status] || 'badge-gray'}`}>
                            {(candidate.status || 'NEW').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <Link 
                            to={`/candidates/${candidate.id}`}
                            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                          >
                            View Details
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="px-6 py-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} results
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="btn btn-secondary text-sm disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.pages}
                    className="btn btn-secondary text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Batch Schedule Modal */}
      {showBatchScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Batch Schedule Event</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Type *</label>
              <select
                value={batchScheduleData.eventType}
                onChange={(e) => setBatchScheduleData({ ...batchScheduleData, eventType: e.target.value })}
                className="input w-full"
              >
                <option value="">Select event type</option>
                <option value="HR_INDUCTION">HR Induction</option>
                <option value="CEO_INDUCTION">CEO Induction</option>
                <option value="SALES_INDUCTION">Sales Induction</option>
                <option value="CHECKIN_CALL">Check-in Call</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time *</label>
              <input 
                type="datetime-local" 
                value={batchScheduleData.dateTime}
                onChange={(e) => setBatchScheduleData({ ...batchScheduleData, dateTime: e.target.value })}
                className="input w-full"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
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
            <div className="text-sm text-gray-600 mb-4">
              This will create ONE calendar event with all {selectedCandidates.length} selected candidates as attendees.
            </div>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => {
                  setShowBatchScheduleModal(false);
                  setBatchScheduleData({ eventType: '', dateTime: '', duration: 60 });
                }} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={handleBatchSchedule} 
                disabled={!batchScheduleData.eventType || !batchScheduleData.dateTime || batchLoading} 
                className="btn btn-primary"
              >
                {batchLoading ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Candidates;
