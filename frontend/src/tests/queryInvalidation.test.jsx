import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { applicationsApi } from '../api/applicationsApi.js';
import { incidentsApi } from '../api/incidentsApi.js';
import { useApplicationsList, useCreateApplication, useDeleteApplication } from '../hooks/useApplications.js';
import { useIncidentsList, useChangeIncidentStatus } from '../hooks/useIncidents.js';

vi.mock('../api/applicationsApi.js', () => ({
  applicationsApi: {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn()
  }
}));

vi.mock('../api/incidentsApi.js', () => ({
  incidentsApi: {
    list: vi.fn(),
    changeStatus: vi.fn()
  }
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 60 * 1000 // 60s cache: only explicit invalidation will refetch
      },
      mutations: {
        retry: false
      }
    }
  });

  function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { queryClient, Wrapper };
}

describe('TanStack Query v5 cache invalidation integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useCreateApplication invalidates [applications] and updates the list without reload', async () => {
    let mockApps = [
      { _id: 'app_1', name: 'Billing Service', url: 'https://billing.example.com', status: 'up' }
    ];

    applicationsApi.list.mockImplementation(async () => ({
      data: { applications: [...mockApps], pagination: { total: mockApps.length } }
    }));

    applicationsApi.create.mockImplementation(async (payload) => {
      const created = { _id: 'app_2', name: payload.name, url: payload.url, status: 'up' };
      mockApps.push(created);
      return { data: { application: created } };
    });

    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => ({
        list: useApplicationsList(),
        create: useCreateApplication()
      }),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result.current.list.data?.applications).toHaveLength(1);
    });
    expect(result.current.list.data?.applications[0].name).toBe('Billing Service');

    // Create a new application
    await act(async () => {
      await result.current.create.mutateAsync({
        name: 'Auth Service',
        url: 'https://auth.example.com'
      });
    });

    // Verify cache invalidation caused list to update to 2 applications
    await waitFor(() => {
      expect(result.current.list.data?.applications).toHaveLength(2);
    });
    expect(result.current.list.data?.applications[1].name).toBe('Auth Service');
  });

  it('useDeleteApplication invalidates [applications] and removes the item from the list without reload', async () => {
    let mockApps = [
      { _id: 'app_1', name: 'Billing Service', url: 'https://billing.example.com', status: 'up' },
      { _id: 'app_2', name: 'Auth Service', url: 'https://auth.example.com', status: 'up' }
    ];

    applicationsApi.list.mockImplementation(async () => ({
      data: { applications: [...mockApps], pagination: { total: mockApps.length } }
    }));

    applicationsApi.remove.mockImplementation(async (id) => {
      mockApps = mockApps.filter((a) => a._id !== id);
      return { data: { deleted: true } };
    });

    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => ({
        list: useApplicationsList(),
        remove: useDeleteApplication()
      }),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result.current.list.data?.applications).toHaveLength(2);
    });

    // Delete application
    await act(async () => {
      await result.current.remove.mutateAsync('app_2');
    });

    // Verify cache invalidation updated list to 1 application
    await waitFor(() => {
      expect(result.current.list.data?.applications).toHaveLength(1);
    });
    expect(result.current.list.data?.applications[0].name).toBe('Billing Service');
  });

  it('useChangeIncidentStatus invalidates [incidents] and reflects the new status without reload', async () => {
    let mockIncidents = [
      {
        _id: 'inc_1',
        title: 'High 500 error rate',
        status: 'open',
        severity: 'critical'
      }
    ];

    incidentsApi.list.mockImplementation(async () => ({
      data: { incidents: [...mockIncidents], pagination: { total: mockIncidents.length } }
    }));

    incidentsApi.changeStatus.mockImplementation(async (id, { status }) => {
      const inc = mockIncidents.find((i) => i._id === id);
      if (inc) inc.status = status;
      return { data: { incident: { ...inc } } };
    });

    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => ({
        list: useIncidentsList(),
        updateStatus: useChangeIncidentStatus('inc_1')
      }),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result.current.list.data?.incidents).toHaveLength(1);
    });
    expect(result.current.list.data?.incidents[0].status).toBe('open');

    // Transition status to investigating
    await act(async () => {
      await result.current.updateStatus.mutateAsync({ status: 'investigating' });
    });

    // Verify cache invalidation updated status in incidents list
    await waitFor(() => {
      expect(result.current.list.data?.incidents[0].status).toBe('investigating');
    });
  });
});
