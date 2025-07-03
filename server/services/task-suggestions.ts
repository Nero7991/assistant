import { db } from "../db";
import { eq } from "drizzle-orm";
import { KnownUserFact, TaskType, knownUserFacts } from "@shared/schema";
import { storage } from "../storage";
// Remove openai import as it doesn't exist
import { format, add } from 'date-fns';

// Import LLM Providers and types
import { LLMProvider, StandardizedChatCompletionMessage } from "./llm/provider";
import { openAIProvider } from "./llm/openai_provider";
import { gcloudProvider } from "./llm/gcloud_provider";

interface SubTaskSuggestion {
  title: string;
  description: string;
  estimatedDuration: string;
  deadline: string;
  scheduledTime?: string;
  recurrencePattern?: string;
}

interface TaskSuggestionResponse {
  subtasks: SubTaskSuggestion[];
  estimatedTotalDuration: string;
  suggestedDeadline: string;
  tips: string[];
}

// Helper function to extract the lower bound from duration ranges
function extractLowerBound(duration: string): string {
  // Check if the string contains a range (e.g., "3-4h" or "2 to 3 days")
  const rangeMatch = duration.match(/(\d+)[\s-]*(?:to)?[\s-]*(\d+)([a-zA-Z]+)/);
  if (rangeMatch) {
    return `${rangeMatch[1]}${rangeMatch[3]}`;
  }
  return duration;
}

// Helper function to calculate a deadline based on duration
function calculateDeadline(duration: string): string {
  const now = new Date();
  const cleanDuration = extractLowerBound(duration);
  
  // Extract the number and unit (e.g., "3d" -> 3 and "d")
  const match = cleanDuration.match(/(\d+)([a-zA-Z]+)/);
  if (!match) return now.toISOString().split('T')[0]; // Return today if no match
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  // Clone the current date
  const deadline = new Date(now);
  
  // Add time based on the unit
  switch (unit) {
    case 'm': // minutes
      deadline.setMinutes(deadline.getMinutes() + value);
      break;
    case 'h': // hours
      deadline.setHours(deadline.getHours() + value);
      break;
    case 'd': // days
      deadline.setDate(deadline.getDate() + value);
      break;
    case 'w': // weeks
      deadline.setDate(deadline.getDate() + (value * 7));
      break;
    case 'mo': // months
    case 'month':
    case 'months':
    case 'M': // capital M for months
      deadline.setMonth(deadline.getMonth() + value);
      break;
    case 'y': // years
      deadline.setFullYear(deadline.getFullYear() + value);
      break;
    default:
      // Default to days if unit not recognized
      deadline.setDate(deadline.getDate() + value);
  }
  
  // Return in YYYY-MM-DD format
  return deadline.toISOString().split('T')[0];
}

// Format user facts for better context
function formatUserFacts(facts: KnownUserFact[]): string {
  if (facts.length === 0) return "No known user facts available.";
  
  return `Known facts about the user:
${facts.map(f => `- ${f.category}: ${f.content}`).join('\n')}

Take these facts into consideration when suggesting tasks and estimating durations.`;
}

