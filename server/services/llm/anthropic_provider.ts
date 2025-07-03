import Anthropic from "@anthropic-ai/sdk";
import {
  LLMProvider,
  StandardizedChatCompletionMessage,
} from "./provider";

// Type for Anthropic function definition properties
type AnthropicFunctionProperty = {
    type: string;
    description?: string;
    enum?: string[];
};

// Type for Anthropic function parameters
type AnthropicFunctionParameters = {
    type: "object";
    properties: { [key: string]: AnthropicFunctionProperty };
    required?: string[];
};

// Type for Anthropic function definition
type AnthropicFunctionDefinition = {
    name: string;
    description: string;
    input_schema: AnthropicFunctionParameters;
};

export class AnthropicProvider implements LLMProvider {
  constructor() {
    // No default client initialization needed here anymore
  }

  async generateCompletion(
    model: string,
    messages: StandardizedChatCompletionMessage[],
    temperature?: number,
    jsonMode?: boolean,
    functionDefinitions?: any[], // Using any[] for simplicity
    customBaseUrl?: string | null,
    customApiKey?: string | null // Optional API key override
  ): Promise<StandardizedChatCompletionMessage> {
    
    // Dynamic Client Creation
    const apiKeyToUse = customApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKeyToUse) {
        console.error("Anthropic API Key is missing (checked custom, env). Cannot proceed.");
        throw new Error("Anthropic API Key is missing.");
    }
    
    const clientOptions: any = { 
         apiKey: apiKeyToUse,
    };
    if (customBaseUrl) {
        console.log(`[AnthropicProvider] Using custom baseURL: ${customBaseUrl}`);
        clientOptions.baseURL = customBaseUrl;
    }
    const dynamicAnthropicClient = new Anthropic(clientOptions);
    
    // Map standardized messages to Anthropic format
    const anthropicMessages: any[] = [];
    let systemMessage: string | undefined;
    
    // Extract system message and convert other messages
    for (const msg of messages) {
      if (msg.role === "system") {
        systemMessage = msg.content || "";
      } else if (msg.role === "user") {
        anthropicMessages.push({
          role: "user",
          content: msg.content || ""
        });
      } else if (msg.role === "assistant") {
        const assistantMessage: any = {
          role: "assistant",
          content: msg.content || ""
        };
        
        // Handle tool calls if present
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          assistantMessage.content = [
            ...(msg.content ? [{ type: "text", text: msg.content }] : []),
            ...msg.tool_calls.map(tc => ({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments)
            }))
          ];
        }
        
        anthropicMessages.push(assistantMessage);
      } else if (msg.role === "function") {
        // Convert function results to tool_result format
        anthropicMessages.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: msg.name || "unknown_function",
            content: msg.content || ""
          }]
        });
      }
    }

    let completionParams: any = {
      model: model,
      messages: anthropicMessages,
      max_tokens: 4096,
    };

    if (systemMessage) {
      completionParams.system = systemMessage;
    }

    if (temperature !== undefined) {
      completionParams.temperature = temperature;
    }

    // Handle function definitions (tools)
    if (functionDefinitions && functionDefinitions.length > 0) {
      completionParams.tools = functionDefinitions.map((fn: any) => ({
        name: fn.name,
        description: fn.description,
        input_schema: fn.parameters
      }));
    }

    try {
        console.log(`[AnthropicProvider] Calling model ${model}...`);
        const response = await dynamicAnthropicClient.messages.create(completionParams);
        
        console.log(`[AnthropicProvider] Received response. Stop reason: ${response.stop_reason}`);

        // Map Anthropic response back to standardized format
        let content = "";
        let tool_calls: any[] = [];
        
        if (Array.isArray(response.content)) {
          for (const contentBlock of response.content) {
            if (contentBlock.type === "text") {
              content += contentBlock.text;
            } else if (contentBlock.type === "tool_use") {
              tool_calls.push({
                id: contentBlock.id,
                type: "function",
                function: {
                  name: contentBlock.name,
                  arguments: JSON.stringify(contentBlock.input)
                }
              });
            }
          }
        } else {
          content = response.content.toString();
        }

        const standardizedResponse: StandardizedChatCompletionMessage = {
            role: "assistant",
            content: content || null,
            tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
        };
        
        return standardizedResponse;

    } catch (error) {
        console.error("[AnthropicProvider] Error calling Anthropic API:", error);
        // Return a standardized error response
        return {
            role: "assistant",
            content: `{ "message": "Sorry, I encountered an error communicating with the Anthropic service." }`,
        };
    }
  }
}

export const anthropicProvider = new AnthropicProvider();