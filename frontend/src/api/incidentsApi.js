import { axiosClient } from './axiosClient.js';

export const incidentsApi = {
  /**
   * List incidents with filters, sorting, and pagination.
   * @param {object} params { page, limit, status, severity, applicationId, from, to, sortBy, order }
   */
  list: (params = {}) => {
    return axiosClient.get('/incidents', { params });
  },

  /**
   * Retrieve a single incident with its complete update timeline.
   * @param {string} id Incident ID
   */
  get: (id) => {
    return axiosClient.get(`/incidents/${id}`);
  },

  /**
   * Update the status of an incident.
   * @param {string} id Incident ID
   * @param {{ status: 'investigating' | 'resolved', note?: string }} data
   */
  changeStatus: (id, data) => {
    return axiosClient.patch(`/incidents/${id}/status`, data);
  },

  /**
   * Post a new manual note to an incident's timeline.
   * @param {string} id Incident ID
   * @param {{ message: string }} data
   */
  addUpdate: (id, data) => {
    return axiosClient.post(`/incidents/${id}/updates`, data);
  }
};
