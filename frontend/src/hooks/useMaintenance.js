import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { maintenanceApi } from '../api/maintenanceApi.js';

/**
 * Hook to retrieve the active maintenance window for an application.
 */
export function useActiveMaintenance(applicationId) {
  return useQuery({
    queryKey: ['maintenance', 'active', applicationId],
    queryFn: async () => {
      const response = await maintenanceApi.getActive(applicationId);
      return response.data?.data?.activeWindow ?? response.data?.activeWindow ?? null;
    },
    enabled: Boolean(applicationId),
    refetchInterval: 30000 // Poll every 30s as safety fallback alongside WebSockets
  });
}

/**
 * Hook to retrieve paginated maintenance history for an application.
 */
export function useMaintenanceHistory(applicationId, params = {}) {
  return useQuery({
    queryKey: ['maintenance', 'history', applicationId, params],
    queryFn: async () => {
      const response = await maintenanceApi.list(applicationId, params);
      const data = response.data?.data ?? response.data;
      return {
        windows: data?.windows ?? [],
        pagination: data?.pagination ?? { page: 1, limit: 10, total: 0, totalPages: 1 }
      };
    },
    placeholderData: keepPreviousData,
    enabled: Boolean(applicationId)
  });
}

/**
 * Mutation to create/schedule a maintenance window.
 */
export function useCreateMaintenance(applicationId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => maintenanceApi.create(applicationId, data),
    onSuccess: () => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['maintenance', 'active', applicationId] }),
        queryClient.invalidateQueries({ queryKey: ['maintenance', 'history', applicationId] }),
        queryClient.invalidateQueries({ queryKey: ['application', applicationId] }),
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      ]);
    }
  });
}

/**
 * Mutation to end or cancel a maintenance window.
 */
export function useEndMaintenance(applicationId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (maintenanceId) => maintenanceApi.end(maintenanceId),
    onSuccess: () => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['maintenance', 'active', applicationId] }),
        queryClient.invalidateQueries({ queryKey: ['maintenance', 'history', applicationId] }),
        queryClient.invalidateQueries({ queryKey: ['application', applicationId] }),
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      ]);
    }
  });
}
