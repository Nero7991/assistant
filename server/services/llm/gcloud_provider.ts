import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  Content,
  Part,
  GenerateContentRequest,
  FunctionDeclarationSchema,
  FunctionDeclarationsTool,
} from "@google/generative-ai";
import {
  LLMProvider,
  StandardizedChatCompletionMessage,
} from "./provider";
import { llmFunctionDefinitions } from "../llm-functions"; // Import your function definitions

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Helper to map standard roles to Gemini roles
function mapRoleToGemini(role: StandardizedChatCompletionMessage['role']): 'user' | 'model' {
    return (role === 'user') ? 'user' : 'model';
}

// Define the expected type strings for Gemini function parameters
type GeminiFunctionParameterType = "string" | "number" | "integer" | "boolean" | "array" | "object";

// Helper to map our function definitions to Gemini's format
function mapFunctionsToGeminiTool(definitions: typeof llmFunctionDefinitions): FunctionDeclarationsTool | undefined {
    if (!definitions || definitions.length === 0) {
        return undefined;
    }

    const functionDeclarations: FunctionDeclarationSchema[] = definitions.map(def => {
        // Use the GeminiFunctionParameterType for properties
        const properties: { [key: string]: { type: GeminiFunctionParameterType; description?: string; } } = {};
        const requiredParams: string[] = def.parameters?.required || [];

        if (def.parameters?.properties) {
            for (const [key, value] of Object.entries(def.parameters.properties)) {
                 // Use string literals matching GeminiFunctionParameterType
                let geminiType: GeminiFunctionParameterType;
                switch (value.type) {
                    case 'string': geminiType = "string"; break;
                    case 'number': geminiType = "number"; break;
                    case 'integer': geminiType = "integer"; break;
                    case 'boolean': geminiType = "boolean"; break;
                    case 'array': geminiType = "array"; break;
                    case 'object': geminiType = "object"; break;
                    default: geminiType = "string"; // Default fallback type
                }
                properties[key] = { type: geminiType, description: value.description };
            }
        }

        return {
            name: def.name,
            description: def.description,
            parameters: {
                type: "object", // Parameters schema is always an object
                properties: properties,
                required: requiredParams,
            },
        };
    });

    return { functionDeclarations };
}

export class GCloudProvider implements LLMProvider {
    async generateCompletion(
        model: string,
        messages: StandardizedChatCompletionMessage[],
        temperature?: number,
        jsonMode?: boolean,
        functionDefinitions?: any[], // Use the passed definitions
        customBaseUrl?: string | null,
        customApiKey?: string | null
    ): Promise<StandardizedChatCompletionMessage> {

        const geminiModel = genAI.getGenerativeModel({
             model: model.startsWith('gemini-') ? model : 'gemini-1.5-pro-latest', // Use specific model or fallback
             safetySettings: [
                 { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                 { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                 { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                 { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
             ],
             // Remove tools config to avoid conflict with jsonMode when not forcing function calls
             // tools: mapFunctionsToGeminiTool(functionDefinitions || llmFunctionDefinitions) 
        });

        // Convert messages to Gemini's Content format
        const history: Content[] = messages
         .filter(msg => msg.role !== 'system') // Filter out system messages
         .map((msg): Content => {
            if (msg.role === 'function') {
                let functionResponseContent = {};
                try {
                    // Gemini expects the result object directly
                    functionResponseContent = JSON.parse(msg.content || '{}'); 
                } catch (e) {
                    console.error("[GCloudProvider] Failed to parse function result content for Gemini:", msg.content, e);
                    functionResponseContent = { error: "Failed to parse function result content.", originalContent: msg.content };
                }
                return {
                    // Role mapping isn't direct here, parts define the type
                    role: 'function', // Needs to be function to contain functionResponse
                    parts: [{
                        functionResponse: {
                            name: msg.name || 'unknown_function',
                            response: { // The actual response object goes here
                                name: msg.name || 'unknown_function', // Gemini might expect name here too
                                content: functionResponseContent, 
                            }
                        }
                    }]
                };
            }
            // Handle regular user/model messages
            return {
                role: mapRoleToGemini(msg.role),
                parts: [{ text: msg.content || "" }],
            };
        });

         const request: GenerateContentRequest = {
             contents: history,
             generationConfig: {
                 temperature: temperature,
             }
         };
        
         if (jsonMode) {
             request.generationConfig = {
                 ...request.generationConfig,
                 responseMimeType: "application/json",
             };
             console.log("[GCloudProvider] Requesting JSON object format via responseMimeType.");
         }

        try {
            console.log(`[GCloudProvider] Calling model ${geminiModel.model}...`);
            const result = await geminiModel.generateContent(request);
            const response = result.response;

            if (!response || !response.candidates || response.candidates.length === 0) {
                console.error("[GCloudProvider] No response or candidates received.", response);
                 const finishReason = response?.promptFeedback?.blockReason || "No candidates";
                 const blockMessage = response?.promptFeedback?.blockReasonMessage || "No content generated.";
                throw new Error(`Gemini generation failed. Reason: ${finishReason}. ${blockMessage}`);
            }

            const candidate = response.candidates[0];
            const finishReason = candidate.finishReason || "UNKNOWN";
            console.log(`[GCloudProvider] Received response. Finish Reason: ${finishReason}`);
            
             let responseContent: string | null = null;
             let toolCalls: StandardizedChatCompletionMessage['tool_calls'] | undefined = undefined;

             const functionCalls = candidate.content?.parts?.filter((part: Part) => !!part.functionCall);
             if (functionCalls && functionCalls.length > 0) {
                 console.log(`[GCloudProvider] Detected ${functionCalls.length} function call(s).`);
                 toolCalls = functionCalls.map((part: Part, index: number) => ({
                     id: `gemini-call-${Date.now()}-${index}`,
                     type: "function",
                     function: {
                         name: part.functionCall?.name || "unknown",
                         arguments: JSON.stringify(part.functionCall?.args || {}),
                     },
                 }));
                  responseContent = candidate.content?.parts?.find((part: Part) => !!part.text)?.text || null;
                  if (!responseContent && toolCalls && toolCalls.length > 0) {
                      responseContent = `[System action: Calling function ${toolCalls[0].function.name}]`;
                  }
             } else {
                 responseContent = candidate.content?.parts?.map((part: Part) => part.text).join('\n') || null;
             }

            const standardizedResponse: StandardizedChatCompletionMessage = {
                role: "assistant",
                content: responseContent,
                tool_calls: toolCalls,
            };

            return standardizedResponse;

        } catch (error) {
            console.error("[GCloudProvider] Error calling Google AI completion API:", error);
            return {
                role: "assistant",
                content: `{ "message": "Sorry, I encountered an error communicating with the Google AI service." }`,
                tool_calls: undefined
            };
        }
    }
}

export const gcloudProvider = new GCloudProvider();
