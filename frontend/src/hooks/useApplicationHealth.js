import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { healthApi } from '../api/healthApi.js';

/**
 * Hook to retrieve application uptime summary and time-series for a given range.
 */
export function useApplicationUptime(id, range = '24h') {
  return useQuery({
    queryKey: ['uptime', id, range],
    queryFn: async () => {
      const response = await healthApi.getUptime(id, range);
      return response.data;
    },
    enabled: Boolean(id),
    staleTime: 15000
  });
}

/**
 * Hook to retrieve paginated health checks for an application.
 */
export function useApplicationHealthChecks(id, params = {}) {
  return useQuery({
    queryKey: ['healthChecks', id, params],
    queryFn: async () => {
      const response = await healthApi.getHealthChecks(id, params);
      return response.data; // { healthChecks: [...], pagination: { ... } }
    },
    placeholderData: keepPreviousData,
    enabled: Boolean(id),
    staleTime: 10000
  });
}

/**
 * Mutation to trigger an immediate manual health check for an application.
 * Invalidates related query caches upon completion.
 */
export function useRunCheck(id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => healthApi.runCheck(id),
    onSuccess: () => {
      // Refresh the application, its uptime metrics, its check history,
      // as well as global dashboard and application lists.
      queryClient.invalidateQueries({ queryKey: ['application', id] });
      queryClient.invalidateQueries({ queryKey: ['uptime', id] });
      queryClient.invalidateQueries({ queryKey: ['healthChecks', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    }
  });
}
