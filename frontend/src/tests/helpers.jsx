import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AUTH_QUERY_KEY } from '../hooks/useAuth.js';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0
      },
      mutations: {
        retry: false
      }
    }
  });
}

/**
 * Custom render helper that wraps the component under test with:
 * - QueryClientProvider
 * - MemoryRouter (configured with initialEntries)
 * - Optional pre-seeded authenticated user in cache
 */
export function renderWithProviders(
  ui,
  {
    initialEntries = ['/'],
    user = null,
    queryClient = createTestQueryClient(),
    ...renderOptions
  } = {}
) {
  if (user !== undefined) {
    queryClient.setQueryData(AUTH_QUERY_KEY, user);
  }

  function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...renderOptions })
  };
}

