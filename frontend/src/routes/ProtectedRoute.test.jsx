import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useAuthModule from '../hooks/useAuth.js';

vi.mock('../hooks/useAuth.js');

describe('ProtectedRoute component', () => {
  it('renders spinner while session is loading', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: null,
      isLoading: true
    });

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/protected" element={<div>Protected Secret</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/protected'] }
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Protected Secret')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated user to /login', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: null,
      isLoading: false
    });

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/protected" element={<div>Protected Secret</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/protected'] }
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Secret')).not.toBeInTheDocument();
  });

  it('renders child routes when user is authenticated', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { id: 'u1', name: 'Alice' },
      isLoading: false
    });

    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/protected" element={<div>Protected Secret</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/protected'] }
    );

    expect(screen.getByText('Protected Secret')).toBeInTheDocument();
  });
});

