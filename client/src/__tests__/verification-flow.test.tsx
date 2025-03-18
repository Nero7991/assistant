import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, prettyDOM } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/use-auth';
import AuthPage from '../pages/auth-page';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';

// Mock useLocation hook
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/auth', mockSetLocation],
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
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

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('Auth Page', () => {
  it('completes the registration and verification flow', async () => {
    // Mock API responses
    server.use(
      http.post('/api/initiate-verification', () => {
        return HttpResponse.json({
          message: "Verification code sent",
          tempUserId: Date.now()
        });
      }),
      http.post('/api/verify-contact', () => {
        return HttpResponse.json({ message: "Verification successful" });
      }),
      http.post('/api/register', () => {
        return HttpResponse.json({
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          isEmailVerified: true,
          isPhoneVerified: true,
          contactPreference: 'whatsapp'
        });
      })
    );

    // Setup user events and render
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AuthPage />);

    // Navigate to registration and fill form
    await user.click(screen.getByRole('tab', { name: /register/i }));
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');

    // Select contact preference
    const selectTrigger = screen.getByTestId('contact-preference-select');
    await user.click(selectTrigger);
    await user.click(screen.getByTestId('whatsapp-option'));

    // Wait for and fill phone number
    await waitFor(() => {
      expect(screen.getByTestId('phone-number-input')).toBeInTheDocument();
    });
    await user.type(screen.getByTestId('phone-number-input'), '+1234567890');

    // Submit form
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Debug dialog rendering
    await waitFor(() => {
      const dialogContent = document.querySelector('[role="dialog"]');
      if (!dialogContent) {
        console.log('Dialog not found in DOM:', prettyDOM(container));
      } else {
        console.log('Dialog found:', prettyDOM(dialogContent));
      }
    });

    // Handle email verification dialog
    const emailDialog = await screen.findByRole('dialog', {
      name: 'Verify Your Email',
      timeout: 5000
    });
    expect(emailDialog).toBeInTheDocument();

    const emailCodeInput = await screen.findByLabelText(/email verification code/i);
    await user.type(emailCodeInput, '123456');
    await user.click(screen.getByTestId('email-verify-button'));

    // Handle phone verification dialog
    const phoneDialog = await screen.findByRole('dialog', {
      name: 'Verify Your Phone Number',
      timeout: 5000
    });
    expect(phoneDialog).toBeInTheDocument();

    const phoneCodeInput = await screen.findByLabelText(/phone verification code/i);
    await user.type(phoneCodeInput, '123456');
    await user.click(screen.getByTestId('phone-verify-button'));

    // Verify redirection
    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/');
    });
  });

  it('handles verification errors', async () => {
    // Mock error response
    server.use(
      http.post('/api/verify-contact', () => {
        return HttpResponse.json(
          { message: "Invalid verification code" },
          { status: 400 }
        );
      })
    );

    const user = userEvent.setup();
    const { container } = renderWithProviders(<AuthPage />);

    // Navigate to registration and fill form
    await user.click(screen.getByRole('tab', { name: /register/i }));
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Debug dialog rendering
    await waitFor(() => {
      const dialogContent = document.querySelector('[role="dialog"]');
      if (!dialogContent) {
        console.log('Dialog not found in DOM:', prettyDOM(container));
      } else {
        console.log('Dialog found:', prettyDOM(dialogContent));
      }
    });

    // Wait for verification dialog
    const emailDialog = await screen.findByRole('dialog', {
      name: 'Verify Your Email',
      timeout: 5000
    });
    expect(emailDialog).toBeInTheDocument();

    // Submit incorrect code
    const codeInput = await screen.findByLabelText(/email verification code/i);
    await user.type(codeInput, '000000');
    await user.click(screen.getByTestId('email-verify-button'));

    // Check for error message
    const errorMessage = await screen.findByText(/invalid verification code/i);
    expect(errorMessage).toBeInTheDocument();
  });
});