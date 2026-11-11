import { axiosClient } from './axiosClient.js';

/**
 * REST API client methods for Service Level Objective (SLO) management.
 */
export const slosApi = {
  /**
   * Retrieve SLO configuration, current status, burn rates, and daily series for an application.
   * Returns null on 404 so unconfigured applications display the empty state cleanly without errors.
   */
  getSlo: async (applicationId) => {
    try {
      const response = await axiosClient.get(`/applications/${applicationId}/slo`);
      return response.data;
    } catch (err) {
      if (err.statusCode === 404 || err.response?.status === 404) {
        return null;
      }
      throw err;
    }
  },

  /**
   * Create an SLO for an application.
   * @param {string} applicationId
   * @param {{ name: string, targetPercent: number, windowDays: number }} data
   */
  createSlo: async (applicationId, data) => {
    const response = await axiosClient.post(`/applications/${applicationId}/slo`, data);
    return response.data;
  },

  /**
   * Update an existing SLO configuration.
   * @param {string} applicationId
   * @param {{ name?: string, targetPercent?: number, windowDays?: number }} data
   */
  updateSlo: async (applicationId, data) => {
    const response = await axiosClient.patch(`/applications/${applicationId}/slo`, data);
    return response.data;
  },

  /**
   * Delete an SLO configuration for an application.
   * @param {string} applicationId
   */
  deleteSlo: async (applicationId) => {
    const response = await axiosClient.delete(`/applications/${applicationId}/slo`);
    return response.data;
  },

  /**
   * List SLOs across applications with pagination, status filtering, and sorting.
   * @param {{ page?: number, limit?: number, status?: string, sortBy?: string, sortOrder?: string }} params
   */
  listSlos: async (params = {}) => {
    const response = await axiosClient.get('/slos', { params });
    return response.data;
  }
};
