
import axios from 'axios';

/**
 * Pre-configured Axios instance for DevOpsPulse API.
 * Uses withCredentials: true so that httpOnly session cookies are automatically included.
 */
export const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Response interceptor:
 * - Unwraps response.data on success
 * - Formats API errors into a simple, component-friendly { message, fieldErrors, statusCode } object
 */
axiosClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const errorData = error.response?.data;
    const message = errorData?.message || error.message || 'An unexpected error occurred';

    // Convert array of [{ field, message }] to convenient key-value map: { [field]: message }
    const fieldErrors = {};
    if (Array.isArray(errorData?.errors)) {
      errorData.errors.forEach((err) => {
        if (err.field) {
          fieldErrors[err.field] = err.message;
        }
      });
    }

    return Promise.reject({
      message,
      fieldErrors,
      statusCode: error.response?.status
    });
  }
);

