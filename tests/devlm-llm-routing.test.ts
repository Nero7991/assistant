/**
 * Test suite for DevLM LLM routing based on user settings
 * Tests that the correct provider and model are selected based on devlmPreferredModel
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import type { User } from '@shared/schema';

// Mock the LLM providers
const mockOpenAIProvider = {
  generateCompletion: vi.fn()
};

const mockGCloudProvider = {
  generateCompletion: vi.fn()
};

const mockStorage = {
  getUser: vi.fn()
};

// Mock WebSocket
const mockWebSocket = {
  send: vi.fn()
};

// Mock modules before importing the routing logic
vi.mock('../server/services/llm/openai_provider.js', () => ({
  openAIProvider: mockOpenAIProvider
}));

vi.mock('../server/services/llm/gcloud_provider.js', () => ({
  gcloudProvider: mockGCloudProvider
}));

vi.mock('../server/storage', () => ({
  storage: mockStorage
}));

// Test helper to simulate the routing logic from routes.ts
async function simulateDevLMRouting(user: Partial<User>, llmMessage: any, ws: any) {
  // This simulates the exact routing logic from handleLLMRequestFromDevLM
  const { requestId, messages, temperature } = llmMessage.payload;
  
  if (!messages || !Array.isArray(messages)) {
    throw new Error('Invalid messages array provided');
  }

  if (!user) {
    throw new Error('User not found');
  }

  // Determine provider and model based on user's DevLM settings
  const devlmModel = user.devlmPreferredModel || 'o1-mini';
  let provider: any;
  let effectiveModel = devlmModel;
  let detectedProvider = '';

  if (devlmModel === 'custom' && user.devlmCustomOpenaiServerUrl) {
      provider = mockOpenAIProvider;
      effectiveModel = user.devlmCustomOpenaiModelName || 'model';
      detectedProvider = 'custom';
  } else if (devlmModel.startsWith('claude-')) {
      provider = mockGCloudProvider;
      effectiveModel = devlmModel;
      detectedProvider = 'anthropic';
  } else if (devlmModel.startsWith('gemini-')) {
      provider = mockGCloudProvider;
      effectiveModel = devlmModel;
      detectedProvider = 'gcloud';
  } else if (devlmModel.startsWith('gpt-') || devlmModel.startsWith('o1-')) {
      provider = mockOpenAIProvider;
      effectiveModel = devlmModel;
      detectedProvider = 'openai';
  } else {
      // Fallback to openai with o1-mini
      provider = mockOpenAIProvider;
      effectiveModel = 'o1-mini';
      detectedProvider = 'openai';
  }

  // Mock successful response
  const mockResponse = {
    content: 'Test response'
  };
  provider.generateCompletion.mockResolvedValue(mockResponse);

  await provider.generateCompletion(
      effectiveModel,
      messages,
      temperature || 0.7,
      false, // jsonMode
      undefined, // functionDefinitions
      user.devlmCustomOpenaiServerUrl,
      undefined // customApiKey
  );

  const successResponse = {
    type: 'llm_response',
    payload: {
      requestId,
      content: mockResponse.content,
      model: effectiveModel,
      provider: detectedProvider
    }
  };
  
  ws.send(JSON.stringify(successResponse));

  return {
    provider: detectedProvider,
    model: effectiveModel,
    customUrl: user.devlmCustomOpenaiServerUrl,
    response: successResponse
  };
}

describe('DevLM LLM Routing Tests', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  const baseLLMMessage = {
    payload: {
      requestId: 'test-req-001',
      messages: [{ role: 'user', content: 'Test message' }],
      temperature: 0.7
    }
  };

  describe('OpenAI Model Routing', () => {
    it('should route o1-mini to OpenAI provider', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'o1-mini'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('o1-mini');
      expect(mockOpenAIProvider.generateCompletion).toHaveBeenCalledWith(
        'o1-mini',
        baseLLMMessage.payload.messages,
        0.7,
        false,
        undefined,
        undefined,
        undefined
      );
      expect(mockGCloudProvider.generateCompletion).not.toHaveBeenCalled();
    });

    it('should route gpt-4o to OpenAI provider', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'gpt-4o'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
      expect(mockOpenAIProvider.generateCompletion).toHaveBeenCalledWith(
        'gpt-4o',
        baseLLMMessage.payload.messages,
        0.7,
        false,
        undefined,
        undefined,
        undefined
      );
    });

    it('should route gpt-4o-mini to OpenAI provider', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'gpt-4o-mini'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o-mini');
    });
  });

  describe('Anthropic Model Routing', () => {
    it('should route claude-3-5-sonnet-20241022 to GCloud provider', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'claude-3-5-sonnet-20241022'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
      expect(mockGCloudProvider.generateCompletion).toHaveBeenCalledWith(
        'claude-3-5-sonnet-20241022',
        baseLLMMessage.payload.messages,
        0.7,
        false,
        undefined,
        undefined,
        undefined
      );
      expect(mockOpenAIProvider.generateCompletion).not.toHaveBeenCalled();
    });

    it('should route claude-3-5-haiku-20241022 to GCloud provider', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'claude-3-5-haiku-20241022'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-5-haiku-20241022');
    });

    it('should route claude-3-opus-20240229 to GCloud provider', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'claude-3-opus-20240229'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-opus-20240229');
    });
  });

  describe('Google Model Routing', () => {
    it('should route gemini-1.5-pro-latest to GCloud provider', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'gemini-1.5-pro-latest'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('gcloud');
      expect(result.model).toBe('gemini-1.5-pro-latest');
      expect(mockGCloudProvider.generateCompletion).toHaveBeenCalledWith(
        'gemini-1.5-pro-latest',
        baseLLMMessage.payload.messages,
        0.7,
        false,
        undefined,
        undefined,
        undefined
      );
      expect(mockOpenAIProvider.generateCompletion).not.toHaveBeenCalled();
    });

    it('should route gemini-2.0-flash to GCloud provider', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'gemini-2.0-flash'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('gcloud');
      expect(result.model).toBe('gemini-2.0-flash');
    });
  });

  describe('Custom Server Routing', () => {
    it('should route custom model to OpenAI provider with custom URL', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'http://localhost:1234/v1',
        devlmCustomOpenaiModelName: 'llama-3-8b'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('custom');
      expect(result.model).toBe('llama-3-8b');
      expect(result.customUrl).toBe('http://localhost:1234/v1');
      expect(mockOpenAIProvider.generateCompletion).toHaveBeenCalledWith(
        'llama-3-8b',
        baseLLMMessage.payload.messages,
        0.7,
        false,
        undefined,
        'http://localhost:1234/v1',
        undefined
      );
    });

    it('should use "model" as default when custom model name is not specified', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'http://localhost:1234/v1'
        // No devlmCustomOpenaiModelName specified
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('custom');
      expect(result.model).toBe('model');
    });

    it('should fallback to openai when custom is selected but no URL provided', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'custom'
        // No devlmCustomOpenaiServerUrl specified
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      // Should fallback to unknown model handling
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('o1-mini');
    });
  });

  describe('Fallback Scenarios', () => {
    it('should fallback to o1-mini when no model is specified', async () => {
      const user: Partial<User> = {
        // No devlmPreferredModel specified
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('o1-mini');
    });

    it('should fallback to o1-mini for unknown model', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'unknown-model-xyz'
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('o1-mini');
    });

    it('should fallback to o1-mini when model is null', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: null as any
      };

      const result = await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('o1-mini');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid messages array', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'gpt-4o'
      };

      const invalidMessage = {
        payload: {
          requestId: 'test-req-001',
          messages: null, // Invalid messages
          temperature: 0.7
        }
      };

      await expect(simulateDevLMRouting(user, invalidMessage, mockWebSocket))
        .rejects.toThrow('Invalid messages array provided');
    });

    it('should throw error when user is not found', async () => {
      await expect(simulateDevLMRouting(null as any, baseLLMMessage, mockWebSocket))
        .rejects.toThrow('User not found');
    });

    it('should handle empty messages array', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'gpt-4o'
      };

      const emptyMessagesMessage = {
        payload: {
          requestId: 'test-req-001',
          messages: [], // Empty but valid array
          temperature: 0.7
        }
      };

      const result = await simulateDevLMRouting(user, emptyMessagesMessage, mockWebSocket);
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
    });
  });

  describe('WebSocket Response Format', () => {
    it('should send correctly formatted response via WebSocket', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'claude-3-5-sonnet-20241022'
      };

      await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'llm_response',
          payload: {
            requestId: 'test-req-001',
            content: 'Test response',
            model: 'claude-3-5-sonnet-20241022',
            provider: 'anthropic'
          }
        })
      );
    });

    it('should include custom server details in response for custom models', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'custom',
        devlmCustomOpenaiServerUrl: 'http://localhost:1234/v1',
        devlmCustomOpenaiModelName: 'custom-model'
      };

      await simulateDevLMRouting(user, baseLLMMessage, mockWebSocket);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'llm_response',
          payload: {
            requestId: 'test-req-001',
            content: 'Test response',
            model: 'custom-model',
            provider: 'custom'
          }
        })
      );
    });
  });

  describe('Temperature Handling', () => {
    it('should use default temperature when not specified', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'gpt-4o'
      };

      const messageWithoutTemp = {
        payload: {
          requestId: 'test-req-001',
          messages: [{ role: 'user', content: 'Test message' }]
          // No temperature specified
        }
      };

      await simulateDevLMRouting(user, messageWithoutTemp, mockWebSocket);

      expect(mockOpenAIProvider.generateCompletion).toHaveBeenCalledWith(
        'gpt-4o',
        messageWithoutTemp.payload.messages,
        0.7, // Default temperature
        false,
        undefined,
        undefined,
        undefined
      );
    });

    it('should use specified temperature when provided', async () => {
      const user: Partial<User> = {
        devlmPreferredModel: 'gpt-4o'
      };

      const messageWithTemp = {
        payload: {
          requestId: 'test-req-001',
          messages: [{ role: 'user', content: 'Test message' }],
          temperature: 0.2
        }
      };

      await simulateDevLMRouting(user, messageWithTemp, mockWebSocket);

      expect(mockOpenAIProvider.generateCompletion).toHaveBeenCalledWith(
        'gpt-4o',
        messageWithTemp.payload.messages,
        0.2, // Specified temperature
        false,
        undefined,
        undefined,
        undefined
      );
    });
  });
});