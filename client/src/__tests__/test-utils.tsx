import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import { Router } from 'wouter';
import { vi } from 'vitest';
import { ReactElement } from 'react';

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
    logger: {
      log: console.log,
      warn: console.warn,
      error: () => {},
    },
  });
}

// Setup base URL for Wouter Router
const mockBaseUrl = '/';

function render(
  ui: ReactElement,
  { wrapper, ...renderOptions }: RenderOptions = {}
) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Router base={mockBaseUrl}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </Router>
    );
  }

  return rtlRender(ui, {
    wrapper: wrapper ?? Wrapper,
    ...renderOptions,
  });
}

// re-export everything
export * from '@testing-library/react';
export { render };