import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi, taskApi, calendarApi } from '../services/api';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [activity, setActivity] = useState([]);
  const [todayTasks, setTodayTasks] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, pipelineRes, activityRes, tasksRes, eventsRes] = await Promise.all([
        dashboardApi.getOverview(),
        dashboardApi.getPipeline(),
        dashboardApi.getActivity(10),
        taskApi.getToday(),
        calendarApi.getToday()
      ]);

      setStats(statsRes.data.data);
      setPipeline(pipelineRes.data.data);
      setActivity(activityRes.data.data);
      setTodayTasks(tasksRes.data.data);
      setTodayEvents(eventsRes.data.data);
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" style={{ width: 40, height: 40 }}></div>
      </div>
    );
  }

  const statCards = [
    { label: 'Active Candidates', value: stats?.activeCandidates || 0, icon: '👥', color: 'bg-blue-500' },
    { label: 'Joining This Week', value: stats?.joiningThisWeek || 0, icon: '📅', color: 'bg-green-500' },
    { label: 'Pending Offers', value: stats?.pendingOffers || 0, icon: '📄', color: 'bg-yellow-500' },
    { label: 'Pending Tasks', value: stats?.pendingTasks || 0, icon: '✅', color: 'bg-purple-500' }
  ];

  return (
    <div className="space-y-4 lg:space-y-6 animate-fadeIn">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {statCards.map((stat, index) => (
          <div key={index} className="card p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs lg:text-sm text-gray-500 truncate">{stat.label}</p>
                <p className="text-2xl lg:text-3xl font-bold mt-1">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 lg:w-12 lg:h-12 ${stat.color} rounded-lg flex items-center justify-center text-white text-xl lg:text-2xl flex-shrink-0 ml-3`}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Pipeline Overview */}
        <div className="lg:col-span-2 card p-4 lg:p-6">
          <div className="flex items-center justify-between mb-4 lg:mb-6">
            <h2 className="text-base lg:text-lg font-semibold">Onboarding Pipeline</h2>
            <Link to="/candidates" className="text-indigo-600 hover:text-indigo-700 text-xs lg:text-sm whitespace-nowrap">
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
            {pipeline.map((stage, index) => (
              <div key={index} className="text-center p-3 lg:p-4 bg-gray-50 rounded-lg">
                <p className="text-xl lg:text-2xl font-bold text-indigo-600">{stage.count}</p>
                <p className="text-xs lg:text-sm text-gray-500 mt-1 break-words">{stage.stage}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="card p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <h2 className="text-base lg:text-lg font-semibold">Today's Schedule</h2>
            <Link to="/calendar" className="text-indigo-600 hover:text-indigo-700 text-xs lg:text-sm whitespace-nowrap">
              View All →
            </Link>
          </div>
          {todayEvents.length === 0 ? (
            <p className="text-gray-500 text-xs lg:text-sm">No events scheduled for today</p>
          ) : (
            <div className="space-y-2 lg:space-y-3">
              {todayEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-center p-2 lg:p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 mr-2 lg:mr-3 flex-shrink-0 text-sm lg:text-base">
                    📅
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs lg:text-sm font-medium truncate">{event.title}</p>
                    <p className="text-[10px] lg:text-xs text-gray-500">
                      {new Date(event.startTime).toLocaleTimeString('en-IN', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Pending Tasks */}
        <div className="card p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <h2 className="text-base lg:text-lg font-semibold">Today's Tasks</h2>
            <Link to="/tasks" className="text-indigo-600 hover:text-indigo-700 text-xs lg:text-sm whitespace-nowrap">
              View All →
            </Link>
          </div>
          {todayTasks.length === 0 ? (
            <p className="text-gray-500 text-xs lg:text-sm">No tasks due today</p>
          ) : (
            <div className="space-y-2 lg:space-y-3">
              {todayTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-center justify-between p-2 lg:p-3 bg-gray-50 rounded-lg gap-2">
                  <div className="flex items-center flex-1 min-w-0">
                    <input type="checkbox" className="mr-2 lg:mr-3 h-4 w-4 lg:h-5 lg:w-5 text-indigo-600 rounded flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs lg:text-sm font-medium truncate">{task.message}</p>
                      <p className="text-[10px] lg:text-xs text-gray-500 truncate">{task.candidate?.name}</p>
                    </div>
                  </div>
                  <span className={`badge text-[10px] lg:text-xs flex-shrink-0 ${
                    task.metadata?.priority === 'HIGH' ? 'badge-danger' : 
                    task.metadata?.priority === 'MEDIUM' ? 'badge-warning' : 'badge-info'
                  }`}>
                    {task.metadata?.priority || 'MEDIUM'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card p-4 lg:p-6">
          <h2 className="text-base lg:text-lg font-semibold mb-3 lg:mb-4">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-gray-500 text-xs lg:text-sm">No recent activity</p>
          ) : (
            <div className="space-y-3 lg:space-y-4">
              {activity.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-start">
                  <div className="w-6 h-6 lg:w-8 lg:h-8 bg-gray-100 rounded-full flex items-center justify-center text-xs lg:text-sm mr-2 lg:mr-3 flex-shrink-0">
                    {item.action === 'CANDIDATE_CREATED' ? '➕' :
                     item.action === 'OFFER_SENT' ? '📧' :
                     item.action === 'OFFER_SIGNED' ? '✍️' :
                     item.action === 'EMAIL_SENT' ? '📨' :
                     item.action === 'CALENDAR_EVENT_CREATED' ? '📅' : '📝'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs lg:text-sm text-gray-900 break-words">{item.description}</p>
                    <p className="text-[10px] lg:text-xs text-gray-500 mt-1">
                      {new Date(item.createdAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