export async function generateTaskSuggestions(
  taskType: typeof TaskType[keyof typeof TaskType],
  title: string,
  description: string,
  userId: number,
  estimatedDuration?: string
): Promise<TaskSuggestionResponse> {
  try {
    const currentDateTime = new Date().toISOString();
    const userFacts = await storage.getKnownUserFacts(userId);
    const userFactsContext = formatUserFacts(userFacts);
    const cleanDuration = estimatedDuration ? extractLowerBound(estimatedDuration) : 'Not specified';

    // --- System Prompt (remains mostly the same) ---
    const systemPrompt = `You are Kona, a personal assistant that helps with task planning. Break down tasks into manageable subtasks with realistic deadlines.
    Current datetime: ${currentDateTime}

    ${userFactsContext}

    Overall task duration provided by user: ${cleanDuration}

    Important rules for durations and deadlines:
    1. Always provide a single duration value, not a range (e.g., use "3d" not "3-4d")
    2. Use duration format: Xm (minutes), Xh (hours), Xd (days), Xw (weeks), XM (months), Xy (years)
    3. Calculate each deadline by adding the estimated duration to the current datetime
    4. Always use the lower bound of any duration range
    5. Keep all subtasks within the overall task duration (if provided)
    6. Use consistent units for all subtasks (don't mix days and weeks)

    Consider:
    - Executive function-friendly task sizes (25-45 minutes per subtask)
    - Clear, actionable steps
    - Realistic time estimates accounting for context switching
    - Buffer time for unexpected challenges
    - Progressive difficulty to build momentum
    - User's personal circumstances from their facts

    Respond in JSON format with:
    {
      "subtasks": [
        {
          "title": "string",
          "description": "string",
          "estimatedDuration": "string (e.g. 2h, 3d, 1w)",
          "deadline": "YYYY-MM-DD",
          "scheduledTime": "HH:MM (24-hour format, optional)",
          "recurrencePattern": "none|daily|weekly:1,2,3,4,5|weekly:6,7|weekly:1|weekly:2|etc (optional)"
        }
      ],
      "estimatedTotalDuration": "string",
      "suggestedDeadline": "YYYY-MM-DD",
      "tips": ["string"]
    }`;

    // --- User Prompt (remains the same) ---
    const userPrompt = `Task Type: ${taskType}
    Title: ${title}
    Description: ${description}

    Please suggest a breakdown of this task into manageable subtasks with deadlines.
    
    For subtasks that would benefit from specific scheduling (like daily medication or routine tasks), 
    please include scheduledTime (in 24-hour format like "09:00") and recurrencePattern 
    (e.g., "daily", "weekly:1,2,3,4,5" for weekdays, or day-specific like "weekly:1" for Monday).`;

    // Debug log the prompts in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('\n--------- TASK SUGGESTION DEBUG ---------');
      console.log('User ID:', userId);
      console.log('Task Type:', taskType);
      console.log('Task Title:', title);
      console.log('Task Duration:', cleanDuration);
      console.log('User Facts Count:', userFacts.length);
      console.log('\nSystem Prompt:', systemPrompt);
      console.log('\nUser Prompt:', userPrompt);
      console.log('------- END TASK SUGGESTION DEBUG -------\n');
    }

    // --- Select LLM Provider --- 
    const user = await storage.getUser(userId);
    const preferredModel = user?.preferredModel || "gpt-4o";
    console.log(`[Task Suggestions] Using user's preferred model: ${preferredModel}`);

    let provider: LLMProvider;
    let effectiveModel = preferredModel;
    if (preferredModel.startsWith("gemini-")) {
      provider = gcloudProvider;
    } else if (preferredModel.startsWith("gpt-") || preferredModel.startsWith("o1-") || preferredModel.startsWith("o3-")) {
      provider = openAIProvider;
    } else {
      console.warn(`[Task Suggestions] Unsupported model ${preferredModel}, falling back to OpenAI.`);
      provider = openAIProvider;
      effectiveModel = "gpt-4o"; 
    }
    
    // --- Prepare Messages for Provider --- 
    const messages: StandardizedChatCompletionMessage[] = [];
    let requiresJson = true; // Assume JSON required unless it's o1/o3 mini

    // Handle different provider/model requirements
    if (provider === openAIProvider && !effectiveModel.startsWith("o1-") && !effectiveModel.startsWith("o3-")) {
        messages.push({ role: "system", content: systemPrompt });
        messages.push({ role: "user", content: userPrompt });
    } else if (provider === gcloudProvider) {
        // Combine prompts for Gemini (it prefers system instructions with user query)
        messages.push({ role: "user", content: `${systemPrompt}\n\n${userPrompt}` });
    } else { // OpenAI Mini models
        messages.push({ role: "user", content: `${systemPrompt}\n\n${userPrompt}` });
        requiresJson = false; // Mini models don't reliably support JSON mode
    }

    // --- Set Temperature --- 
    const temperature = (effectiveModel.startsWith("o1-") || effectiveModel.startsWith("o3-")) ? undefined : 0.7;

    // --- Call the Selected Provider --- 
    console.log(`[Task Suggestions] Calling ${provider.constructor.name} model ${effectiveModel}...`);
    const responseMessage = await provider.generateCompletion(
      effectiveModel,
      messages,
      temperature,
      requiresJson
      // No function definitions needed for this specific suggestion prompt
    );

    // --- Process the Response --- 
    if (!responseMessage.content) {
        throw new Error("LLM did not return any content for task suggestions.");
    }

    // Attempt to parse the JSON from the response content
    let suggestions: TaskSuggestionResponse;
    try {
        // Need to clean potential markdown fences if model adds them
        let cleanContent = responseMessage.content.trim();
        if (cleanContent.startsWith("```json")) {
            cleanContent = cleanContent.substring(7);
            if (cleanContent.endsWith("```")) {
                cleanContent = cleanContent.substring(0, cleanContent.length - 3);
            }
            cleanContent = cleanContent.trim();
        } else if (cleanContent.startsWith("```")) { 
             cleanContent = cleanContent.substring(3);
             if (cleanContent.endsWith("```")) {
                cleanContent = cleanContent.substring(0, cleanContent.length - 3);
             }
             cleanContent = cleanContent.trim();
        }
        suggestions = JSON.parse(cleanContent) as TaskSuggestionResponse;
    } catch (parseError) {
        console.error("[Task Suggestions] Failed to parse JSON response:", parseError);
        console.error("[Task Suggestions] Raw LLM content:", responseMessage.content);
        throw new Error("Failed to parse task suggestions from LLM response.");
    }
    
    // Process deadlines and durations (existing logic is good)
    suggestions.subtasks = suggestions.subtasks.map(subtask => {
      const { scheduledTime, recurrencePattern } = subtask;
      return {
        ...subtask,
        estimatedDuration: extractLowerBound(subtask.estimatedDuration),
        deadline: calculateDeadline(subtask.estimatedDuration),
        scheduledTime: scheduledTime || undefined,
        recurrencePattern: recurrencePattern || undefined
      };
    });
    suggestions.suggestedDeadline = calculateDeadline(suggestions.estimatedTotalDuration);
    suggestions.estimatedTotalDuration = extractLowerBound(suggestions.estimatedTotalDuration);

    console.log("[Task Suggestions] Successfully generated suggestions.");
    return suggestions;

  } catch (error) {
    console.error("Error generating task suggestions:", error);
    // Throw specific error for the API route handler
    throw new Error("Failed to generate task suggestions via LLM."); 
  }
}