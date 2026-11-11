import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlosPage } from './SlosPage.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import { slosApi } from '../api/slosApi.js';

vi.mock('../api/slosApi.js', () => ({
  slosApi: {
    listSlos: vi.fn(),
    getSlo: vi.fn(),
    createSlo: vi.fn(),
    updateSlo: vi.fn(),
    deleteSlo: vi.fn()
  }
}));

describe('SlosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    slosApi.listSlos.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<SlosPage />);
    expect(screen.getByTestId('slos-page')).toBeInTheDocument();
  });

  it('renders empty state when no SLOs exist', async () => {
    slosApi.listSlos.mockResolvedValueOnce({
      slos: [],
      pagination: { page: 1, totalPages: 1, total: 0 }
    });

    renderWithProviders(<SlosPage />);
    expect(await screen.findByTestId('slos-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No SLOs configured')).toBeInTheDocument();
  });

  it('renders table with SLO list items and status badges', async () => {
    const mockData = {
      slos: [
        {
          _id: 'slo_1',
          name: 'Payment Service Availability',
          targetPercent: 99.9,
          windowDays: 30,
          status: 'healthy',
          sli: 99.95,
          budgetConsumedPct: 50.0,
          burnRate1h: 0.5,
          burnRate6h: 0.6,
          applicationId: { _id: 'app_1', name: 'Payment API' }
        },
        {
          _id: 'slo_2',
          name: 'Auth Gateway Availability',
          targetPercent: 99.5,
          windowDays: 7,
          status: 'breached',
          sli: 98.2,
          budgetConsumedPct: 150.0,
          burnRate1h: 18.2,
          burnRate6h: 6.5,
          applicationId: { _id: 'app_2', name: 'Auth Gateway' }
        }
      ],
      pagination: { page: 1, totalPages: 1, total: 2 }
    };

    slosApi.listSlos.mockResolvedValue(mockData);

    renderWithProviders(<SlosPage />);

    const paymentElements = await screen.findAllByText('Payment API');
    expect(paymentElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Auth Gateway').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Healthy').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Breached').length).toBeGreaterThanOrEqual(1);
  });

  it('updates status filter and triggers refetch', async () => {
    const user = userEvent.setup();
    slosApi.listSlos.mockResolvedValue({
      slos: [],
      pagination: { page: 1, totalPages: 1, total: 0 }
    });

    renderWithProviders(<SlosPage />);

    const filterSelect = await screen.findByTestId('slo-status-filter');
    await user.selectOptions(filterSelect, 'healthy');

    await waitFor(() => {
      expect(slosApi.listSlos).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'healthy' })
      );
    });
  });

  it('renders error state when fetch fails and allows retry', async () => {
    const user = userEvent.setup();
    slosApi.listSlos.mockRejectedValueOnce(new Error('Network connectivity failure'));

    renderWithProviders(<SlosPage />);

    expect(await screen.findByText(/Failed to load Service Level Objectives/i)).toBeInTheDocument();
    expect(screen.getByText('Network connectivity failure')).toBeInTheDocument();

    slosApi.listSlos.mockResolvedValueOnce({
      slos: [],
      pagination: { page: 1, totalPages: 1, total: 0 }
    });

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    await user.click(retryBtn);

    expect(await screen.findByTestId('slos-empty-state')).toBeInTheDocument();
  });
});
