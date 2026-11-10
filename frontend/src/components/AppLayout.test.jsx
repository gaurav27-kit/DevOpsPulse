import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { AppLayout } from './AppLayout.jsx';
import { renderWithProviders, createTestQueryClient } from '../tests/helpers.jsx';
import { authApi } from '../api/authApi.js';
import { AUTH_QUERY_KEY } from '../hooks/useAuth.js';

vi.mock('../api/authApi.js', () => ({
  authApi: {
    logout: vi.fn(),
    getMe: vi.fn()
  }
}));

vi.mock('../socket/useLiveInvalidation.js', () => ({
  useLiveInvalidation: vi.fn()
}));

vi.mock('./LiveIndicator.jsx', () => ({
  LiveIndicator: () => <div data-testid="live-indicator">Live</div>
}));

describe('AppLayout logout regression suite', () => {
  const fakeUser = {
    id: 'user_123',
    name: 'Ada Lovelace',
    email: 'ada@example.com'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking Logout navigates to /login upon success', async () => {
    authApi.logout.mockResolvedValueOnce({ success: true, message: 'Logged out successfully' });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60000, staleTime: 60000 }
      }
    });
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<div>Dashboard Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page Target</div>} />
      </Routes>,
      {
        initialEntries: ['/'],
        user: fakeUser,
        queryClient
      }
    );

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();

    const logoutBtn = screen.getByRole('button', { name: /Logout/i });
    await user.click(logoutBtn);

    // Verify navigation to /login occurred
    expect(await screen.findByText('Login Page Target')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
  });

  it('removes non-auth cached queries while setting ["me"] to null on logout', async () => {
    authApi.logout.mockResolvedValueOnce({ success: true });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60000, staleTime: 60000 }
      }
    });
    // Seed non-auth queries in cache
    queryClient.setQueryData(['applications'], [{ id: 'app1', name: 'Prod API' }]);
    queryClient.setQueryData(['dashboard', '24h'], { total: 1 });

    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<div>Dashboard Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page Target</div>} />
      </Routes>,
      {
        initialEntries: ['/'],
        user: fakeUser,
        queryClient
      }
    );

    // Verify initial cache
    expect(queryClient.getQueryData(['applications'])).toEqual([{ id: 'app1', name: 'Prod API' }]);
    expect(queryClient.getQueryData(['dashboard', '24h'])).toEqual({ total: 1 });

    const logoutBtn = screen.getByRole('button', { name: /Logout/i });
    await user.click(logoutBtn);

    await screen.findByText('Login Page Target');

    // Assert that ["me"] is null
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toBeNull();

    // Assert that non-auth queries were removed to avoid leaking previous user data
    expect(queryClient.getQueryData(['applications'])).toBeUndefined();
    expect(queryClient.getQueryData(['dashboard', '24h'])).toBeUndefined();
  });

  it('displays error message and remains on current page when logout fails', async () => {
    authApi.logout.mockRejectedValueOnce(new Error('Network connectivity loss during logout'));

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60000, staleTime: 60000 }
      }
    });
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<div>Dashboard Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page Target</div>} />
      </Routes>,
      {
        initialEntries: ['/'],
        user: fakeUser,
        queryClient
      }
    );

    const logoutBtn = screen.getByRole('button', { name: /Logout/i });
    await user.click(logoutBtn);

    // Assert error message is presented to the user
    expect(
      await screen.findByText(/Network connectivity loss during logout/i)
    ).toBeInTheDocument();

    // Assert user was NOT navigated away
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page Target')).not.toBeInTheDocument();
  });
});
