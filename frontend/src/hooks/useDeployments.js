import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { deploymentsApi } from '../api/deploymentsApi.js';

/**
 * Hook to retrieve a paginated and filtered list of deployments.
 */
export function useDeploymentsList(params = {}) {
  return useQuery({
    queryKey: ['deployments', params],
    queryFn: async () => {
      const response = await deploymentsApi.list(params);
      return response.data; // { deployments: [...], pagination: { ... } }
    },
    placeholderData: keepPreviousData,
    staleTime: 15000
  });
}

/**
 * Hook to retrieve a single deployment record.
 */
export function useDeployment(id) {
  return useQuery({
    queryKey: ['deployment', id],
    queryFn: async () => {
      const response = await deploymentsApi.get(id);
      return response.data?.deployment;
    },
    enabled: Boolean(id),
    staleTime: 30000
  });
}

/**
 * Mutation to record a new deployment for an application.
 */
export function useCreateDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ applicationId, data }) => deploymentsApi.create(applicationId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (variables?.applicationId) {
        queryClient.invalidateQueries({ queryKey: ['application', variables.applicationId] });
      }
    }
  });
}
