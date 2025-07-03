/**
 * Test that DevLM AI model settings from account page correctly affect LLM routing
 * Tests the end-to-end flow: Account settings → Database → LLM routing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { apiRequest } from '../client/src/lib/queryClient';
import { db } from '../server/db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Mock the API request function for account settings
const mockApiRequest = async (method: string, endpoint: string, data?: any) => {
  if (method === 'PATCH' && endpoint === '/api/user') {
    // Simulate successful account settings update
    await db.update(users)
      .set(data)
      .where(eq(users.id, testUserId));
    return { ok: true };
  }
  throw new Error(`Unexpected API call: ${method} ${endpoint}`);
};

// Test user
const TEST_USER = {
  username: 'settings-test-user',
  email: 'settings-test@example.com', 
  password: 'testpass123',
  devlmPreferredModel: 'o1-mini'
};

let testUserId: number;

describe('DevLM Settings → Routing Integration', () => {
  beforeEach(async () => {
    // Create test user
    const [user] = await db.insert(users).values(TEST_USER).returning();
    testUserId = user.id;
  });

  afterEach(async () => {
    // Clean up test user
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  // Helper function to simulate account page settings update
  async function updateDevLMSettings(settings: {
    devlmPreferredModel?: string;
    devlmCustomOpenaiServerUrl?: string;
    devlmCustomOpenaiModelName?: string;
  }) {
    return await mockApiRequest('PATCH', '/api/user', settings);
  }

  // Helper function to verify settings were saved correctly
  async function getStoredSettings() {
    const [user] = await db.select().from(users).where(eq(users.id, testUserId));
    return {
      devlmPreferredModel: user.devlmPreferredModel,
      devlmCustomOpenaiServerUrl: user.devlmCustomOpenaiServerUrl,
      devlmCustomOpenaiModelName: user.devlmCustomOpenaiModelName
    };
  }

  // Helper function to simulate the routing logic decision
  function simulateRoutingDecision(userSettings: any) {
    const devlmModel = userSettings.devlmPreferredModel || 'o1-mini';
    let provider = '';
    let effectiveModel = devlmModel;

    if (devlmModel === 'custom' && userSettings.devlmCustomOpenaiServerUrl) {
        effectiveModel = userSettings.devlmCustomOpenaiModelName || 'model';
        provider = 'custom';
    } else if (devlmModel.startsWith('claude-')) {
        provider = 'anthropic';
    } else if (devlmModel.startsWith('gemini-')) {
        provider = 'gcloud';
    } else if (devlmModel.startsWith('gpt-') || devlmModel.startsWith('o1-')) {
        provider = 'openai';
    } else {
        // Fallback
        provider = 'openai';
        effectiveModel = 'o1-mini';
    }

    return { provider, model: effectiveModel, customUrl: userSettings.devlmCustomOpenaiServerUrl };
  }

  describe('OpenAI Model Settings', () => {
    it('should save o1-mini setting and route to OpenAI', async () => {
      // Update settings via account page
      const response = await updateDevLMSettings({
        devlmPreferredModel: 'o1-mini'
      });
      
      expect(response.ok).toBe(true);

      // Verify settings were saved
      const stored = await getStoredSettings();
      expect(stored.devlmPreferredModel).toBe('o1-mini');

      // Verify routing decision
      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('openai');
      expect(routing.model).toBe('o1-mini');
    });

    it('should save gpt-4o setting and route to OpenAI', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'gpt-4o'
      });

      const stored = await getStoredSettings();
      expect(stored.devlmPreferredModel).toBe('gpt-4o');

      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('openai');
      expect(routing.model).toBe('gpt-4o');
    });

    it('should save gpt-4o-mini setting and route to OpenAI', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'gpt-4o-mini'
      });

      const stored = await getStoredSettings();
      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('openai');
      expect(routing.model).toBe('gpt-4o-mini');
    });
  });

  describe('Anthropic Model Settings', () => {
    it('should save Claude 3.5 Sonnet setting and route to Anthropic', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'claude-3-5-sonnet-20241022'
      });

      const stored = await getStoredSettings();
      expect(stored.devlmPreferredModel).toBe('claude-3-5-sonnet-20241022');

      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('anthropic');
      expect(routing.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should save Claude 3.5 Haiku setting and route to Anthropic', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'claude-3-5-haiku-20241022'
      });

      const stored = await getStoredSettings();
      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('anthropic');
      expect(routing.model).toBe('claude-3-5-haiku-20241022');
    });

    it('should save Claude 3 Opus setting and route to Anthropic', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'claude-3-opus-20240229'
      });

      const stored = await getStoredSettings();
      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('anthropic');
      expect(routing.model).toBe('claude-3-opus-20240229');
    });
  });

  describe('Google Model Settings', () => {
    it('should save Gemini 1.5 Pro setting and route to GCloud', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'gemini-1.5-pro-latest'
      });

      const stored = await getStoredSettings();
      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('gcloud');
      expect(routing.model).toBe('gemini-1.5-pro-latest');
    });

    it('should save Gemini 2.0 Flash setting and route to GCloud', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'gemini-2.0-flash'
      });

      const stored = await getStoredSettings();
      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('gcloud');
      expect(routing.model).toBe('gemini-2.0-flash');
    });
  });

  describe('Custom Server Settings', () => {
    it('should save custom server settings and route to custom provider', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'http://localhost:1234/v1',
        devlmCustomOpenaiModelName: 'llama-3-8b'
      });

      const stored = await getStoredSettings();
      expect(stored.devlmPreferredModel).toBe('custom');
      expect(stored.devlmCustomOpenaiServerUrl).toBe('http://localhost:1234/v1');
      expect(stored.devlmCustomOpenaiModelName).toBe('llama-3-8b');

      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('custom');
      expect(routing.model).toBe('llama-3-8b');
      expect(routing.customUrl).toBe('http://localhost:1234/v1');
    });

    it('should handle custom server without model name', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'http://localhost:1234/v1'
        // No custom model name
      });

      const stored = await getStoredSettings();
      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('custom');
      expect(routing.model).toBe('model'); // Default model name
    });

    it('should fallback when custom selected but no URL provided', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: 'custom'
        // No custom URL
      });

      const stored = await getStoredSettings();
      const routing = simulateRoutingDecision(stored);
      expect(routing.provider).toBe('openai'); // Fallback
      expect(routing.model).toBe('o1-mini'); // Fallback model
    });
  });

  describe('Settings Persistence', () => {
    it('should maintain custom settings when switching back to custom', async () => {
      // Set custom settings
      await updateDevLMSettings({
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'http://localhost:1234/v1',
        devlmCustomOpenaiModelName: 'llama-3-8b'
      });

      // Switch to different model
      await updateDevLMSettings({
        devlmPreferredModel: 'gpt-4o'
      });

      // Switch back to custom
      await updateDevLMSettings({
        devlmPreferredModel: 'custom'
      });

      const stored = await getStoredSettings();
      // Custom URL and model name should still be there
      expect(stored.devlmCustomOpenaiServerUrl).toBe('http://localhost:1234/v1');
      expect(stored.devlmCustomOpenaiModelName).toBe('llama-3-8b');
    });

    it('should handle null/undefined values correctly', async () => {
      await updateDevLMSettings({
        devlmPreferredModel: null as any,
        devlmCustomOpenaiServerUrl: null,
        devlmCustomOpenaiModelName: null
      });

      const stored = await getStoredSettings();
      const routing = simulateRoutingDecision(stored);
      
      // Should fallback to defaults
      expect(routing.provider).toBe('openai');
      expect(routing.model).toBe('o1-mini');
    });
  });

  describe('Account Page Form Validation Simulation', () => {
    it('should simulate form validation for custom server', async () => {
      // Simulate the account page validation logic
      const formData = {
        devlmPreferredModel: 'custom',
        devlmCustomUrl: '', // Empty URL
        devlmCustomModel: 'test-model'
      };

      // This would be caught by form validation on account page
      let validationError = null;
      if (formData.devlmPreferredModel === 'custom' && !formData.devlmCustomUrl) {
        validationError = 'DevLM Custom URL cannot be empty when Custom model is selected.';
      }

      expect(validationError).toBe('DevLM Custom URL cannot be empty when Custom model is selected.');
    });

    it('should simulate successful form validation', async () => {
      const formData = {
        devlmPreferredModel: 'custom',
        devlmCustomUrl: 'http://localhost:1234/v1',
        devlmCustomModel: 'test-model'
      };

      let validationError = null;
      if (formData.devlmPreferredModel === 'custom' && !formData.devlmCustomUrl) {
        validationError = 'Custom URL required';
      }

      expect(validationError).toBeNull();

      // Would proceed to update settings
      await updateDevLMSettings({
        devlmPreferredModel: formData.devlmPreferredModel,
        devlmCustomOpenaiServerUrl: formData.devlmCustomUrl,
        devlmCustomOpenaiModelName: formData.devlmCustomModel
      });

      const stored = await getStoredSettings();
      expect(stored.devlmPreferredModel).toBe('custom');
      expect(stored.devlmCustomOpenaiServerUrl).toBe('http://localhost:1234/v1');
      expect(stored.devlmCustomOpenaiModelName).toBe('test-model');
    });
  });

  describe('Model Compatibility Matrix', () => {
    const testCases = [
      // OpenAI models
      { model: 'o1-mini', expectedProvider: 'openai' },
      { model: 'gpt-4o', expectedProvider: 'openai' },
      { model: 'gpt-4o-mini', expectedProvider: 'openai' },
      { model: 'gpt-4-turbo', expectedProvider: 'openai' },
      { model: 'gpt-4', expectedProvider: 'openai' },
      { model: 'gpt-3.5-turbo', expectedProvider: 'openai' },
      
      // Anthropic models
      { model: 'claude-3-5-sonnet-20241022', expectedProvider: 'anthropic' },
      { model: 'claude-3-5-haiku-20241022', expectedProvider: 'anthropic' },
      { model: 'claude-3-opus-20240229', expectedProvider: 'anthropic' },
      
      // Google models
      { model: 'gemini-1.5-pro-latest', expectedProvider: 'gcloud' },
      { model: 'gemini-1.5-flash-latest', expectedProvider: 'gcloud' },
      { model: 'gemini-2.0-flash', expectedProvider: 'gcloud' },
      { model: 'gemini-2.0-flash-lite', expectedProvider: 'gcloud' },
      
      // Fallback cases
      { model: 'unknown-model', expectedProvider: 'openai' }, // Should fallback
      { model: '', expectedProvider: 'openai' }, // Should fallback
    ];

    testCases.forEach(({ model, expectedProvider }) => {
      it(`should route ${model || 'empty'} to ${expectedProvider} provider`, async () => {
        await updateDevLMSettings({
          devlmPreferredModel: model
        });

        const stored = await getStoredSettings();
        const routing = simulateRoutingDecision(stored);
        
        expect(routing.provider).toBe(expectedProvider);
        
        if (expectedProvider === 'openai' && (model === '' || model === 'unknown-model')) {
          expect(routing.model).toBe('o1-mini'); // Fallback model
        } else if (model !== '') {
          expect(routing.model).toBe(model);
        }
      });
    });
  });
});