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

  console.log('Setting up test render with providers...');

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </QueryClientProvider>
  );

  // Log initial render state
  console.log('Initial render complete. DOM state:', prettyDOM(document.body));

  return result;
}

describe('Verification Flow', () => {
  it('should redirect to dashboard after successful registration and verification', async () => {
    console.log('\n=== Starting Registration Flow Test ===\n');
    console.time('test-duration');

    console.log('Rendering AuthPage...');
    renderWithProviders(<AuthPage />);
    const user = userEvent.setup();

    console.log('\nWaiting for register tab...');
    const registerTab = await screen.findByRole('tab', { name: /register/i });
    console.log('Found register tab:', prettyDOM(registerTab));

    console.log('\nClicking register tab...');
    await user.click(registerTab);
    console.log('DOM after tab click:', prettyDOM(document.body));

    console.log('\nWaiting for register content...');
    await waitFor(() => {
      const content = screen.queryByTestId('register-tab-content');
      if (content) {
        console.log('Found register content:', prettyDOM(content));
      } else {
        console.log('Register content not found. Current DOM:', prettyDOM(document.body));
        throw new Error('Register content not found');
      }
    }, { timeout: 5000 });

    // Log visible roles and test IDs
    const roles = screen.queryAllByRole('*').map(el => ({
      role: el.getAttribute('role'),
      testId: el.getAttribute('data-testid')
    }));
    console.log('\nVisible elements:', roles);

    console.log('\nAttempting to fill registration form...');
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');

    console.log('\nSelecting WhatsApp preference...');
    const select = screen.getByRole('combobox', { name: /preferred contact method/i });
    await user.click(select);
    await user.click(screen.getByRole('option', { name: /whatsapp/i }));
    await user.type(screen.getByRole('textbox', { name: /phone number/i }), '+1234567890');

    console.log('\nSubmitting form...');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    console.log('\nWaiting for email verification dialog...');
    const emailVerificationDialog = await screen.findByText(/verify your email/i);
    console.log('Email verification dialog:', prettyDOM(emailVerificationDialog));

    console.log('\nCompleting email verification...');
    await user.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    console.log('\nWaiting for WhatsApp verification dialog...');
    const whatsappVerificationDialog = await screen.findByText(/verify your phone number/i);
    console.log('WhatsApp verification dialog:', prettyDOM(whatsappVerificationDialog));

    console.log('\nCompleting WhatsApp verification...');
    await user.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    console.log('\nChecking for redirection...');
    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/');
    });

    console.timeEnd('test-duration');
    console.log('\n=== Registration Flow Test Complete ===\n');
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

    // Render with debug logging
    const { container } = renderWithProviders(<AuthPage />);
    console.log('Initial container in error test:', container.innerHTML);

    const user = userEvent.setup();

    // Wait for register tab and click it
    const registerTab = await screen.findByRole('tab', { name: /register/i });
    await user.click(registerTab);

    // Wait for content with debug logging
    const registerContent = await screen.findByTestId('register-tab-content');
    console.log('Found register content in error test:', registerContent.outerHTML);
    expect(registerContent).toBeInTheDocument();

    // Fill form and submit
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'testuser');
    await user.type(screen.getByLabelText(/password/i), 'testpass123');
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Attempt verification
    const emailVerificationDialog = await screen.findByText(/verify your email/i);
    expect(emailVerificationDialog).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/enter 6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    // Check for error message
    const errorMessage = await screen.findByText(/verification failed/i);
    expect(errorMessage).toBeInTheDocument();
  }, 30000);
});