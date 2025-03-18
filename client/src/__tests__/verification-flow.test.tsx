import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
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
  http.post('/api/initiate-verification', () => {
    return HttpResponse.json({
      message: "Verification code sent",
      tempUserId: Date.now()
    });
  }),

  // Mock verify contact
  http.post('/api/verify-contact', () => {
    return HttpResponse.json({ message: "Verification successful" });
  }),

  // Mock registration
  http.post('/api/register', () => {
    return new HttpResponse(
      JSON.stringify({
        id: 1,
        username: 'testuser',
        isEmailVerified: true,
        isPhoneVerified: true,
        contactPreference: 'whatsapp'
      }),
      { status: 201 }
    );
  }),

  // Mock user endpoint
  http.get('/api/user', () => {
    return HttpResponse.json({
      id: 1,
      username: 'testuser',
      isEmailVerified: true,
      isPhoneVerified: true,
      contactPreference: 'whatsapp'
    });
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

    // Switch to registration form
    await userEvent.click(screen.getByRole('tab', { name: /register/i }));

    // Wait for form to be visible
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Fill registration form with WhatsApp preference
    await userEvent.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'testpass123');
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');

    // Select WhatsApp preference
    const select = screen.getByRole('combobox', { name: /preferred contact method/i });
    await userEvent.click(select);
    await userEvent.click(screen.getByRole('option', { name: /whatsapp/i }));

    await userEvent.type(screen.getByRole('textbox', { name: /phone number/i }), '+1234567890');

    // Submit form
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    // Complete email verification
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    // Complete WhatsApp verification
    await waitFor(() => {
      expect(screen.getByText(/verify your phone number/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    // Verify redirection to dashboard
    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/');
    });
  });

  it('should handle error states during verification', async () => {
    // Mock error response for verification
    server.use(
      http.post('/api/verify-contact', () => {
        return new HttpResponse(
          JSON.stringify({ message: "Verification failed" }),
          { status: 500 }
        );
      })
    );

    renderComponent();

    // Switch to registration form
    await userEvent.click(screen.getByRole('tab', { name: /register/i }));

    // Wait for form to be visible
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Fill registration form
    await userEvent.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'testpass123');
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');

    // Submit form
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    // Attempt verification
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    // Check for error message
    await waitFor(() => {
      expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
    });
  });

  it('should complete email verification successfully', async () => {
    renderComponent();

    // Switch to registration form
    await userEvent.click(screen.getByRole('tab', { name: /register/i }));

    // Wait for form to be visible
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Fill registration form
    await userEvent.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'testpass123');
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');

    // Submit form
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    // Complete verification
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    // Verify success
    await waitFor(() => {
      expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
    });
  });

  it('should handle WhatsApp verification after email verification', async () => {
    renderComponent();

    // Switch to registration form
    await userEvent.click(screen.getByRole('tab', { name: /register/i }));

    // Wait for form to be visible
    await waitFor(() => {
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    // Fill registration form with WhatsApp preference
    await userEvent.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'testpass123');
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');

    // Select WhatsApp preference
    const select = screen.getByRole('combobox', { name: /preferred contact method/i });
    await userEvent.click(select);
    await userEvent.click(screen.getByRole('option', { name: /whatsapp/i }));

    await userEvent.type(screen.getByRole('textbox', { name: /phone number/i }), '+1234567890');

    // Submit form
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    // Complete email verification
    await waitFor(() => {
      expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    // Verify WhatsApp verification appears
    await waitFor(() => {
      expect(screen.getByText(/verify your phone number/i)).toBeInTheDocument();
    });

    // Complete WhatsApp verification
    await userEvent.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    // Verify all dialogs are closed
    await waitFor(() => {
      expect(screen.queryByText(/verify your email/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/verify your phone number/i)).not.toBeInTheDocument();
    });
  });
});