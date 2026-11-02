import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Server,
  AlertTriangle,
  Rocket,
  LogOut,
  Menu,
  X,
  Activity
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from './Button.jsx';
import { LiveIndicator } from './LiveIndicator.jsx';
import { useLiveInvalidation } from '../socket/useLiveInvalidation.js';

/**
 * Main application shell featuring a responsive sidebar navigation and top bar.
 */
export function AppLayout() {
  const { user, logout, isLoggingOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  // Mount real-time Socket.IO cache invalidation hook
  useLiveInvalidation();

  // Inspect cached dashboard data for active incident count without triggering any network requests
  const cachedDashboard =
    queryClient.getQueryData(['dashboard', '24h']) ||
    queryClient.getQueryData(['dashboard', '7d']) ||
    queryClient.getQueryData(['dashboard', '30d']);
  const activeIncidentsCount = cachedDashboard?.incidents?.activeCount;

  const navItems = [
    { name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, enabled: true },
    { name: 'Applications', to: '/applications', icon: Server, enabled: true },
    {
      name: 'Incidents',
      to: '/incidents',
      icon: AlertTriangle,
      enabled: true,
      badge: activeIncidentsCount > 0 ? activeIncidentsCount : null
    },
    { name: 'Deployments', to: '/deployments', icon: Rocket, enabled: true }
  ];

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2 font-bold text-slate-900 tracking-tight">
          <Activity className="w-5 h-5 text-indigo-600" />
          <span>DevOpsPulse</span>
        </div>
        <div className="flex items-center gap-2">
          <LiveIndicator />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Backdrop for mobile drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="p-5 border-b border-slate-100 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">DevOpsPulse</h1>
            <p className="text-xs text-slate-500">Monitoring & Incidents</p>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
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
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 ${isItemActive ? 'text-indigo-600' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span>{item.name}</span>
                </div>

                {item.badge != null && (
                  <span className="inline-flex items-center justify-center rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-2xs font-bold leading-none">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User profile footer inside sidebar */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-900 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar on desktop */}
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 px-8 items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-800">Operational Dashboard</h2>
            <LiveIndicator />
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              isLoading={isLoggingOut}
              className="text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4 text-slate-500" aria-hidden="true" />
              <span>Logout</span>
            </Button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
