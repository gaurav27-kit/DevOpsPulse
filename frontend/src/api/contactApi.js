import { axiosClient } from './axiosClient.js';

export const contactApi = {
  /**
   * Submits a message through the public contact form.
   *
   * @param {object} data
   * @param {string} data.name
   * @param {string} data.email
   * @param {string} data.message
   * @param {string} [data.website]
   * @returns {Promise<object>}
   */
  submitMessage: async (data) => {
    const res = await axiosClient.post('/contact', data);
    return res.data;
  }
};

