import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import { vi } from 'vitest';
import { ReactElement } from 'react';

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

// Mock useLocation hook since we don't want actual navigation in tests
vi.mock('wouter', () => ({
  useLocation: () => ['/auth', vi.fn()],
}));

function render(
  ui: ReactElement,
  { wrapper, ...renderOptions }: RenderOptions = {}
) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </QueryClientProvider>
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
