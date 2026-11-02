import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboardApi.js';

/**
 * Hook to retrieve aggregated dashboard metrics for the chosen time range.
 *
 * NOTE: refetchInterval (30s) is a temporary polling stand-in for live updates.
 * Socket.IO real-time event streaming replaces this in Step 10.
 *
 * @param {'24h' | '7d' | '30d'} range Time window
 */
export function useDashboard(range = '24h') {
  return useQuery({
    queryKey: ['dashboard', range],
    queryFn: async () => {
      const response = await dashboardApi.getSummary(range);
      return response.data;
    },
    // Temporary 30s polling until Socket.IO is introduced in Step 10
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 15000
  });
}
