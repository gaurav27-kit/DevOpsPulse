import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Server,
  AlertTriangle,
  Rocket,
  Target,
  LogOut,
  Menu,
  X,
  Activity,
  Bell
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from './Button.jsx';
import { LiveIndicator } from './LiveIndicator.jsx';
import { AlertBanner } from './AlertBanner.jsx';
import { useLiveInvalidation } from '../socket/useLiveInvalidation.js';

/**
 * Main application shell featuring a responsive sidebar navigation and top bar.
 */
export function AppLayout() {
  const { user, logout, isLoggingOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');
  const [sloNotice, setSloNotice] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  // Mount real-time Socket.IO cache invalidation hook
  useLiveInvalidation();

  useEffect(() => {
    const handleSloAlert = (e) => {
      const { type, severity } = e.detail || {};
      const formatType = (type || 'alert').replace(/^slo_/, '').replace(/_/g, ' ');
      setSloNotice({
        message: `SLO Alert: ${formatType.toUpperCase()} (${severity || 'notice'})`,
        type: severity === 'critical' || severity === 'high' ? 'error' : 'info'
      });
    };

    window.addEventListener('devopspulse:slo-alert', handleSloAlert);
    return () => window.removeEventListener('devopspulse:slo-alert', handleSloAlert);
  }, []);

  // Inspect cached dashboard data for active incident count without triggering any network requests
  const cachedDashboard =
    queryClient.getQueryData(['dashboard', '24h']) ||
    queryClient.getQueryData(['dashboard', '7d']) ||
    queryClient.getQueryData(['dashboard', '30d']);
  const activeIncidentsCount = cachedDashboard?.incidents?.activeCount;

  const navItems = [
    { name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, enabled: true },
    { name: 'Applications', to: '/applications', icon: Server, enabled: true },
    { name: 'SLOs', to: '/slos', icon: Target, enabled: true },
    {
      name: 'Incidents',
      to: '/incidents',
      icon: AlertTriangle,
      enabled: true,
      badge: activeIncidentsCount > 0 ? activeIncidentsCount : null
    },
    { name: 'Deployments', to: '/deployments', icon: Rocket, enabled: true },
    { name: 'Alerts', to: '/notifications', icon: Bell, enabled: true }
  ];

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      setLogoutError(err.message || 'Logout failed. Please check your network connection.');
      console.error('Logout error:', err);
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-[#faf8ff] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden bg-white/85 backdrop-blur-xl border-b border-[#e2e8f0] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2 font-bold text-[#131b2e] tracking-tight">
          <div className="w-8 h-8 rounded-lg bg-[#070d0d] text-[#ff6700] flex items-center justify-center shadow-xs">
            <Activity className="w-4 h-4" />
          </div>
          <span>DevOpsPulse</span>
        </div>
        <div className="flex items-center gap-2">
          <LiveIndicator />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-[#5a4136] hover:bg-[#f2f3ff] hover:text-[#131b2e] focus:outline-hidden focus:ring-2 focus:ring-[#ff6700]"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Backdrop for mobile drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-[#283044]/40 backdrop-blur-xs z-40 md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#e2e8f0] flex flex-col transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 shadow-xs ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="p-5 border-b border-[#eaedff] flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#070d0d] text-[#ff6700] flex items-center justify-center font-bold shadow-xs">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-[#131b2e] leading-tight">DevOpsPulse</h1>
            <p className="text-xs text-[#a23f00] font-medium">Monitoring &amp; Incidents</p>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;

            const isItemActive =
              item.to === '/dashboard'
                ? location.pathname === '/dashboard'
                : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={closeMobileMenu}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isItemActive
                    ? 'bg-[#e2e7ff] text-[#131b2e] font-semibold shadow-xs'
                    : 'text-[#5a4136] hover:bg-[#f2f3ff] hover:text-[#131b2e]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 ${isItemActive ? 'text-[#a23f00]' : 'text-[#59605f]'}`}
                    aria-hidden="true"
                  />
                  <span>{item.name}</span>
                </div>

                {item.badge != null && (
                  <span className="inline-flex items-center justify-center rounded-full bg-[#ffdad6] text-[#93000a] px-2 py-0.5 text-2xs font-bold leading-none">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User profile footer inside sidebar */}
        <div className="p-4 border-t border-[#eaedff] bg-[#f2f3ff]/50">
          <div className="flex items-center justify-between">
            <div className="truncate">
              <p className="text-xs font-semibold text-[#131b2e] truncate">{user?.name}</p>
              <p className="text-xs text-[#59605f] truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar on desktop */}
        <header className="hidden md:flex h-16 bg-white/85 backdrop-blur-xl border-b border-[#e2e8f0] px-8 items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-[#131b2e]">Operational Dashboard</h2>
            <LiveIndicator />
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-[#131b2e]">{user?.name}</p>
              <p className="text-xs text-[#59605f]">{user?.email}</p>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              isLoading={isLoggingOut}
              className="text-xs py-1.5 px-3 min-h-[36px] flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4 text-[#59605f]" aria-hidden="true" />
              <span>Logout</span>
            </Button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          {sloNotice && (
            <div className="mb-6" data-testid="slo-alert-banner">
              <AlertBanner
                message={sloNotice.message}
                type={sloNotice.type}
                onDismiss={() => setSloNotice(null)}
              />
            </div>
          )}
          {logoutError && (
            <div className="mb-6">
              <AlertBanner
                message={logoutError}
                type="error"
                onDismiss={() => setLogoutError('')}
              />
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
