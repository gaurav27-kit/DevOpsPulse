import { axiosClient } from './axiosClient.js';

/**
 * REST API client methods for Application management.
 */
export const applicationsApi = {
  /**
   * List applications with filtering, sorting, and pagination.
   */
  list: (params = {}) => {
    return axiosClient.get('/applications', { params });
  },

  /**
   * Retrieve a single application by its ID.
   */
  get: (id) => {
    return axiosClient.get(`/applications/${id}`);
  },

  /**
   * Register a new application for monitoring.
   */
  create: (data) => {
    return axiosClient.post('/applications', data);
  },

  /**
   * Update an existing application's configuration.
   */
  update: (id, data) => {
    return axiosClient.patch(`/applications/${id}`, data);
  },

  /**
   * Delete an application and schedule cascade deletion.
   */
  remove: (id) => {
    return axiosClient.delete(`/applications/${id}`);
  }
};

