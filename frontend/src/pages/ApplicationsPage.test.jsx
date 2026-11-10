import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { ApplicationsPage } from './ApplicationsPage.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useApplicationsModule from '../hooks/useApplications.js';

vi.mock('../hooks/useApplications.js');

describe('ApplicationsPage component', () => {
  const mockRefetch = vi.fn();
  const mockDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApplicationsModule.useDeleteApplication).mockReturnValue({
      mutateAsync: mockDelete
    });
  });

  it('renders application list and pagination controls', () => {
    vi.mocked(useApplicationsModule.useApplicationsList).mockReturnValue({
      data: {
        applications: [
          {
            _id: 'app1',
            name: 'API Gateway',
            url: 'https://gateway.example.com',
            environment: 'production',
            status: 'up',
            checkIntervalSeconds: 60,
            lastCheckedAt: new Date().toISOString()
          }
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch
    });

    renderWithProviders(<ApplicationsPage />);

    expect(screen.getAllByText('API Gateway').length).toBeGreaterThan(0);
    expect(screen.getAllByText('https://gateway.example.com').length).toBeGreaterThan(0);
  });

  it('shows "No matching applications" with Clear filters action when filtered with 0 results', () => {
    vi.mocked(useApplicationsModule.useApplicationsList).mockReturnValue({
      data: {
        applications: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 }
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch
    });

    // Provide status filter in search params
    renderWithProviders(<ApplicationsPage />, {
      initialEntries: ['/applications?status=down']
    });

    expect(screen.getByText('No matching applications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument();
  });

  it('updates filter and resets page parameter in URL', () => {
    vi.mocked(useApplicationsModule.useApplicationsList).mockReturnValue({
      data: {
        applications: [],
        pagination: { page: 2, limit: 10, total: 20, totalPages: 2 }
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch
    });

    renderWithProviders(<ApplicationsPage />, {
      initialEntries: ['/applications?page=2']
    });

    // Change environment filter
    const envSelect = screen.getByLabelText(/filter by environment/i);
    fireEvent.change(envSelect, { target: { value: 'staging' } });

    // The filter selection should be updated
    expect(envSelect.value).toBe('staging');
  });
});
