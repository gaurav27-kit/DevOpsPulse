import { useQuery } from '@tanstack/react-query';
import { applicationsApi } from '../api/applicationsApi.js';

/**
 * Hook to load applications for select dropdowns across the app.
 * Fetches up to 50 applications sorted by name, cached for 60 seconds.
 */
export function useApplicationOptions() {
  return useQuery({
    queryKey: ['applications', 'options'],
    queryFn: async () => {
      const response = await applicationsApi.list({
        limit: 50,
        sortBy: 'name',
        order: 'asc'
      });
      return response.data?.applications || [];
    },
    staleTime: 60 * 1000
  });
}
