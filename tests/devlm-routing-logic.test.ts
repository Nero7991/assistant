/**
 * Test suite focused purely on the DevLM routing logic
 * Tests the exact logic from routes.ts without database dependencies
 */

import { describe, it, expect } from 'vitest';

// Simulate the exact routing logic from handleLLMRequestFromDevLM in routes.ts
function simulateDevLMRoutingLogic(userSettings: {
  devlmPreferredModel?: string | null;
  devlmCustomOpenaiServerUrl?: string | null;
  devlmCustomOpenaiModelName?: string | null;
}) {
  // This replicates the exact logic from routes.ts lines 2271-2304
  const devlmModel = userSettings.devlmPreferredModel || 'o1-mini';
  let provider: string;
  let effectiveModel = devlmModel;
  let detectedProvider = '';

  if (devlmModel === 'custom' && userSettings.devlmCustomOpenaiServerUrl) {
      provider = 'openAIProvider';
      effectiveModel = userSettings.devlmCustomOpenaiModelName || 'model';
      detectedProvider = 'custom';
  } else if (devlmModel.startsWith('claude-')) {
      provider = 'gcloudProvider';
      effectiveModel = devlmModel;
      detectedProvider = 'anthropic';
  } else if (devlmModel.startsWith('gemini-')) {
      provider = 'gcloudProvider';
      effectiveModel = devlmModel;
      detectedProvider = 'gcloud';
  } else if (devlmModel.startsWith('gpt-') || devlmModel.startsWith('o1-')) {
      provider = 'openAIProvider';
      effectiveModel = devlmModel;
      detectedProvider = 'openai';
  } else {
      // Fallback to openai with o1-mini
      provider = 'openAIProvider';
      effectiveModel = 'o1-mini';
      detectedProvider = 'openai';
  }

  return {
    provider,
    effectiveModel,
    detectedProvider,
    customUrl: userSettings.devlmCustomOpenaiServerUrl
  };
}

