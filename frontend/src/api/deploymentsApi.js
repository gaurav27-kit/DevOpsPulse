import { axiosClient } from './axiosClient.js';

export const deploymentsApi = {
  /**
   * List deployments with filters, sorting, and pagination.
   * @param {object} params { page, limit, applicationId, status, environment, branch, from, to, sortBy, order }
   */
  list: (params = {}) => {
    return axiosClient.get('/deployments', { params });
  },

  /**
   * Retrieve a single deployment by ID.
   * @param {string} id Deployment ID
   */
  get: (id) => {
    return axiosClient.get(`/deployments/${id}`);
  },

  /**
   * Create a new deployment record for an application.
   * @param {string} applicationId Application ID
   * @param {object} data Deployment attributes
   */
  create: (applicationId, data) => {
    return axiosClient.post(`/applications/${applicationId}/deployments`, data);
  }
};
