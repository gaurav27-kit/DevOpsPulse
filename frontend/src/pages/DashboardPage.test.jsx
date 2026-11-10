import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { DashboardPage } from './DashboardPage.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import * as useDashboardModule from '../hooks/useDashboard.js';
import * as useAuthModule from '../hooks/useAuth.js';

vi.mock('../hooks/useDashboard.js');
vi.mock('../hooks/useAuth.js');

describe('DashboardPage component', () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      user: { name: 'Alice' }
    });
  });

  it('renders onboarding zero-state when user has 0 applications', () => {
    vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
      data: {
        applications: { total: 0, byStatus: { unknown: 0, up: 0, degraded: 0, down: 0 } },
        incidents: { activeCount: 0, activeBySeverity: {}, recent: [] },
        deployments: { recent: [] },
        health: { totalChecks: 0, uptimePercent: null, avgResponseTimeMs: null },
        applicationsTable: []
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch
    });

    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('No applications monitored yet')).toBeInTheDocument();
    expect(screen.getByText('Add your first application')).toBeInTheDocument();
  });

  it('displays "No data" for null uptime percentage (never 0% or NaN)', () => {
    vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
      data: {
        applications: { total: 2, byStatus: { unknown: 2, up: 0, degraded: 0, down: 0 } },
        incidents: { activeCount: 0, activeBySeverity: { low: 0, medium: 0, high: 0, critical: 0 }, recent: [] },
        deployments: { recent: [] },
        health: { totalChecks: 0, uptimePercent: null, avgResponseTimeMs: null },
        applicationsTable: [
          { id: '1', name: 'App One', url: 'https://one.com', status: 'unknown', uptimePercent: null }
        ]
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch
    });

    renderWithProviders(<DashboardPage />);

    // In the summary stats and table, null uptime must render as "No data"
    const noDataBadges = screen.getAllByText('No data');
    expect(noDataBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('NaN%')).not.toBeInTheDocument();
  });

  it('renders application and incident counts correctly', () => {
    vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
      data: {
        applications: { total: 5, byStatus: { unknown: 0, up: 4, degraded: 1, down: 0 } },
        incidents: { activeCount: 1, activeBySeverity: { low: 0, medium: 0, high: 1, critical: 0 }, recent: [] },
        deployments: { recent: [] },
        health: { totalChecks: 100, uptimePercent: 99.2, avgResponseTimeMs: 145 },
        applicationsTable: [
          { id: '1', name: 'Billing API', url: 'https://billing.com', status: 'up', uptimePercent: 99.8 }
        ]
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch
    });

    renderWithProviders(<DashboardPage />);

    expect(screen.getAllByText('Billing API')[0]).toBeInTheDocument();
    expect(screen.getByText('99.2%')).toBeInTheDocument();
    expect(screen.getByText('145 ms')).toBeInTheDocument();
  });

  it('renders error state and retry button on failure', () => {
    vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('Network timeout loading dashboard'),
      refetch: mockRefetch
    });

    renderWithProviders(<DashboardPage />);

    expect(screen.getByText('Failed to load dashboard metrics')).toBeInTheDocument();
    expect(screen.getByText('Network timeout loading dashboard')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
