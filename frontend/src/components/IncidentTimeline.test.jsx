import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { IncidentTimeline } from './IncidentTimeline.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useAuthModule from '../hooks/useAuth.js';

vi.mock('../hooks/useAuth.js');

describe('IncidentTimeline component', () => {
  it('renders chronological updates with appropriate type labels and authors', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { _id: 'u1', name: 'Alice' }
    });

    // Provide unsorted updates
    const updates = [
      {
        _id: 'up2',
        message: 'Investigating database pool exhaustion',
        type: 'note',
        author: 'u1', // current user -> "You"
        createdAt: '2026-01-01T10:15:00Z'
      },
      {
        _id: 'up1',
        message: 'Incident opened after 2 consecutive failed checks',
        type: 'system',
        author: null, // null author -> "System"
        createdAt: '2026-01-01T10:00:00Z'
      },
      {
        _id: 'up3',
        message: 'Status changed to "resolved". Note: Pool recycled',
        type: 'status_change',
        author: 'u2', // other user -> "Team member"
        createdAt: '2026-01-01T10:30:00Z'
      }
    ];

    renderWithProviders(<IncidentTimeline updates={updates} />);

    // Verifying text contents
    expect(screen.getByText('Incident opened after 2 consecutive failed checks')).toBeInTheDocument();
    expect(screen.getByText('Investigating database pool exhaustion')).toBeInTheDocument();
    expect(screen.getByText('Status changed to "resolved". Note: Pool recycled')).toBeInTheDocument();

    // Verifying type badges/labels
    expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByText('Status Change')).toBeInTheDocument();

    // Verifying authors
    expect(screen.getByText(/You/i)).toBeInTheDocument();
    expect(screen.getByText(/Team member/i)).toBeInTheDocument();

    // Verify chronological order: first message appears before last message in the DOM
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Incident opened after 2 consecutive failed checks');
    expect(items[1]).toHaveTextContent('Investigating database pool exhaustion');
    expect(items[2]).toHaveTextContent('Status changed to "resolved"');
  });

  it('renders fallback when updates array is empty', () => {
    vi.mocked(useAuthModule.useAuth).mockReturnValue({ user: null });
    renderWithProviders(<IncidentTimeline updates={[]} />);

    expect(screen.getByText('No timeline entries recorded yet.')).toBeInTheDocument();
  });
});
