import { axiosClient } from './axiosClient.js';

/**
 * REST API client methods for Maintenance Mode.
 */
export const maintenanceApi = {
  /**
   * Create a new maintenance window (immediate activation or future scheduled).
   */
  create: (applicationId, data) => {
    return axiosClient.post(`/applications/${applicationId}/maintenance`, data);
  },

  /**
   * Retrieve paginated maintenance history for an application.
   */
  list: (applicationId, params = {}) => {
    return axiosClient.get(`/applications/${applicationId}/maintenance`, { params });
  },

  /**
   * Retrieve the currently active maintenance window for an application (or null).
   */
  getActive: (applicationId) => {
    return axiosClient.get(`/applications/${applicationId}/maintenance/active`);
  },

  /**
   * End an active maintenance window or cancel a scheduled maintenance window.
   */
  end: (maintenanceId) => {
    return axiosClient.patch(`/maintenance/${maintenanceId}/end`);
  }
};