describe('DevLM Routing Logic Tests', () => {
  describe('OpenAI Model Routing', () => {
    it('should route o1-mini to OpenAI provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'o1-mini'
      });

      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('o1-mini');
      expect(result.provider).toBe('openAIProvider');
    });

    it('should route gpt-4o to OpenAI provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gpt-4o'
      });

      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('gpt-4o');
      expect(result.provider).toBe('openAIProvider');
    });

    it('should route gpt-4o-mini to OpenAI provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gpt-4o-mini'
      });

      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('gpt-4o-mini');
    });

    it('should route gpt-3.5-turbo to OpenAI provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gpt-3.5-turbo'
      });

      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('gpt-3.5-turbo');
    });
  });

  describe('Anthropic Model Routing', () => {
    it('should route claude-3-5-sonnet-20241022 to GCloud provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'claude-3-5-sonnet-20241022'
      });

      expect(result.detectedProvider).toBe('anthropic');
      expect(result.effectiveModel).toBe('claude-3-5-sonnet-20241022');
      expect(result.provider).toBe('gcloudProvider');
    });

    it('should route claude-3-5-haiku-20241022 to GCloud provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'claude-3-5-haiku-20241022'
      });

      expect(result.detectedProvider).toBe('anthropic');
      expect(result.effectiveModel).toBe('claude-3-5-haiku-20241022');
    });

    it('should route claude-3-opus-20240229 to GCloud provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'claude-3-opus-20240229'
      });

      expect(result.detectedProvider).toBe('anthropic');
      expect(result.effectiveModel).toBe('claude-3-opus-20240229');
    });
  });

  describe('Google Model Routing', () => {
    it('should route gemini-1.5-pro-latest to GCloud provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gemini-1.5-pro-latest'
      });

      expect(result.detectedProvider).toBe('gcloud');
      expect(result.effectiveModel).toBe('gemini-1.5-pro-latest');
      expect(result.provider).toBe('gcloudProvider');
    });

    it('should route gemini-2.0-flash to GCloud provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gemini-2.0-flash'
      });

      expect(result.detectedProvider).toBe('gcloud');
      expect(result.effectiveModel).toBe('gemini-2.0-flash');
    });

    it('should route gemini-1.5-flash-latest to GCloud provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gemini-1.5-flash-latest'
      });

      expect(result.detectedProvider).toBe('gcloud');
      expect(result.effectiveModel).toBe('gemini-1.5-flash-latest');
    });
  });

  describe('Custom Server Routing', () => {
    it('should route custom model with URL to custom provider', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'http://localhost:1234/v1',
        devlmCustomOpenaiModelName: 'llama-3-8b'
      });

      expect(result.detectedProvider).toBe('custom');
      expect(result.effectiveModel).toBe('llama-3-8b');
      expect(result.provider).toBe('openAIProvider');
      expect(result.customUrl).toBe('http://localhost:1234/v1');
    });

    it('should use default model name when not specified for custom', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'http://localhost:1234/v1'
        // No custom model name
      });

      expect(result.detectedProvider).toBe('custom');
      expect(result.effectiveModel).toBe('model');
    });

    it('should fallback when custom selected but no URL', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'custom'
        // No custom URL
      });

      // Should follow the "else" path and fallback
      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('o1-mini');
    });
  });

  describe('Fallback Scenarios', () => {
    it('should fallback to o1-mini when model is null', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: null
      });

      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('o1-mini');
    });

    it('should fallback to o1-mini when model is undefined', () => {
      const result = simulateDevLMRoutingLogic({
        // No devlmPreferredModel
      });

      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('o1-mini');
    });

    it('should fallback to o1-mini for unknown model', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'unknown-model-xyz'
      });

      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('o1-mini');
    });

    it('should fallback to o1-mini for empty string model', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: ''
      });

      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('o1-mini');
    });
  });

  describe('Edge Cases', () => {
    it('should handle models with similar prefixes correctly', () => {
      // Test that "gpt-" prefix works correctly
      const gptResult = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gpt-custom-model'
      });
      expect(gptResult.detectedProvider).toBe('openai');

      // Test that "claude-" prefix works correctly  
      const claudeResult = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'claude-custom-model'
      });
      expect(claudeResult.detectedProvider).toBe('anthropic');

      // Test that "gemini-" prefix works correctly
      const geminiResult = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gemini-custom-model'
      });
      expect(geminiResult.detectedProvider).toBe('gcloud');
    });

    it('should handle custom URL with special characters', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'https://api.example.com:8080/v1/chat',
        devlmCustomOpenaiModelName: 'model-v2.1'
      });

      expect(result.detectedProvider).toBe('custom');
      expect(result.effectiveModel).toBe('model-v2.1');
      expect(result.customUrl).toBe('https://api.example.com:8080/v1/chat');
    });

    it('should handle null custom fields correctly', () => {
      const result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gpt-4o',
        devlmCustomOpenaiServerUrl: null,
        devlmCustomOpenaiModelName: null
      });

      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('gpt-4o');
      expect(result.customUrl).toBeNull();
    });
  });

  describe('Model Pattern Matching', () => {
    const testCases = [
      // OpenAI patterns
      { model: 'o1-preview', expected: 'openai' },
      { model: 'o1-mini-preview', expected: 'openai' },
      { model: 'gpt-5', expected: 'openai' },
      { model: 'gpt-4o-preview', expected: 'openai' },
      
      // Anthropic patterns
      { model: 'claude-4', expected: 'anthropic' },
      { model: 'claude-3.5-updated', expected: 'anthropic' },
      
      // Google patterns
      { model: 'gemini-3.0', expected: 'gcloud' },
      { model: 'gemini-ultra', expected: 'gcloud' },
      
      // Non-matching patterns (should fallback)
      { model: 'llama-2', expected: 'openai' }, // fallback
      { model: 'mistral-7b', expected: 'openai' }, // fallback
      { model: 'palm-2', expected: 'openai' }, // fallback
    ];

    testCases.forEach(({ model, expected }) => {
      it(`should route "${model}" to ${expected} provider`, () => {
        const result = simulateDevLMRoutingLogic({
          devlmPreferredModel: model
        });

        expect(result.detectedProvider).toBe(expected);
        
        if (expected === 'openai' && !model.startsWith('gpt-') && !model.startsWith('o1-')) {
          // Should be fallback case
          expect(result.effectiveModel).toBe('o1-mini');
        } else {
          expect(result.effectiveModel).toBe(model);
        }
      });
    });
  });

  describe('Account Page Settings Scenarios', () => {
    it('should match account page dropdown model selections', () => {
      // These are the exact models from AVAILABLE_MODELS in account-page.tsx
      const accountPageModels = [
        'o1-mini',
        'gpt-4o', 
        'gpt-4o-mini',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022', 
        'claude-3-opus-20240229',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash-latest',
        'gemini-2.5-flash-preview-04-17',
        'gemini-2.5-pro-preview-03-25',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'custom'
      ];

      accountPageModels.forEach(model => {
        const result = simulateDevLMRoutingLogic({
          devlmPreferredModel: model,
          devlmCustomOpenaiServerUrl: model === 'custom' ? 'http://localhost:1234/v1' : null,
          devlmCustomOpenaiModelName: model === 'custom' ? 'test-model' : null
        });

        // Verify each model routes correctly
        if (model.startsWith('gpt-') || model.startsWith('o1-')) {
          expect(result.detectedProvider).toBe('openai');
        } else if (model.startsWith('claude-')) {
          expect(result.detectedProvider).toBe('anthropic');
        } else if (model.startsWith('gemini-')) {
          expect(result.detectedProvider).toBe('gcloud');
        } else if (model === 'custom') {
          expect(result.detectedProvider).toBe('custom');
        }
      });
    });

    it('should simulate account page custom configuration flow', () => {
      // Step 1: User selects custom
      let result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'custom'
        // No URL yet - would show validation error on account page
      });
      expect(result.detectedProvider).toBe('openai'); // Fallback

      // Step 2: User enters custom URL and model
      result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'http://localhost:11434/v1',
        devlmCustomOpenaiModelName: 'llama-3-8b'
      });
      expect(result.detectedProvider).toBe('custom');
      expect(result.effectiveModel).toBe('llama-3-8b');

      // Step 3: User switches back to standard model
      result = simulateDevLMRoutingLogic({
        devlmPreferredModel: 'gpt-4o',
        devlmCustomOpenaiServerUrl: 'http://localhost:11434/v1', // Still stored
        devlmCustomOpenaiModelName: 'llama-3-8b' // Still stored
      });
      expect(result.detectedProvider).toBe('openai');
      expect(result.effectiveModel).toBe('gpt-4o');
    });
  });
});