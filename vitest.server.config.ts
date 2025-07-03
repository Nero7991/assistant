import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,ts,mjs}'],
    exclude: ['client/**/*'],
    timeout: 300000, // 5 minutes for E2E tests
    testTimeout: 300000,
    hookTimeout: 120000, // 2 minutes for setup/teardown
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});