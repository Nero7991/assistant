import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import necessary modules
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql, and, or, lte, gte, not, isNull, asc, desc, lt, inArray, ne } from 'drizzle-orm'; // Added lt, inArray, and neq
import { db } from '../db.js'; // Correct path
import * as schema from '../../shared/schema.js';
const { users, tasks, TaskType, messageSchedules, messageHistory, taskEvents, knownUserFacts } = schema;
import { Pool } from 'pg';
import OpenAI from 'openai';
import schedule from 'node-schedule';
import twilio from 'twilio'; // Added twilio import

import {
  toZonedTime, 
  formatInTimeZone, 
  toDate // Keep only necessary functions
} from 'date-fns-tz';
import {
  startOfDay, 
  startOfToday, 
  startOfTomorrow, 
  addDays, 
  addMinutes, 
  subMinutes, 
  isBefore, 
  set, 
  parse as parseDate, // Alias parse to avoid conflict
  getDay, 
  isSameDay, 
  formatISO, 
  parseISO, 
  subDays, 
  isValid as isValidDate, 
  format // Keep format from date-fns
} from 'date-fns'; // Consolidated date-fns imports

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio( // Added twilio client init
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

// Load User from schema
import type { User as StorageUser, Goal, CheckIn, KnownUserFact, Task, MessagingPreferences, MessageHistory, InsertTask, InsertUser, InsertKnownUserFact, MessageSchedule, Subtask, InsertSubtask } from '../../shared/schema.js';
import type { StandardizedChatCompletionMessage } from './llm/provider.js'; // Corrected import for StandardizedChatCompletionMessage

// Import storage service if needed, or use db directly
import { storage } from '../storage.js'; // Corrected path

// Import LLM related components
import { LLMProvider } from './llm/provider.js'; // Added import
import { openAIProvider } from './llm/openai_provider.js'; // Added import
import { gcloudProvider } from './llm/gcloud_provider.js'; // Added import
import { llmFunctionExecutors, llmFunctionDefinitions } from './llm-functions.js'; // Added import
import logger from '../logger.js'; // Import the configured logger

// Constants
const REMINDER_BUFFER_MINUTES = 5; // Send reminder 5 mins before task
const POST_REMINDER_BUFFER_MINUTES = 30; // Follow up 30 mins after task time if not completed
const FINAL_SCHEDULE_MARKER = "FINAL_SCHEDULE_MARKER"; // Ensure defined correctly
// ... rest of the file ...

export interface MessageContext {
  user: StorageUser; // Changed User to StorageUser
  tasks: Task[];
  facts: KnownUserFact[];
  previousMessages: MessageHistory[]; // Keep original DB format for prompt context
  currentDateTime: string;
  messageType: // Used to guide the prompt generation
    | "morning"
    | "follow_up"
    | "response"
    | "reschedule"
    | "schedule_confirmation_response"
    | "agent_mode"
    | "system_request"; // Added for system messages
  userResponse?: string; // User's latest message if applicable
  systemRequestType?: // Specific type for system requests
    | "reschedule_request"
    | "morning_summary"
    | "task_suggestion"
    | string;
  functionResults?: Record<string, any>; // Results from previous tool calls in a loop
  taskDetails?: any; // New field for task details
}

export interface ScheduleUpdate {
  taskId: number | string; // Can be numeric ID or task name string
  action: "reschedule" | "complete" | "skip" | "create";
  scheduledTime?: string;
  recurrencePattern?: string;
  title?: string;
  description?: string;
}

export class MessagingService {
  // ---> Define Template Mapping
  private readonly templateMap: Record<string, { sid: string; variables: number }> = {
      schedule_proposal_v1: { sid: 'HX118e176b98fd0d9bfad5efe73332430b', variables: 2 },
      task_completion_check_v1: { sid: 'HX1aa504f2343fd4325c6afedd7725ec50', variables: 3 },
      task_reminder_now_v1: { sid: 'HX1c1c3d487beccebea02565da8075df85', variables: 3 },
      task_pre_reminder_v1: { sid: 'HXb0c9959392c9a2751b19faa0b12ed91c', variables: 3 },
      morning_brief: { sid: 'HXce60783e6501ba932f9e4386c0bb9d40', variables: 2 },
      // Map internal types to template names/SIDs
      task_follow_up: { sid: 'HX1aa504f2343fd4325c6afedd7725ec50', variables: 3 }, // Reuse completion check
      task_reminder: { sid: 'HX1c1c3d487beccebea02565da8075df85', variables: 3 }, // Alias for task_reminder_now_v1
      task_post_reminder_follow_up: { sid: 'HX1aa504f2343fd4325c6afedd7725ec50', variables: 3 }, // Reuse completion check
      morning_summary: { sid: 'HXce60783e6501ba932f9e4386c0bb9d40', variables: 2 }, // Alias for morning_brief
       // Add other system types if they need templates (e.g., reschedule_request)
       // reschedule_request: { sid: 'TEMPLATE_SID_HERE', variables: X },
  };
  // <--- End Template Mapping

  // --- Helper: Get User's Preferred Model ---
  private async getUserPreferredModel(userId: number): Promise<string> {
    try {
      const user = await storage.getUser(userId);
      return user?.preferredModel || "gpt-4o"; // Default to gpt-4o if no preference set
    } catch (error) {
      console.error("Error getting user preferred model:", error);
      return "gpt-4o"; // Fall back to default model on error
    }
  }

  // --- Unified Prompt Template ---
  private createUnifiedPrompt(context: MessageContext): string {
    const { user, tasks, facts, previousMessages, currentDateTime, messageType, systemRequestType, userResponse, functionResults, taskDetails } = context;
    const userId = user.id;

    // Construct the system prompt portion
    const prompt = `You are an expert AI Assistant Coach specialized in helping users with ADHD manage their tasks, schedule, and well-being.\nCurrent User ID: ${userId}\nCurrent Time (${user.timeZone || 'UTC'}): ${currentDateTime}\n\nUSER PROFILE:\n- Username: ${user.username}\n- Email: ${user.email} ${user.isEmailVerified ? '(Verified)' : '(Not Verified)'}\n- Phone: ${user.phoneNumber || 'Not provided'} ${user.isPhoneVerified ? '(Verified)' : '(Not Verified)'}\n- Contact Preference: ${user.contactPreference}\n- Schedule: Wake ${user.wakeTime}, Start Routine ${user.routineStartTime}, Sleep ${user.sleepTime}\n- Preferred LLM: ${user.preferredModel}\n\nUSER FACTS:\n${facts.length > 0 ? facts.map((fact) => `- ${fact.category}: ${fact.content}`).join("\n") : "No specific facts known."}\n\nActive Tasks (for context, use functions to get latest status/details):\n${tasks.length > 0 ? tasks.filter(t => t.status === 'active').map((task) => `- ID:${task.id} | ${task.title} | Type: ${task.taskType}${task.scheduledTime ? ` | Scheduled: ${task.scheduledTime}` : ""}`).join("\n") : "No active tasks."}\n\nAVAILABLE FUNCTIONS:\n- \`get_task_list({ status: 'active'|'completed'|'all' = 'active' })\`: Retrieves the user's tasks. Default status is 'active'.\n- \`create_task({ title: string, description?: string, taskType: 'regular'|'personal_project'|'long_term_project'|'life_goal', priority?: number (1-5), estimatedDuration?: string ('30m', '2h', '1d', '1w', '1M', '1y'), deadline?: string (ISO8601), scheduledTime?: string ('HH:MM'), recurrencePattern?: string ('daily', 'weekly:1,3,5', 'monthly:15', 'none') })\`: Creates a new task.\n    - **IMPORTANT (Scheduling & Recurrence)**: If a task is time-sensitive (e.g., 'Take medication') or the user wants it to repeat, ask for clarification:\n        - For timing: \"What time should this be scheduled for (e.g., 9am, 14:30)?\" (Provide \`scheduledTime\` argument)\n        - For recurrence: \"Should this task repeat? If so, how often (e.g., daily, specific weekdays, monthly)?\" (Provide \`recurrencePattern\` argument: 'daily', 'weekly:1,3,5', 'monthly:15').\n        - **If the user doesn't specify recurrence, assume it's a one-off task and use \`recurrencePattern: 'none'\`.**\n        - A recurring task usually needs a \`scheduledTime\`. If recurrence is given but time is missing, ask for the time.\n    - **IMPORTANT (Projects/Goals)**: If \`taskType\` is 'personal_project', 'long_term_project', or 'life_goal', follow this sequence:\n        1. Ask for \`description\` AND overall \`estimatedDuration\` (e.g., '2w', '3M', '1y').\n        2. WAIT for the user's response.\n        3. THEN, **suggest** 3-5 relevant initial subtasks with estimated durations/deadlines based on the description and overall duration. Ask the user to confirm or modify these suggestions.\n        4. WAIT for the user's response confirming or modifying the subtasks.\n        5. FINALLY, call \`create_task\` with the title, description, and duration, then call \`create_subtask\` for each confirmed/modified subtask.\n- \`update_task({ taskId: number, updates: { title?: string, description?: string, status?: 'active'|'completed'|'archived', priority?: number, estimatedDuration?: string, deadline?: string, scheduledTime?: string, recurrencePattern?: string } })\`: Updates an existing task. **Requires** \`taskId\` and an \`updates\` object containing the fields to change. Example: \`{ "taskId": 123, "updates": { "status": "completed" } }\`.\n- \`delete_task({ taskId: number })\`: Deletes a task. Requires \`taskId\`.\n- \`create_subtask({ parentTaskId: number, title: string, description?: string, estimatedDuration?: string })\`: Adds a subtask to a parent task. Requires \`parentTaskId\` and \`title\`.
- \`update_subtask({ subtaskId: number, updates: { title?: string, description?: string, status?: 'active'|'completed'|'archived', estimatedDuration?: string, ... } })\`: Updates an existing subtask. **Requires** \`subtaskId\` and an \`updates\` object containing the fields to change.
- \`delete_subtask({ subtaskId: number, parentTaskId: number })\`: Deletes a subtask. **Requires** both \`subtaskId\` and \`parentTaskId\`.
- \`get_user_facts({ category?: 'life_event'|'core_memory'|...|'custom' })\`: Retrieves known facts about the user, optionally filtered by category.
- \`add_user_fact({ factType: string, category: 'life_event'|'core_memory'|...|'custom', content: string })\`: Adds a new fact about the user.
- \`propose_daily_schedule({ date: string (YYYY-MM-DD) })\`: Generates a proposed schedule for the user for a specific date. Output the schedule clearly in the 'message' field, marked with \"PROPOSED_SCHEDULE_AWAITING_CONFIRMATION\".
- \`mark_task_skipped_today({ taskId: number })\`: Marks a task as skipped for today. Use this when the user explicitly says they didn't do a task today.
\nIMPORTANT NOTES & WORKFLOW:\n1.  **PRIORITY OF INFORMATION**: Function results provided in the conversation history (FUNCTION EXECUTION RESULTS section below) are the MOST current state. Always use the data from the latest function result for tasks, facts, etc., over older messages or your internal knowledge.\n2.  **Task Management**:\n    *   Before creating ANY task, ALWAYS call \`get_task_list({ status: \'active\' })\` to check if a similar task already exists. Ask the user if they want to proceed if duplicates are found.\n    *   Ensure \`taskType\` is one of the valid values: \'regular\', \'personal_project\', \'long_term_project\', \'life_goal\'. If the user is vague, ask them to clarify the type.\n    *   **Follow the specific instructions within the \`create_task\` description regarding asking for \`scheduledTime\` and \`recurrencePattern\` for regular tasks, and the multi-step process for projects/goals.**\n3.  **Function Result Handling (VERY IMPORTANT!)**: \n    *   After a function is executed, its results appear in the FUNCTION EXECUTION RESULTS section.\n    *   If a function like \`create_task\` or \`update_task\` was successful (e.g., result contains \`{\"success\": true, ...\`}), your response to the user MUST simply confirm the action based on the result (e.g., \"Okay, I\'ve created the task '[Task Title]'.\"). \n    *   **DO NOT** re-check for duplicates or ask to perform the same action again immediately after seeing a success result for that action.\n    *   If the function result indicates an error (e.g., \`{\"error\": ...\`}), inform the user about the error.\n    *   If the function returned data (like \`get_task_list\`), use that data to inform your *next* step (e.g., check the list for duplicates before deciding whether to ask the user or call \`create_task\`).\n4.  **Fact Management**: Use \`get_user_facts\` to recall information. Use \`add_user_fact\` to store new persistent information learned about the user during conversation.\n5.  **Scheduling**: Use \`propose_daily_schedule\` to generate structured plans. Your schedule proposal *must* be included in the \`message\` field of your JSON response and clearly marked.\n\nRESPONSE FORMAT (CRITICAL):\nYour output MUST be a single JSON object with the following potential keys:\n- "message": (string, Required) The conversational text response to the user.\n- "function_call": (object, Optional) If a function needs to be called. Structure: { "name": "function_name", "arguments": { "arg1": "value1", ... } }\n- "scheduleUpdates": (array, Optional) List of schedule items to create/update. Use this ONLY if the user explicitly confirms a proposed schedule or asks for direct item modifications. Structure: [{ id?: number, date: string (YYYY-MM-DD), taskId?: number | string, subtaskId?: number, title: string, startTime: string (HH:MM), endTime?: string (HH:MM), status?: string, action?: 'create'|'update'|'delete'|'skip' }]\n- "scheduledMessages": (array, Optional) List of messages to schedule. Structure: [{ type: 'follow_up'|'reminder', title: string, content?: string, scheduledFor: string (ISO8601 or "HH:MM" for today), metadata?: object }]\n\nGoal/Instruction:\n`;

    // Determine the goal instruction based on message type
    let goalInstruction = "";
    const specificTaskInfo = taskDetails ? ` for the task: \"${taskDetails.taskTitle}\" (ID: ${taskDetails.taskId}) scheduled at ${taskDetails.taskScheduledTime}` : "";

    switch (messageType) {
      case "morning":
        // Corrected multi-line template literal
        goalInstruction = `Generate the morning summary and plan for ${currentDateTime.split(",")[0]}. 
Review the user's active non-daily tasks (personal projects, long-term projects, life goals) listed in the context. 
Ask the user if they want to dedicate time today to work on any specific project or goal, perhaps suggesting one or two based on recent activity or priority. 
Then, propose a daily schedule using 'propose_daily_schedule', incorporating any daily tasks and any project work the user wants to schedule. Your response MUST be JSON.`;
        break;
      case "reschedule":
        goalInstruction = `User wants help rescheduling tasks or their day. Analyze their request and the current tasks/schedule. If appropriate, propose a new schedule using 'propose_daily_schedule'. Your response MUST be JSON.`;
        break;
      case "system_request":
        // --- Updated instructions for system requests (reminders, follow-ups) ---
        let intentDescription = "";
        let taskFocus = taskDetails ? ` for task "${taskDetails.taskTitle}" (ID: ${taskDetails.taskId})` : "";
        
        switch (systemRequestType) {
            case 'task_pre_reminder': 
                intentDescription = `You are about to send a PRE-REMINDER${taskFocus}.`; 
                break;
            case 'task_reminder': 
                intentDescription = `You are about to send an ON-TIME REMINDER${taskFocus}.`; 
                break;
            case 'task_post_reminder_follow_up': 
                intentDescription = `You are about to send a quick FOLLOW-UP asking if the user completed the task${taskFocus}, shortly after its scheduled time.`; 
                break;
            case 'task_follow_up': 
                intentDescription = `You are about to send a general FOLLOW-UP asking about the task${taskFocus}, as it seems overdue.`; 
                break;
            default:
                 intentDescription = `This is a system-initiated request for: ${systemRequestType}.`;
        }
        
        goalInstruction = `${intentDescription}

IMPORTANT EVALUATION:
1. Review the recent conversation history provided below.
2. Based ONLY on the recent messages, is sending this specific ${systemRequestType} message still relevant and appropriate? (Consider: Did the user recently say they already completed this task? Did they reschedule it for much later today? Did they say they skipped it today?)

YOUR ACTION:
- If YES (Message is still relevant): Generate the appropriate brief, friendly message content in the "message" field of your JSON response. Focus ONLY on the specific task mentioned.
- If NO (Message is NO LONGER relevant due to recent conversation): Respond with ONLY the following exact JSON object: { "message": null }

Your response MUST be JSON.`;
        // --- End updated instructions ---
        break;
      case "response":
      default:
        // Updated instruction for handling user responses, including schedule adjustments
        goalInstruction = `Respond to the user's latest message: "${userResponse}". Address their request, manage tasks/schedule, or ask clarifying questions as needed based on the workflow. 

IMPORTANT: Schedule Adjustment Logic:
1. Analyze if the user response indicates a change of plan for a specific task **for today only**. Examples: "I'll do the 10am task later at 3pm", "I actually finished Task X already", "Can't do Task Y today".
2. **DO NOT** call 'update_task' for these temporary changes unless the user explicitly asks to change the task's default time, recurrence, or other core details.
3. If the user indicates a change for **today**:
    a. Identify the relevant 'taskId'.
    b. Call 'get_scheduled_messages({taskId: <task_id>, status: "pending"})' to find pending reminders/follow-ups for that task scheduled for today.
    c. If irrelevant pending messages are found (e.g., a 10:15am follow-up when the user says they'll do it at 3pm), call 'cancel_scheduled_message({scheduleId: <id_from_get>})' for each one.
    d. If the user specified a **new time for today** (e.g., "at 3pm"), calculate the corresponding UTC timestamp in ISO8601 format (YYYY-MM-DDTHH:mm:ssZ) and call 'schedule_one_off_reminder({taskId: <task_id>, remindAt: "<ISO_timestamp>"})'.
    e. If the user indicates they **skipped or cannot do** the task today, call 'mark_task_skipped_today({taskId: <task_id>})' INSTEAD of cancelling/rescheduling reminders.
    f. If the user says they **already completed** the task, call 'update_task({ taskId: <task_id>, updates: { status: "completed" } })'.
4. **CRITICAL:** Use ONLY the functions listed above (get_scheduled_messages, cancel_scheduled_message, schedule_one_off_reminder, mark_task_skipped_today, update_task) for these adjustments. **DO NOT use the 'scheduleUpdates' field** in your JSON response for these temporary, same-day changes.
5. Inform the user about the actions taken using the specific function calls.

Your response MUST be JSON.`;
    }

    // Include function results if available from a previous loop iteration
    const functionResultText = functionResults
      ? `\n\nFUNCTION EXECUTION RESULTS:\nYou previously called functions and received these results:\n${JSON.stringify(functionResults, null, 2)}\nCRITICAL: Use these results to formulate your response. If the result shows a successful task creation/update (e.g., \`success: true\`), STOP, DO NOT perform further checks (like \`get_task_list\` for duplicates), and simply confirm the success to the user based on this result.`
      : "";

    // Combine prompt, goal, and function results
    return `${prompt}${goalInstruction}${functionResultText}`;
  }

  // --- New Core LLM Interaction Function ---
  private async generateUnifiedResponse(
    userId: number,
    prompt: string,
    conversationHistory: StandardizedChatCompletionMessage[]
  ): Promise<StandardizedChatCompletionMessage> {
    const preferredModel = await this.getUserPreferredModel(userId);
    console.log(`Using user's preferred model: ${preferredModel} for unified response`);

    // --- Provider Selection Logic ---
    let provider: LLMProvider;
    let effectiveModel = preferredModel;

    if (preferredModel.startsWith("gemini-")) {
      console.log("Selecting GCloudProvider for Gemini model.");
      provider = gcloudProvider; // Use the imported gcloudProvider
      effectiveModel = preferredModel; // Pass the specific gemini model name
    } else if (preferredModel.startsWith("gpt-") || preferredModel.startsWith("o1-") || preferredModel.startsWith("o3-")) { // Added o3-mini check
      console.log("Selecting OpenAIProvider for OpenAI model.");
      provider = openAIProvider;
      effectiveModel = preferredModel;
    } else {
      console.error(`Unsupported model prefix: ${preferredModel}. Falling back to OpenAI default.`);
      provider = openAIProvider; // Default fallback
      effectiveModel = "gpt-4o"; // Default fallback model
    }

    // --- Prepare Messages (Adjust for Provider Needs if Necessary) ---
    const messages: StandardizedChatCompletionMessage[] = [];
    let requiresJson = false;
    let systemPrompt = prompt; // Base system prompt

    // Adjust message preparation based on the *selected* provider
    if (provider === openAIProvider && !effectiveModel.startsWith("o1-") && !effectiveModel.startsWith("o3-")) {
      // Use system role for capable OpenAI models
      messages.push({ role: "system", content: systemPrompt });
      messages.push(...conversationHistory);
      requiresJson = true; // Assume capable OpenAI models should use JSON mode
      console.log("[generateUnifiedResponse] Using system role for OpenAI model.");
    } else if (provider === gcloudProvider) {
      // Gemini handles system instructions differently. Often combined or passed separately.
      // For now, let's combine it into the first message content if history exists,
      // or send it as the first user message if history is empty.
      // We also filter out the 'system' role message from history for Gemini.
      const geminiHistory = conversationHistory.filter(m => m.role !== 'system');
      if (geminiHistory.length > 0 && geminiHistory[0].role === 'user') {
          // Prepend system prompt to the first user message
          geminiHistory[0].content = `${systemPrompt}\n\n${geminiHistory[0].content}`;
          messages.push(...geminiHistory);
        } else {
          // If history starts with assistant or is empty, send system prompt as first user message
          messages.push({ role: 'user', content: systemPrompt });
          messages.push(...geminiHistory);
      }
      requiresJson = true; // Gemini supports JSON mode via mimeType
      console.log("[generateUnifiedResponse] Preparing messages for GCloud/Gemini model.");

    } else {
      // Fallback for o1-mini / o3-mini (OpenAI) - Combine system prompt
      const historyString = conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n---\n');
      const combinedFirstMessage = `${systemPrompt}\n\nConversation History:\n${historyString}\n\nRespond to the last user message:`;
      messages.push({ role: "user", content: combinedFirstMessage });
      requiresJson = false; // o1/o3 mini don't reliably support JSON mode
      console.log("[generateUnifiedResponse] Combining system prompt for OpenAI Mini model.");
    }

    // --- Set Temperature ---
    const temperature = (effectiveModel.startsWith("o1-") || effectiveModel.startsWith("o3-")) ? undefined : 0.7;

    // DEBUG: Log parameters before calling provider
    console.log("\n===== MESSAGING DEBUG: PROVIDER CALL PARAMS =====");
    console.log(`Provider: ${provider.constructor.name}`);
    console.log(`Model: ${effectiveModel}`);
    console.log(`Temperature: ${temperature ?? 'Provider Default'}`);
    console.log(`Request JSON: ${requiresJson}`);
    console.log(`Message Count: ${messages.length}`);
    // console.log("Messages:", JSON.stringify(messages, null, 2)); // Uncomment for deep debugging
    console.log("============================================\n");

    // --- Call the Provider ---
    try {
      const responseMessage = await provider.generateCompletion(
        effectiveModel,
        messages,
        temperature,
        requiresJson,
        llmFunctionDefinitions // Pass function definitions
      );

      // DEBUG: Log provider response
      console.log("\n===== MESSAGING DEBUG: PROVIDER RESPONSE =====");
      console.log(`Role: ${responseMessage.role}`);
      console.log(`Has Content: ${!!responseMessage.content}`);
      console.log(`Tool Calls: ${responseMessage.tool_calls?.length || 0}`);
      // console.log("Raw Content:", responseMessage.content); // Uncomment for deep debugging
      console.log("==========================================\n");

      return responseMessage;

        } catch (error) {
        console.error(`[generateUnifiedResponse] Error during provider execution:`, error);
          return {
            role: "assistant",
            content: `{ "message": "Sorry, I encountered an error communicating with the AI service." }`,
            name: undefined,
            tool_calls: undefined
        };
    }
  }

  // --- Refactored handleUserResponse (Main Orchestrator) ---
  async handleUserResponse(userId: number, userMessageContent: string): Promise<string | null> {
    console.log(`Processing response from user ${userId}: "${userMessageContent.substring(0, 50)}..."`);

    const now = new Date(); // Get current time once

    // 1. Store User Message & Update User Timestamp
    await db.insert(messageHistory).values({ userId, content: userMessageContent, type: "user_message", status: "received", createdAt: now });
    await db.update(users).set({ last_user_initiated_message_at: now }).where(eq(users.id, userId)); // Update the timestamp
    console.log(`Updated last_user_initiated_message_at for user ${userId}`);

    // 2. Prepare Initial Context & History
    const user = await storage.getUser(userId);
    if (!user) { console.error(`User not found: ${userId}`); return null; }
    const userTasks = await storage.getTasks(userId); // Get current tasks for context
    const userFacts = await storage.getKnownUserFacts(userId);
    const dbHistory = await db.select().from(messageHistory).where(eq(messageHistory.userId, userId)).orderBy(desc(messageHistory.createdAt)).limit(20);

    // Convert DB history to Standardized format, adding localized timestamp
    let conversationHistory: StandardizedChatCompletionMessage[] = dbHistory.map(msg => {
          // ---> Change the format to include the date
          const timestamp = `(${(formatInTimeZone(msg.createdAt, user.timeZone || 'UTC', 'MMM d, h:mm a'))}) `; // e.g., (Apr 18, 9:15 AM)
          // <--- End format change
          return {
            role: (msg.type === "user_message" || msg.type === "system_request") ? "user" as const : "assistant" as const,
            content: `${timestamp}${msg.content || ""}`, // Prepend timestamp
            name: undefined,
            tool_calls: undefined
        };
    }).reverse();

    // Add current user message (without timestamp, as it's the latest)
    conversationHistory.push({ role: "user", content: userMessageContent, name: undefined });

    let messageContext: MessageContext = { // Initial context for the *first* prompt
        user,
        tasks: userTasks,
        facts: userFacts,
        previousMessages: dbHistory, // Keep original format for prompt generation function
        currentDateTime: new Date().toLocaleString("en-US", { timeZone: user.timeZone || undefined, dateStyle: "full", timeStyle: "long" }),
        messageType: "response",
        userResponse: userMessageContent,
    };

    // 3. LLM Interaction Loop
    let loopCount = 0;
    const MAX_LOOPS = 25;
    let currentFunctionResults: Record<string, any> | undefined = undefined;
    let finalAssistantMessage: string | null = null;

    while (loopCount < MAX_LOOPS) {
        loopCount++;
        console.log(`Unified Response Loop - Iteration ${loopCount}`);

        // A. Update context with function results
        messageContext.functionResults = currentFunctionResults;
        if (currentFunctionResults) {
            console.log(`\n--- Function Results Provided to LLM for Iteration ${loopCount} ---`);
            console.log(JSON.stringify(currentFunctionResults, null, 2));
            console.log("----------------------------------------------------\n");
        }

        // B. Build the prompt
        const currentPrompt = this.createUnifiedPrompt(messageContext);

        // C. Call the LLM using the new abstracted function
        const assistantResponseObject = await this.generateUnifiedResponse(userId, currentPrompt, conversationHistory);
        // Raw content is now directly from the standardized response
        const assistantRawContent = assistantResponseObject.content || `{ "message": "Error: Received empty response from LLM." }`;

        // D. Process the LLM's JSON Content String (using existing function)
        const processedResult = this.processLLMResponse(assistantRawContent);

        // E. Add the assistant's message to history (Standardized Format)
        conversationHistory.push({
            role: "assistant",
            content: processedResult.message, 
            name: undefined,
            // We won't directly use tool_calls from the response object for function execution anymore
            // but might keep it for history reconstruction later if needed.
            tool_calls: assistantResponseObject.tool_calls 
        });

        // F. Check for Function Call Request (ONLY check the parsed JSON content)
        let functionName: string | undefined = undefined;
        let functionArgs: Record<string, any> | undefined = undefined;

        // Mechanism: Check function_call parsed from JSON content (processLLMResponse)
        if (processedResult.function_call && processedResult.function_call.name) {
            functionName = processedResult.function_call.name;
            functionArgs = processedResult.function_call.arguments || {}; // Already parsed
            console.log(`LLM requested function call via JSON content: ${functionName}`);
    } else {
            // Log if no function call was found in the parsed content
            console.log("No function_call found in processed LLM response content.");
        }

        // --- Proceed if a function call was detected --- 
        if (functionName && functionArgs !== undefined) {
            // G. Execute Function and Collect Results
            // (Existing logic remains the same)
            let executionResult: any;
            let functionResultMessageContent = "";

            try {
                console.log(`Executing function: ${functionName} with args: `, functionArgs);
                const funcToExecute = llmFunctionExecutors[functionName];
                if (typeof funcToExecute === 'function') {
                    executionResult = await funcToExecute({ userId: userId, messagingService: this }, functionArgs);
                    console.log(`Function ${functionName} result: `, executionResult);
                    functionResultMessageContent = JSON.stringify(executionResult);
                } else {
                    console.warn(`Unknown function called: ${functionName}`);
                    executionResult = { error: `Unknown function: ${functionName}` };
                    functionResultMessageContent = JSON.stringify(executionResult);
                }
          } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Error executing function ${functionName}: `, error);
                executionResult = { error: `Error executing function ${functionName}: ${errorMessage}` };
                functionResultMessageContent = JSON.stringify(executionResult);
            }

            // H. Add Function Result to History
            conversationHistory.push({
                role: "function",
                name: functionName,
                content: functionResultMessageContent,
            });

            // I. Store results for next prompt context
            currentFunctionResults = { [functionName]: executionResult };

            // J. Continue loop
            continue;

      } else {
            // --- No Function Call Detected - Final Response ---
            console.log("LLM provided final response (no function_call in content). Processing final actions.");
            finalAssistantMessage = processedResult.message;
            
            // ---> NEW: Post-process message for WhatsApp formatting
            if (finalAssistantMessage) {
                // Replace Markdown bold (**) with WhatsApp bold (*)
                // Using regex to capture content between double asterisks
                finalAssistantMessage = finalAssistantMessage.replace(/\*\*(.*?)\*\*/g, '*$1*');
                console.log("[Formatting] Applied WhatsApp bold conversion.");
            }
            // <--- END NEW

            // --- Keep existing K, L, M, N steps for final processing ---
            // K. Perform Actions based on Final Processed Result
            // ... (rest of the code) ...
            const isConfirmation = processedResult.message.includes(FINAL_SCHEDULE_MARKER); // Check usage
            const isProposal = processedResult.message.includes("PROPOSED_SCHEDULE_AWAITING_CONFIRMATION");
            let finalMetadata: any = {};
            // ...(rest of schedule/message/sentiment handling)... 
            if (processedResult.scheduleUpdates && processedResult.scheduleUpdates.length > 0) {
                 if (isConfirmation) {
                     console.log(`Processing ${processedResult.scheduleUpdates.length} confirmed schedule updates based on marker: ${FINAL_SCHEDULE_MARKER}`); // Log usage
                     await this.processScheduleUpdates(userId, processedResult.scheduleUpdates);
                      await db.insert(messageHistory).values({ userId, content: "✅ Schedule confirmed! Your tasks are updated.", type: "system_notification", status: "sent", createdAt: new Date() });
                 } else if (isProposal) {
                      console.log("Storing proposed schedule updates in metadata, not processing yet.");
                      finalMetadata.scheduleUpdates = processedResult.scheduleUpdates;
        } else {
                      console.log(`Processing ${processedResult.scheduleUpdates.length} updates from regular response.`);
                      await this.processScheduleUpdates(userId, processedResult.scheduleUpdates);
                      await db.insert(messageHistory).values({ userId, content: "✅ Okay, I've updated your tasks.", type: "system_notification", status: "sent", createdAt: new Date() });
                 }
            } else if (isConfirmation) {
                  console.log(`Processing schedule confirmation based ONLY on marker: ${FINAL_SCHEDULE_MARKER} (no explicit updates in final JSON).`); // Log usage
                  await db.insert(messageHistory).values({ userId, content: "✅ Schedule confirmed!", type: "system_notification", status: "sent", createdAt: new Date() });
            }
            if (processedResult.scheduledMessages && processedResult.scheduledMessages.length > 0) {
                 console.log(`Processing ${processedResult.scheduledMessages.length} scheduled messages.`);
                 await this.processScheduledMessages(userId, processedResult.scheduledMessages);
            }

            // L. Save Final Assistant Message to History
            // ... (existing logic using finalAssistantMessage and finalMetadata) ...
            console.log(`[DEBUG] Saving final assistant message to DB. Content: "${finalAssistantMessage}"`);
            let metadataToSave = finalMetadata; 
            try {
                const insertResult = await db.insert(messageHistory).values({
                   userId: userId,
                   content: finalAssistantMessage,
                   type: "coach_response",
                   status: "sent",
                   metadata: Object.keys(metadataToSave).length > 0 ? metadataToSave : undefined,
                   createdAt: new Date(),
                }).returning({ insertedId: messageHistory.id });
                console.log(`[DEBUG] Successfully inserted coach_response message with ID: ${insertResult[0]?.insertedId}`);
            } catch (dbError) {
                console.error(`[CRITICAL] Failed to save final assistant message to DB for user ${userId}: `, dbError);
            }

            // M. Send Final Message to User
            // If user has a verified phone number, send the response via WhatsApp
            // regardless of original contact preference, to keep chats synced.
             if (user.phoneNumber) { // Maybe add && user.isPhoneVerified later if needed
                 console.log(`[Sync] Attempting to send final response to WhatsApp for user ${userId}`);
                 await this.sendWhatsAppMessage(user.phoneNumber, finalAssistantMessage);
             }

            // N. Exit Loop
                break;
        }
    } // End while loop
    // ...(rest of handleUserResponse - loop limit check, return finalAssistantMessage)
    if (loopCount >= MAX_LOOPS) {
      console.error(`Max loops (${MAX_LOOPS}) reached for user ${userId}. Aborting.`);
      const fallbackMsg = "Sorry, I got stuck trying to process that. Could you try rephrasing?";
       await db.insert(messageHistory).values({ userId, content: fallbackMsg, type: "coach_response", status: "sent", createdAt: new Date() });
       if (user.phoneNumber && user.contactPreference === "whatsapp") {
          await this.sendWhatsAppMessage(user.phoneNumber, fallbackMsg);
       }
    }
    return finalAssistantMessage;
  }

  // --- Refactored handleSystemMessage ---
  async handleSystemMessage(
    userId: number,
    systemRequestType: string, // Now just string
    contextData: Record<string, any> = {},
  ): Promise<string> { // Returns the message content for potential immediate use
    logger.info({ userId, systemRequestType, contextData }, `Handling system message`); // Use logger
    try {
      // 1. Prepare Context (Fetch user WITH the new timestamp field)
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(res => res[0]); // Fetch directly
      if (!user) throw new Error(`User ${userId} not found`);
      
      const userTasks = await storage.getTasks(userId);
      const userFacts = await storage.getKnownUserFacts(userId);
      const dbHistory = await db.select().from(messageHistory).where(eq(messageHistory.userId, userId)).orderBy(desc(messageHistory.createdAt)).limit(20);

      const currentDateTime = new Date().toLocaleString("en-US", { timeZone: user.timeZone || undefined, dateStyle: "full", timeStyle: "long" });

      // Map system message type for prompt generation context
      let contextType: MessageContext['messageType'] = 'system_request';
      if (systemRequestType === 'morning_summary') contextType = 'morning';
      else if (systemRequestType === 'reschedule_request') contextType = 'reschedule';

      const messageContext: MessageContext = {
        user,
        tasks: userTasks,
        facts: userFacts,
        previousMessages: dbHistory,
        currentDateTime,
        messageType: contextType,
        systemRequestType: systemRequestType,
        userResponse: contextData.userRequest || undefined,
        taskDetails: contextData.taskDetails 
      };

      // Prepare conversation history for LLM
      let conversationHistory: StandardizedChatCompletionMessage[] = dbHistory.map(msg => {
         const timestamp = `(${(formatInTimeZone(msg.createdAt, user.timeZone || 'UTC', 'h:mm a'))}) `;
         return {
         role: (msg.type === "user_message" || msg.type === "system_request") ? "user" as const : "assistant" as const,
           content: `${timestamp}${msg.content || ""}`,
         }
      }).reverse();
       conversationHistory.push({ role: "user", content: `System Request: Initiate ${systemRequestType}` });

      // Generate LLM response
      const prompt = this.createUnifiedPrompt(messageContext);
      const assistantMessage = await this.generateUnifiedResponse(userId, prompt, conversationHistory);
      const finalContent = assistantMessage.content || `{ "message": "System message generation failed." }`;
      const processedResult = this.processLLMResponse(finalContent);

      if (processedResult.message === null) {
          // Log skip with logger
          logger.info({ userId, systemRequestType, scheduleId: contextData.messageScheduleId }, `LLM determined message no longer relevant. Skipping send.`);
          return ""; 
      }

      let messageToUser: string = processedResult.message; // Message is guaranteed non-null here
      messageToUser = messageToUser.replace(/\*\*(.*?)\*\*/g, '*$1*');
      logger.debug({ userId, systemRequestType }, `Generated system message content (pre-send): ${messageToUser.substring(0,100)}...`); // Debug log

      // 4. Perform Actions (Save Message, Send to User) only if there's content
       const finalMetadata: any = { systemInitiated: true, type: systemRequestType };

      // Store proposal updates if present
        if (processedResult.scheduleUpdates && systemRequestType === 'reschedule_request') {
            finalMetadata.scheduleUpdates = processedResult.scheduleUpdates;
            console.log("Storing proposed schedule updates from system message.");
        }
        // Process scheduled messages immediately if generated
        if (processedResult.scheduledMessages && processedResult.scheduledMessages.length > 0) {
            await this.processScheduledMessages(userId, processedResult.scheduledMessages);
        }

      // ---> Save to History only if messageToUser is a non-empty string AFTER formatting
      let savedMessageId: number | null = null;
      if (messageToUser && messageToUser.trim().length > 0) {
          const insertResult = await db.insert(messageHistory).values({
        userId,
            content: messageToUser, // Save the non-empty string
            type: "coach_response",
            status: "generated", // Change status initially to 'generated'
        metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
        createdAt: new Date(),
          }).returning({ insertedId: messageHistory.id });
          savedMessageId = insertResult[0]?.insertedId;
          // Log save with logger
          logger.info({ userId, messageId: savedMessageId, status: 'generated' }, `Saved generated system message to history.`);
      } else {
          logger.warn({ userId, systemRequestType }, "Skipping database insert for empty system message content."); // Warn if empty
      }
      // <--- End DB insert block

      // ---> Conditional Sending Logic (Regular vs Template)
      const shouldAttemptSend = systemRequestType === 'morning_summary' || systemRequestType === 'reschedule_request' || systemRequestType.startsWith('task_'); 
      let sentVia: 'regular' | 'template' | 'none' = 'none'; // Track how message was sent
      let sendError: string | null = null;

      if (user.phoneNumber && shouldAttemptSend && savedMessageId) { // Only attempt send if message was generated and saved
          const now = new Date();
          const lastUserMessageTime = user.last_user_initiated_message_at;
          const twentyThreeHalfHoursInMillis = 23.5 * 60 * 60 * 1000;
          let useTemplate = false;

          if (lastUserMessageTime) {
              const timeDiff = now.getTime() - new Date(lastUserMessageTime).getTime();
              if (timeDiff > twentyThreeHalfHoursInMillis) {
                  useTemplate = true;
                  console.log(`[handleSystemMessage] User ${userId} last message > 23.5 hours ago. Attempting to use template.`);
              }
    } else {
              useTemplate = true;
              console.log(`[handleSystemMessage] User ${userId} has no last message time recorded. Using template.`);
          }

          if (useTemplate) {
              const templateInfo = this.templateMap[systemRequestType];
              if (templateInfo) {
                  let bodyVariables: string[] = [];
                  const userName = user.firstName || 'there';
                  try {
                       // --- Variable preparation logic based on systemRequestType ---
                       if (['schedule_proposal_v1', 'morning_summary', 'morning_brief'].includes(systemRequestType)) {
                           const summary = messageToUser.length > 200 ? messageToUser.substring(0, 197) + "..." : messageToUser;
                           bodyVariables = [userName, summary];
                       } else if (['task_completion_check_v1', 'task_follow_up', 'task_post_reminder_follow_up'].includes(systemRequestType)) {
                           const taskTitle = contextData.taskDetails?.taskTitle || "your task";
                           const scheduledTime = contextData.taskDetails?.taskScheduledTime || "earlier";
                           bodyVariables = [userName, taskTitle, scheduledTime];
                       } else if (['task_reminder_now_v1', 'task_reminder'].includes(systemRequestType)) {
                           const taskTitle = contextData.taskDetails?.taskTitle || "your task";
                           const scheduledTime = contextData.taskDetails?.taskScheduledTime || "now";
                           const reminderContent = messageToUser.includes(taskTitle) ? messageToUser : `It's time for \"${taskTitle}\"`;
                           bodyVariables = [userName, reminderContent, scheduledTime];
                       } else if (systemRequestType === 'task_pre_reminder_v1') {
                           const taskTitle = contextData.taskDetails?.taskTitle || "your upcoming task";
                           const scheduledTime = contextData.taskDetails?.taskScheduledTime || "soon";
                           bodyVariables = [userName, taskTitle, scheduledTime];
                       } else {
                           console.warn(`[handleSystemMessage] Template mapping for ${systemRequestType} fallback. Variables: name, summary.`);
                           const fallbackSummary = messageToUser.length > 100 ? messageToUser.substring(0, 97) + "..." : messageToUser;
                           bodyVariables = [userName, fallbackSummary];
                       }
                       // ---------------------------------------------------------------

                       // Ensure correct variable count
                       while (bodyVariables.length < templateInfo.variables) bodyVariables.push("-");
                       bodyVariables = bodyVariables.slice(0, templateInfo.variables);
                       
                       const templateSent = await this.sendWhatsAppTemplateMessage(user.phoneNumber, templateInfo.sid, bodyVariables);
                       if(templateSent) sentVia = 'template'; else sendError = 'Template send failed';
                   } catch (varError: any) {
                       sendError = `Error preparing template variables: ${varError.message}`;
                       console.error(`[handleSystemMessage] ${sendError}`);
                   }
              } else {
                  sendError = `No template mapping for ${systemRequestType}`;
                  console.error(`[handleSystemMessage] ${sendError}. Cannot send message outside 24h window.`);
              }
          } else {
              // Within 24h window, send regular message
              console.log(`[Sync] Attempting to send regular system-initiated message (${systemRequestType}) to WhatsApp for user ${userId}`);
              const regularSent = await this.sendWhatsAppMessage(user.phoneNumber, messageToUser);
              if(regularSent) sentVia = 'regular'; else sendError = 'Regular send failed';
          }

          // Determine final status based on send result
          let finalStatus = 'failed_send';
          if (sentVia !== 'none') {
               finalStatus = 'sent';
          } else if (sendError?.includes('No template mapping')) {
               finalStatus = 'failed_window';
          }
          
          // Update DB status
          await db.update(messageHistory).set({ status: finalStatus }).where(eq(messageHistory.id, savedMessageId));
          
          // Log update with logger
          logger.info({ userId, messageId: savedMessageId, status: finalStatus, sentVia, error: sendError }, `Updated system message status after send attempt.`);

      } else {
          console.log(`System message type ${systemRequestType} generated, but not attempted to send (no phone, type mismatch, or empty content).`);
          // If message was saved but not sent, update status? Maybe keep as 'generated'?
          if (savedMessageId) {
               await db.update(messageHistory).set({ status: 'generated_not_sent' }).where(eq(messageHistory.id, savedMessageId));
               // Log not sent with logger
               logger.info({ userId, messageId: savedMessageId, status: 'generated_not_sent' }, `System message generated but not sent (no phone/type mismatch/empty).`);
          }
      }
      // <--- End conditional sending block

      return messageToUser; // Return the original generated message content

        } catch (error) {
      // Log error with logger
      logger.error({ userId, systemRequestType, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, `Error handling system message`);
      return "Sorry, I encountered an error processing the system request.";
    }
  }

  // --- Supporting Functions ---

  // processLLMResponse (Modified for in-JSON function calls)
  processLLMResponse(content: string): {
    message: string | null; // Allow message to be null
    function_call?: { 
      name: string;
      arguments: Record<string, any>;
    };
    scheduleUpdates?: ScheduleUpdate[];
    scheduledMessages?: Array<{ type: string; scheduledFor: string; content: string; title?: string; }>;
  } {
    let cleanContent = content.trim();
    // --- FIX: Remove fences FIRST ---
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.substring(7); // Remove ```json
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.substring(0, cleanContent.length - 3); // Remove trailing ```
      }
      cleanContent = cleanContent.trim(); // Trim again after removing fences
      console.log("[DEBUG] Cleaned content after fence removal:", cleanContent);
    } else if (cleanContent.startsWith("```")) { // Handle case where it might just be ```{}```
         cleanContent = cleanContent.substring(3);
         if (cleanContent.endsWith("```")) {
            cleanContent = cleanContent.substring(0, cleanContent.length - 3);
         }
         cleanContent = cleanContent.trim();
         console.log("[DEBUG] Cleaned content after fence removal (generic ```):", cleanContent);
    }
    // ------------------------------

    try {
      // Check if the *cleaned* content looks like JSON
      const looksLikeJson = cleanContent.startsWith("{") && cleanContent.endsWith("}");
      let parsed: any;
      
      if (looksLikeJson) {
        // Try standard parsing on the cleaned content
        parsed = JSON.parse(cleanContent);
    } else {
        // If it doesn't look like JSON after cleaning, treat as plain text message
        console.warn("Content did not look like JSON after cleaning, treating as plain text:", cleanContent);
        return {
          message: cleanContent, // Return the cleaned, non-JSON content as string
          function_call: undefined,
          scheduleUpdates: [],
          scheduledMessages: [],
        };
      }

      // --- Proceed with parsed JSON logic --- 

       // Extract function call if present and valid
       let functionCall = undefined;
       if (parsed.function_call && 
           typeof parsed.function_call.name === 'string' && 
           typeof parsed.function_call.arguments === 'object' &&
           parsed.function_call.arguments !== null) {
           functionCall = {
               name: parsed.function_call.name,
               arguments: parsed.function_call.arguments
           };
           console.log("Parsed function call from JSON:", functionCall);
       } else if (parsed.function_call) {
           console.warn("Parsed JSON contained an invalid 'function_call' field. Ignoring it.", parsed.function_call);
       }
       
      // ---> Correctly handle message content (string or null)
      let messageContent: string | null = parsed.message; // Assign directly

      if (messageContent === null) {
          // Explicitly handle the null case - this is valid for skipping messages
          console.log("[processLLMResponse] Parsed message content is null. Preserving null.");
      } else if (typeof messageContent !== 'string') {
          // Message is neither null nor a string - this is invalid or a fallback case
          if (functionCall) {
              console.log("[processLLMResponse] Message field invalid or missing, using function call placeholder.");
              messageContent = `[System action: Calling function '${functionCall.name}']`;
          } else {
              console.warn("Parsed JSON response lacks a valid 'message' field (string or null) and no 'function_call'. Using raw content as fallback.", cleanContent);
              messageContent = cleanContent; // Fallback to raw content as string
          }
      }
      // <--- End message content handling

      return {
        message: messageContent, // Return the string, null, or fallback string
        function_call: functionCall, 
        scheduleUpdates: Array.isArray(parsed.scheduleUpdates) ? parsed.scheduleUpdates : [],
        scheduledMessages: Array.isArray(parsed.scheduledMessages) ? parsed.scheduledMessages : [],
      };

            } catch (error: unknown) {
      console.error(`Error processing LLM response content: ${content}`, error);
      // Return a safe fallback string in case of JSON parsing errors etc.
      return {
        message: `Sorry, there was an issue processing the response: ${content}`,
        function_call: undefined,
        scheduleUpdates: [],
        scheduledMessages: [],
      };
    }
  }

  // sendWhatsAppMessage (Keep existing)
  async sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
    try {
      const MAX_MESSAGE_LENGTH = 1500;
      let messageToSend = message;

      if (message.length > MAX_MESSAGE_LENGTH) {
        messageToSend = message.substring(0, MAX_MESSAGE_LENGTH) + "\n\n[Message truncated due to length]";
        console.log(`Truncated WhatsApp message to ${to}`);
      }

      await twilioClient.messages.create({
        body: messageToSend,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${to}`,
      });
      console.log(`Successfully sent WhatsApp message to ${to}`);
      return true;
    } catch (error) {
      console.error("Failed to send WhatsApp message:", error);
      return false;
    }
  }

  // ---> NEW: Send WhatsApp Template Message
  private async sendWhatsAppTemplateMessage(
    to: string, 
    templateSid: string, 
    bodyVariables: string[] // Array of strings for {{1}}, {{2}}, etc.
  ): Promise<boolean> {
    console.log(`Attempting to send WhatsApp template ${templateSid} to ${to}`);
    try {
      // Construct the parameters for the Twilio API call
      // The `contentVariables` need to be a JSON string mapping placeholders to values
      const contentVariables = bodyVariables.reduce((acc, value, index) => {
        acc[`${index + 1}`] = value; // Creates { "1": value1, "2": value2, ... }
        return acc;
      }, {} as Record<string, string>);

      await twilioClient.messages.create({
        contentSid: templateSid,
        contentVariables: JSON.stringify(contentVariables),
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${to}`,
      });
      console.log(`Successfully sent WhatsApp template ${templateSid} to ${to}`);
      return true;
    } catch (error) {
      console.error(`Failed to send WhatsApp template ${templateSid} to ${to}:`, error);
      return false;
    }
  }
  // <--- END NEW

  // processScheduleUpdates (Keep existing)
  async processScheduleUpdates(userId: number, updates: ScheduleUpdate[]): Promise<void> {
     try {
       if (!updates || updates.length === 0) return;
       console.log(`Processing ${updates.length} schedule updates for user ${userId}`);
       const userTasks = await storage.getTasks(userId); // Fetch tasks once

      for (const update of updates) {
          let taskId = typeof update.taskId === "number" ? update.taskId : undefined;
           // Resolve task ID by name if necessary
        if (!taskId && typeof update.taskId === "string") {
          const taskName = update.taskId.toLowerCase();
             const matchedTask = userTasks.find(task => task.title.toLowerCase().includes(taskName));
          if (matchedTask) {
            taskId = matchedTask.id;
               console.log(`Resolved task name "${update.taskId}" to ID ${taskId}`);
      } else {
            console.log(`Could not find task matching name "${update.taskId}"`);
               // Option: Create task if action is 'create' and name provided?
               // if (update.action === 'create' && update.title) { ... } else { continue; }
               continue; // Skip if task not found and not creating
             }
           }

         // Process action
         if (!taskId && update.action !== 'create') {
             console.log(`Skipping update action '${update.action}' because taskId is missing.`);
             continue;
        }

        switch (update.action) {
          case "reschedule":
                 if(taskId) await storage.updateTask(taskId, userId, { scheduledTime: update.scheduledTime, recurrencePattern: update.recurrencePattern });
            break;
          case "complete":
                 if(taskId) await storage.completeTask(taskId, userId);
            break;
          case "skip":
            if (taskId) {
              console.log(`User requested to skip task ${taskId} today.`);
              try {
                // Fetch user to get timezone
                const [user] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId)).limit(1);
                const timeZone = user?.timeZone || 'UTC';
                
                // Calculate start of today in user's timezone
                const now = new Date();
                const todayStartInUserTz = startOfDay(toZonedTime(now, timeZone)); // Use startOfDay

                // Insert the skip event
                await db.insert(taskEvents).values({
                  userId: userId,
                  taskId: taskId,
                  eventType: 'skipped_today',
                  eventDate: todayStartInUserTz, // Record event for the start of the day it was skipped
                  createdAt: now,
                });
                console.log(`Inserted 'skipped_today' event for task ${taskId} for user ${userId} for date ${todayStartInUserTz.toISOString()}`);
              } catch (skipError) {
                console.error(`Error inserting skip event for task ${taskId}:`, skipError);
              }
            }
            break;
          case "create":
            if (update.title) {
                     await storage.createTask({
        userId,
                title: update.title,
                description: update.description || "",
                         taskType: TaskType.REGULAR, // Updated from DAILY
                status: "active",
                         estimatedDuration: "30 minutes", // Should this be updated? Maybe remove default?
                scheduledTime: update.scheduledTime,
                recurrencePattern: update.recurrencePattern || "none",
        });
      } else {
                    console.log("Skipping create action because title is missing.");
            }
            break;
             default:
                 console.warn(`Unknown schedule update action: ${update.action}`);
        }
      }
          } catch (error) {
       console.error(`Error processing schedule updates for user ${userId}: `, error);
     }
   }

  // processScheduledMessages (Keep existing)
   async processScheduledMessages(userId: number, messages: Array<{ type: string; scheduledFor: string; content: string; title?: string; }>): Promise<void> {
     try {
       if (!messages || messages.length === 0) return;
      console.log(`Processing ${messages.length} scheduled messages for user ${userId}`);
      const now = new Date();
      
      for (const message of messages) {
        try {
          const [hours, minutes] = message.scheduledFor.split(':').map(n => parseInt(n, 10));
          if (isNaN(hours) || isNaN(minutes)) {
             console.error(`Invalid time format: ${message.scheduledFor}`);
            continue;
          }
           const scheduledDateTime = new Date();
          scheduledDateTime.setHours(hours, minutes, 0, 0);
           // Schedule for tomorrow if time has passed today
           if (scheduledDateTime < now) scheduledDateTime.setDate(scheduledDateTime.getDate() + 1);

          await db.insert(messageSchedules).values({
            userId: userId,
            type: message.type || 'follow_up',
            title: message.title || `Follow-up at ${message.scheduledFor}`,
            scheduledFor: scheduledDateTime,
            content: message.content || 'Check-in',
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
         } catch (err) {
           console.error(`Error scheduling single message: ${err}`);
         }
       }
        } catch (error) {
       console.error(`Error processing scheduled messages batch for user ${userId}: `, error);
     }
   }

  // analyzeSentiment (Keep existing)
  private async analyzeSentiment(text: string, userId?: number): Promise<{ type: "positive" | "negative" | "neutral"; needsFollowUp: boolean; urgency: number; }> {
    let preferredModel = "gpt-4o"; // Default
    if (userId) preferredModel = await this.getUserPreferredModel(userId);

    const isMiniModel = ["o1-mini", "o3-mini"].includes(preferredModel);
    let completionParams: any = { model: preferredModel };
    const instruction = `Analyze sentiment/urgency of this ADHD coaching response. Return JSON: {"type": "positive|negative|neutral", "needsFollowUp": true|false, "urgency": 1-5}. Response: ${text}`;

    if (isMiniModel) {
        completionParams.messages = [{ role: "user", content: instruction }];
    } else {
      completionParams.messages = [
            { role: "system", content: "Analyze sentiment/urgency. Return JSON: {\"type\": \"positive|negative|neutral\", \"needsFollowUp\": true|false, \"urgency\": 1-5}"},
        { role: "user", content: text }
      ];
      completionParams.response_format = { type: "json_object" };
      completionParams.temperature = 0.3;
    }

    try {
        const response = await openai.chat.completions.create(completionParams);
        let content = response.choices[0]?.message?.content || '{}';
        // Clean potential markdown
        if (content.includes("```json")) content = content.replace(/```json\n?/g, "").replace(/```$/, "");
        const parsed = JSON.parse(content);
        // Add validation if needed
      return {
            type: parsed.type || "neutral",
            needsFollowUp: parsed.needsFollowUp !== undefined ? parsed.needsFollowUp : true, // Default to needing follow-up
            urgency: parsed.urgency || 3,
        };
    } catch (error) {
        console.error("Failed to parse sentiment response:", error);
        return { type: "neutral", needsFollowUp: true, urgency: 3 }; // Safe default
    }
  }

  // scheduleFollowUp (Keep existing)
   async scheduleFollowUp(userId: number, responseType: "positive" | "negative" | "neutral"): Promise<void> {
     try {
        const pendingFollowUps = await db.select().from(messageSchedules).where(and(eq(messageSchedules.userId, userId), eq(messageSchedules.type, "follow_up"), eq(messageSchedules.status, "pending")));
    if (pendingFollowUps.length > 0) {
          console.log(`User ${userId} already has pending follow-up.`);
        return;
      }
        const delayMinutes = responseType === "negative" ? 30 : responseType === "neutral" ? 60 : 120;
        const scheduledFor = new Date(Date.now() + delayMinutes * 60000);

    await db.insert(messageSchedules).values({
          userId: userId, type: "follow_up", scheduledFor, status: "pending",
          metadata: { responseType } as any, createdAt: new Date(), updatedAt: new Date(),
        });
        console.log(`Scheduled ${responseType} follow-up for user ${userId} at ${scheduledFor}`);
     } catch (error) {
        console.error(`Error scheduling follow-up for user ${userId}: `, error);
     }
   }

  // --- Scheduling Logic ---

  // ---> NEW: Private helper to schedule reminders for a single task
  private async _scheduleRemindersForTask(task: Task, user: StorageUser, timeZone: string, todayStartLocal: Date, tomorrowStartLocal: Date, now: Date): Promise<number> {
    let scheduledCount = 0;
    try {
        if (!task.scheduledTime || !/^\d{2}:\d{2}$/.test(task.scheduledTime)) {
            console.log(`[_scheduleRemindersForTask] Skipping task ID ${task.id} for user ${user.id} due to invalid/missing scheduledTime: ${task.scheduledTime}`);
            return 0;
        }

        // Check if reminders for THIS SPECIFIC task exist for today
        const existingTaskReminders = await db.select({ id: messageSchedules.id }).from(messageSchedules).where(
            and(
                eq(messageSchedules.userId, user.id),
                // Ensure metadata comparison handles potential null/undefined properly
                // Using sql template with explicit cast for robustness
                sql`(${messageSchedules.metadata} ->> 'taskId')::integer = ${task.id}`,
                or( // Check any of the three types
                    eq(messageSchedules.type, 'pre_reminder'),
                    eq(messageSchedules.type, 'reminder'),
                    eq(messageSchedules.type, 'post_reminder_follow_up')
                ),
                gte(messageSchedules.scheduledFor, todayStartLocal),
                lt(messageSchedules.scheduledFor, tomorrowStartLocal)
            )
        ).limit(1);

        if (existingTaskReminders.length > 0) {
            console.log(`[_scheduleRemindersForTask] Reminders already scheduled today for task ${task.id} (User ${user.id}). Skipping.`);
            return 0; // No new reminders scheduled
        }

        // Calculate task time in user's local timezone
        const [hours, minutes] = task.scheduledTime.split(':').map(Number);
        // --- BEGIN DEBUG LOGGING ---
        console.log(`[_scheduleRemindersForTask DEBUG taskId=${task.id}] Parsed HH:MM: hours=${hours}, minutes=${minutes}`);
        // --- END DEBUG LOGGING ---
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            console.log(`[_scheduleRemindersForTask] Invalid hours/minutes parsed from scheduledTime "${task.scheduledTime}" for task ${task.id}. Skipping.`);
            return 0;
        }

        // --- NEW Calculation using string parsing in target timezone ---
        // 1. Get the date string (YYYY-MM-DD) in the target timezone
        const dateStringInZone = format(todayStartLocal, 'yyyy-MM-dd');
        // 2. Combine date string with HH:MM:SS time string
        const dateTimeString = `${dateStringInZone}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        // 3. Parse this string explicitly in the target timezone using toDate
        const taskTimeLocal = toDate(dateTimeString, { timeZone: timeZone });
        // --- END NEW Calculation ---

        // --- BEGIN DEBUG LOGGING ---
        console.log(`[_scheduleRemindersForTask DEBUG taskId=${task.id}] Constructed dateTimeString='${dateTimeString}' for zone '${timeZone}'`);
        console.log(`[_scheduleRemindersForTask DEBUG taskId=${task.id}] Calculated taskTimeLocal='${taskTimeLocal.toISOString()}' using toDate`);
        // --- END DEBUG LOGGING ---

        if (!isValidDate(taskTimeLocal)) {
            console.log(`[_scheduleRemindersForTask] Invalid date created using toDate for task ${task.id}. Original time: ${task.scheduledTime}. Skipping.`);
            return 0;
        }

        const metadata = { taskId: task.id, taskTitle: task.title, taskScheduledTime: task.scheduledTime };

        // Schedule Pre-Reminder (15 mins before)
        const preReminderTime = subMinutes(taskTimeLocal, 15);
        // --- BEGIN DEBUG LOGGING ---
        console.log(`[_scheduleRemindersForTask DEBUG taskId=${task.id}] Calculated preReminderTime='${preReminderTime.toISOString()}'`);
        // --- END DEBUG LOGGING ---
            await db.insert(messageSchedules).values({
                userId: user.id, type: 'pre_reminder', title: `Pre-Reminder: ${task.title}`,
            scheduledFor: preReminderTime, status: 'pending', metadata, createdAt: new Date(), updatedAt: new Date(), // Use new Date() for creation time
            });
            scheduledCount++;
            logger.debug({ userId: user.id, taskId: task.id, type: 'pre_reminder', scheduledFor: preReminderTime }, `Attempting to schedule pre_reminder`);
            logger.info({ userId: user.id, taskId: task.id, type: 'pre_reminder', scheduledFor: preReminderTime }, `Scheduled pre_reminder`);
        

        // Schedule On-Time Reminder
        const onTimeReminderTime = taskTimeLocal;
        // --- BEGIN DEBUG LOGGING ---
        console.log(`[_scheduleRemindersForTask DEBUG taskId=${task.id}] Calculated onTimeReminderTime='${onTimeReminderTime.toISOString()}'`);
        // --- END DEBUG LOGGING ---
            await db.insert(messageSchedules).values({
                userId: user.id, type: 'reminder', title: `Reminder: ${task.title}`,
            scheduledFor: onTimeReminderTime, status: 'pending', metadata, createdAt: new Date(), updatedAt: new Date(), // Use new Date() for creation time
            });
            scheduledCount++;
            logger.debug({ userId: user.id, taskId: task.id, type: 'reminder', scheduledFor: onTimeReminderTime }, `Attempting to schedule reminder`);
            logger.info({ userId: user.id, taskId: task.id, type: 'reminder', scheduledFor: onTimeReminderTime }, `Scheduled reminder`);
        

        // Schedule Post-Reminder Follow-up (15 mins after)
        const postReminderTime = addMinutes(taskTimeLocal, 15);
        // --- BEGIN DEBUG LOGGING ---
        console.log(`[_scheduleRemindersForTask DEBUG taskId=${task.id}] Calculated postReminderTime='${postReminderTime.toISOString()}'`);
        // --- END DEBUG LOGGING ---
            await db.insert(messageSchedules).values({
                userId: user.id, type: 'post_reminder_follow_up', title: `Check-in: ${task.title}`,
            scheduledFor: postReminderTime, status: 'pending', metadata, createdAt: new Date(), updatedAt: new Date(), // Use new Date() for creation time
            });
            scheduledCount++;
            logger.debug({ userId: user.id, taskId: task.id, type: 'post_reminder_follow_up', scheduledFor: postReminderTime }, `Attempting to schedule post_reminder_follow_up`);
            logger.info({ userId: user.id, taskId: task.id, type: 'post_reminder_follow_up', scheduledFor: postReminderTime }, `Scheduled post_reminder_follow_up`);

    } catch (taskError) {
        logger.error({ userId: user.id, taskId: task.id, error: taskError instanceof Error ? taskError.message : String(taskError) }, `Error scheduling reminder for task`);
        return 0; 
    }
    return scheduledCount;
  }

  // REVISED: Schedule reminders for daily tasks (uses helper)
  private async scheduleDailyReminders(): Promise<void> {
    logger.info("[Scheduler] Starting scheduleDailyReminders check..."); // Use logger
    const now = new Date();
    let totalScheduled = 0;

    try {
      const activeUsers = await db.select().from(users).where(eq(users.isActive, true));
      logger.debug(`[scheduleDailyReminders] Found ${activeUsers.length} active users.`); // Use logger

      for (const user of activeUsers) {
        const timeZone = user.timeZone || 'UTC';
        let userScheduledCount = 0;
        logger.debug({ userId: user.id, timeZone }, `[scheduleDailyReminders] Processing user.`); // Use logger
        try {
          const systemStartOfToday = startOfToday();
          const todayStartLocal = toZonedTime(systemStartOfToday, timeZone);
          const tomorrowStartLocal = addDays(todayStartLocal, 1);
          logger.debug({ userId: user.id, todayStartLocal: formatISO(todayStartLocal) }, `[scheduleDailyReminders] Calculated local day range.`); // Use logger

          const regularTasks = await db.select().from(tasks).where( 
            and(
              eq(tasks.userId, user.id),
              eq(tasks.taskType, TaskType.REGULAR), 
              eq(tasks.status, 'active'),
              not(isNull(tasks.scheduledTime))
            )
          );

          logger.debug({ userId: user.id, taskCount: regularTasks.length }, `[scheduleDailyReminders] Found active regular tasks with time.`); // Use logger
          if (regularTasks.length === 0) {
            continue;
          }

          for (const task of regularTasks) { 
            const count = await this._scheduleRemindersForTask(
                task, 
                user as StorageUser, 
                timeZone, 
                todayStartLocal, 
                tomorrowStartLocal, 
                now
            );
            userScheduledCount += count;
          }
          
          if (userScheduledCount > 0) {
             logger.info({ userId: user.id, count: userScheduledCount }, `[scheduleDailyReminders] Scheduled reminders for user.`); // Use logger
             totalScheduled += userScheduledCount;
          }

        } catch (tzError) {
           logger.error({ userId: user.id, timeZone, error: tzError }, `[scheduleDailyReminders] Error processing user timezone.`); // Use logger
        }
      }
      logger.info({ totalScheduled }, `[Scheduler] Finished scheduleDailyReminders check.`); // Use logger
    } catch (error) {
      logger.error({ error }, "[scheduleDailyReminders] General error fetching users or in main loop."); // Use logger
    }
  }

  // NEW: Schedule follow-ups for overdue daily tasks
  private async scheduleFollowUpsForUncompletedOptimized() {
      logger.info("[Scheduler] Starting scheduleFollowUpsForUncompletedOptimized check...");
    const FOLLOW_UP_BUFFER_MINUTES = 60; // How long after scheduled time to wait before following up
    const now = new Date(); // Current UTC time
    let totalFollowUpsScheduled = 0;

    const activeUsers = await db.select().from(users).where(and(eq(users.isActive, true), not(isNull(users.timeZone))));

    for (const user of activeUsers) {
      const timeZone = user.timeZone!;
      let userFollowUpsScheduled = 0;
        logger.debug({ userId: user.id, timeZone }, `[scheduleFollowUpsForUncompletedOptimized] Processing user.`); // Use logger
      try {
        const nowLocal = toZonedTime(now, timeZone);
        const todayStartLocal = startOfToday(); // Get UTC start of today
        const todayStartInUserTz = toZonedTime(todayStartLocal, timeZone); // Convert UTC start to user's start of day
        const tomorrowStartInUserTz = addDays(todayStartInUserTz, 1);
        const todayDateStr = format(todayStartInUserTz, 'yyyy-MM-dd');

        // Fetch active daily tasks for the user.
        // Skipped and time-based filtering will happen in application code.
        const potentiallyOverdueTasks = await db.select().from(tasks).where(
          and(
            eq(tasks.userId, user.id),
            eq(tasks.status, 'active'), 
            not(isNull(tasks.scheduledTime)),
            eq(tasks.taskType, 'daily') // Correct: Use taskType field
          )
        ).orderBy(tasks.scheduledTime);

        if (potentiallyOverdueTasks.length === 0) continue;

        console.log(`[FollowUp] User ${user.id}: Found ${potentiallyOverdueTasks.length} active daily tasks for ${todayDateStr}. Filtering further...`);

        // --- Check each potentially overdue task --- 
        for (const task of potentiallyOverdueTasks) {
           try {
             // Parse task scheduled time (HH:MM) and check if overdue
             const timeMatch = task.scheduledTime!.match(/^(\d{2}):(\d{2})$/);
             if (!timeMatch) continue; // Skip invalid time format
             const hours = parseInt(timeMatch[1], 10);
             const minutes = parseInt(timeMatch[2], 10);
             if (isNaN(hours) || isNaN(minutes)) continue;

             const taskScheduledLocal = new Date(todayStartInUserTz); // Start with 00:00 local
             taskScheduledLocal.setHours(hours, minutes, 0, 0);

             const followUpTimeLocal = addMinutes(taskScheduledLocal, FOLLOW_UP_BUFFER_MINUTES);

             // Check 1: Is the task actually overdue (past scheduled time + buffer)?
             if (nowLocal < followUpTimeLocal) {
                 // This task isn't late enough yet, skip it
                 continue; 
             }
             
             // Check 2: Was task created *after* its scheduled time passed today?
             const taskCreatedLocal = toZonedTime(task.createdAt, timeZone);
             if (taskCreatedLocal >= taskScheduledLocal) {
                 if (taskCreatedLocal >= followUpTimeLocal) {
                    console.log(`[FollowUp] Task ${task.id} (${task.title}) was created at ${formatInTimeZone(taskCreatedLocal, timeZone, 'HH:mm')} after follow-up time (${formatInTimeZone(followUpTimeLocal, timeZone, 'HH:mm')}). Skipping.`);
                    continue;
                 }
             }

             // Check 3: Has a follow-up (pending or sent) already been issued for *this task* today?
             const existingFollowUp = await db.select({ id: messageSchedules.id }).from(messageSchedules).where(
               and(
                 eq(messageSchedules.userId, user.id),
                 eq(messageSchedules.type, 'follow_up'),
                 eq(sql<number>`(${messageSchedules.metadata}->>'taskId')::integer`, task.id), // Correct: Cast JSON text value to integer for comparison
                 gte(messageSchedules.scheduledFor, todayStartInUserTz),
                 lt(messageSchedules.scheduledFor, tomorrowStartInUserTz),
                 or( 
                     eq(messageSchedules.status, 'pending'),
                     eq(messageSchedules.status, 'sent')
                 )
               )
             ).limit(1);

             if (existingFollowUp.length > 0) {
               continue; // Follow-up already handled
             }
             
             // Check 4: Has the task been completed today? (Check task_events)
             const completionEvent = await db.select({id: taskEvents.id}).from(taskEvents).where(
                 and(
                    eq(taskEvents.taskId, task.id),
                    eq(taskEvents.eventType, 'completed'),
                    gte(taskEvents.eventDate, todayStartInUserTz), 
                    lt(taskEvents.eventDate, tomorrowStartInUserTz)
                 )
             ).limit(1);

             if (completionEvent.length > 0) {
                 console.log(`[FollowUp] Task ${task.id} was completed today. Skipping follow-up.`);
                 continue; // Task was completed
             }

               // ---> NEW Check 5: Has the task been skipped today? (Check task_events)
               const skipEvent = await db.select({id: taskEvents.id}).from(taskEvents).where(
                   and(
                      eq(taskEvents.taskId, task.id),
                      eq(taskEvents.eventType, 'skipped_today'), // Check for skip event
                      gte(taskEvents.eventDate, todayStartInUserTz),
                      lt(taskEvents.eventDate, tomorrowStartInUserTz)
                   )
               ).limit(1);

               if (skipEvent.length > 0) {
                   console.log(`[FollowUp] Task ${task.id} was skipped today. Skipping follow-up.`);
                   continue; // Task was skipped
               }
               // <--- END NEW Check 5

             // All checks passed - schedule the follow-up for *now*
             console.log(`[FollowUp] Scheduling immediate follow-up for overdue task ${task.id} (${task.title}) for user ${user.id}.`);
             const followUpContent = `Just checking in on the task "${task.title}" that was scheduled for ${task.scheduledTime}. How did it go?`;
    await db.insert(messageSchedules).values({
               userId: user.id,
               type: 'follow_up',
               content: followUpContent,
               scheduledFor: now, // Schedule immediately
               status: 'pending',
               metadata: { taskId: task.id }
               // ---> Removed timeZone: timeZone
             });
             userFollowUpsScheduled++;

           } catch (taskError) {
                console.error(`[FollowUp] Error processing task ${task.id} for user ${user.id}:`, taskError);
           }
        } // End loop through potentially overdue tasks

        logger.info({ userId: user.id, followUpsScheduled: userFollowUpsScheduled }, `[scheduleFollowUpsForUncompletedOptimized] Scheduled follow-ups for user.`); // Use logger
        totalFollowUpsScheduled += userFollowUpsScheduled;
      } catch (userError) {
        console.error(`[FollowUp] Error processing follow-ups for user ${user.id}:`, userError);
      }
      logger.info({ totalFollowUpsScheduled }, "[Scheduler] Finished scheduleFollowUpsForUncompletedOptimized check.");
    } // End loop through users

    if (totalFollowUpsScheduled > 0) {
       console.log(`[FollowUp] Finished check. Scheduled ${totalFollowUpsScheduled} total follow-ups.`);
    }
  }

  // processPendingSchedules (Modified to call new functions)
  async processPendingSchedules(): Promise<void> {
    const now = new Date();
    logger.info(`[Scheduler - ${now.toISOString()}] Running processPendingSchedules...`); // Use logger

    try {
      await this.scheduleDailyReminders();
    } catch (error) {
      logger.error({ error }, "[Scheduler] Error during scheduleDailyReminders call within processPendingSchedules:"); // Use logger
    }
    
    const pendingSchedules = await db.select().from(messageSchedules).where(and(eq(messageSchedules.status, "pending"), lte(messageSchedules.scheduledFor, now)));
    logger.info({ count: pendingSchedules.length }, `[processPendingSchedules] Found pending messages to process.`); // Use logger

    for (const schedule of pendingSchedules) {
      logger.debug({ scheduleId: schedule.id, type: schedule.type, userId: schedule.userId }, `[processPendingSchedules] Processing schedule.`);
      try {
        const [user] = await db.select().from(users).where(eq(users.id, schedule.userId)).limit(1); // Fetch user correctly
        if (!user || !user.phoneNumber) {
            logger.warn({ scheduleId: schedule.id, userId: schedule.userId }, `[processPendingSchedules] Skipping schedule: User not found or no phone number.`);
            await db.update(messageSchedules).set({ status: "cancelled", updatedAt: new Date() }).where(eq(messageSchedules.id, schedule.id));
          continue;
        }

         // Map schedule type to system request type
         let systemRequestType: string = 'follow_up'; // Default
         if (schedule.type === 'morning_message') systemRequestType = 'morning_summary';
         else if (schedule.type === 'reminder') systemRequestType = 'task_reminder'; 
         else if (schedule.type === 'follow_up') systemRequestType = 'task_follow_up'; 
         else if (schedule.type === 'pre_reminder') systemRequestType = 'task_pre_reminder';
         else if (schedule.type === 'post_reminder_follow_up') systemRequestType = 'task_post_reminder_follow_up';
         // Add other mappings if needed

         const messageContent = await this.handleSystemMessage(
             schedule.userId,
             systemRequestType,
             { 
                 messageScheduleId: schedule.id, 
                 taskDetails: (schedule.metadata as any)?.taskDetails ?? (schedule.metadata as any) // Pass metadata
             } 
         );

         if (messageContent && !messageContent.startsWith("Sorry")) {
             await db.update(messageSchedules).set({ status: "sent", sentAt: now }).where(eq(messageSchedules.id, schedule.id));
             logger.info({ scheduleId: schedule.id }, `[processPendingSchedules] Successfully processed and sent schedule.`); // Use logger
        } else {
             logger.error({ scheduleId: schedule.id, messageContent }, `[processPendingSchedules] Failed to generate/send message for schedule.`); // Use logger
             await db
               .update(messageSchedules)
               .set({ status: "failed", updatedAt: new Date() })
               .where(eq(messageSchedules.id, schedule.id));
        }
      } catch (error) {
         logger.error({ scheduleId: schedule.id, error }, `[processPendingSchedules] Error processing schedule.`); // Use logger
        await db
          .update(messageSchedules)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(messageSchedules.id, schedule.id));
      }
    }

    logger.info("[Scheduler] Finished processPendingSchedules."); // Use logger
  }

  // New function for scheduling recurring tasks' next instances (runs daily)
  async scheduleRecurringTasks() {
      logger.info("[Scheduler] Starting scheduleRecurringTasks check...");
      const systemStartOfToday = startOfToday(); 
      const activeUsers = await db.select().from(users).where(and(eq(users.isActive, true), not(isNull(users.timeZone))));

      logger.debug(`[scheduleRecurringTasks] Found ${activeUsers.length} active users with timezones.`);

      for (const user of activeUsers) {
          const timeZone = user.timeZone!; 
          let userScheduledCount = 0;
          logger.debug({ userId: user.id, timeZone }, `[scheduleRecurringTasks] Processing user.`);
          try {
              const todayStartLocal = toZonedTime(systemStartOfToday, timeZone); 
              const tomorrowStartLocal = addDays(todayStartLocal, 1);
              logger.debug({ userId: user.id, todayStartLocal: formatISO(todayStartLocal) }, `[scheduleRecurringTasks] Calculated local day range.`);

              // Correct query using ne()
              const recurringTasks = await db.select().from(tasks).where(
                  and(
                      eq(tasks.userId, user.id),
                      not(isNull(tasks.recurrencePattern)),
                      ne(tasks.recurrencePattern, 'none'), // Correct usage of ne
                      not(isNull(tasks.scheduledTime)) 
                  )
              );
              logger.debug({ userId: user.id, taskCount: recurringTasks.length }, `[scheduleRecurringTasks] Found potentially recurring tasks with time.`);
              if (recurringTasks.length === 0) continue; 

              for (const task of recurringTasks) {
                   logger.debug({ userId: user.id, taskId: task.id, pattern: task.recurrencePattern }, `[scheduleRecurringTasks] Checking task recurrence.`);
                   // Pass recurrencePattern which can be null
                  if (this.doesTaskRecurOnDate(task.recurrencePattern, todayStartLocal)) {
                       logger.debug({ userId: user.id, taskId: task.id }, `[scheduleRecurringTasks] Task recurs today. Checking existing reminders.`);
                       const existingReminders = await db.select({ id: messageSchedules.id }).from(messageSchedules).where(
                           and(
                               eq(messageSchedules.userId, user.id),
                               // Ensure metadata query is safe
                               sql`${messageSchedules.metadata}->>'taskId' = ${task.id}`,
                               or( 
                                   eq(messageSchedules.type, 'pre_reminder'),
                                   eq(messageSchedules.type, 'reminder'),
                                   eq(messageSchedules.type, 'post_reminder_follow_up')
                               ),
                               gte(messageSchedules.scheduledFor, todayStartLocal),
                               lt(messageSchedules.scheduledFor, tomorrowStartLocal)
                           )
                       ).limit(1);

                       logger.debug({ userId: user.id, taskId: task.id, existingCount: existingReminders.length }, `[scheduleRecurringTasks] Existing reminders check result.`);
                       if (existingReminders.length === 0) {
                           logger.info({ userId: user.id, taskId: task.id }, `[scheduleRecurringTasks] No reminders found for task today. Scheduling now...`);
                           const count = await this._scheduleRemindersForTask(task as Task, user as StorageUser, timeZone, todayStartLocal, tomorrowStartLocal, systemStartOfToday);
                           userScheduledCount += count;
                       } else {
                            logger.debug({ userId: user.id, taskId: task.id }, `[scheduleRecurringTasks] Reminders already exist for task today. Skipping.`);
                       }
                  } // end if task recurs today
              } // end for task in recurringTasks

              if (userScheduledCount > 0) {
                logger.info({ userId: user.id, count: userScheduledCount }, `[scheduleRecurringTasks] Scheduled reminders for recurring tasks.`);
              }

            } catch (error) {
              logger.error({ userId: user.id, error }, `[scheduleRecurringTasks] Error processing user.`); 
          }
      } // end for user
      logger.info("[Scheduler] Finished scheduleRecurringTasks check.");
  }

  // Restore the correct logic for doesTaskRecurOnDate
  private doesTaskRecurOnDate(recurrencePattern: string | null | undefined, targetDateLocal: Date): boolean {
      logger.debug({ pattern: recurrencePattern, targetDate: formatISO(targetDateLocal) }, `[doesTaskRecurOnDate] Checking recurrence.`);
      if (!recurrencePattern || recurrencePattern === 'none') {
          logger.debug({ result: false }, `[doesTaskRecurOnDate] Pattern is null or none.`);
          return false;
      }

      const pattern = recurrencePattern.toLowerCase().trim();
      const dayOfWeek = getDay(targetDateLocal); // 0 = Sunday, 6 = Saturday
      const dateOfMonth = targetDateLocal.getDate(); // 1-31
      let result = false;

      if (pattern === 'daily') {
          result = true;
      } else if (pattern.startsWith('weekly:')) {
          const daysStr = pattern.split(':')[1];
          const targetDays = daysStr?.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d) && d >= 0 && d <= 6);
          if (!targetDays || targetDays.length === 0) {
              logger.warn({ pattern }, `[doesTaskRecurOnDate] Invalid weekly pattern format.`);
              result = false;
          } else {
            // Assuming pattern uses 0=Sun, 6=Sat (matching JS getDay)
            result = targetDays.includes(dayOfWeek);
          }
      } else if (pattern.startsWith('monthly:')) {
           const dayOfMonthStr = pattern.split(':')[1];
           const targetDayOfMonth = parseInt(dayOfMonthStr?.trim(), 10);
           if (isNaN(targetDayOfMonth) || targetDayOfMonth < 1 || targetDayOfMonth > 31) {
                logger.warn({ pattern }, `[doesTaskRecurOnDate] Invalid monthly pattern format.`);
               result = false;
           } else {
               result = dateOfMonth === targetDayOfMonth;
           }
      } else {
        logger.warn({ pattern }, `[doesTaskRecurOnDate] Unknown recurrence pattern.`);
        result = false;
      }
      logger.debug({ pattern, targetDate: formatISO(targetDateLocal), result }, `[doesTaskRecurOnDate] Check complete.`);
      return result;
  }

  // --- ADD New Cleanup Function ---
  async cleanupPendingRemindersForTask(userId: number, taskId: number): Promise<void> {
    console.log(`[MessagingService] Cleaning up pending reminders for task ${taskId}, user ${userId}`);
    try {
      const reminderTypes = ['pre_reminder', 'reminder', 'post_reminder_follow_up'];
      const updateResult = await db.update(messageSchedules)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(messageSchedules.userId, userId),
            eq(sql`(metadata->>'taskId')::integer`, taskId),
            eq(messageSchedules.status, 'pending'),
            inArray(messageSchedules.type, reminderTypes)
          )
        ).returning({ id: messageSchedules.id });
        
      if (updateResult.length > 0) {
         console.log(`[MessagingService] Cancelled ${updateResult.length} pending reminders for task ${taskId}. IDs: ${updateResult.map(r => r.id).join(', ')}`);
      } else {
         console.log(`[MessagingService] No pending reminders found to cancel for task ${taskId}.`);
      }
    } catch (error) {
      console.error(`[MessagingService] Error cleaning up reminders for task ${taskId}:`, error);
      // Decide if we should throw or just log
      // throw error; // Optional: re-throw if the caller needs to know
    }
  }
  // --- END New Cleanup Function ---

  // ---> NEW: Function to schedule reminders for a specific future date <---
  async scheduleRemindersForSpecificDate(task: Task, user: StorageUser, specificDate: Date, timeZone: string): Promise<number> {
      logger.info({ userId: user.id, taskId: task.id, specificDate: formatISO(specificDate), timeZone }, `Scheduling reminders for specific date`);
      let schedulesCreated = 0;
      const now = new Date(); // Current time in UTC

      if (!task.scheduledTime) {
          console.warn(`[scheduleRemindersForSpecificDate] Task ${task.id} has no scheduledTime. Cannot schedule.`);
          return schedulesCreated;
      }

      const timeParts = parseHHMM(task.scheduledTime);
      if (!timeParts) {
          console.error(`[scheduleRemindersForSpecificDate] Invalid time format \"${task.scheduledTime}\" for task ${task.id}`);
          return schedulesCreated;
      }

      const { hours, minutes } = timeParts;
      // Use the provided specificDate (which should already be in the correct timezone context from calculateNextOccurrence)
      // Set the time on the specificDate
      const taskTimeLocal = set(specificDate, { hours, minutes, seconds: 0, milliseconds: 0 });
      // Convert this specific local date/time to UTC for storage/scheduling
      const taskTimeUTC = toDate(taskTimeLocal, { timeZone }); 

      console.log(`[scheduleRemindersForSpecificDate] Task ${task.id} calculated time: Local=${formatISO(taskTimeLocal)}, UTC=${formatISO(taskTimeUTC)}`);

      // Ensure the calculated task time is in the future
      if (!isBefore(now, taskTimeUTC)) {
           console.warn(`[scheduleRemindersForSpecificDate] Calculated task time ${formatISO(taskTimeUTC)} UTC for task ${task.id} is in the past. Skipping scheduling.`);
           return schedulesCreated;
      }

      // --- Schedule Pre-Reminder ---
      const preReminderTimeUTC = subMinutes(taskTimeUTC, REMINDER_BUFFER_MINUTES);
      if (isBefore(now, preReminderTimeUTC)) { // Check if pre-reminder time is also in the future
          try {
              logger.debug({ userId: user.id, taskId: task.id, type: 'task_pre_reminder', scheduledFor: preReminderTimeUTC }, `Attempting specific date pre-reminder schedule`);
              await db.insert(messageSchedules).values({
                  userId: user.id,
                  scheduledFor: preReminderTimeUTC,
                  type: 'task_pre_reminder',
                  status: 'pending',
                  metadata: { taskId: task.id, taskTitle: task.title, taskScheduledTime: task.scheduledTime },
                  createdAt: now,
                  updatedAt: now,
              });
              schedulesCreated++;
              logger.info({ userId: user.id, taskId: task.id, type: 'task_pre_reminder', scheduledFor: preReminderTimeUTC }, `Scheduled specific date pre-reminder`);
          } catch (e) { logger.error({ userId: user.id, taskId: task.id, type: 'task_pre_reminder', error: e }, "Error scheduling specific date pre-reminder"); }
      }
      
      // --- Schedule Reminder ---
      const reminderTimeUTC = taskTimeUTC;
      // No need to check if reminderTimeUTC is before now, as we already checked taskTimeUTC
      try {
          logger.debug({ userId: user.id, taskId: task.id, type: 'task_reminder', scheduledFor: reminderTimeUTC }, `Attempting specific date reminder schedule`);
          await db.insert(messageSchedules).values({
              userId: user.id,
              scheduledFor: reminderTimeUTC,
              type: 'task_reminder',
              status: 'pending',
              metadata: { taskId: task.id, taskTitle: task.title, taskScheduledTime: task.scheduledTime },
              createdAt: now,
              updatedAt: now,
          });
          schedulesCreated++;
          logger.info({ userId: user.id, taskId: task.id, type: 'task_reminder', scheduledFor: reminderTimeUTC }, `Scheduled specific date reminder`);
      } catch (e) { logger.error({ userId: user.id, taskId: task.id, type: 'task_reminder', error: e }, "Error scheduling specific date reminder"); }

      // --- Schedule Post-Reminder Follow-up ---
      const followUpTimeUTC = addMinutes(taskTimeUTC, POST_REMINDER_BUFFER_MINUTES);
      if (isBefore(now, followUpTimeUTC)) { // Check if follow-up time is also in the future
          try {
              logger.debug({ userId: user.id, taskId: task.id, type: 'task_post_reminder_follow_up', scheduledFor: followUpTimeUTC }, `Attempting specific date post-reminder schedule`);
              await db.insert(messageSchedules).values({
                  userId: user.id,
                  scheduledFor: followUpTimeUTC,
                  type: 'task_post_reminder_follow_up',
                  status: 'pending',
                  metadata: { taskId: task.id, taskTitle: task.title, taskScheduledTime: task.scheduledTime },
                  createdAt: now,
                  updatedAt: now,
              });
              schedulesCreated++;
              logger.info({ userId: user.id, taskId: task.id, type: 'task_post_reminder_follow_up', scheduledFor: followUpTimeUTC }, `Scheduled specific date post-reminder`);
          } catch (e) { logger.error({ userId: user.id, taskId: task.id, type: 'task_post_reminder_follow_up', error: e }, "Error scheduling specific date post-reminder follow-up"); }
      }

      return schedulesCreated;
  }
  // <--- End NEW function
}

export const messagingService = new MessagingService();
