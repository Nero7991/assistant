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
    server.use(
      http.post('/api/register', () => {
        return HttpResponse.json({
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          isEmailVerified: false,
          isPhoneVerified: false,
          contactPreference: 'whatsapp',
        }, { status: 201 });
      }),

      // Add initiate-verification handler
      http.post('/api/initiate-verification', () => {
        return HttpResponse.json({
          message: "Verification code sent",
          tempUserId: Date.now()
        });
      }),

      http.post('/api/verify-contact', () => {
        return HttpResponse.json({ message: 'Verification successful' });
      })
    );

    const user = userEvent.setup();
    const { container } = renderWithProviders(<AuthPage />);

    // Fill registration form
    await user.click(screen.getByRole('tab', { name: /register/i }));
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');

    // Select WhatsApp and fill phone number
    await user.click(screen.getByTestId('contact-preference-select'));
    await user.click(screen.getByTestId('whatsapp-option'));
    const phoneInput = await screen.findByTestId('phone-number-input');
    await user.type(phoneInput, '+1234567890');

    // Submit form and wait for email verification dialog
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Add debug output before dialog checks
    console.log('Document state before dialog:', prettyDOM(container));

    // Find and verify email dialog
    await waitFor(
      () => {
        const dialog = screen.queryByTestId('email-verification-dialog');
        if (!dialog) {
          console.log('Current DOM:', prettyDOM(container));
          throw new Error('Email verification dialog not found');
        }
        expect(dialog).toBeInTheDocument();
      },
      { timeout: 10000, interval: 1000 }
    );

    // Enter email verification code
    const emailCodeInput = screen.getByTestId('email-verification-code-input');
    await user.type(emailCodeInput, '123456');
    await user.click(screen.getByTestId('email-verify-button'));

    // Find and verify phone dialog
    await waitFor(
      () => {
        const dialog = screen.queryByTestId('phone-verification-dialog');
        if (!dialog) {
          console.log('Current DOM:', prettyDOM(container));
          throw new Error('Phone verification dialog not found');
        }
        expect(dialog).toBeInTheDocument();
      },
      { timeout: 10000, interval: 1000 }
    );

    // Enter phone verification code
    const phoneCodeInput = screen.getByTestId('phone-verification-code-input');
    await user.type(phoneCodeInput, '123456');
    await user.click(screen.getByTestId('phone-verify-button'));

    // Verify redirection
    await waitFor(
      () => {
        expect(mockSetLocation).toHaveBeenCalledWith('/');
      },
      { timeout: 10000 }
    );
  });

  it('handles verification errors', async () => {
    server.use(
      http.post('/api/verify-contact', () => {
        return HttpResponse.json(
          { message: "Invalid verification code" },
          { status: 400 }
        );
      }),

      // Add initiate-verification handler for error case
      http.post('/api/initiate-verification', () => {
        return HttpResponse.json({
          message: "Verification code sent",
          tempUserId: Date.now()
        });
      })
    );

    const user = userEvent.setup();
    const { container } = renderWithProviders(<AuthPage />);

    // Fill and submit registration form
    await user.click(screen.getByRole('tab', { name: /register/i }));
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Add debug output before dialog check
    console.log('Document state before error dialog:', prettyDOM(container));

    // Wait for verification dialog
    await waitFor(
      () => {
        const dialog = screen.queryByTestId('email-verification-dialog');
        if (!dialog) {
          console.log('Current DOM:', prettyDOM(container));
          throw new Error('Email verification dialog not found');
        }
        expect(dialog).toBeInTheDocument();
      },
      { timeout: 10000, interval: 1000 }
    );

    // Submit incorrect code and verify error message
    const codeInput = screen.getByTestId('email-verification-code-input');
    await user.type(codeInput, '000000');
    await user.click(screen.getByTestId('email-verify-button'));

    // Wait for error message
    await waitFor(
      () => {
        const errorMessage = screen.queryByText(/invalid verification code/i);
        if (!errorMessage) {
          console.log('Current DOM:', prettyDOM(container));
          throw new Error('Error message not found');
        }
        expect(errorMessage).toBeInTheDocument();
      },
      { timeout: 10000, interval: 1000 }
    );
  });
});