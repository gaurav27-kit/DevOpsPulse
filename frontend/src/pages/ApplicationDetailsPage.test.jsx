import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { ApplicationDetailsPage } from './ApplicationDetailsPage.jsx';
import { renderWithProviders } from '../tests/helpers.jsx';
import { applicationsApi } from '../api/applicationsApi.js';
import { healthApi } from '../api/healthApi.js';
import { incidentsApi } from '../api/incidentsApi.js';
import { deploymentsApi } from '../api/deploymentsApi.js';
import { slosApi } from '../api/slosApi.js';

vi.mock('../api/applicationsApi.js', () => ({
  applicationsApi: {
    get: vi.fn(),
    remove: vi.fn()
  }
}));

vi.mock('../api/healthApi.js', () => ({
  healthApi: {
    getUptime: vi.fn(),
    getHealthChecks: vi.fn(),
    runCheck: vi.fn()
  }
}));

vi.mock('../api/incidentsApi.js', () => ({
  incidentsApi: {
    list: vi.fn()
  }
}));

vi.mock('../api/deploymentsApi.js', () => ({
  deploymentsApi: {
    list: vi.fn()
  }
}));

vi.mock('../api/slosApi.js', () => ({
  slosApi: {
    getSlo: vi.fn(),
    createSlo: vi.fn(),
    updateSlo: vi.fn(),
    deleteSlo: vi.fn()
  }
}));

describe('ApplicationDetailsPage SLO integration', () => {
  const fakeApp = {
    _id: 'app_123',
    name: 'Order Processing Service',
    url: 'https://orders.example.com/health',
    environment: 'production',
    status: 'up',
    checkIntervalSeconds: 60,
    timeoutMs: 5000,
    createdAt: new Date().toISOString()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    applicationsApi.get.mockResolvedValue({ data: { application: fakeApp } });
    healthApi.getUptime.mockResolvedValue({
      data: {
        summary: { totalChecks: 100, successfulChecks: 99, uptimePercent: 99.0 },
        series: []
      }
    });
    healthApi.getHealthChecks.mockResolvedValue({ data: { healthChecks: [], pagination: {} } });
    incidentsApi.list.mockResolvedValue({ data: { incidents: [] } });
    deploymentsApi.list.mockResolvedValue({ data: { deployments: [] } });
  });

  const renderComponent = () =>
    renderWithProviders(
      <Routes>
        <Route path="/applications/:id" element={<ApplicationDetailsPage />} />
      </Routes>,
      { initialEntries: ['/applications/app_123'] }
    );

  it('renders "No SLO configured" empty state with "Set an SLO" button when no SLO exists', async () => {
    slosApi.getSlo.mockResolvedValue(null);

    renderComponent();

    expect(await screen.findByText('Order Processing Service')).toBeInTheDocument();
    expect(screen.getByTestId('slo-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No SLO configured for this service')).toBeInTheDocument();
    expect(screen.getByTestId('set-slo-btn')).toBeInTheDocument();
  });

  it('clicking "Set an SLO" opens the modal dialog', async () => {
    const user = userEvent.setup();
    slosApi.getSlo.mockResolvedValue(null);

    renderComponent();

    const setBtn = await screen.findByTestId('set-slo-btn');
    await user.click(setBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Configure Service Level Objective')).toBeInTheDocument();
    expect(screen.getByTestId('slo-form')).toBeInTheDocument();
  });

  it('renders configured SLO state with status badge, gauge, burn rate, and actions', async () => {
    slosApi.getSlo.mockResolvedValue({
      slo: {
        name: 'Order Service Availability Target',
        targetPercent: 99.9,
        windowDays: 30
      },
      status: 'healthy',
      sli: 99.95,
      budgetConsumedPct: 50.0,
      budgetRemainingPct: 50.0,
      totals: { good: 9995, bad: 5, total: 10000 },
      partialWindow: false,
      burnRate1h: 0.8,
      burnRate6h: 0.9,
      fastBurn: false,
      slowBurn: false,
      series: [
        { day: '2026-11-01T00:00:00.000Z', total: 100, bad: 0, cumulativeBudgetConsumedPct: 10.0 }
      ]
    });

    renderComponent();

    expect(await screen.findByText('Order Service Availability Target')).toBeInTheDocument();
    expect(screen.getByText('99.9% target over 30 days rolling window')).toBeInTheDocument();
    expect(screen.getByTestId('slo-configured-state')).toBeInTheDocument();
    expect(screen.getByTestId('error-budget-gauge')).toBeInTheDocument();
    expect(screen.getByTestId('burn-rate-card')).toBeInTheDocument();
    expect(screen.getByTestId('edit-slo-btn')).toBeInTheDocument();
    expect(screen.getByTestId('delete-slo-btn')).toBeInTheDocument();
  });

  it('clicking "Delete SLO" opens the ConfirmDialog', async () => {
    const user = userEvent.setup();
    slosApi.getSlo.mockResolvedValue({
      slo: {
        name: 'Order Service Availability Target',
        targetPercent: 99.9,
        windowDays: 30
      },
      status: 'healthy',
      budgetConsumedPct: 10.0,
      budgetRemainingPct: 90.0
    });

    renderComponent();

    const deleteBtn = await screen.findByTestId('delete-slo-btn');
    await user.click(deleteBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete SLO?')).toBeInTheDocument();
  });
});
