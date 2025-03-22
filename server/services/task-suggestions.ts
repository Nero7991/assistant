import OpenAI from "openai";
import { TaskType } from "@shared/schema";

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
  description: string
): Promise<TaskSuggestionResponse> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are an ADHD-friendly task planning assistant. Break down tasks into manageable subtasks with realistic deadlines.
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
          }`
        },
        {
          role: "user",
          content: `Task Type: ${taskType}
          Title: ${title}
          Description: ${description}

          Please suggest a breakdown of this task into manageable subtasks with deadlines.`
        }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content) as TaskSuggestionResponse;
  } catch (error) {
    console.error("Error generating task suggestions:", error);
    throw new Error("Failed to generate task suggestions");
  }
}