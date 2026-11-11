import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { slosApi } from '../api/slosApi.js';

/**
 * Hook to retrieve an application's SLO data, current metrics, and status.
 * Handles 404 cleanly by returning null (unconfigured), preventing retry loops.
 */
export function useApplicationSlo(applicationId) {
  return useQuery({
    queryKey: ['slo', applicationId],
    queryFn: () => slosApi.getSlo(applicationId),
    enabled: Boolean(applicationId),
    retry: (failureCount, error) => {
      if (error?.statusCode === 404 || error?.response?.status === 404) {
        return false;
      }
      return failureCount < 2;
    },
    staleTime: 15000
  });
}

/**
 * Hook to retrieve a paginated, filterable list of SLOs across monitored applications.
 */
export function useSloList(params = {}) {
  return useQuery({
    queryKey: ['slos', params],
    queryFn: () => slosApi.listSlos(params),
    placeholderData: keepPreviousData,
    staleTime: 15000
  });
}

/**
 * Mutation hook to create an SLO for an application.
 */
export function useCreateSlo(applicationId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => slosApi.createSlo(applicationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slo', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['slos'] });
    }
  });
}

/**
 * Mutation hook to update an application's SLO configuration.
 */
export function useUpdateSlo(applicationId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => slosApi.updateSlo(applicationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slo', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['slos'] });
    }
  });
}

/**
 * Mutation hook to delete an application's SLO.
 */
export function useDeleteSlo(applicationId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => slosApi.deleteSlo(applicationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slo', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['slos'] });
    }
  });
}
