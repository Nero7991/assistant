import OpenAI from "openai";
import { TaskType } from "@shared/schema";
import { storage } from "../storage";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface SubTaskSuggestion {
  title: string;
  description: string;
  estimatedDuration: string;
  deadline: string;
}

interface TaskSuggestionResponse {
  subtasks: SubTaskSuggestion[];
  estimatedTotalDuration: string;
  suggestedDeadline: string;
  tips: string[];
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
    const userFactsContext = userFacts.length > 0
      ? `Known facts about the user:\n${userFacts.map(f => `- ${f.category}: ${f.content}`).join('\n')}`
      : "No known user facts available.";

    const systemPrompt = `You are an ADHD-friendly task planning assistant. Break down tasks into manageable subtasks with realistic deadlines.
    Current datetime: ${currentDateTime}

    ${userFactsContext}

    Overall task duration provided by user: ${estimatedDuration || 'Not specified'}

    Important rules for durations and deadlines:
    1. Always provide a single duration value, not a range (e.g., use "3d" not "3-4d")
    2. Use duration format: Xm (minutes), Xh (hours), Xd (days), Xw (weeks), XM (months), Xy (years)
    3. Calculate each deadline by adding the estimated duration to the current datetime
    4. If given a range, use the lower bound of the range
    5. Ensure all subtasks can be completed within the overall task duration (if provided)

    Consider:
    - ADHD-friendly task sizes (25-45 minutes per subtask)
    - Clear, actionable steps
    - Realistic time estimates accounting for context switching
    - Buffer time for unexpected challenges
    - Progressive difficulty to build momentum

    Respond in JSON format with:
    {
      "subtasks": [
        {
          "title": "string",
          "description": "string",
          "estimatedDuration": "string (e.g. 2h, 3d, 1w)",
          "deadline": "YYYY-MM-DD"
        }
      ],
      "estimatedTotalDuration": "string",
      "suggestedDeadline": "YYYY-MM-DD",
      "tips": ["string"]
    }`;

    const userPrompt = `Task Type: ${taskType}
    Title: ${title}
    Description: ${description}

    Please suggest a breakdown of this task into manageable subtasks with deadlines.`;

    // Debug log the prompts in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('\nTask Suggestion System Prompt:', systemPrompt);
      console.log('\nTask Suggestion User Prompt:', userPrompt);
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", 
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
    });

    return JSON.parse(response.choices[0].message.content!) as TaskSuggestionResponse;
  } catch (error) {
    console.error("Error generating task suggestions:", error);
    throw new Error("Failed to generate task suggestions");
  }
}