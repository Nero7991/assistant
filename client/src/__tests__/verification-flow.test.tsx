import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import AuthPage from '../pages/auth-page';
import { AuthProvider } from '@/hooks/use-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Mock useLocation hook
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/auth', mockSetLocation],
}));

// Mock the API endpoints
const server = setupServer(
  // Mock initiate verification
  rest.post('/api/initiate-verification', (req, res, ctx) => {
    return res(
      ctx.json({
        message: "Verification code sent",
        tempUserId: Date.now()
      })
    );
  }),

  // Mock verify contact
  rest.post('/api/verify-contact', (req, res, ctx) => {
    return res(
      ctx.json({ message: "Verification successful" })
    );
  }),

  // Mock registration
  rest.post('/api/register', (req, res, ctx) => {
    return res(
      ctx.status(201),
      ctx.json({
        id: 1,
        username: 'testuser',
        isEmailVerified: true,
        isPhoneVerified: true,
        contactPreference: 'whatsapp'
      })
    );
  }),

  // Mock user endpoint
  rest.get('/api/user', (req, res, ctx) => {
    return res(
      ctx.json({
        id: 1,
        username: 'testuser',
        isEmailVerified: true,
        isPhoneVerified: true,
        contactPreference: 'whatsapp'
      })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  queryClient.clear();
  server.resetHandlers();
  mockSetLocation.mockClear();
});
afterAll(() => server.close());

describe('Verification Flow', () => {
  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthPage />
        </AuthProvider>
      </QueryClientProvider>
    );
  };

  it('should redirect to dashboard after successful registration and verification', async () => {
    renderComponent();

    // Fill registration form with WhatsApp preference
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'testpass123');
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');

    // Select WhatsApp preference
    const select = screen.getByLabelText(/preferred contact method/i);
    await userEvent.click(select);
    await userEvent.click(screen.getByText(/whatsapp/i));

    await userEvent.type(screen.getByLabelText(/phone number/i), '+1234567890');

    // Submit form
    await userEvent.click(screen.getByText(/create account/i));

    // Complete email verification
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByText(/verify/i));

    // Complete WhatsApp verification
    await waitFor(() => {
      expect(screen.getByText(/verify your phone number/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByText(/verify/i));

    // Verify redirection to dashboard
    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/');
    });
  });

  it('should handle error states during verification', async () => {
    // Mock error response for verification
    server.use(
      rest.post('/api/verify-contact', (req, res, ctx) => {
        return res(
          ctx.status(500),
          ctx.json({ message: "Verification failed" })
        );
      })
    );

    renderComponent();

    // Fill and submit form
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'testpass123');
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.click(screen.getByText(/create account/i));

    // Attempt verification
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByText(/verify/i));

    // Check for error message
    await waitFor(() => {
      expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
    });
  });

  it('should complete email verification successfully', async () => {
    renderComponent();

    // Fill registration form
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'testpass123');
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');

    // Submit form
    await userEvent.click(screen.getByText(/create account/i));

    // Verify email verification dialog appears
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });

    // Enter verification code
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByText(/verify/i));

    // Verify success
    await waitFor(() => {
      expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
    });
  });

  it('should handle WhatsApp verification after email verification', async () => {
    renderComponent();

    // Fill registration form with WhatsApp preference
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'testpass123');
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');

    // Select WhatsApp preference
    const select = screen.getByLabelText(/preferred contact method/i);
    await userEvent.click(select);
    await userEvent.click(screen.getByText(/whatsapp/i));

    await userEvent.type(screen.getByLabelText(/phone number/i), '+1234567890');

    // Submit form
    await userEvent.click(screen.getByText(/create account/i));

    // Complete email verification
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByText(/verify/i));

    // Verify WhatsApp verification appears
    await waitFor(() => {
      expect(screen.getByText(/verify your phone number/i)).toBeInTheDocument();
    });

    // Complete WhatsApp verification
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByText(/verify/i));

    // Verify all dialogs are closed
    await waitFor(() => {
      expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/verify your phone number/i)).not.toBeInTheDocument();
    });
  });
});