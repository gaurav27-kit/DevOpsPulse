import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useAuthModule from '../hooks/useAuth.js';

vi.mock('../hooks/useAuth.js');

describe('LoginPage component', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      login: mockLogin,
      isLoggingIn: false,
      user: null
    });
  });

  it('validates required email and password on client before submission', async () => {
    renderWithProviders(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Email address is required')).toBeInTheDocument();
    expect(await screen.findByText('Password is required')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('validates invalid email format', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Please provide a valid email address')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('submits credentials when valid', async () => {
    mockLogin.mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'secret123');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'secret123'
    });
  });

  it('displays server error message on login failure', async () => {
    mockLogin.mockRejectedValueOnce({
      message: 'Invalid email or password'
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });

  it('disables submit button and inputs while logging in', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      login: mockLogin,
      isLoggingIn: true,
      user: null
    });

    renderWithProviders(<LoginPage />);

    expect(screen.getByLabelText(/email address/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

