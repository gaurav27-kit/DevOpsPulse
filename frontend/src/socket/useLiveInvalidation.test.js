import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLiveInvalidation } from './useLiveInvalidation.js';
import * as SocketProviderModule from './SocketProvider.jsx';
import * as ReactQueryModule from '@tanstack/react-query';

vi.mock('./SocketProvider.jsx');
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQueryClient: vi.fn()
  };
});

describe('useLiveInvalidation hook', () => {
  let mockSocket;
  let mockQueryClient;
  let listeners;

  beforeEach(() => {
    listeners = {};
    mockSocket = {
      on: vi.fn((event, handler) => {
        listeners[event] = handler;
      }),
      off: vi.fn((event, handler) => {
        delete listeners[event];
      })
    };

    mockQueryClient = {
      invalidateQueries: vi.fn()
    };

    vi.mocked(SocketProviderModule.useSocket).mockReturnValue({
      socket: mockSocket,
      isConnected: true
    });

    vi.mocked(ReactQueryModule.useQueryClient).mockReturnValue(mockQueryClient);
  });

  it('subscribes to socket events on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useLiveInvalidation());

    expect(mockSocket.on).toHaveBeenCalledWith('application:status', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('healthcheck:completed', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('incident:created', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('incident:updated', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('deployment:recorded', expect.any(Function));

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('application:status', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('healthcheck:completed', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('incident:created', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('incident:updated', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('deployment:recorded', expect.any(Function));
  });

  it('invalidates dashboard and application queries on application:status event', () => {
    renderHook(() => useLiveInvalidation());

    listeners['application:status']({ applicationId: 'app1', status: 'up' });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['applications'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['application', 'app1'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['uptime', 'app1'] });
  });

  it('invalidates healthChecks, uptime, and SLO on healthcheck:completed event', () => {
    renderHook(() => useLiveInvalidation());

    listeners['healthcheck:completed']({ applicationId: 'app2', success: true });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['slos'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['healthChecks', 'app2'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['application', 'app2'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['uptime', 'app2'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['slo', 'app2'] });
  });

  it('invalidates incidents and dashboard on incident:created event', () => {
    renderHook(() => useLiveInvalidation());

    listeners['incident:created']({ incidentId: 'inc1', applicationId: 'app1' });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['incidents'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['incident', 'inc1'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });

  it('invalidates deployments and dashboard on deployment:recorded event', () => {
    renderHook(() => useLiveInvalidation());

    listeners['deployment:recorded']({ applicationId: 'app3', version: '2.0.0' });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['deployments'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['application', 'app3'] });
  });

  it('invalidates slos, deliveries, and slo query on slo:alert event', () => {
    renderHook(() => useLiveInvalidation());

    listeners['slo:alert']({
      sloId: 'slo123',
      applicationId: 'app123',
      type: 'slo_breached',
      severity: 'critical'
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['slos'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['notifications', 'deliveries'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['slo', 'app123'] });
  });
});

