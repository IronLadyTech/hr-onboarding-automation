import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { configApi } from '../services/api';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [companyName, setCompanyName] = useState('Company');
  const [companyLogo, setCompanyLogo] = useState(null);
  
  useEffect(() => {
    // Fetch company name and logo from config
    const fetchCompanyInfo = async () => {
      try {
        const response = await configApi.getSettings();
        if (response.data?.success) {
          if (response.data.data?.companyName) {
            setCompanyName(response.data.data.companyName);
          }
          if (response.data.data?.companyLogoUrl) {
            setCompanyLogo(response.data.data.companyLogoUrl);
          }
        }
      } catch (error) {
        console.error('Failed to fetch company info:', error);
      }
    };
    fetchCompanyInfo();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/candidates', label: 'Candidates', icon: '👥' },
    { path: '/calendar', label: 'Calendar', icon: '📅' },
    { path: '/steps', label: 'Steps', icon: '📋' },
    { path: '/templates', label: 'Templates', icon: '📝' },
    { path: '/settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} text-white transition-all duration-300 flex flex-col`} style={{ backgroundColor: 'var(--color-primary, #4F46E5)' }}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b" style={{ borderColor: 'var(--color-primary-dark, #4338CA)' }}>
          {sidebarOpen && (
            <div className="flex items-center space-x-2">
              {companyLogo ? (
                <img 
                  src={companyLogo} 
                  alt={companyName} 
                  className="h-8 w-auto object-contain"
                />
              ) : (
                <span className="text-2xl">👩‍💼</span>
              )}
              <span className="font-bold text-xl">{companyName}</span>
            </div>
          )}
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-indigo-800 rounded"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 mx-2 rounded-lg transition-colors ${
                  isActive
                    ? 'text-white'
                    : 'hover:text-white'
                }`
              }
            style={({ isActive }) => ({
              backgroundColor: isActive ? 'var(--color-primary-dark, #4338CA)' : 'transparent',
              color: isActive ? 'white' : 'rgba(255, 255, 255, 0.7)'
            })}
            >
              <span className="text-xl">{item.icon}</span>
              {sidebarOpen && <span className="ml-3">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--color-primary-dark, #4338CA)' }}>
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-dark, #4338CA)' }}>
              {user?.name?.charAt(0) || 'U'}
            </div>
            {sidebarOpen && (
              <div className="ml-3 flex-1">
                <p className="font-medium text-sm">{user?.name}</p>
                <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>{user?.role}</p>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <button
              onClick={handleLogout}
              className="mt-4 w-full py-2 px-4 rounded-lg text-sm transition-colors"
              style={{ 
                backgroundColor: 'var(--color-primary-dark, #4338CA)',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--color-primary-dark, #3730A3)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--color-primary-dark, #4338CA)'}
            >
              Logout
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-6">
          <h1 className="text-xl font-semibold text-gray-800">HR Onboarding</h1>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {new Date().toLocaleDateString('en-IN', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
