import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';

describe('Authentication Flow', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('handles username availability check', async () => {
    server.use(
      http.get('/api/check-username/test', () => {
        return HttpResponse.json({ message: 'Username available' });
      }),
      http.get('/api/check-username/existing', () => {
        return HttpResponse.json({ message: 'Username already exists' }, { status: 400 });
      })
    );

    const availableResponse = await fetch('/api/check-username/test');
    expect(availableResponse.status).toBe(200);

    const takenResponse = await fetch('/api/check-username/existing');
    expect(takenResponse.status).toBe(400);
  });

  it('handles email verification flow', async () => {
    const tempUserId = Math.floor(Math.random() * 1000000);

    server.use(
      http.post('/api/initiate-verification', () => {
        return HttpResponse.json({
          message: 'Verification code sent',
          tempUserId
        });
      }),
      http.post('/api/verify-contact', () => {
        return HttpResponse.json({ message: 'Verification successful' });
      })
    );

    // Test email verification initiation
    const initiateResponse = await fetch('/api/initiate-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        type: 'email'
      })
    });
    expect(initiateResponse.status).toBe(200);
    const initiateData = await initiateResponse.json();
    expect(initiateData.tempUserId).toBeDefined();

    // Test verification code submission
    const verifyResponse = await fetch('/api/verify-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: '123456',
        type: 'email'
      })
    });
    expect(verifyResponse.status).toBe(200);
  });

  it('handles registration with verified contacts', async () => {
    server.use(
      http.post('/api/register', () => {
        return HttpResponse.json({
          id: 1,
          username: 'testuser',
          email: 'test@example.com',
          isEmailVerified: true,
          isPhoneVerified: true,
          contactPreference: 'email'
        }, { status: 201 });
      })
    );

    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        password: 'password123',
        email: 'test@example.com',
        contactPreference: 'email'
      })
    });
    expect(response.status).toBe(201);
    const user = await response.json();
    expect(user.isEmailVerified).toBe(true);
  });

  it('handles login and session management', async () => {
    server.use(
      http.post('/api/login', () => {
        return HttpResponse.json({
          id: 1,
          username: 'testuser',
          email: 'test@example.com'
        });
      }),
      http.get('/api/user', ({ request }) => {
        const cookie = request.headers.get('Cookie');
        if (!cookie?.includes('connect.sid')) {
          return HttpResponse.json(null, { status: 401 });
        }
        return HttpResponse.json({
          id: 1,
          username: 'testuser',
          email: 'test@example.com'
        });
      }),
      http.post('/api/logout', () => {
        return new HttpResponse(null, { 
          status: 200,
          headers: {
            'Set-Cookie': 'connect.sid=; Max-Age=0; Path=/; HttpOnly'
          }
        });
      })
    );

    // Test login
    const loginResponse = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        password: 'password123'
      })
    });
    expect(loginResponse.status).toBe(200);

    // Test session verification
    const userResponse = await fetch('/api/user');
    expect(userResponse.status).toBe(200);
    const user = await userResponse.json();
    expect(user.username).toBe('testuser');

    // Test logout
    const logoutResponse = await fetch('/api/logout', { method: 'POST' });
    expect(logoutResponse.status).toBe(200);

    // Verify session ended
    const afterLogoutResponse = await fetch('/api/user');
    expect(afterLogoutResponse.status).toBe(401);
  });
});