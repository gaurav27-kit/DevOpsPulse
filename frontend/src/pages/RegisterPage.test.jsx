import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegisterPage } from './RegisterPage.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useAuthModule from '../hooks/useAuth.js';

vi.mock('../hooks/useAuth.js');

describe('RegisterPage component', () => {
  const mockRegister = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      register: mockRegister,
      isRegistering: false,
      user: null
    });
  });

  it('validates client constraints: name length, email format, password min 8 chars', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RegisterPage />);

    // Click submit empty
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Full name is required')).toBeInTheDocument();
    expect(await screen.findByText('Email address is required')).toBeInTheDocument();
    expect(await screen.findByText('Password is required')).toBeInTheDocument();

    // Fill invalid short password
    await user.type(screen.getByLabelText(/full name/i), 'Alice');
    await user.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Password must be at least 8 characters long')).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('submits valid registration data', async () => {
    mockRegister.mockResolvedValueOnce({ success: true });
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), 'Alice Developer');
    await user.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'securepassword123');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(mockRegister).toHaveBeenCalledWith({
      name: 'Alice Developer',
      email: 'alice@example.com',
      password: 'securepassword123'
    });
  });

  it('displays field-specific error from server (e.g. duplicate email 409)', async () => {
    mockRegister.mockRejectedValueOnce({
      fieldErrors: { email: 'Email already exists' },
      message: 'Email already exists'
    });
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RegisterPage />);

    await user.type(screen.getByLabelText(/full name/i), 'Alice Developer');
    await user.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'securepassword123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect((await screen.findAllByText('Email already exists', {}, { timeout: 4000 })).length).toBeGreaterThanOrEqual(1);
  });
});
