import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Spinner } from '../components/Spinner.jsx';

/**
 * Route wrapper that redirects already-authenticated users to /dashboard.
 * Prevents logged-in users from seeing login or registration screens.
 */
export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Spinner fullPage size="lg" />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

