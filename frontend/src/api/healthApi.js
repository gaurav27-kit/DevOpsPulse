import { axiosClient } from './axiosClient.js';

export const healthApi = {
  /**
   * Get application uptime summary and time-series for a given range.
   * @param {string} id Application ID
   * @param {'24h' | '7d' | '30d'} range Time window
   */
  getUptime: (id, range = '24h') => {
    return axiosClient.get(`/applications/${id}/uptime`, { params: { range } });
  },

  /**
   * List paginated health check records for an application.
   * @param {string} id Application ID
   * @param {object} params { page, limit, success, order, from, to }
   */
  getHealthChecks: (id, params = {}) => {
    return axiosClient.get(`/applications/${id}/health-checks`, { params });
  },

  /**
   * Trigger an immediate manual health check.
   * @param {string} id Application ID
   */
  runCheck: (id) => {
    return axiosClient.post(`/applications/${id}/check`);
  }
};
