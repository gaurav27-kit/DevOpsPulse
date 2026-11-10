import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { PublicOnlyRoute } from './PublicOnlyRoute.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useAuthModule from '../hooks/useAuth.js';

vi.mock('../hooks/useAuth.js');

describe('PublicOnlyRoute component', () => {
  it('renders spinner while session is loading', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: null,
      isLoading: true
    });

    renderWithProviders(
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<div>Login View</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/login'] }
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Login View')).not.toBeInTheDocument();
  });

  it('redirects authenticated user to /dashboard', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { id: 'u1', name: 'Alice' },
      isLoading: false
    });

    renderWithProviders(
      <Routes>
        <Route path="/dashboard" element={<div>Dashboard Home</div>} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<div>Login View</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/login'] }
    );

    expect(screen.getByText('Dashboard Home')).toBeInTheDocument();
    expect(screen.queryByText('Login View')).not.toBeInTheDocument();
  });

  it('renders public route when user is unauthenticated', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: null,
      isLoading: false
    });

    renderWithProviders(
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<div>Login View</div>} />
        </Route>
      </Routes>,
      { initialEntries: ['/login'] }
    );

    expect(screen.getByText('Login View')).toBeInTheDocument();
  });
});

