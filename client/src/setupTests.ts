import '@testing-library/jest-dom';
import { expect, afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { vi } from 'vitest';
import { server } from './__tests__/mocks/server';

// Extend Vitest's expect with React Testing Library's matchers
expect.extend(matchers);

// Only enable MSW for unit tests, not integration tests
// Set INTEGRATION_TEST in process.env for test environment
process.env.INTEGRATION_TEST = process.env.INTEGRATION_TEST || 'false';

if (process.env.INTEGRATION_TEST !== 'true') {
  // Establish API mocking before all tests
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  // Reset any request handlers that we may add during the tests
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  // Clean up after the tests are finished
  afterAll(() => server.close());
}

// Mock ResizeObserver which is not available in jsdom
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Add pointer capture polyfills
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.hasPointerCapture = vi.fn();

// Mock pointer events
class PointerEvent extends Event {
  constructor(type: string, props: any = {}) {
    super(type, { bubbles: true, ...props });
    this.pointerId = props.pointerId || 1;
    this.pointerType = props.pointerType || 'mouse';
  }
  pointerId: number;
  pointerType: string;
}

// @ts-ignore
global.PointerEvent = PointerEvent;