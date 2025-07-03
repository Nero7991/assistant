import OpenAI from "openai";
import { Task, KnownUserFact, Subtask } from "@shared/schema";
import { FINAL_SCHEDULE_MARKER } from "./services/schedule-parser-new";
import { storage } from "./storage";

// Define interfaces for task data formatting
interface SubtaskData {
  id: number;
  title: string;
  description: string;
  status: string;
  estimatedDuration: string;
  deadline: string | null;
  scheduledTime: string | null;
  recurrencePattern: string;
}

interface TaskData {
  id: number;
  title: string;
  description: string;
  status: string;
  estimatedDuration: string;
  deadline: string | null;
  scheduledTime: string | null;
  recurrencePattern: string;
  subtasks: SubtaskData[];
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const COACHING_PROMPT = `You are Kona, a supportive personal assistant helping users stay accountable and achieve their goals. Provide encouraging, practical advice that accounts for executive dysfunction challenges including ADHD. Focus on breaking down tasks, providing structure, and maintaining motivation.

Respond with JSON in this format:
{
  "message": "Your coaching response",
  "nextCheckIn": "Suggested time for next check-in (e.g. '4 hours', 'tomorrow morning')",
  "actionItems": ["List", "of", "specific", "action", "items"]
}`;

const DAILY_SCHEDULE_PROMPT = `You are Kona, a personal assistant helping create a structured daily schedule.

Current date and time: {currentDateTime}

User time preferences:
- Wake up time: {wakeTime}
- Routine start time: {routineStartTime}
- Sleep time: {sleepTime}

User facts:
{userFactsFormatted}

Tasks and subtasks information (in JSON format):
{tasksFormatted}

The JSON structure contains tasks and their associated subtasks with the following fields:
- id: The unique identifier for the task/subtask
- title: The name of the task/subtask
- description: A description of what the task/subtask entails
- status: Current status ('active', 'completed', 'archived')
- estimatedDuration: Estimated time required for the task/subtask
- deadline: The due date if applicable
- scheduledTime: The time the task/subtask is scheduled for (if any)
- recurrencePattern: Whether the task repeats and how often
- subtasks: Array of subtasks associated with the main task

Your task is to create a daily schedule that:
1. Accounts for the user's executive function challenges
2. Breaks down the day into manageable time blocks
3. Includes time for breaks, transitions, and self-care
4. Prioritizes important tasks based on deadlines and importance
5. Provides a realistic and achievable schedule
6. Respects the user's wake time, routine start time, and sleep time
7. Includes specific times for each activity in 24-hour format (e.g., "09:00 - 10:30")
8. CLEARLY INDICATES which main task each subtask belongs to when scheduling subtasks

EXTREMELY IMPORTANT: Your response MUST ALWAYS include a section with the EXACT marker "${FINAL_SCHEDULE_MARKER}" followed by a schedule with each item on a separate line with a time specified. This marker is essential and MUST appear exactly as written.

FORMATTING INSTRUCTIONS FOR SCHEDULE ITEMS:
1. Do NOT include "Task ID:" in the title of any schedule item
2. Instead, provide task IDs and subtask IDs in a specific format at the end of each item
3. For tasks, use the format: "10:00 - 11:00 Design User Interface (Task ID: 43)"
4. For subtasks, use the format: "10:00 - 11:00 Create wireframes (Subtask ID: 75)"
5. Do NOT include colons at the beginning of activity titles
6. Keep the activity title clean and readable, without any extraneous information

Example of correctly formatted schedule:

${FINAL_SCHEDULE_MARKER}
08:00 Morning routine
08:30 Work on Project X (Task ID: 12)
09:15 Short break
10:00 Design User Interface (Task ID: 43)
10:30 Create wireframes (Subtask ID: 75)
11:00 Short break
...

Provide a friendly, encouraging message before presenting the schedule. After the schedule, include 2-3 tips for staying on track.`;

export async function generateCoachingResponse(
  checkInContent: string,
  previousResponses?: string[],
  preferredModel: string = "gpt-4o"
): Promise<{
  message: string;
  nextCheckIn: string;
  actionItems: string[];
}> {
  try {
    // DEBUG: Print the coaching prompt and user message
    console.log("\n===== COACHING DEBUG: PROMPT =====");
    console.log("System prompt: ", COACHING_PROMPT);
    console.log("User message: ", checkInContent);
    console.log(`Previous responses: ${previousResponses?.length || 0}`);
    console.log(`Using model: ${preferredModel}`);
    if (previousResponses && previousResponses.length > 0) {
      console.log("Previous responses:", previousResponses);
    }
    console.log("========================================\n");
    
    // Different models require different parameters
    let completionParams: any = {
      model: preferredModel,
      messages: [
        { role: "system", content: COACHING_PROMPT },
        ...(previousResponses?.map(msg => ({ role: "assistant" as const, content: msg })) || []),
        { role: "user", content: checkInContent }
      ],
    };
    
    // Only add response_format for models that support it (not o1-mini/o3-mini)
    if (preferredModel !== "o1-mini" && preferredModel !== "o3-mini") {
      completionParams.response_format = { type: "json_object" };
      completionParams.temperature = 0.7;
    }
    
    const response = await openai.chat.completions.create(completionParams);

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI API");
    }
    
    // DEBUG: Print the raw LLM response
    console.log("\n===== COACHING DEBUG: RAW LLM RESPONSE =====");
    console.log(content);
    console.log("========================================\n");
    
    return JSON.parse(content);
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to generate coaching response");
  }
}

