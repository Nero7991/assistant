import OpenAI from "openai";
import { TaskType, KnownUserFact } from "@shared/schema";
import { storage } from "../storage";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    // Fetch user facts for context
    const userFacts = await storage.getKnownUserFacts(userId);
    const userFactsContext = formatUserFacts(userFacts);

    // Clean up duration if provided (extract lower bound)
    const cleanDuration = estimatedDuration ? extractLowerBound(estimatedDuration) : 'Not specified';

    const systemPrompt = `You are an ADHD-friendly task planning assistant. Break down tasks into manageable subtasks with realistic deadlines.
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
    - ADHD-friendly task sizes (25-45 minutes per subtask)
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

    // Get the user's preferred model
    const user = await storage.getUser(userId);
    const preferredModel = user?.preferredModel || "gpt-4o";
    console.log(`Using user's preferred model: ${preferredModel} for task suggestions`);
    
    // Different models require different parameters
    let completionParams: any = {
      model: preferredModel, // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      response_format: { type: "json_object" }
    };
    
    // Add reasoning_effort for o1-mini (or other reasoning models)
    if (preferredModel === "o1-mini" || preferredModel === "o3-mini") {
      completionParams.reasoning_effort = "medium";
    } else {
      // Add temperature for non-reasoning models
      completionParams.temperature = 0.7;
    }
    
    const response = await openai.chat.completions.create(completionParams);

    const suggestions = JSON.parse(response.choices[0].message.content!) as TaskSuggestionResponse;
    
    // Process the response to ensure all deadlines are calculated properly
    suggestions.subtasks = suggestions.subtasks.map(subtask => {
      // Preserve the scheduledTime and recurrencePattern if they exist
      const { scheduledTime, recurrencePattern } = subtask;
      
      return {
        ...subtask,
        estimatedDuration: extractLowerBound(subtask.estimatedDuration),
        deadline: calculateDeadline(subtask.estimatedDuration),
        // Ensure we maintain scheduled time and recurrence pattern
        scheduledTime: scheduledTime || undefined,
        recurrencePattern: recurrencePattern || undefined
      };
    });
    
    // Calculate the suggested deadline based on the total duration
    suggestions.suggestedDeadline = calculateDeadline(suggestions.estimatedTotalDuration);
    suggestions.estimatedTotalDuration = extractLowerBound(suggestions.estimatedTotalDuration);

    return suggestions;
  } catch (error) {
    console.error("Error generating task suggestions:", error);
    throw new Error("Failed to generate task suggestions");
  }
}