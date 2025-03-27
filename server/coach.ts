import OpenAI from "openai";
import { Task, KnownUserFact } from "@shared/schema";
import { SCHEDULE_MARKER } from "./services/schedule-parser";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const COACHING_PROMPT = `You are a supportive ADHD coach helping users stay accountable and achieve their goals. Provide encouraging, practical advice that accounts for ADHD challenges. Focus on breaking down tasks, providing structure, and maintaining motivation.

Respond with JSON in this format:
{
  "message": "Your coaching response",
  "nextCheckIn": "Suggested time for next check-in (e.g. '4 hours', 'tomorrow morning')",
  "actionItems": ["List", "of", "specific", "action", "items"]
}`;

const DAILY_SCHEDULE_PROMPT = `You are an ADHD coach helping create a structured daily schedule.

Current date and time: {currentDateTime}

User facts:
{userFactsFormatted}

Tasks information:
{tasksFormatted}

Your task is to create a daily schedule that:
1. Accounts for the user's ADHD challenges
2. Breaks down the day into manageable time blocks
3. Includes time for breaks, transitions, and self-care
4. Prioritizes important tasks based on deadlines and importance
5. Provides a realistic and achievable schedule
6. Includes specific times for each activity in 24-hour format (e.g., "09:00 - 10:30")

IMPORTANT: Your response MUST include a section with the marker "${SCHEDULE_MARKER}" followed by a schedule with each item on a separate line with a time specified. Example format:

${SCHEDULE_MARKER}
08:00 - 08:30 Morning routine
08:30 - 09:15 Work on Project X
09:15 - 09:30 Short break
...

Provide a friendly, encouraging message before presenting the schedule. After the schedule, include 2-3 tips for staying on track.`;

export async function generateCoachingResponse(
  checkInContent: string,
  previousResponses?: string[]
): Promise<{
  message: string;
  nextCheckIn: string;
  actionItems: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: COACHING_PROMPT },
        ...(previousResponses?.map(msg => ({ role: "assistant" as const, content: msg })) || []),
        { role: "user", content: checkInContent }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to generate coaching response");
  }
}

export async function generateDailySchedule(
  tasks: Task[],
  facts: KnownUserFact[],
  customInstructions?: string
): Promise<string> {
  try {
    // Format current date and time
    const currentDateTime = new Date().toISOString();
    
    // Format user facts
    const userFactsFormatted = facts.length > 0
      ? facts.map(fact => `- ${fact.category}: ${fact.content}`).join('\n')
      : "No known user facts available.";
    
    // Format tasks, prioritizing those with deadlines or scheduled times
    const tasksFormatted = tasks.length > 0
      ? tasks
          .sort((a, b) => {
            // Priority order: has deadline > has scheduledTime > default
            const aHasDeadline = !!a.deadline;
            const bHasDeadline = !!b.deadline;
            const aHasScheduledTime = !!a.scheduledTime;
            const bHasScheduledTime = !!b.scheduledTime;
            
            if (aHasDeadline !== bHasDeadline) return aHasDeadline ? -1 : 1;
            if (aHasDeadline && bHasDeadline) {
              return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
            }
            if (aHasScheduledTime !== bHasScheduledTime) return aHasScheduledTime ? -1 : 1;
            return 0;
          })
          .map(task => {
            let taskInfo = `- ${task.title}`;
            if (task.description) taskInfo += `\n  Description: ${task.description}`;
            if (task.estimatedDuration) taskInfo += `\n  Estimated Duration: ${task.estimatedDuration}`;
            if (task.deadline) taskInfo += `\n  Deadline: ${new Date(task.deadline).toLocaleDateString()}`;
            if (task.scheduledTime) taskInfo += `\n  Scheduled Time: ${task.scheduledTime}`;
            if (task.recurrencePattern && task.recurrencePattern !== 'none') {
              taskInfo += `\n  Recurrence: ${task.recurrencePattern}`;
            }
            
            return taskInfo;
          })
          .join('\n\n')
      : "No tasks available.";
    
    // Replace placeholders in the prompt
    let promptContent = DAILY_SCHEDULE_PROMPT
      .replace('{currentDateTime}', currentDateTime)
      .replace('{userFactsFormatted}', userFactsFormatted)
      .replace('{tasksFormatted}', tasksFormatted);
    
    // Add custom instructions if provided
    if (customInstructions) {
      promptContent += `\n\nAdditional instructions: ${customInstructions}`;
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: promptContent },
        { role: "user", content: "Please create a daily schedule for me based on my tasks and information." }
      ],
      max_tokens: 1500
    });
    
    const content = response.choices[0].message.content;
    return content ? content : "Failed to generate a schedule.";
  } catch (error) {
    console.error("Error generating daily schedule:", error);
    throw new Error("Failed to generate daily schedule");
  }
}
