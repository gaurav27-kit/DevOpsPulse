import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/authApi.js';

export const AUTH_QUERY_KEY = ['me'];

/**
 * Custom hook managing authentication lifecycle and session cache using TanStack Query.
 */
export function useAuth() {
  const queryClient = useQueryClient();

  // Query current user session
  const { data: user = null, isPending: isLoading } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await authApi.getMe();
        return res.data?.user || null;
      } catch (err) {
        // A 401 means not authenticated; return null user rather than throwing an unhandled UI error
        if (err.statusCode === 401) {
          return null;
        }
        throw err;
      }
    },
    // Do not retry when receiving 401 Unauthorized
    retry: (failureCount, error) => {
      if (error?.statusCode === 401) return false;
      return failureCount < 1;
    },
    staleTime: 5 * 60 * 1000
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: (credentials) => authApi.login(credentials),
    onSuccess: (response) => {
      // Update session in cache immediately
      queryClient.setQueryData(AUTH_QUERY_KEY, response.data?.user || null);
    }
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: (userData) => authApi.register(userData),
    onSuccess: (response) => {
      // Update session in cache immediately
      queryClient.setQueryData(AUTH_QUERY_KEY, response.data?.user || null);
    }
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      // Clear entire TanStack Query cache and reset session
      queryClient.clear();
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
    }
  });

  return {
    user,
    isLoading,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending
  };
}

