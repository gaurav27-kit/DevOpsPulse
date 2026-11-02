import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { applicationsApi } from '../api/applicationsApi.js';

/**
 * Hook to retrieve a paginated and filtered list of applications.
 * Uses keepPreviousData so the UI does not flicker or unmount during page/filter transitions.
 */
export function useApplicationsList(params = {}) {
  return useQuery({
    queryKey: ['applications', params],
    queryFn: async () => {
      const response = await applicationsApi.list(params);
      return response.data; // { applications: [...], pagination: { ... } }
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000 // 30 seconds
  });
}

/**
 * Hook to retrieve details for a specific application.
 */
export function useApplication(id) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: async () => {
      const response = await applicationsApi.get(id);
      return response.data?.application;
    },
    enabled: Boolean(id),
    staleTime: 30 * 1000
  });
}

/**
 * Mutation to register a new application.
 * Invalidates the applications list cache upon success.
 */
export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => applicationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    }
  });
}

/**
 * Mutation to update an existing application.
 * Invalidates both the list cache and the specific application's cache.
 */
export function useUpdateApplication(id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => applicationsApi.update(id, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['application', id] });
    }
  });
}

/**
 * Mutation to delete an application.
 * Invalidates the applications list cache upon success.
 */
export function useDeleteApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => applicationsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    }
  });
}
