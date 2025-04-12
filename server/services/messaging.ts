import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import necessary modules
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql, and, or, lte, gte, not, isNull, asc, desc, lt, inArray } from 'drizzle-orm'; // Added lt and inArray
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
    const prompt = `You are an expert AI Assistant Coach specialized in helping users with ADHD manage their tasks, schedule, and well-being.\nCurrent User ID: ${userId}\nCurrent Time (${user.timeZone || 'UTC'}): ${currentDateTime}\n\nUSER PROFILE:\n- Username: ${user.username}\n- Email: ${user.email} ${user.isEmailVerified ? '(Verified)' : '(Not Verified)'}\n- Phone: ${user.phoneNumber || 'Not provided'} ${user.isPhoneVerified ? '(Verified)' : '(Not Verified)'}\n- Contact Preference: ${user.contactPreference}\n- Schedule: Wake ${user.wakeTime}, Start Routine ${user.routineStartTime}, Sleep ${user.sleepTime}\n- Preferred LLM: ${user.preferredModel}\n\nUSER FACTS:\n${facts.length > 0 ? facts.map((fact) => `- ${fact.category}: ${fact.content}`).join("\n") : "No specific facts known."}\n\nActive Tasks (for context, use functions to get latest status/details):\n${tasks.length > 0 ? tasks.filter(t => t.status === 'active').map((task) => `- ID:${task.id} | ${task.title} | Type: ${task.taskType}${task.scheduledTime ? ` | Scheduled: ${task.scheduledTime}` : ""}`).join("\n") : "No active tasks."}\n\nAVAILABLE FUNCTIONS:\n- \`get_task_list({ status: 'active'|'completed'|'all' = 'active' })\`: Retrieves the user's tasks. Default status is 'active'.\n- \`create_task({ title: string, description?: string, taskType: 'daily'|'personal_project'|'long_term_project'|'life_goal', priority?: number (1-5), estimatedDuration?: string ('30m', '2h', '1d', '1w', '1M', '1y'), deadline?: string (ISO8601), scheduledTime?: string ('HH:MM'), recurrencePattern?: string ('daily', 'weekly:1,3,5', 'monthly:15') })\`: Creates a new task.\n    - **IMPORTANT**: If \`taskType\` is 'daily', you MUST ask the user for a \`scheduledTime\` (e.g., "09:00") if they haven't provided one before calling this function.\n    - **IMPORTANT**: If \`taskType\` is 'personal_project', 'long_term_project', or 'life_goal', follow this sequence:\n        1. Ask the user for a brief \`description\` AND the overall \`estimatedDuration\` (e.g., '2w', '3M', '1y') for the project/goal.\n        2. WAIT for the user's response.\n        3. THEN, **suggest** 3-5 relevant initial subtasks with estimated durations/deadlines based on the description and overall duration. Ask the user to confirm or modify these suggestions.\n        4. WAIT for the user's response confirming or modifying the subtasks.\n        5. FINALLY, call \`create_task\` with the title, description, and duration, then call \`create_subtask\` for each confirmed/modified subtask.\n- \`update_task({ taskId: number, updates: { title?: string, description?: string, status?: 'active'|'completed'|'archived', priority?: number, estimatedDuration?: string, deadline?: string, scheduledTime?: string, recurrencePattern?: string } })\`: Updates an existing task. **Requires** \`taskId\` and an \`updates\` object containing the fields to change. Example: \`{ "taskId": 123, "updates": { "status": "completed" } }\`.\n- \`delete_task({ taskId: number })\`: Deletes a task. Requires \`taskId\`.\n- \`create_subtask({ parentTaskId: number, title: string, description?: string, estimatedDuration?: string })\`: Adds a subtask to a parent task. Requires \`parentTaskId\` and \`title\`.
- \`update_subtask({ subtaskId: number, updates: { title?: string, description?: string, status?: 'active'|'completed'|'archived', estimatedDuration?: string, ... } })\`: Updates an existing subtask. **Requires** \`subtaskId\` and an \`updates\` object containing the fields to change.
- \`delete_subtask({ subtaskId: number, parentTaskId: number })\`: Deletes a subtask. **Requires** both \`subtaskId\` and \`parentTaskId\`.
- \`get_user_facts({ category?: 'life_event'|'core_memory'|...|'custom' })\`: Retrieves known facts about the user, optionally filtered by category.
- \`add_user_fact({ factType: string, category: 'life_event'|'core_memory'|...|'custom', content: string })\`: Adds a new fact about the user.
- \`propose_daily_schedule({ date: string (YYYY-MM-DD) })\`: Generates a proposed schedule for the user for a specific date. Output the schedule clearly in the 'message' field, marked with \"PROPOSED_SCHEDULE_AWAITING_CONFIRMATION\".
- \`mark_task_skipped_today({ taskId: number })\`: Marks a task as skipped for today. Use this when the user explicitly says they didn't do a task today.
\nIMPORTANT NOTES & WORKFLOW:\n1.  **PRIORITY OF INFORMATION**: Function results provided in the conversation history (FUNCTION EXECUTION RESULTS section below) are the MOST current state. Always use the data from the latest function result for tasks, facts, etc., over older messages or your internal knowledge.\n2.  **Task Management**:\n    *   Before creating ANY task, ALWAYS call \`get_task_list({ status: \'active\' })\` to check if a similar task already exists. Ask the user if they want to proceed if duplicates are found.\n    *   Ensure \`taskType\` is one of the valid values: \'daily\', \'personal_project\', \'long_term_project\', \'life_goal\'. If the user is vague, ask them to clarify the type.\n    *   Follow the specific instructions within the \`create_task\` description regarding \`scheduledTime\` for daily tasks and the multi-step process (description + duration -> wait -> suggest subtasks -> wait -> create) for larger projects/goals.\n3.  **Function Result Handling (VERY IMPORTANT!)**: \n    *   After a function is executed, its results appear in the FUNCTION EXECUTION RESULTS section.\n    *   If a function like \`create_task\` or \`update_task\` was successful (e.g., result contains \`{\"success\": true, ...\`}), your response to the user MUST simply confirm the action based on the result (e.g., \"Okay, I\'ve created the task '[Task Title]'.\"). \n    *   **DO NOT** re-check for duplicates or ask to perform the same action again immediately after seeing a success result for that action.\n    *   If the function result indicates an error (e.g., \`{\"error\": ...\`}), inform the user about the error.\n    *   If the function returned data (like \`get_task_list\`), use that data to inform your *next* step (e.g., check the list for duplicates before deciding whether to ask the user or call \`create_task\`).\n4.  **Fact Management**: Use \`get_user_facts\` to recall information. Use \`add_user_fact\` to store new persistent information learned about the user during conversation.\n5.  **Scheduling**: Use \`propose_daily_schedule\` to generate structured plans. Your schedule proposal *must* be included in the \`message\` field of your JSON response and clearly marked.\n\nRESPONSE FORMAT (CRITICAL):\nYour output MUST be a single JSON object with the following potential keys:\n- "message": (string, Required) The conversational text response to the user.\n- "function_call": (object, Optional) If a function needs to be called. Structure: { "name": "function_name", "arguments": { "arg1": "value1", ... } }\n- "scheduleUpdates": (array, Optional) List of schedule items to create/update. Use this ONLY if the user explicitly confirms a proposed schedule or asks for direct item modifications. Structure: [{ id?: number, date: string (YYYY-MM-DD), taskId?: number | string, subtaskId?: number, title: string, startTime: string (HH:MM), endTime?: string (HH:MM), status?: string, action?: 'create'|'update'|'delete'|'skip' }]\n- "scheduledMessages": (array, Optional) List of messages to schedule. Structure: [{ type: 'follow_up'|'reminder', title: string, content?: string, scheduledFor: string (ISO8601 or "HH:MM" for today), metadata?: object }]\n\nGoal/Instruction:\n`;

    // Determine the goal instruction based on message type
    let goalInstruction = "";
    const specificTaskInfo = taskDetails ? ` for the task: \"${taskDetails.taskTitle}\" (ID: ${taskDetails.taskId}) scheduled at ${taskDetails.taskScheduledTime}` : "";

    switch (messageType) {
      case "morning":
        goalInstruction = `Generate the morning summary and plan for ${currentDateTime.split(",")[0]}. Propose a schedule using 'propose_daily_schedule'. Your response MUST be JSON.`;
        break;
      case "reschedule":
        goalInstruction = `User wants help rescheduling tasks or their day. Analyze their request and the current tasks/schedule. If appropriate, propose a new schedule using 'propose_daily_schedule'. Your response MUST be JSON.`;
        break;
      case "system_request":
        let baseInstruction = `This is a system-initiated request for: ${systemRequestType}.`;
        if (systemRequestType === 'task_pre_reminder') {
          goalInstruction = `${baseInstruction} Generate a brief, friendly pre-reminder message focused *only* on this task${specificTaskInfo}.`;
        } else if (systemRequestType === 'task_reminder') {
          goalInstruction = `${baseInstruction} Generate a brief, friendly message reminding the user to do this task now, focused *only* on this task${specificTaskInfo}.`;
        } else if (systemRequestType === 'task_post_reminder_follow_up') {
          goalInstruction = `${baseInstruction} Generate a brief, friendly follow-up message asking if the user completed the task, focused *only* on this task${specificTaskInfo}. Do not list other tasks.`;
        } else if (systemRequestType === 'task_follow_up') {
          goalInstruction = `${baseInstruction} The user hasn't marked this task as done significantly after its scheduled time. Generate a brief, friendly follow-up message asking about the task, focused *only* on this task${specificTaskInfo}. Do not list other tasks.`;
        } else {
          // Default system request instruction
          goalInstruction = `${baseInstruction} Generate the appropriate content.`;
        }
        goalInstruction += " Your response MUST be JSON."; // Ensure JSON format for all system requests?
        break;
      case "response":
      default:
        goalInstruction = `Respond to the user's latest message: "${userResponse}". Address their request, manage tasks/schedule, or ask clarifying questions as needed based on the workflow. \nIMPORTANT: If the user is responding to a follow-up about a task and indicates they did NOT complete it today, acknowledge their response AND call the function \`mark_task_skipped_today({taskId: <task_id>})\` to prevent further follow-ups for that task today. Your response MUST be JSON.`;
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

    // 1. Store User Message
    await db.insert(messageHistory).values({ userId, content: userMessageContent, type: "user_message", status: "received", createdAt: new Date() });

    // 2. Prepare Initial Context & History
    const user = await storage.getUser(userId);
    if (!user) { console.error(`User not found: ${userId}`); return null; }
    const userTasks = await storage.getTasks(userId); // Get current tasks for context
    const userFacts = await storage.getKnownUserFacts(userId);
    const dbHistory = await db.select().from(messageHistory).where(eq(messageHistory.userId, userId)).orderBy(desc(messageHistory.createdAt)).limit(20);

    // Convert DB history to Standardized format
    let conversationHistory: StandardizedChatCompletionMessage[] = dbHistory.map(msg => {
          return {
            role: (msg.type === "user_message" || msg.type === "system_request") ? "user" as const : "assistant" as const,
            content: msg.content || "",
            name: undefined,
            tool_calls: undefined // TODO: Reconstruct from metadata if needed
        };
    }).reverse();

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
            if ((!processedResult.scheduledMessages || processedResult.scheduledMessages.length === 0) && !isProposal && !isConfirmation) {
                 const sentiment = await this.analyzeSentiment(processedResult.message, userId);
                 if (sentiment.needsFollowUp) {
                     await this.scheduleFollowUp(userId, sentiment.type);
                 }
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
    systemRequestType: "reschedule_request" | "morning_summary" | "task_suggestion" | string, // Allow other types
    contextData: Record<string, any> = {},
  ): Promise<string> { // Returns the message content for potential immediate use
    console.log(`Handling system message type: ${systemRequestType} for user ${userId}`);
    try {
      // 1. Prepare Context
      const user = await storage.getUser(userId);
      if (!user) throw new Error(`User ${userId} not found`);
      const userTasks = await storage.getTasks(userId);
      const userFacts = await storage.getKnownUserFacts(userId);
       // Limit history for system messages? Maybe not needed if prompt is specific.
      const dbHistory = await db.select().from(messageHistory).where(eq(messageHistory.userId, userId)).orderBy(desc(messageHistory.createdAt)).limit(10);

      const currentDateTime = new Date().toLocaleString("en-US", { timeZone: user.timeZone || undefined, dateStyle: "full", timeStyle: "long" });

      // Map system message type
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
        systemRequestType: systemRequestType, // Pass the specific type
        userResponse: contextData.userRequest || undefined, // Include if system request is based on prior user input
        taskDetails: contextData.taskDetails 
      };

      // 2. Prepare Conversation History for API
       // System messages might not need deep history, but include some for context.
      let conversationHistory: StandardizedChatCompletionMessage[] = dbHistory.map(msg => ({
         role: (msg.type === "user_message" || msg.type === "system_request") ? "user" as const : "assistant" as const,
         content: msg.content || "",
       })).reverse(); // Chronological

       // Add a placeholder message representing the system's intent for this turn
       conversationHistory.push({ role: "user", content: `System Request: Initiate ${systemRequestType}` });


      // 3. Generate Response (Assume no tool calls needed for most system messages)
       // If system messages *could* require tools (e.g., complex task suggestion),
       // this would need the same loop structure as handleUserResponse.
      const prompt = this.createUnifiedPrompt(messageContext);
      const assistantMessage = await this.generateUnifiedResponse(userId, prompt, conversationHistory);
      const finalContent = assistantMessage.content || `{ "message": "System message generation failed." }`;
      const processedResult = this.processLLMResponse(finalContent);

       // ---> NEW: Apply WhatsApp formatting
       let messageToUser = processedResult.message;
       if (messageToUser) {
           messageToUser = messageToUser.replace(/\*\*(.*?)\*\*/g, '*$1*');
           console.log("[Formatting] Applied WhatsApp bold conversion to system message.");
       }
       // <--- END NEW

       // 4. Perform Actions (Save Message, Send to User if needed)
       const finalMetadata: any = { systemInitiated: true, type: systemRequestType };
        // Store proposal updates if it's a reschedule request, don't process yet
        if (processedResult.scheduleUpdates && systemRequestType === 'reschedule_request') {
            finalMetadata.scheduleUpdates = processedResult.scheduleUpdates;
            console.log("Storing proposed schedule updates from system message.");
        }
        // Process scheduled messages immediately if generated
        if (processedResult.scheduledMessages && processedResult.scheduledMessages.length > 0) {
            await this.processScheduledMessages(userId, processedResult.scheduledMessages);
        }

      await db.insert(messageHistory).values({
        userId,
        content: messageToUser, // ---> Use formatted message
        type: "coach_response", // Mark as coach response, metadata indicates system initiated
        status: "sent",
        metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
        createdAt: new Date(),
      });

       // Only send interactive system messages (like summaries/proposals) to the user
       const shouldSendMessage = systemRequestType === 'morning_summary' || systemRequestType === 'reschedule_request' || systemRequestType.startsWith('task_'); // Send reminders/followups
       // ---> FIX: Check if user.phoneNumber exists before comparing contactPreference
       if (user.phoneNumber && shouldSendMessage) { // Send system messages via WhatsApp if phone exists
            console.log(`[Sync] Attempting to send system-initiated message (${systemRequestType}) to WhatsApp for user ${userId}`);
            await this.sendWhatsAppMessage(user.phoneNumber, messageToUser); // ---> Use formatted message
    } else {
            console.log(`System message type ${systemRequestType} generated, but not sent directly to user (no phone or type mismatch).`);
        }

      return messageToUser; // ---> Return formatted message

        } catch (error) {
      console.error(`Error handling system message (${systemRequestType}) for user ${userId}: `, error);
      // Don't save or send anything on error
      return "Sorry, I encountered an error processing the system request.";
    }
  }


  // --- Supporting Functions (Keep Existing Implementations) ---

  // processLLMResponse (Modified for in-JSON function calls)
  processLLMResponse(content: string): {
    message: string;
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
          message: cleanContent, // Return the cleaned, non-JSON content
          scheduleUpdates: [],
          scheduledMessages: [],
        };
      }

      // --- Proceed with parsed JSON logic --- 
      
      // Basic validation - ensure message exists (or function_call exists)
       if (typeof parsed.message !== 'string' && !parsed.function_call) {
           console.warn("Parsed JSON response lacks both 'message' string field and 'function_call'. Using raw content as fallback message.", cleanContent);
            // Return a fallback structure, but use the cleaned content as the message
      return {
               message: cleanContent, 
               scheduleUpdates: [],
               scheduledMessages: [],
           }; 
       }

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
       
       // Use message field if it's a string, otherwise use a placeholder if a function was called
       let messageContent = typeof parsed.message === 'string' ? parsed.message : 
                            (functionCall ? `[System action: Calling function '${functionCall.name}']` : "[System processing...]");

      return {
        message: messageContent, // Use extracted message or placeholder
        function_call: functionCall, 
        scheduleUpdates: Array.isArray(parsed.scheduleUpdates) ? parsed.scheduleUpdates : [],
        scheduledMessages: Array.isArray(parsed.scheduledMessages) ? parsed.scheduledMessages : [],
      };

            } catch (error: unknown) {
      // --- Fallback Logic if JSON parsing failed on cleaned content ---
      console.warn("Could not parse cleaned LLM response as JSON. Treating cleaned content as message:", cleanContent, error);
      return {
        message: cleanContent, // Use the cleaned content
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
                         taskType: TaskType.DAILY, // Default or derive from context?
                status: "active",
                         estimatedDuration: "30 minutes",
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

    } catch (taskError) {
        console.error(`[_scheduleRemindersForTask] Error scheduling reminder for task ${task.id} (User ${user.id}):`, taskError);
        return 0; // Return 0 on error
    }
    return scheduledCount;
  }

  // REVISED: Schedule reminders for daily tasks (uses helper)
  private async scheduleDailyReminders(): Promise<void> {
    console.log("[Scheduler] Checking for daily task reminders to schedule...");
    const now = new Date();
    let totalScheduled = 0;

    try {
      // Fetch active users (already corrected to use isActive)
      const activeUsers = await db.select().from(users).where(eq(users.isActive, true));
      console.log(`[Scheduler] Found ${activeUsers.length} active users to check for reminders.`);

      for (const user of activeUsers) {
        const timeZone = user.timeZone || 'UTC';
        let userScheduledCount = 0;
        try {
          const systemStartOfToday = startOfToday();
          const todayStartLocal = toZonedTime(systemStartOfToday, timeZone);
          const tomorrowStartLocal = addDays(todayStartLocal, 1);

          // Get active daily tasks with a scheduled time
          const dailyTasks = await db.select().from(tasks).where(
            and(
              eq(tasks.userId, user.id),
              eq(tasks.taskType, TaskType.DAILY),
              eq(tasks.status, 'active'),
              not(isNull(tasks.scheduledTime))
            )
          );

          if (dailyTasks.length === 0) {
            // console.log(`[Scheduler] No active daily tasks with scheduled times found for user ${user.id}.`);
            continue;
          }

          console.log(`[Scheduler] Found ${dailyTasks.length} daily tasks for user ${user.id}. Attempting to schedule reminders.`);

          // --- Call helper for each task --- 
          for (const task of dailyTasks) {
            // Pass necessary arguments to the helper
            const count = await this._scheduleRemindersForTask(
                task, 
                user as StorageUser, // Cast needed as db select() doesn't return StorageUser type directly
                timeZone, 
                todayStartLocal, 
                tomorrowStartLocal, 
                now
            );
            userScheduledCount += count;
          }
          // ----------------------------------
          
          if (userScheduledCount > 0) {
             console.log(`[Scheduler] Scheduled ${userScheduledCount} reminders for user ${user.id}.`);
             totalScheduled += userScheduledCount;
          }

        } catch (tzError) {
          console.error(`[Scheduler] Error processing timezone ${timeZone} for user ${user.id}:`, tzError);
        }
      }
      if (totalScheduled > 0) {
          console.log(`[Scheduler] Finished daily reminder check. Total reminders scheduled: ${totalScheduled}.`);
      }
    } catch (error) {
      console.error("[Scheduler] Error fetching active users or general error in scheduleDailyReminders:", error);
    }
  }

  // NEW: Schedule follow-ups for overdue daily tasks
  private async scheduleFollowUpsForUncompletedOptimized() {
    console.log("[Scheduler] Running optimized check for overdue task follow-ups...");
    const FOLLOW_UP_BUFFER_MINUTES = 60; // How long after scheduled time to wait before following up
    const now = new Date(); // Current UTC time
    let totalFollowUpsScheduled = 0;

    const activeUsers = await db.select().from(users).where(and(eq(users.isActive, true), not(isNull(users.timeZone))));

    for (const user of activeUsers) {
      const timeZone = user.timeZone!;
      let userFollowUpsScheduled = 0;
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

      } catch (userError) {
        console.error(`[FollowUp] Error processing follow-ups for user ${user.id}:`, userError);
      }
      if (userFollowUpsScheduled > 0) {
        console.log(`[FollowUp] Scheduled ${userFollowUpsScheduled} follow-ups for user ${user.id}.`);
        totalFollowUpsScheduled += userFollowUpsScheduled;
      }
    } // End loop through users

    if (totalFollowUpsScheduled > 0) {
       console.log(`[FollowUp] Finished check. Scheduled ${totalFollowUpsScheduled} total follow-ups.`);
    }
  }

  // processPendingSchedules (Modified to call new functions)
  async processPendingSchedules(): Promise<void> {
    const now = new Date();
    console.log(`[Scheduler - ${now.toISOString()}] Running schedule processing...`);

    // ---> NEW: Call reminder and follow-up scheduling logic first
    try {
      await this.scheduleDailyReminders();
    } catch (error) {
      console.error("[Scheduler] Error during scheduleDailyReminders:", error);
    }
    
    // <--- END NEW

    // Existing logic to process messages scheduled for now
    const pendingSchedules = await db.select().from(messageSchedules).where(and(eq(messageSchedules.status, "pending"), lte(messageSchedules.scheduledFor, now)));
    console.log(`[Scheduler] Found ${pendingSchedules.length} pending messages to process.`);

    for (const schedule of pendingSchedules) {
      try {
        console.log(`Processing schedule ${schedule.id} type ${schedule.type} for user ${schedule.userId}`);
        const [user] = await db.select().from(users).where(eq(users.id, schedule.userId)).limit(1);
        if (!user || !user.phoneNumber) {
            console.log(`Skipping schedule ${schedule.id}: User ${schedule.userId} not found or has no phone number.`);
            // Optionally update status to failed/cancelled if user is gone
            await db.update(messageSchedules).set({ status: "cancelled", updatedAt: now }).where(eq(messageSchedules.id, schedule.id));
          continue;
        }

         // Map schedule type to system request type
         let systemRequestType: string = 'follow_up'; // Default
         if (schedule.type === 'morning_message') systemRequestType = 'morning_summary';
         else if (schedule.type === 'reminder') systemRequestType = 'task_reminder'; // Example mapping
         else if (schedule.type === 'follow_up') systemRequestType = 'task_follow_up'; // Example mapping
         // ---> NEW Mappings
         else if (schedule.type === 'pre_reminder') systemRequestType = 'task_pre_reminder';
         else if (schedule.type === 'post_reminder_follow_up') systemRequestType = 'task_post_reminder_follow_up';
         // <--- END NEW
         // Add other mappings if needed

         // Use handleSystemMessage to generate and send the message
         const messageContent = await this.handleSystemMessage(
             schedule.userId,
             systemRequestType,
             { 
                 messageScheduleId: schedule.id, 
                 // Pass task details if available in metadata (e.g., for reminders/follow-ups)
                 taskDetails: (schedule.metadata as { taskDetails?: any } | null)?.taskDetails 
             } 
         );

         // Check if message generation/sending was successful (handleSystemMessage sends it)
         // We might need better error propagation from handleSystemMessage if needed here
         if (messageContent && !messageContent.startsWith("Sorry")) {
             // Update schedule status if sent successfully
             await db.update(messageSchedules).set({ status: "sent", sentAt: now }).where(eq(messageSchedules.id, schedule.id));
             console.log(`[Scheduler] Successfully processed and sent schedule ID ${schedule.id}.`);

             // Reschedule recurring tasks like morning message?
             // if (schedule.type === 'morning_message') { /* Reschedule logic */ }

        } else {
            console.error(`Failed to generate/send message for schedule ${schedule.id}. Content: ${messageContent}`);
            // Optionally update status to 'failed'
             await db
               .update(messageSchedules)
               .set({ status: "failed", updatedAt: new Date() })
               .where(eq(messageSchedules.id, schedule.id));
        }
      } catch (error) {
        console.error(`[Scheduler] Error processing schedule ID ${schedule.id}:`, error);
        // Update status to 'failed' to prevent reprocessing loops
        await db
          .update(messageSchedules)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(messageSchedules.id, schedule.id));
      }
    }

    console.log("[Scheduler] Finished processing pending schedules.");
  }

  // New function for scheduling recurring tasks' next instances (runs daily)
  async scheduleRecurringTasks() {
      console.log("[Scheduler] Running daily check for scheduling recurring tasks...");
      const systemStartOfToday = startOfToday(); // UTC start of today
      const activeUsers = await db.select().from(users).where(and(eq(users.isActive, true), not(isNull(users.timeZone))));

      console.log(`[Scheduler] Found ${activeUsers.length} active users with timezones for recurrence check.`);

      for (const user of activeUsers) {
          const timeZone = user.timeZone!; // We filtered for non-null timezones
          let userScheduledCount = 0;
          try {
              const todayStartLocal = toZonedTime(systemStartOfToday, timeZone); // 00:00 in user's timezone
              const tomorrowStartLocal = addDays(todayStartLocal, 1);

              // Find active tasks for this user with recurrence patterns and scheduled times
              const recurringTasks = await db.select().from(tasks).where(
                  and(
                      eq(tasks.userId, user.id),
                      eq(tasks.status, 'active'),
                      not(isNull(tasks.recurrencePattern)),
                      not(isNull(tasks.scheduledTime)) // Must have a time to schedule reminders
                  )
              );

              if (recurringTasks.length === 0) continue; // No recurring tasks for this user

              console.log(`[Scheduler] Checking ${recurringTasks.length} recurring tasks for user ${user.id}`);

              for (const task of recurringTasks) {
                   // Check if this task recurs today based on its pattern
                  if (this.doesTaskRecurOnDate(task.recurrencePattern, todayStartLocal)) {
                       console.log(`[Scheduler] Task ${task.id} (${task.title}) recurs today for user ${user.id}. Checking if reminders already scheduled...`);
                       // Check if reminders for *this specific task* are already scheduled for *today*
                       const existingReminders = await db.select({ id: messageSchedules.id }).from(messageSchedules).where(
                           and(
                               eq(messageSchedules.userId, user.id),
                               sql`${messageSchedules.metadata}->>'taskId' = ${task.id}`, // Check metadata for taskId
                               or( // Check any of the three reminder types
                                   eq(messageSchedules.type, 'pre_reminder'),
                                   eq(messageSchedules.type, 'reminder'),
                                   eq(messageSchedules.type, 'post_reminder_follow_up')
                               ),
                               gte(messageSchedules.scheduledFor, todayStartLocal),
                               lt(messageSchedules.scheduledFor, tomorrowStartLocal)
                           )
                       ).limit(1);

                       if (existingReminders.length === 0) {
                           console.log(`[Scheduler] No reminders found for task ${task.id} today. Scheduling now...`);
                           // ---> FIX: Call the new helper method
                           const count = await this._scheduleRemindersForTask(task as Task, user as StorageUser, timeZone, todayStartLocal, tomorrowStartLocal, systemStartOfToday);
                           userScheduledCount += count;
                           // <--- END FIX
                       } else {
                            console.log(`[Scheduler] Reminders already exist for task ${task.id} today. Skipping.`);
                       }
                  } // end if task recurs today
              } // end for task in recurringTasks

              if (userScheduledCount > 0) {
                console.log(`[Scheduler] Scheduled reminders for ${userScheduledCount} recurring tasks for user ${user.id}`);
              }

            } catch (error) {
              console.error(`[Scheduler] Error processing recurring tasks for user ${user.id}:`, error);
          }
      } // end for user
      console.log("[Scheduler] Finished daily check for scheduling recurring tasks.");
  }

  // ---> ADD helper function INSIDE the class
  private doesTaskRecurOnDate(recurrencePattern: string | null | undefined, targetDateLocal: Date): boolean {
      if (!recurrencePattern) return false;

      const pattern = recurrencePattern.toLowerCase().trim();
      const dayOfWeek = getDay(targetDateLocal); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const dateOfMonth = targetDateLocal.getDate(); // 1-31

      if (pattern === 'daily') {
          return true;
      }

      if (pattern.startsWith('weekly:')) {
          const days = pattern.split(':')[1]?.split(',').map(d => parseInt(d.trim(), 10));
          if (!days || days.some(isNaN)) {
              console.warn(`[RecurrenceCheck] Invalid weekly pattern: ${recurrencePattern}`);
              return false;
          }
          // Assuming pattern uses 1=Monday, 7=Sunday. Adjust JS dayOfWeek (0=Sun) to match.
          const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
          return days.includes(isoDayOfWeek);
      }

      if (pattern.startsWith('monthly:')) {
          const dayOfMonth = parseInt(pattern.split(':')[1]?.trim(), 10);
          if (isNaN(dayOfMonth)) {
               console.warn(`[RecurrenceCheck] Invalid monthly pattern: ${recurrencePattern}`);
              return false;
          }
          return dateOfMonth === dayOfMonth;
      }
      
      // Add more patterns here if needed (e.g., yearly, bi-weekly)

      console.warn(`[RecurrenceCheck] Unknown recurrence pattern: ${recurrencePattern}`);
      return false;
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
}

export const messagingService = new MessagingService();
