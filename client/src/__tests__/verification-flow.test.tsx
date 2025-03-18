import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import AuthPage from '../pages/auth-page';

// Mock useLocation hook
vi.mock('wouter', () => ({
  useLocation: () => ['/auth', vi.fn()],
}));

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

describe('Auth Page', () => {
  it('renders register tab and form elements', async () => {
    // Render component
    renderWithProviders(<AuthPage />);

    // Find and click register tab
    const registerTab = screen.getByRole('tab', { name: /register/i });
    expect(registerTab).toBeInTheDocument();

    await userEvent.click(registerTab);

    // Check form elements
    expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
  });
});