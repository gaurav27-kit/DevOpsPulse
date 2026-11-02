import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { PublicOnlyRoute } from './routes/PublicOnlyRoute.jsx';
import { AppLayout } from './components/AppLayout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ApplicationsPage } from './pages/ApplicationsPage.jsx';
import { ApplicationCreatePage } from './pages/ApplicationCreatePage.jsx';
import { ApplicationEditPage } from './pages/ApplicationEditPage.jsx';
import { ApplicationDetailsPage } from './pages/ApplicationDetailsPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

/**
 * Root routing component defining access control policies:
 * - Public-only: /login, /register
 * - Protected: /dashboard, /applications, /applications/new, /applications/:id, /applications/:id/edit
 * - Redirects: / -> /dashboard
 * - Catch-all: * -> NotFoundPage
 */
export default function App() {
  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Guest/Public-only routes */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Authenticated routes wrapped with AppLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/applications/new" element={<ApplicationCreatePage />} />
          <Route path="/applications/:id" element={<ApplicationDetailsPage />} />
          <Route path="/applications/:id/edit" element={<ApplicationEditPage />} />
        </Route>
      </Route>

      {/* 404 Fallback */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