export async function generateDailySchedule(
  userId: number,
  tasks: Task[],
  facts: KnownUserFact[],
  customInstructions?: string,
  userTimeZone?: string,
  userTimePreferences?: {
    wakeTime?: string,
    routineStartTime?: string,
    sleepTime?: string
  },
  preferredModel: string = "gpt-4o"
): Promise<string> {
  try {
    // Format current date and time in user's timezone if provided
    let currentDateTime;
    if (userTimeZone) {
      currentDateTime = new Date().toLocaleString('en-US', { 
        timeZone: userTimeZone,
        dateStyle: 'full',
        timeStyle: 'long'
      });
    } else {
      currentDateTime = new Date().toISOString();
    }
    
    // Set default time preferences if not provided
    const wakeTime = userTimePreferences?.wakeTime || "08:00";
    const routineStartTime = userTimePreferences?.routineStartTime || "09:30";
    const sleepTime = userTimePreferences?.sleepTime || "23:00";
    
    // Format user facts
    const userFactsFormatted = facts.length > 0
      ? facts.map(fact => `- ${fact.category}: ${fact.content}`).join('\n')
      : "No known user facts available.";
    
    // Format tasks, prioritizing those with deadlines or scheduled times
    // Get subtasks for each task
    const allSubtasks = await storage.getAllSubtasks(userId);
    
    // Create a map of task ID to its subtasks
    const subtasksByTaskId = new Map<number, Subtask[]>();
    allSubtasks.forEach((subtask: Subtask) => {
      if (!subtasksByTaskId.has(subtask.parentTaskId)) {
        subtasksByTaskId.set(subtask.parentTaskId, []);
      }
      subtasksByTaskId.get(subtask.parentTaskId)?.push(subtask);
    });
    
    // Format tasks and subtasks as JSON
    const formattedTasksJSON = tasks.length > 0
      ? tasks
          .sort((a, b) => {
            // Priority order: has deadline > has scheduledTime > default
            const aHasDeadline = !!a.deadline;
            const bHasDeadline = !!b.deadline;
            const aHasScheduledTime = !!a.scheduledTime;
            const bHasScheduledTime = !!b.scheduledTime;
            
            if (aHasDeadline !== bHasDeadline) return aHasDeadline ? -1 : 1;
            if (aHasDeadline && bHasDeadline && a.deadline && b.deadline) {
              return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
            }
            if (aHasScheduledTime !== bHasScheduledTime) return aHasScheduledTime ? -1 : 1;
            return 0;
          })
          .map(task => {
            // Format task
            const taskData: TaskData = {
              id: task.id,
              title: task.title,
              description: task.description || "",
              status: task.status,
              estimatedDuration: task.estimatedDuration || "",
              deadline: task.deadline ? new Date(task.deadline).toLocaleDateString() : null,
              scheduledTime: task.scheduledTime || null,
              recurrencePattern: task.recurrencePattern || "none",
              subtasks: []
            };
            
            // Add subtasks if available
            const taskSubtasks = subtasksByTaskId.get(task.id) || [];
            if (taskSubtasks.length > 0) {
              taskData.subtasks = taskSubtasks.map((subtask: Subtask) => ({
                id: subtask.id,
                title: subtask.title,
                description: subtask.description || "",
                status: subtask.status,
                estimatedDuration: subtask.estimatedDuration || "",
                deadline: subtask.deadline ? new Date(subtask.deadline).toLocaleDateString() : null,
                scheduledTime: subtask.scheduledTime || null,
                recurrencePattern: subtask.recurrencePattern || "none"
              }));
            }
            
            return taskData;
          })
      : [];
      
    // Create a string representation as JSON for the LLM prompt
    const tasksFormatted = JSON.stringify(formattedTasksJSON, null, 2);
    
    // Replace placeholders in the prompt
    let promptContent = DAILY_SCHEDULE_PROMPT
      .replace('{currentDateTime}', currentDateTime)
      .replace('{wakeTime}', wakeTime)
      .replace('{routineStartTime}', routineStartTime)
      .replace('{sleepTime}', sleepTime)
      .replace('{userFactsFormatted}', userFactsFormatted)
      .replace('{tasksFormatted}', tasksFormatted);
    
    // Add custom instructions if provided
    if (customInstructions) {
      promptContent += `\n\nAdditional instructions: ${customInstructions}`;
    }
    
    // DEBUG: Print the complete prompt being sent to the LLM
    console.log("\n===== COACH DEBUG: DAILY SCHEDULE PROMPT =====");
    console.log(promptContent);
    console.log("=====================================\n");
    
    // Log which model is being used
    console.log(`Using model: ${preferredModel} for daily schedule generation`);
    
    // Different models require different parameters
    let completionParams: any = {
      model: preferredModel,
      messages: [
        { role: "system", content: promptContent },
        { role: "user", content: "Please create a daily schedule for me based on my tasks and information." }
      ],
      max_tokens: 1500
    };
    
    // Only add temperature for non-reasoning models
    // Reasoning models like o1-mini don't need temperature parameter
    if (preferredModel !== "o1-mini" && preferredModel !== "o3-mini") {
      completionParams.temperature = 0.7;
    }
    
    const response = await openai.chat.completions.create(completionParams);
    
    const content = response.choices[0].message.content;
    return content ? content : "Failed to generate a schedule.";
  } catch (error) {
    console.error("Error generating daily schedule:", error);
    throw new Error("Failed to generate daily schedule");
  }
}