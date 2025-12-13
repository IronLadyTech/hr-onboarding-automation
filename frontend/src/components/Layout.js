import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { configApi } from '../services/api';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
            // Use the full URL from the API
            setCompanyLogo(response.data.data.companyLogoUrl);
          }
        }
      } catch (error) {
        console.error('Failed to fetch company info:', error);
      }
    };
    fetchCompanyInfo();
    
    // Refresh logo every 30 seconds in case it was updated
    const interval = setInterval(fetchCompanyInfo, 30000);
    return () => clearInterval(interval);
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
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${sidebarOpen ? 'w-64' : 'w-20'} 
        text-white transition-all duration-300 flex flex-col
      `} style={{ backgroundColor: 'var(--color-primary, #4F46E5)' }}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b" style={{ borderColor: 'var(--color-primary-dark, #4338CA)' }}>
          {sidebarOpen && (
            <div className="flex items-center space-x-2">
              {companyLogo ? (
                <img 
                  src={companyLogo} 
                  alt={companyName} 
                  className="h-8 w-auto object-contain max-w-[120px]"
                  onError={(e) => {
                    console.error('Failed to load logo in sidebar:', companyLogo);
                    e.target.style.display = 'none';
                    // Show emoji fallback
                    if (!e.target.nextElementSibling || e.target.nextElementSibling.tagName !== 'SPAN') {
                      const emoji = document.createElement('span');
                      emoji.className = 'text-2xl';
                      emoji.textContent = '👩‍💼';
                      e.target.parentNode.insertBefore(emoji, e.target);
                    }
                  }}
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
              onClick={() => setMobileMenuOpen(false)}
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
      <main className="flex-1 overflow-auto lg:ml-0">
        {/* Top bar */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center space-x-3">
            {/* Mobile Hamburger Menu */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg lg:text-xl font-semibold text-gray-800">HR Onboarding</h1>
          </div>
          <div className="flex items-center space-x-2 lg:space-x-4">
            <span className="text-xs lg:text-sm text-gray-600 hidden sm:inline">
              {new Date().toLocaleDateString('en-IN', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </span>
            <span className="text-xs lg:text-sm text-gray-600 sm:hidden">
              {new Date().toLocaleDateString('en-IN', { 
                day: 'numeric',
                month: 'short'
              })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
