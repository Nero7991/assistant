/**
 * Unit tests for LLM providers
 * Tests each provider's generateCompletion method with mocked API calls
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StandardizedChatCompletionMessage } from '../server/services/llm/provider';

// Set test environment variables
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

// Mock the external dependencies
vi.mock('openai');
vi.mock('@google/generative-ai');
vi.mock('@anthropic-ai/sdk');

// Import providers after setting environment variables
import { openAIProvider } from '../server/services/llm/openai_provider';
import { gcloudProvider } from '../server/services/llm/gcloud_provider';
import { anthropicProvider } from '../server/services/llm/anthropic_provider';

describe('LLM Providers', () => {
  const testMessages: StandardizedChatCompletionMessage[] = [
    {
      role: 'user',
      content: 'Hello, how are you?'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('OpenAI Provider', () => {
    it('should handle gpt-4o model completion', async () => {
      // Mock OpenAI response
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'I am doing well, thank you!'
          },
          finish_reason: 'stop'
        }]
      };

      // Mock the OpenAI client
      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      const mockOpenAI = {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      };

      // Mock the OpenAI constructor
      const OpenAI = await import('openai');
      vi.mocked(OpenAI.default).mockImplementation(() => mockOpenAI as any);

      const result = await openAIProvider.generateCompletion(
        'gpt-4o',
        testMessages,
        0.7,
        false
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('I am doing well, thank you!');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        temperature: 0.7
      });
    });

    it('should handle o3-mini model completion', async () => {
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hello! I am functioning well.'
          },
          finish_reason: 'stop'
        }]
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      const mockOpenAI = {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      };

      const OpenAI = await import('openai');
      vi.mocked(OpenAI.default).mockImplementation(() => mockOpenAI as any);

      const result = await openAIProvider.generateCompletion(
        'o3-mini',
        testMessages,
        0.5
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Hello! I am functioning well.');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'o3-mini',
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        temperature: 0.5
      });
    });

    it('should handle custom OpenAI-compatible server', async () => {
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Custom server response'
          },
          finish_reason: 'stop'
        }]
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      const mockOpenAI = {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      };

      const OpenAI = await import('openai');
      vi.mocked(OpenAI.default).mockImplementation(() => mockOpenAI as any);

      const result = await openAIProvider.generateCompletion(
        'custom-model',
        testMessages,
        0.8,
        false,
        [],
        'http://localhost:8080/v1',
        'custom-api-key'
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Custom server response');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'custom-model',
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        temperature: 0.8
      });
    });
  });

  describe('Google Cloud Provider', () => {
    it('should handle gemini-2.5-flash model completion', async () => {
      const mockResponse = {
        response: {
          text: () => 'Hello! I am Gemini, how can I help you today?',
          candidates: [{
            content: {
              parts: [{ text: 'Hello! I am Gemini, how can I help you today?' }]
            }
          }]
        }
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      const mockModel = {
        generateContent: mockGenerateContent
      };

      // Mock the GoogleGenerativeAI constructor and its methods
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockGenAI = {
        getGenerativeModel: vi.fn().mockReturnValue(mockModel)
      };
      vi.mocked(GoogleGenerativeAI).mockImplementation(() => mockGenAI as any);

      const result = await gcloudProvider.generateCompletion(
        'gemini-2.5-flash',
        testMessages,
        0.6
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Hello! I am Gemini, how can I help you today?');
    });

    it('should handle gemini-2.5-pro model completion', async () => {
      const mockResponse = {
        response: {
          text: () => 'This is Gemini Pro with enhanced capabilities.',
          candidates: [{
            content: {
              parts: [{ text: 'This is Gemini Pro with enhanced capabilities.' }]
            }
          }]
        }
      };

      const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      const mockModel = {
        generateContent: mockGenerateContent
      };

      const mockGenAI = {
        getGenerativeModel: vi.fn().mockReturnValue(mockModel)
      };

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      vi.mocked(GoogleGenerativeAI).mockImplementation(() => mockGenAI as any);

      const result = await gcloudProvider.generateCompletion(
        'gemini-2.5-pro',
        testMessages,
        0.4
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('This is Gemini Pro with enhanced capabilities.');
    });
  });

  describe('Anthropic Provider', () => {
    it('should handle claude-4-opus model completion', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Hello! I am Claude, pleased to meet you.'
        }],
        stop_reason: 'end_turn'
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      const mockAnthropic = {
        messages: {
          create: mockCreate
        }
      };

      const Anthropic = await import('@anthropic-ai/sdk');
      vi.mocked(Anthropic.default).mockImplementation(() => mockAnthropic as any);

      const result = await anthropicProvider.generateCompletion(
        'claude-4-opus',
        testMessages,
        0.7
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Hello! I am Claude, pleased to meet you.');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-4-opus',
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        max_tokens: 4096,
        temperature: 0.7
      });
    });

    it('should handle claude-4-sonnet model completion', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Hi there! I am Claude Sonnet, ready to assist.'
        }],
        stop_reason: 'end_turn'
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      const mockAnthropic = {
        messages: {
          create: mockCreate
        }
      };

      const Anthropic = await import('@anthropic-ai/sdk');
      vi.mocked(Anthropic.default).mockImplementation(() => mockAnthropic as any);

      const result = await anthropicProvider.generateCompletion(
        'claude-4-sonnet',
        testMessages,
        0.5
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Hi there! I am Claude Sonnet, ready to assist.');
    });

    it('should handle system messages correctly', async () => {
      const messagesWithSystem: StandardizedChatCompletionMessage[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant.'
        },
        {
          role: 'user',
          content: 'Hello!'
        }
      ];

      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Hello! How can I help you today?'
        }],
        stop_reason: 'end_turn'
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      const mockAnthropic = {
        messages: {
          create: mockCreate
        }
      };

      const Anthropic = await import('@anthropic-ai/sdk');
      vi.mocked(Anthropic.default).mockImplementation(() => mockAnthropic as any);

      const result = await anthropicProvider.generateCompletion(
        'claude-4-sonnet',
        messagesWithSystem,
        0.5
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Hello! How can I help you today?');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-4-sonnet',
        messages: [{ role: 'user', content: 'Hello!' }],
        system: 'You are a helpful assistant.',
        max_tokens: 4096,
        temperature: 0.5
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenAI provider errors gracefully', async () => {
      const mockCreate = vi.fn().mockRejectedValue(new Error('API Error'));
      const mockOpenAI = {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      };

      const OpenAI = await import('openai');
      vi.mocked(OpenAI.default).mockImplementation(() => mockOpenAI as any);

      const result = await openAIProvider.generateCompletion(
        'gpt-4o',
        testMessages
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toContain('error communicating with the OpenAI service');
    });

    it('should handle Anthropic provider errors gracefully', async () => {
      const mockCreate = vi.fn().mockRejectedValue(new Error('API Error'));
      const mockAnthropic = {
        messages: {
          create: mockCreate
        }
      };

      const Anthropic = await import('@anthropic-ai/sdk');
      vi.mocked(Anthropic.default).mockImplementation(() => mockAnthropic as any);

      const result = await anthropicProvider.generateCompletion(
        'claude-4-opus',
        testMessages
      );

      expect(result.role).toBe('assistant');
      expect(result.content).toContain('error communicating with the Anthropic service');
    });
  });
});