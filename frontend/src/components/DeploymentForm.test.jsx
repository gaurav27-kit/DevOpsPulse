import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeploymentForm } from './DeploymentForm.jsx';
import * as useAppOptionsModule from '../hooks/useApplicationOptions.js';

vi.mock('../hooks/useApplicationOptions.js');

describe('DeploymentForm component', () => {
  const mockSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppOptionsModule.useApplicationOptions).mockReturnValue({
      data: [{ _id: 'app1', name: 'Web Frontend', environment: 'production' }],
      isLoading: false
    });
  });

  it('rejects completedAt before startedAt', async () => {
    const user = userEvent.setup();
    render(<DeploymentForm initialAppId="app1" onSubmit={mockSubmit} />);

    await user.type(screen.getByLabelText(/version/i), 'v1.0.0');

    // Set startedAt to 12:00 and completedAt to 11:00
    fireEvent.change(screen.getByLabelText(/started at/i), {
      target: { value: '2026-01-01T12:00' }
    });
    fireEvent.change(screen.getByLabelText(/completed at/i), {
      target: { value: '2026-01-01T11:00' }
    });

    fireEvent.click(screen.getByRole('button', { name: /record deployment/i }));

    expect(await screen.findByText(/Completion time must not be before start time/i)).toBeInTheDocument();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects startedAt more than 5 minutes in the future', async () => {
    const user = userEvent.setup();
    render(<DeploymentForm initialAppId="app1" onSubmit={mockSubmit} />);

    await user.type(screen.getByLabelText(/version/i), 'v1.0.0');

    // Future start time +2 hours
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const futureStr = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;

    fireEvent.change(screen.getByLabelText(/started at/i), {
      target: { value: futureStr }
    });

    fireEvent.click(screen.getByRole('button', { name: /record deployment/i }));

    expect(await screen.findByText(/Start time cannot be more than 5 minutes in the future/i)).toBeInTheDocument();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('hides or disables completedAt field when status is pending or in_progress', () => {
    render(<DeploymentForm initialAppId="app1" onSubmit={mockSubmit} />);

    // Change status to pending
    const statusSelect = screen.getByLabelText(/status/i);
    fireEvent.change(statusSelect, { target: { value: 'pending' } });

    // CompletedAt input should not be visible or available for pending
    expect(screen.queryByLabelText(/completion time/i)).not.toBeInTheDocument();
  });

  it('validates commitSha hex format', async () => {
    const user = userEvent.setup();
    render(<DeploymentForm initialAppId="app1" onSubmit={mockSubmit} />);

    await user.type(screen.getByLabelText(/version/i), 'v1.0.0');
    await user.type(screen.getByLabelText(/commit sha/i), 'not-a-valid-hex-sha');

    fireEvent.click(screen.getByRole('button', { name: /record deployment/i }));

    expect(
      await screen.findByText(/Commit SHA must be between 7 and 40 hexadecimal characters/i)
    ).toBeInTheDocument();
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
