import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { StatusActions } from './StatusActions.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useIncidentsModule from '../hooks/useIncidents.js';

vi.mock('../hooks/useIncidents.js');

describe('StatusActions component', () => {
  it('renders "Mark as investigating" and "Resolve incident" for open incidents', () => {
    vi.mocked(useIncidentsModule.useChangeIncidentStatus).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });

    renderWithProviders(<StatusActions incident={{ _id: 'inc1', status: 'open' }} />);

    expect(screen.getByRole('button', { name: /mark as investigating/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resolve incident/i })).toBeInTheDocument();
  });

  it('renders only "Resolve incident" for investigating incidents', () => {
    vi.mocked(useIncidentsModule.useChangeIncidentStatus).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false
    });

    renderWithProviders(<StatusActions incident={{ _id: 'inc1', status: 'investigating' }} />);

    expect(screen.queryByRole('button', { name: /mark as investigating/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resolve incident/i })).toBeInTheDocument();
  });

  it('renders read-only notice and NO action buttons for resolved incidents', () => {
    renderWithProviders(<StatusActions incident={{ _id: 'inc1', status: 'resolved' }} />);

    expect(screen.getByText('Resolved incidents cannot be changed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resolve incident/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as investigating/i })).not.toBeInTheDocument();
  });

  it('shows 409 conflict message and calls onRefetch on concurrent state update', async () => {
    const mockOnRefetch = vi.fn();
    const mockMutate = vi.fn().mockRejectedValueOnce({
      statusCode: 409,
      message: 'Invalid status transition'
    });

    vi.mocked(useIncidentsModule.useChangeIncidentStatus).mockReturnValue({
      mutateAsync: mockMutate,
      isPending: false
    });

    renderWithProviders(
      <StatusActions
        incident={{ _id: 'inc1', status: 'open' }}
        onRefetch={mockOnRefetch}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /mark as investigating/i }));

    expect(
      await screen.findByText(/Status conflict: This incident was updated elsewhere. Refreshing.../i)
    ).toBeInTheDocument();
    expect(mockOnRefetch).toHaveBeenCalledTimes(1);
  });
});

