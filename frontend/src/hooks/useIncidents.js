import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { incidentsApi } from '../api/incidentsApi.js';

/**
 * Hook to retrieve a paginated and filtered list of incidents.
 */
export function useIncidentsList(params = {}) {
  return useQuery({
    queryKey: ['incidents', params],
    queryFn: async () => {
      const response = await incidentsApi.list(params);
      return response.data; // { incidents: [...], pagination: { ... } }
    },
    placeholderData: keepPreviousData,
    staleTime: 15000
  });
}

/**
 * Hook to retrieve full incident details and its timeline.
 */
export function useIncident(id) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      const response = await incidentsApi.get(id);
      return response.data?.incident;
    },
    enabled: Boolean(id),
    staleTime: 10000
  });
}

/**
 * Mutation to transition incident status (investigating, resolved).
 * Invalidates incident, incident list, dashboard, and application queries.
 */
export function useChangeIncidentStatus(id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => incidentsApi.changeStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application'] });
    }
  });
}

/**
 * Mutation to post a new note to the incident timeline.
 */
export function useAddIncidentUpdate(id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => incidentsApi.addUpdate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    }
  });
}
