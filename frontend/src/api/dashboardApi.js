import { axiosClient } from './axiosClient.js';

export const dashboardApi = {
  /**
   * Fetch aggregated dashboard summary statistics and recent events.
   * @param {'24h' | '7d' | '30d'} range
   */
  getSummary: (range = '24h') => {
    return axiosClient.get('/dashboard/summary', { params: { range } });
  }
};

