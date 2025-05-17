import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  LLMProvider,
  StandardizedChatCompletionMessage,
} from "./provider";

// Type for OpenAI function definition properties
type OpenAIFunctionProperty = {
    type: string;
    description?: string;
    enum?: string[];
};

// Type for OpenAI function parameters
type OpenAIFunctionParameters = {
    type: "object";
    properties: { [key: string]: OpenAIFunctionProperty };
    required?: string[];
};

// Type for OpenAI function definition
type OpenAIFunctionDefinition = {
    name: string;
    description: string;
    parameters: OpenAIFunctionParameters;
};

export class OpenAIProvider implements LLMProvider {
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
    
    // ---> NEW: Dynamic Client Creation
    const apiKeyToUse = customApiKey || process.env.OPENAI_API_KEY;
    if (!apiKeyToUse) {
        console.error("OpenAI API Key is missing (checked custom, env). Cannot proceed.");
        throw new Error("OpenAI API Key is missing.");
    }
    
    // Use 'any' for options type if specific type is causing issues
    const clientOptions: any = { 
         apiKey: apiKeyToUse,
    };
    if (customBaseUrl) {
        console.log(`[OpenAIProvider] Using custom baseURL: ${customBaseUrl}`);
        clientOptions.baseURL = customBaseUrl;
    }
    const dynamicOpenaiClient = new OpenAI(clientOptions);
    // <--- END NEW
    
    // Map standardized messages to specific OpenAI format based on role
    const openAIMessages: ChatCompletionMessageParam[] = messages.map(msg => {
      switch (msg.role) {
        case "system":
          return { role: "system", content: msg.content || "" };
        case "user":
          // Note: OpenAI's user message type doesn't strictly include name or tool_calls
          return { role: "user", content: msg.content || "" };
        case "assistant":
          // Assistant message can include tool_calls
          return { 
            role: "assistant", 
            content: msg.content, 
            tool_calls: msg.tool_calls // Pass tool_calls if present
          };
        case "function":
          // Function message requires name
          return { 
            role: "function", 
            name: msg.name || "unknown_function", // Provide a default name if missing
            content: msg.content || "" 
          };
        default:
          // Fallback or throw error for unexpected roles
          console.warn(`Unsupported role found during OpenAI mapping: ${msg.role}`);
          return { role: "user", content: msg.content || "" }; // Default to user role as a fallback
      }
    });

    let completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: model,
      messages: openAIMessages,
    };

    if (temperature !== undefined) {
      completionParams.temperature = temperature;
    }

    // Only request JSON object format if jsonMode is true
    // And handle the fact that o1-mini doesn't support it reliably
    if (jsonMode && !model.startsWith("o1-") && !model.startsWith("o3-")) {
       completionParams.response_format = { type: "json_object" };
       console.log("[OpenAIProvider] Requesting JSON object format.");
    } else if (jsonMode) {
        console.log(`[OpenAIProvider] JSON mode requested but not supported/reliable for model ${model}. Skipping.`);
    }


    try {
        console.log(`[OpenAIProvider] Calling model ${model}...`);
        const response = await dynamicOpenaiClient.chat.completions.create(completionParams);
        const choice = response.choices[0];

        if (!choice?.message) {
            throw new Error("No message received in the choice from OpenAI.");
        }
        
        console.log(`[OpenAIProvider] Received response. Finish Reason: ${choice.finish_reason}`);

        // Map OpenAI response back to standardized format
        const standardizedResponse: StandardizedChatCompletionMessage = {
            role: choice.message.role,
            content: choice.message.content,
            tool_calls: choice.message.tool_calls?.map(tc => ({ // Ensure mapping matches Standardized structure
                id: tc.id,
                type: tc.type,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                }
            })),
        };
        
        return standardizedResponse;

    } catch (error) {
        console.error("[OpenAIProvider] Error calling OpenAI completion API:", error);
        // Return a standardized error response
        return {
            role: "assistant",
            content: `{ "message": "Sorry, I encountered an error communicating with the OpenAI service." }`,
        };
    }
  }
}

export const openAIProvider = new OpenAIProvider();
