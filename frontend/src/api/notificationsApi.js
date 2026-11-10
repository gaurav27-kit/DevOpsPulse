import { axiosClient } from './axiosClient.js';

export const notificationsApi = {
  getChannels: () => axiosClient.get('/notifications/channels'),
  createChannel: (data) => axiosClient.post('/notifications/channels', data),
  updateChannel: (id, data) => axiosClient.patch(`/notifications/channels/${id}`, data),
  rotateSecret: (id) => axiosClient.post(`/notifications/channels/${id}/rotate-secret`),
  deleteChannel: (id) => axiosClient.delete(`/notifications/channels/${id}`),
  testChannel: (id) => axiosClient.post(`/notifications/channels/${id}/test`),
  getDeliveries: (params) => axiosClient.get('/notifications/deliveries', { params })
};

