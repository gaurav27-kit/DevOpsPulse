import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders, createTestQueryClient } from '../tests/helpers.jsx';
import { NotificationsPage } from './NotificationsPage.jsx';
import { notificationsApi } from '../api/notificationsApi.js';

vi.mock('../api/notificationsApi.js', () => ({
  notificationsApi: {
    getChannels: vi.fn(),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    rotateSecret: vi.fn(),
    deleteChannel: vi.fn(),
    testChannel: vi.fn(),
    getDeliveries: vi.fn()
  }
}));

describe('NotificationsPage component', () => {
  const mockUser = {
    _id: 'user_1',
    name: 'SRE Lead',
    email: 'sre@example.com'
  };

  const sampleChannels = [
    {
      _id: 'chan_1',
      name: 'Primary Slack Channel',
      type: 'webhook',
      format: 'slack',
      url: 'https://webhook.example.com/services/***',
      enabled: true,
      minSeverity: 'high',
      events: ['incident_opened', 'incident_resolved']
    },
    {
      _id: 'chan_2',
      name: 'Owner Email Alerts',
      type: 'email',
      format: 'generic',
      enabled: false,
      minSeverity: 'low',
      events: ['incident_opened']
    }
  ];

  const sampleDeliveries = [
    {
      _id: 'deliv_1',
      event: 'incident_opened',
      channelId: { _id: 'chan_1', name: 'Primary Slack Channel' },
      status: 'sent',
      skipReason: null,
      errorType: null,
      attempts: 1,
      createdAt: new Date().toISOString()
    },
    {
      _id: 'deliv_2',
      event: 'incident_opened',
      channelId: { _id: 'chan_1', name: 'Primary Slack Channel' },
      status: 'skipped',
      skipReason: 'cooldown',
      errorType: null,
      attempts: 0,
      createdAt: new Date().toISOString()
    },
    {
      _id: 'deliv_3',
      event: 'incident_opened',
      channelId: { _id: 'chan_1', name: 'Primary Slack Channel' },
      status: 'failed',
      skipReason: null,
      errorType: 'timeout',
      attempts: 3,
      createdAt: new Date().toISOString()
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    notificationsApi.getChannels.mockResolvedValue({
      data: { channels: sampleChannels }
    });
    notificationsApi.getDeliveries.mockResolvedValue({
      data: { deliveries: sampleDeliveries }
    });
  });

  it('renders channels list, accessible toggle buttons, and delivery history table', async () => {
    renderWithProviders(<NotificationsPage />, { user: mockUser });

    // Wait for channels to load
    const slackChannelElements = await screen.findAllByText('Primary Slack Channel');
    expect(slackChannelElements.length).toBeGreaterThan(0);
    expect(screen.getByText('Owner Email Alerts')).toBeInTheDocument();

    // Verify enabled toggle accessible name
    const slackToggle = screen.getByRole('button', { name: 'Toggle enabled for Primary Slack Channel' });
    expect(slackToggle).toHaveTextContent('Enabled');

    const emailToggle = screen.getByRole('button', { name: 'Toggle enabled for Owner Email Alerts' });
    expect(emailToggle).toHaveTextContent('Disabled');

    // Verify delivery table reason texts
    expect(await screen.findByText('skip: cooldown')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();

    // Delivery statuses have visible text badges
    expect(screen.getByText('sent')).toBeInTheDocument();
    expect(screen.getByText('skipped')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('validates channel form and maps server field errors under inputs', async () => {
    notificationsApi.createChannel.mockRejectedValueOnce({
      statusCode: 400,
      message: 'Forbidden destination: private or local IP addresses are not permitted',
      fieldErrors: {
        url: 'Forbidden destination: private or local IP addresses are not permitted'
      }
    });

    renderWithProviders(<NotificationsPage />, { user: mockUser });

    // Open Add Channel modal
    fireEvent.click(await screen.findByRole('button', { name: /Add Channel/i }));
    expect(screen.getByRole('heading', { name: 'Create Notification Channel' })).toBeInTheDocument();

    // Fill form with invalid private IP
    fireEvent.change(screen.getByLabelText(/Channel Name/i), { target: { value: 'Local Webhook' } });
    fireEvent.change(screen.getByLabelText(/Webhook URL/i), { target: { value: 'http://127.0.0.1:8080/hook' } });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Create Channel' }));

    // Assert field error message appears under URL input
    const urlError = await screen.findByText(/private or local IP addresses are not permitted/i);
    expect(urlError).toBeInTheDocument();
    expect(urlError).toHaveAttribute('id', 'channel-url-error');
  });

  it('displays error banner when creating email channel on unconfigured SMTP (409)', async () => {
    notificationsApi.createChannel.mockRejectedValueOnce({
      statusCode: 409,
      message: 'Email is not configured on this server'
    });

    renderWithProviders(<NotificationsPage />, { user: mockUser });

    fireEvent.click(await screen.findByRole('button', { name: /Add Channel/i }));
    fireEvent.change(screen.getByLabelText(/Channel Name/i), { target: { value: 'Team Email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email' }));

    fireEvent.click(screen.getByRole('button', { name: 'Create Channel' }));

    expect(await screen.findByText('Email is not configured on this server')).toBeInTheDocument();
  });

  it('manages one-time signing secret dialog lifecycle and ensures storage absence', async () => {
    const syntheticSecret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    notificationsApi.createChannel.mockResolvedValueOnce({
      data: {
        channel: {
          _id: 'chan_new',
          name: 'Secure Webhook',
          type: 'webhook',
          url: 'https://api.example.com/hooks/***'
        },
        signingSecret: syntheticSecret
      }
    });

    const queryClient = createTestQueryClient();
    renderWithProviders(<NotificationsPage />, { user: mockUser, queryClient });

    fireEvent.click(await screen.findByRole('button', { name: /Add Channel/i }));
    fireEvent.change(screen.getByLabelText(/Channel Name/i), { target: { value: 'Secure Webhook' } });
    fireEvent.change(screen.getByLabelText(/Webhook URL/i), { target: { value: 'https://api.example.com/hooks/prod' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Channel' }));

    // Secret modal appears
    expect(await screen.findByRole('heading', { name: 'Webhook Signing Secret' })).toBeInTheDocument();
    expect(screen.getByDisplayValue(syntheticSecret)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'I have saved it' });
    expect(confirmBtn).toBeDisabled();

    // Check confirmation checkbox to enable button
    const confirmCheckbox = screen.getByLabelText(/I have saved this secret in a secure location/i);
    fireEvent.click(confirmCheckbox);
    expect(confirmBtn).toBeEnabled();

    // Dismiss modal
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Webhook Signing Secret' })).not.toBeInTheDocument();
    });

    // Verify secret is NOT in the document
    expect(document.body.textContent).not.toContain(syntheticSecret);

    // Verify secret is NOT in query cache
    const cachedData = JSON.stringify(queryClient.getQueryCache().getAll());
    expect(cachedData).not.toContain(syntheticSecret);

    // Verify secret is NOT in localStorage or sessionStorage
    expect(JSON.stringify(localStorage)).not.toContain(syntheticSecret);
    expect(JSON.stringify(sessionStorage)).not.toContain(syntheticSecret);
  });

  it('TanStack Query v5 cache invalidation updates channel list on create, toggle, and delete without reload', async () => {
    let currentChannels = [
      {
        _id: 'chan_1',
        name: 'Channel Alpha',
        type: 'email',
        format: 'generic',
        enabled: true,
        minSeverity: 'low',
        events: ['incident_opened']
      }
    ];

    notificationsApi.getChannels.mockImplementation(async () => ({
      data: { channels: [...currentChannels] }
    }));

    notificationsApi.createChannel.mockImplementation(async (payload) => {
      const created = {
        _id: 'chan_2',
        name: payload.name,
        type: payload.type,
        format: payload.format || 'generic',
        enabled: true,
        minSeverity: payload.minSeverity || 'low',
        events: payload.events || ['incident_opened']
      };
      currentChannels.push(created);
      return { data: { channel: created } };
    });

    notificationsApi.updateChannel.mockImplementation(async (id, data) => {
      const ch = currentChannels.find((c) => c._id === id);
      if (ch) Object.assign(ch, data);
      return { data: { channel: ch } };
    });

    notificationsApi.deleteChannel.mockImplementation(async (id) => {
      currentChannels = currentChannels.filter((c) => c._id !== id);
      return { data: { deleted: true } };
    });

    const queryClient = createTestQueryClient();
    renderWithProviders(<NotificationsPage />, { user: mockUser, queryClient });

    // Initial state: Channel Alpha is visible and Enabled
    expect(await screen.findByText('Channel Alpha')).toBeInTheDocument();
    const toggleBtn = screen.getByRole('button', { name: 'Toggle enabled for Channel Alpha' });
    expect(toggleBtn).toHaveTextContent('Enabled');

    // 1. Create Channel Beta
    fireEvent.click(screen.getByRole('button', { name: /Add Channel/i }));
    fireEvent.change(screen.getByLabelText(/Channel Name/i), { target: { value: 'Channel Beta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Channel' }));

    // Channel Beta appears dynamically in the DOM via TanStack Query invalidation
    expect(await screen.findByText('Channel Beta')).toBeInTheDocument();

    // 2. Toggle Channel Alpha to disabled
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Toggle enabled for Channel Alpha' })).toHaveTextContent('Disabled');
    });

    // 3. Delete Channel Beta
    const deleteBetaButton = screen.getByRole('button', { name: 'Delete Channel Beta' });
    fireEvent.click(deleteBetaButton);
    expect(await screen.findByRole('heading', { name: 'Delete Notification Channel' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete channel' }));

    // Channel Beta disappears dynamically from the DOM via TanStack Query invalidation
    await waitFor(() => {
      expect(screen.queryByText('Channel Beta')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Channel Alpha')).toBeInTheDocument();
  });
});

