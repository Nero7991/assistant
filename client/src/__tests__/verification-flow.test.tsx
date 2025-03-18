import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from './test-utils';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import AuthPage from '../pages/auth-page';

// Mock useLocation hook
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/auth', mockSetLocation],
}));

// Mock API endpoints
const server = setupServer(
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

// Setup MSW
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  mockSetLocation.mockClear();
});

describe('Verification Flow', () => {
  it('should redirect to dashboard after successful registration and verification', async () => {
    render(<AuthPage />);
    const user = userEvent.setup();

    // Switch to registration form and wait for it to be visible
    const registerTab = await screen.findByRole('tab', { name: /register/i });
    await user.click(registerTab);

    // Wait for the registration tab content to be rendered
    const registerContent = await screen.findByTestId('register-tab-content');
    expect(registerContent).toBeInTheDocument();

    // Fill registration form with WhatsApp preference
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');

    // Select WhatsApp preference
    const select = screen.getByRole('combobox', { name: /preferred contact method/i });
    await user.click(select);
    await user.click(screen.getByRole('option', { name: /whatsapp/i }));

    await user.type(screen.getByRole('textbox', { name: /phone number/i }), '+1234567890');

    // Submit form
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Complete email verification
    const emailVerificationDialog = await screen.findByText(/verify your email/i);
    expect(emailVerificationDialog).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    // Complete WhatsApp verification
    const whatsappVerificationDialog = await screen.findByText(/verify your phone number/i);
    expect(whatsappVerificationDialog).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

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

    render(<AuthPage />);
    const user = userEvent.setup();

    // Switch to registration form
    const registerTab = await screen.findByRole('tab', { name: /register/i });
    await user.click(registerTab);

    // Wait for the registration tab content to be rendered
    const registerContent = await screen.findByTestId('register-tab-content');
    expect(registerContent).toBeInTheDocument();

    // Fill registration form
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');

    // Submit form
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Attempt verification
    const emailVerificationDialog = await screen.findByText(/verify your email/i);
    expect(emailVerificationDialog).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    // Check for error message
    const errorMessage = await screen.findByText(/verification failed/i);
    expect(errorMessage).toBeInTheDocument();
  });
});