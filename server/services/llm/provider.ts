// File: server/services/llm/provider.ts

// Define a structure similar to OpenAI's ChatCompletionMessage for standardization
export interface StandardizedChatCompletionMessage {
  role: "user" | "assistant" | "function" | "system"; // Keep OpenAI roles for now, map internally
  content: string | null;
  name?: string; // For function role
  // Add fields relevant for tool/function calls if needed, mimicking OpenAI structure
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string; // Keep as string for now, parse later
    };
  }>;
}

export interface LLMProvider {
  generateCompletion(
    model: string,
    messages: StandardizedChatCompletionMessage[],
    temperature?: number,
    jsonMode?: boolean,
    functionDefinitions?: any[], // Placeholder for function definitions
    customBaseUrl?: string | null,
    customApiKey?: string | null
  ): Promise<StandardizedChatCompletionMessage>; // Return a standardized response message
}
