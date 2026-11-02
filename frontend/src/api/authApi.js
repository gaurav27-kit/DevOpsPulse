import { axiosClient } from './axiosClient.js';

/**
 * Authentication API methods communicating with /api/v1/auth endpoints.
 */
export const authApi = {
  /**
   * Register new user account.
   */
  register: (userData) => {
    return axiosClient.post('/auth/register', userData);
  },

  /**
   * Log in with existing credentials.
   */
  login: (credentials) => {
    return axiosClient.post('/auth/login', credentials);
  },

  /**
   * Invalidate session and clear auth cookie.
   */
  logout: () => {
    return axiosClient.post('/auth/logout');
  },

  /**
   * Fetch currently authenticated user session.
   */
  getMe: () => {
    return axiosClient.get('/auth/me');
  }
};

