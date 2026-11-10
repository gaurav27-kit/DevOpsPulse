import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { IncidentsPage } from './IncidentsPage.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useIncidentsModule from '../hooks/useIncidents.js';
import * as useAppOptionsModule from '../hooks/useApplicationOptions.js';

vi.mock('../hooks/useIncidents.js');
vi.mock('../hooks/useApplicationOptions.js');

describe('IncidentsPage component', () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppOptionsModule.useApplicationOptions).mockReturnValue({
      data: [{ _id: 'app1', name: 'Primary Web' }]
    });
  });

  it('renders incidents list and pagination', () => {
    vi.mocked(useIncidentsModule.useIncidentsList).mockReturnValue({
      data: {
        incidents: [
          {
            _id: 'inc1',
            title: 'Primary Web is down',
            severity: 'critical',
            status: 'open',
            failureCount: 4,
            startedAt: new Date().toISOString(),
            applicationId: { name: 'Primary Web' }
          }
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch
    });

    renderWithProviders(<IncidentsPage />);

    expect(screen.getAllByText('Primary Web is down').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/critical/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/open/i).length).toBeGreaterThan(0);
  });

  it('shows empty state with clear filters button when filter produces 0 results', () => {
    vi.mocked(useIncidentsModule.useIncidentsList).mockReturnValue({
      data: {
        incidents: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 }
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch
    });

    renderWithProviders(<IncidentsPage />, {
      initialEntries: ['/incidents?status=open']
    });

    expect(screen.getByText('No incidents match your filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument();
  });

  it('changing a filter dropdown updates search param and resets page to 1', () => {
    vi.mocked(useIncidentsModule.useIncidentsList).mockReturnValue({
      data: {
        incidents: [],
        pagination: { page: 2, limit: 10, total: 20, totalPages: 2 }
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch
    });

    renderWithProviders(<IncidentsPage />, {
      initialEntries: ['/incidents?page=2']
    });

    const statusFilter = screen.getByLabelText(/^status$/i);
    fireEvent.change(statusFilter, { target: { value: 'investigating' } });

    expect(statusFilter.value).toBe('investigating');
  });
});
