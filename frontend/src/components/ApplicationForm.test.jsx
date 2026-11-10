import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationForm } from './ApplicationForm.jsx';

describe('ApplicationForm component', () => {
  it('validates required fields on client before submission', async () => {
    const handleSubmit = vi.fn();
    render(<ApplicationForm onSubmit={handleSubmit} />);

    const submitBtn = screen.getByRole('button', { name: /save application/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Application name is required')).toBeInTheDocument();
    expect(await screen.findByText('Monitored URL is required')).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('validates URL protocol (must start with http:// or https://)', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ApplicationForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/application name/i), 'My Service');
    await user.type(screen.getByLabelText(/endpoint url/i), 'ftp://bad-url.com');

    fireEvent.click(screen.getByRole('button', { name: /save application/i }));

    expect(await screen.findByText('URL must start with http:// or https://')).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('displays server-side field error when provided', () => {
    render(
      <ApplicationForm
        onSubmit={vi.fn()}
        serverErrors={{ url: 'You are already monitoring this URL' }}
      />
    );

    expect(screen.getByText('You are already monitoring this URL')).toBeInTheDocument();
  });

  it('submits valid data with trimmed fields', async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ApplicationForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText(/application name/i), '  Prod Service  ');
    await user.type(screen.getByLabelText(/endpoint url/i), 'https://api.example.com/health');

    fireEvent.click(screen.getByRole('button', { name: /save application/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      name: 'Prod Service',
      url: 'https://api.example.com/health',
      environment: 'production',
      checkIntervalSeconds: 300,
      timeoutMs: 10000
    });
  });

  it('disables inputs and submit button when isLoading is true', () => {
    render(<ApplicationForm onSubmit={vi.fn()} isLoading={true} />);

    expect(screen.getByLabelText(/application name/i)).toBeDisabled();
    expect(screen.getByLabelText(/endpoint url/i)).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

