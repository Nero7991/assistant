import { describe, it, expect, beforeEach } from 'vitest';
import { server } from '../client/src/__tests__/mocks/server';
import { http, HttpResponse } from 'msw';

describe('MSW Debug', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('can intercept a simple GET request', async () => {
    server.use(
      http.get('/api/creations', () => {
        return HttpResponse.json([{ id: 1, title: 'Test' }]);
      })
    );

    const response = await fetch('/api/creations');
    const data = await response.json();
    
    expect(response.ok).toBe(true);
    expect(data).toEqual([{ id: 1, title: 'Test' }]);
  });

  it('shows what happens with default handlers', async () => {
    const response = await fetch('/api/creations');
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', data);
    
    expect(response.ok).toBe(true);
    expect(Array.isArray(data)).toBe(true);
  });
});