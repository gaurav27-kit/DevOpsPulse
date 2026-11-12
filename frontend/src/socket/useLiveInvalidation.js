import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from './SocketProvider.jsx';

/**
 * useLiveInvalidation subscribes to Socket.IO events and triggers targeted React Query
 * cache invalidations. Invalidation is the primary mechanism for real-time reactivity
 * (PRD FR-08), preserving the REST API as the authoritative single source of truth.
 */
export function useLiveInvalidation() {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handleApplicationStatus = (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      if (data?.applicationId) {
        queryClient.invalidateQueries({ queryKey: ['application', data.applicationId] });
        queryClient.invalidateQueries({ queryKey: ['uptime', data.applicationId] });
      }
    };

    const handleHealthCheckCompleted = (data) => {
      queryClient.invalidateQueries({ queryKey: ['slos'] });
      if (data?.applicationId) {
        queryClient.invalidateQueries({ queryKey: ['healthChecks', data.applicationId] });
        queryClient.invalidateQueries({ queryKey: ['application', data.applicationId] });
        queryClient.invalidateQueries({ queryKey: ['uptime', data.applicationId] });
        queryClient.invalidateQueries({ queryKey: ['slo', data.applicationId] });
      }
    };

    const handleIncidentChanged = (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      if (data?.incidentId) {
        queryClient.invalidateQueries({ queryKey: ['incident', data.incidentId] });
      }
      if (data?.applicationId) {
        queryClient.invalidateQueries({ queryKey: ['application', data.applicationId] });
      }
    };

    const handleDeploymentRecorded = (data) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      if (data?.applicationId) {
        queryClient.invalidateQueries({ queryKey: ['application', data.applicationId] });
      }
    };

    const handleSloAlert = (data) => {
      queryClient.invalidateQueries({ queryKey: ['slos'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'deliveries'] });
      if (data?.applicationId) {
        queryClient.invalidateQueries({ queryKey: ['slo', data.applicationId] });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('devopspulse:slo-alert', { detail: data }));
      }
    };

    socket.on('application:status', handleApplicationStatus);
    socket.on('healthcheck:completed', handleHealthCheckCompleted);
    socket.on('incident:created', handleIncidentChanged);
    socket.on('incident:updated', handleIncidentChanged);
    socket.on('deployment:recorded', handleDeploymentRecorded);
    socket.on('slo:alert', handleSloAlert);

    return () => {
      socket.off('application:status', handleApplicationStatus);
      socket.off('healthcheck:completed', handleHealthCheckCompleted);
      socket.off('incident:created', handleIncidentChanged);
      socket.off('incident:updated', handleIncidentChanged);
      socket.off('deployment:recorded', handleDeploymentRecorded);
      socket.off('slo:alert', handleSloAlert);
    };
  }, [socket, queryClient]);
}
