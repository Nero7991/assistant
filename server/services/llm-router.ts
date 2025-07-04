import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { openAIProvider } from './llm/openai_provider';
import { gcloudProvider } from './llm/gcloud_provider';
import { anthropicProvider } from './llm/anthropic_provider';
import type { StandardizedChatCompletionMessage } from './llm/provider';

/**
 * LLMRouter - Abstract service for routing LLM calls through user preferences
 * 
 * This service ensures all LLM calls respect the user's AI model preference
 * instead of using hardcoded models.
 */
export class LLMRouter {
  /**
   * Generate completion using the user's preferred AI model
   */
  async generateCompletion(
    userId: number,
    messages: StandardizedChatCompletionMessage[],
    temperature?: number,
    jsonMode?: boolean
  ): Promise<StandardizedChatCompletionMessage> {
    // Get user's AI model preference
    const [user] = await db
      .select({
        preferredModel: users.preferredModel,
        customOpenaiServerUrl: users.customOpenaiServerUrl,
        customOpenaiModelName: users.customOpenaiModelName
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Route to appropriate provider based on user's preferred model
    return this.routeToProvider(
      user.preferredModel || 'gemini-2.5-flash', // Default fallback
      messages,
      temperature,
      jsonMode,
      user.customOpenaiServerUrl,
      user.customOpenaiModelName
    );
  }

  /**
   * Route the request to the appropriate provider based on model preference
   */
  private async routeToProvider(
    preferredModel: string,
    messages: StandardizedChatCompletionMessage[],
    temperature?: number,
    jsonMode?: boolean,
    customBaseUrl?: string | null,
    customModelName?: string | null
  ): Promise<StandardizedChatCompletionMessage> {
    let provider;
    let effectiveModel = preferredModel;
    let effectiveBaseUrl = customBaseUrl || null;
    const customApiKey = null;

    // Provider selection logic (extracted from messaging.ts)
    if (preferredModel === "custom" && effectiveBaseUrl) {
      provider = openAIProvider;
      effectiveModel = customModelName || "model";
      console.log(`[LLMRouter] Using Custom OpenAI config: URL=${effectiveBaseUrl}, Model=${effectiveModel}`);
    } else if (preferredModel.startsWith("gemini-")) {
      provider = gcloudProvider;
      effectiveModel = preferredModel;
      console.log("[LLMRouter] Using GCloudProvider.");
    } else if (preferredModel.startsWith("claude-")) {
      provider = anthropicProvider;
      effectiveModel = preferredModel;
      console.log("[LLMRouter] Using AnthropicProvider.");
    } else if (preferredModel.startsWith("gpt-") || preferredModel.startsWith("o1-") || preferredModel.startsWith("o3-")) {
      provider = openAIProvider;
      effectiveModel = preferredModel;
      console.log("[LLMRouter] Using OpenAIProvider.");
    } else {
      console.error(`Unsupported model: ${preferredModel}. Falling back to OpenAI GPT-4o.`);
      provider = openAIProvider;
      effectiveModel = "gpt-4o";
    }

    // Adjust parameters based on model capabilities
    const requiresJson = !effectiveModel.startsWith("o1-") && !effectiveModel.startsWith("o3-");
    const effectiveJsonMode = jsonMode && requiresJson;
    const effectiveTemperature = (effectiveModel.startsWith("o1-") || effectiveModel.startsWith("o3-")) 
      ? undefined 
      : (temperature ?? 0.7);

    console.log(`[LLMRouter] Calling ${effectiveModel} with temperature=${effectiveTemperature}, jsonMode=${effectiveJsonMode}`);

    // Make the LLM call
    try {
      return await provider.generateCompletion(
        effectiveModel,
        messages,
        effectiveTemperature,
        effectiveJsonMode,
        undefined, // functionDefinitions
        effectiveBaseUrl,
        customApiKey
      );
    } catch (error) {
      console.error(`[LLMRouter] Error calling ${effectiveModel}:`, error);
      throw new Error(`Failed to generate completion using ${effectiveModel}`);
    }
  }

  /**
   * Generate completion with a specific model override (for legacy compatibility)
   * Use this when you need to force a specific model regardless of user preference
   */
  async generateCompletionWithModel(
    model: string,
    messages: StandardizedChatCompletionMessage[],
    temperature?: number,
    jsonMode?: boolean,
    customBaseUrl?: string | null,
    customApiKey?: string | null
  ): Promise<StandardizedChatCompletionMessage> {
    return this.routeToProvider(
      model,
      messages,
      temperature,
      jsonMode,
      customBaseUrl,
      null // customModelName not needed for direct model calls
    );
  }
}

// Export singleton instance
export const llmRouter = new LLMRouter();