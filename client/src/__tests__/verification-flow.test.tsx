import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import AuthPage from '../pages/auth-page';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import { prettyDOM } from '@testing-library/dom';

// Mock useLocation hook
const mockSetLocation = vi.fn();
vi.mock('wouter', async () => {
  const actual = await vi.importActual('wouter');
  return {
    ...actual,
    useLocation: () => ['/auth', mockSetLocation],
  };
});

// Setup MSW server
const server = setupServer(
  http.get('/api/user', () => {
    return HttpResponse.json(null, { status: 401 });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  mockSetLocation.mockClear();
});

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('Verification Flow', () => {
  it('should display registration form when register tab is selected', async () => {
    // Render component
    const { container } = renderWithProviders(<AuthPage />);
    console.log('Initial DOM:', prettyDOM(container));

    // Get tabs
    const registerTab = await screen.findByRole('tab', { name: /register/i });
    const tabsList = container.querySelector('[role="tablist"]');
    console.log('Tabs found:', prettyDOM(tabsList));

    // Click register tab
    await userEvent.click(registerTab);

    // Wait for tab to be active
    await waitFor(() => {
      const activeTab = container.querySelector('[role="tab"][data-state="active"]');
      console.log('Active tab:', prettyDOM(activeTab));
      expect(activeTab).toHaveTextContent(/register/i);
    });

    // Wait for registration content
    await waitFor(() => {
      const tabPanel = container.querySelector('[role="tabpanel"][data-state="active"]');
      console.log('Active tab panel:', prettyDOM(tabPanel));
      const content = screen.getByTestId('register-tab-content');
      expect(content).toBeInTheDocument();
    });

    // Verify form elements
    const form = screen.getByRole('form');
    expect(form).toBeInTheDocument();

    // Verify form inputs
    const usernameInput = screen.getByRole('textbox', { name: /username/i });
    const passwordInput = screen.getByLabelText(/password/i);
    const emailInput = screen.getByRole('textbox', { name: /email/i });

    expect(usernameInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();
  });
});