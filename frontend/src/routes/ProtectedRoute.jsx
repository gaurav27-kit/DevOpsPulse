import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Spinner } from '../components/Spinner.jsx';

/**
 * Route wrapper that restricts access to authenticated users.
 * Remembers intended navigation target in router state if user is unauthenticated.
 */
export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Spinner fullPage size="lg" />;
  }

  if (!user) {
    // Preserve the requested path so login can route back after authentication
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

