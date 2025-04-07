import OpenAI from "openai";
import twilio from "twilio";
import {
  Task,
  User,
  KnownUserFact,
  MessageHistory,
  MessageSchedule,
  messageHistory,
  messageSchedules,
  users,
  tasks,
  subtasks,
  knownUserFacts,
  TaskType,
  Subtask,
  ScheduleItem,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, lte, desc, gt, isNull } from "drizzle-orm";
import { storage } from "../storage";
import { FINAL_SCHEDULE_MARKER } from "./schedule-parser-new";
import {
  parseScheduleFromLLMResponse,
  createDailyScheduleFromParsed,
  confirmSchedule,
} from "./schedule-parser-new";
import { llmFunctionExecutors, llmFunctionDefinitions } from "./llm-functions";
import { ChatCompletionMessage, ChatCompletionMessageParam } from "openai/resources/chat/completions";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

export interface MessageContext {
  user: User;
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
  // agentModeHistory?: Array<{ action: string; params?: Record<string, any>; result: any; timestamp: string; }>; // Simplified for now
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
    // Format past messages (keep existing logic, use context.previousMessages)
    const formattedPreviousMessages = context.previousMessages
      .slice(0, 10) // Limit history in prompt for brevity
      .map((msg) => {
        let messageTime;
        if (context.user.timeZone) {
          messageTime = new Date(msg.createdAt).toLocaleTimeString("en-US", {
            timeZone: context.user.timeZone,
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          messageTime = new Date(msg.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
        const messageType = msg.type === "user_message" ? "User" : "Coach";
        return `[${messageTime}] ${messageType}: ${msg.content}`;
      })
      .reverse() // Oldest first in this snippet for context flow
      .join("\n");

    // Determine the goal/context based on messageType
    let goalInstruction = "";
    switch (context.messageType) {
      case "morning":
        goalInstruction = `This is the user's morning check-in. Generate a friendly greeting, a brief positive note, and a proposed schedule for the day based on their tasks and preferences. Ask if they need adjustments. Format the schedule clearly using bullet points and times. Your response MUST be JSON.`;
        break;
      case "reschedule":
        goalInstruction = `The user wants to reschedule their day. Generate a revised schedule proposal considering the current time (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}), their tasks, and preferences. Your response MUST be JSON including scheduleUpdates/scheduledMessages. IMPORTANT: End the 'message' field with 'PROPOSED_SCHEDULE_AWAITING_CONFIRMATION'.`;
        break;
      case "schedule_confirmation_response":
        goalInstruction = `The user responded ("${context.userResponse}") to a schedule proposal. If they confirmed, finalize the schedule (include '${FINAL_SCHEDULE_MARKER}' in the message field). If they requested changes, propose a new schedule. Your response MUST be JSON.`;
        break;
      case "follow_up":
        goalInstruction = `Generate a brief, friendly follow-up message based on the recent conversation and tasks. Ask a simple question. Your response MUST be JSON.`;
        break;
      case "agent_mode": // Keep if needed, logic might change
        goalInstruction = `You are in AGENT MODE. Use the provided function results to formulate your response or ask further clarifying questions if needed. If you have all info, provide the final response and exit agent mode. Your response MUST be JSON.`;
        break;
       case "system_request":
         goalInstruction = `This is a system-initiated request for: ${context.systemRequestType}. Generate the appropriate content (e.g., morning summary, task suggestion). Your response MUST be JSON.`;
         break;
      case "response":
      default:
        goalInstruction = `Respond to the user's latest message: "${context.userResponse}". Address their request, manage tasks/schedule, or ask clarifying questions as needed based on the workflow. Your response MUST be JSON.`;
    }

     // Include function results if available from a previous loop iteration
     const functionResultText = context.functionResults
     ? `\n\nFUNCTION EXECUTION RESULTS:\nYou previously called functions and received these results:\n${JSON.stringify(context.functionResults, null, 2)}\nUse these results ONLY to formulate your response to the user. Do not call the same function again unless necessary for new information.`
     : "";

    // Construct the main prompt
    return `
      You are an ADHD coach and accountability partner chatting with ${context.user.username}.
      Current date and time: ${context.currentDateTime}

      User Preferences:
      - Wake time: ${context.user.wakeTime || "Not set"}
      - Routine start: ${context.user.routineStartTime || "Not set"}
      - Sleep time: ${context.user.sleepTime || "Not set"}
      - Timezone: ${context.user.timeZone || "Not set"}

      User Facts:
      ${context.facts.length > 0 ? context.facts.map((fact) => `- ${fact.category}: ${fact.content}`).join("\n") : "No specific facts known."}

      Active Tasks (for context, use functions to get latest status/details):
      ${context.tasks.length > 0 ? context.tasks.filter(t => t.status === 'active').map((task) => `- ID:${task.id} | ${task.title} | Type: ${task.taskType}${task.scheduledTime ? ` | Scheduled: ${task.scheduledTime}` : ""}`).join("\n") : "No active tasks."}

      Recent Conversation Snippets (Oldest first):
      ${formattedPreviousMessages}

      YOUR CURRENT GOAL: ${goalInstruction}
      ${functionResultText}

      AGENTIC WORKFLOW (Follow this sequence):
      1.  **Analyze Goal & Info:** Understand the goal (from YOUR CURRENT GOAL section) and check if the user's message or function results provide needed info.
      2.  **Function Use (If Needed):** If you lack information (e.g., task details, existence checks, user facts) OR need to perform an action (create/update/delete), use the available functions. Refer to function descriptions for parameters and usage notes (like the 'create_task' pre-check). **To request a function call, include the 'function_call' field in your JSON response.**
      3.  **Clarification (If Needed):** ONLY IF information is missing AND cannot be obtained via functions, ask the user ONE clear, targeted question in the 'message' field of your JSON response.
      4.  **Final Response/Action:** Once all info is gathered (user, context, function results), generate the final conversational response, schedule proposal, or confirmation in the 'message' field. If you are making a final response (not calling a function or asking a question), ensure the 'function_call' field is omitted or null. Include 'scheduleUpdates' or 'scheduledMessages' in the JSON if appropriate.
      *Note on Agent Mode:* You are implicitly in 'Agent Mode' whenever you need to call a function or ask clarifying questions sequentially. You exit Agent Mode by providing the final response to the user without including the 'function_call' field.

      AVAILABLE FUNCTIONS (Invoke by including in the 'function_call' field of your JSON response):
      *   get_todays_notifications(): Returns notifications scheduled for today.
      *   get_task_list(): Returns tasks. Can filter by status (e.g., 'active', 'completed').
      *   get_user_facts(): Returns known facts about the user. Can filter by category.
      *   get_todays_schedule(): Returns the schedule for today.
      *   create_task(): Creates a new task. Requires title and taskType (category: 'daily', 'personal_project', 'long_term_project', 'life_goal'). Frequency is set via recurrencePattern. IMPORTANT: Must call 'get_task_list' first to check for duplicates.
      *   update_task(): Updates an existing task by ID. Requires taskId and updates object.
      *   delete_task(): Deletes a task by ID. Requires taskId.
      *   create_subtask(): Creates a new subtask. Requires parentTaskId and title.
      *   update_subtask(): Updates a subtask. Requires subtaskId and updates object.
      *   delete_subtask(): Deletes a subtask. Requires subtaskId and parentTaskId.
      *   create_schedule_item(): Creates a schedule item. Requires scheduleId, title, startTime.
      *   update_schedule_item(): Updates a schedule item. Requires itemId and updates object.
      *   delete_schedule_item(): Deletes a schedule item. Requires itemId.
      *   schedule_message(): Schedules a message/notification. Requires content, scheduledFor (time string like 'HH:MM'), type ('reminder', 'follow_up').
      *   delete_scheduled_message(): Deletes a scheduled message. Requires messageScheduleId.

      RESPONSE FORMAT (CRITICAL):
      - ALWAYS respond using a valid JSON object.
      - **Include the 'function_call' field ONLY when you need to execute a function.** Otherwise, omit it or set it to null.
      - Structure your response like this:
        {
          "message": "Your conversational response to the user (or question if clarifying).",
          "function_call": { // Omit or set to null if not calling a function this turn
            "name": "function_name_to_call", // e.g., "get_task_list"
            "arguments": { // Arguments as a JSON object
              "param_name": "value" // e.g., "status": "active"
            }
          },
          "scheduleUpdates": [ /* Array of ScheduleUpdate objects, or empty */ ],
          "scheduledMessages": [ /* Array of scheduled message objects, or empty */ ]
        }

      OTHER IMPORTANT NOTES:
      *   Trust function results over potentially outdated chat history.
      *   Valid 'taskType' values are the categories: 'daily', 'personal_project', 'long_term_project', 'life_goal'.
      *   Task frequency is set using the 'recurrencePattern' parameter (e.g., 'daily', 'weekly:1,3,5', 'none').
      *   PRIORITIZE using the specific functions (create_task, update_task, etc.) for modifying data.
      *   Do not invent information. Use functions or ask the user.
      *   For dates/times provided vaguely (e.g., "tomorrow afternoon", "Friday"), ask for clarification (e.g., "What specific date do you mean for Friday?", "What time tomorrow afternoon?").
      *   Confirm understanding before executing actions, especially deletions (e.g., "Just to confirm, you want me to delete the task 'xyz' (ID: 123)?").
    `;
  }

  // --- New Core LLM Interaction Function ---
  private async generateUnifiedResponse(
    userId: number,
    prompt: string,
    conversationHistory: ChatCompletionMessageParam[] // Expects chronological order (oldest first)
  ): Promise<ChatCompletionMessage> { // Returns the assistant's message object

    const preferredModel = await this.getUserPreferredModel(userId);
    console.log(`Using user's preferred model: ${preferredModel} for unified response`);

    const isMiniModel = ["o1-mini", "o3-mini"].includes(preferredModel);
    // Assume models supporting tools also support JSON format and system role
    const supportsToolsAndJson = !isMiniModel;

    // Construct the messages array for the API call
    const messages: ChatCompletionMessageParam[] = [];
    if (supportsToolsAndJson) {
        messages.push({ role: "system", content: prompt }); // Use system role for capable models
        messages.push(...conversationHistory); // Add chronological history
    } else {
        // Combine system prompt and history into the first user message for mini models
        const historyString = conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n---\n');
        const combinedFirstMessage = `${prompt}\n\nConversation History:\n${historyString}\n\nRespond to the last user message:`;
        messages.push({ role: "user", content: combinedFirstMessage });
    }


    // --- API Call Parameters ---
    let completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: preferredModel,
      messages: messages,
      // temperature: 0.7, // REMOVED: Set conditionally below
    };

    // Add model-specific parameters
    if (isMiniModel) {
        // No specific parameters needed for o1/o3 mini based on API error
        // (completionParams as any).reasoning_effort = "medium"; // REMOVED
        console.log("Model is o1/o3-mini. Using basic parameters.");
    } else {
        // Add parameters for other models (like GPT-4o)
        completionParams.temperature = 0.7; // Set temperature only for non-mini models
        // Add response_format if supported by non-mini models (assuming supportsToolsAndJson is true here)
        if (supportsToolsAndJson) { // Assuming non-mini models support JSON format
            completionParams.response_format = { type: "json_object" };
            console.log("Requesting JSON object format from capable model.");
        }
    }
    // Note: The `response_format` part was moved inside the else block
    // If mini models *could* support it, the logic would need adjustment.

    // DEBUG: Log final params before API call
    console.log("\n===== MESSAGING DEBUG: API CALL PARAMS =====");
    console.log(`Model: ${completionParams.model}`);
    console.log(`Temperature: ${completionParams.temperature ?? 'Not Set (Mini Model?)'}`);
    console.log(`Reasoning Effort: ${(completionParams as any).reasoning_effort ?? 'Not Set (GPT Model?)'}`);
    console.log(`Response Format: ${JSON.stringify(completionParams.response_format)}`);
    // console.log(`Tools enabled: ${supportsToolsAndJson}`); // Remove tool logging
    console.log(`Tools Parameter: NOT USED`); // Indicate tools are not being passed
    console.log(`Message Count: ${messages.length}`);
    // Avoid logging full messages/prompt in production
    // messages.forEach((m, i) => console.log(`Message ${i} Role: ${m.role}, Content Length: ${m.content?.length || 0}`));
    console.log("========================================\n");

    // --- Make the API Call ---
    try {
        const response = await openai.chat.completions.create(completionParams);

        // DEBUG: Log raw response choice
        console.log("\n===== MESSAGING DEBUG: RAW LLM RESPONSE CHOICE =====");
        // Avoid logging potentially large/sensitive content in production
        const choice = response.choices[0];
        console.log(`Finish Reason: ${choice?.finish_reason}`);
        console.log(`Has Content: ${!!choice?.message?.content}`);
        console.log(`Tool Calls: ${choice?.message?.tool_calls?.length || 0}`);
        // console.log(JSON.stringify(response.choices[0], null, 2)); // Use only for deep debugging
        console.log("============================================\n");

        if (!choice?.message) {
            throw new Error("No message received in the choice from OpenAI.");
        }

        // Return the complete assistant message object (includes content and tool_calls)
        return choice.message;

    } catch (error) {
        console.error("Error calling OpenAI completion API:", error);
        // Return a structured error message that processLLMResponse can handle
        // Ensure the returned object matches the ChatCompletionMessage type
        return {
            role: "assistant" as const, // Add 'as const' for literal type
            content: `{ "message": "Sorry, I encountered an error trying to process your request. Please try again later." }`, // Default JSON error
            tool_calls: undefined, // Explicitly add missing property
            refusal: null, // Add refusal property with null as default
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

    // Convert DB history to OpenAI format (chronological order)
    // Important: Include tool calls and results if stored in metadata for accurate history
    let conversationHistory: ChatCompletionMessageParam[] = dbHistory.map(msg => {
        const baseMsg: ChatCompletionMessageParam = {
            role: (msg.type === "user_message" || msg.type === "system_request") ? "user" as const : "assistant" as const,
            content: msg.content || "", // Ensure content is string
        };
        // TODO: Reconstruct tool_calls from metadata if assistant message requested them
        // TODO: Reconstruct tool result messages from metadata if they exist following a tool_calls message
        return baseMsg;
    }).reverse(); // Oldest first

    // Add the current user message to the history for the first API call
    conversationHistory.push({ role: "user", content: userMessageContent });

    let messageContext: MessageContext = { // Initial context for the *first* prompt
        user,
        tasks: userTasks, // Provide current tasks for initial context
        facts: userFacts,
        previousMessages: dbHistory, // Keep original format for prompt generation function
        currentDateTime: new Date().toLocaleString("en-US", { timeZone: user.timeZone || undefined, dateStyle: "full", timeStyle: "long" }),
        messageType: "response", // Default, can be refined (e.g., check if prior msg was proposal)
        userResponse: userMessageContent,
    };

    // 3. LLM Interaction Loop (Handles In-JSON Function Calls)
    let loopCount = 0;
    const MAX_LOOPS = 5; // Prevent infinite loops
    let currentFunctionResults: Record<string, any> | undefined = undefined; // Store results between loops
    let finalAssistantMessage: string | null = null; // Variable to hold the final message

    while (loopCount < MAX_LOOPS) {
        loopCount++;
        console.log(`Unified Response Loop - Iteration ${loopCount}`);

        // A. Update context with function results from the *previous* iteration, if any
        messageContext.functionResults = currentFunctionResults;
        // Log results being fed back into the prompt
        if (currentFunctionResults) {
            console.log(`\n--- Function Results Provided to LLM for Iteration ${loopCount} ---`);
            console.log(JSON.stringify(currentFunctionResults, null, 2));
            console.log("---------------------------------------------------\n");
        }

        // B. Build the prompt for this iteration
        const currentPrompt = this.createUnifiedPrompt(messageContext);

        // C. Call the LLM
        const assistantResponseObject = await this.generateUnifiedResponse(userId, currentPrompt, conversationHistory);
        const assistantRawContent = assistantResponseObject.content || `{ "message": "Error: Received empty response from LLM." }`; // Handle potential null content

        // D. Process the LLM's JSON Content String
        const processedResult = this.processLLMResponse(assistantRawContent);

        // E. Add the assistant's message to history
        conversationHistory.push({
            role: "assistant",
            content: processedResult.message 
        });

        // F. Check for Function Call Request
        if (processedResult.function_call && processedResult.function_call.name) {
            const functionCallRequest = processedResult.function_call;
            console.log(`LLM requested function call via JSON: ${functionCallRequest.name}`);

            // G. Execute Function and Collect Results
            const functionName = functionCallRequest.name;
            const functionArgs = functionCallRequest.arguments || {}; 
            let executionResult: any;
            let functionResultMessageContent = "";

            try {
                console.log(`Executing function: ${functionName} with args:`, functionArgs);
                // Use the new llmFunctionExecutors map
                const funcToExecute = llmFunctionExecutors[functionName]; 
                if (typeof funcToExecute === 'function') {
                    executionResult = await funcToExecute({ userId: userId }, functionArgs);
                    console.log(`Function ${functionName} result:`, executionResult);
                    functionResultMessageContent = JSON.stringify(executionResult);
                } else {
                    console.warn(`Unknown function called: ${functionName}`);
                    executionResult = { error: `Unknown function: ${functionName}` };
                    functionResultMessageContent = JSON.stringify(executionResult);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Error executing function ${functionName}:`, error);
                executionResult = { error: `Error executing function ${functionName}: ${errorMessage}` };
                functionResultMessageContent = JSON.stringify(executionResult);
            }

            // H. Add Function Result to History
            conversationHistory.push({
                role: "function",
                name: functionName,
                content: functionResultMessageContent
            });

            // I. Store results for next prompt context
            currentFunctionResults = { [functionName]: executionResult };

            // J. Continue loop
            continue;

        } else {
            // --- No Function Call Requested - Final Response ---
            console.log("LLM provided final response (no function_call field). Processing final actions.");
            
            // Store the final message content to be returned
            finalAssistantMessage = processedResult.message;

            // K. Perform Actions based on Final Processed Result
            // (Schedule updates, message scheduling, sentiment, etc. - Logic remains similar)
            const isConfirmation = processedResult.message.includes(FINAL_SCHEDULE_MARKER);
            const isProposal = processedResult.message.includes("PROPOSED_SCHEDULE_AWAITING_CONFIRMATION");
            let finalMetadata: any = {};

            // --- Handle Schedule Updates ---
            if (processedResult.scheduleUpdates && processedResult.scheduleUpdates.length > 0) {
                 // ... existing logic for handling scheduleUpdates ...
                  if (isConfirmation) {
                      console.log(`Processing ${processedResult.scheduleUpdates.length} confirmed schedule updates.`);
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
                  console.log("Processing schedule confirmation based on marker (no explicit updates in final JSON).");
                  await db.insert(messageHistory).values({ userId, content: "✅ Schedule confirmed!", type: "system_notification", status: "sent", createdAt: new Date() });
            }

            // --- Handle Scheduled Messages ---
            if (processedResult.scheduledMessages && processedResult.scheduledMessages.length > 0) {
                 console.log(`Processing ${processedResult.scheduledMessages.length} scheduled messages.`);
                 await this.processScheduledMessages(userId, processedResult.scheduledMessages);
            }

            // --- Handle Sentiment / Auto Follow-up ---
            if ((!processedResult.scheduledMessages || processedResult.scheduledMessages.length === 0) && !isProposal && !isConfirmation) {
                 const sentiment = await this.analyzeSentiment(processedResult.message, userId);
                 if (sentiment.needsFollowUp) {
                     await this.scheduleFollowUp(userId, sentiment.type);
                 }
            }

            // L. Save Final Assistant Message to History
             console.log(`[DEBUG] Saving final assistant message to DB. Content: "${finalAssistantMessage}"`);

             // Metadata and confirmation checks are already done in the surrounding scope
             // let finalMetadata: any = {}; // REMOVED Redeclaration
             // const isConfirmation = finalAssistantMessage.includes(FINAL_SCHEDULE_MARKER); // REMOVED Redeclaration
             // const isProposal = finalAssistantMessage.includes("PROPOSED_SCHEDULE_AWAITING_CONFIRMATION"); // REMOVED Redeclaration
             
             // Use existing finalMetadata
             let metadataToSave = finalMetadata; // Rename for clarity inside try block if needed, or use directly

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
                 console.error(`[CRITICAL] Failed to save final assistant message to DB for user ${userId}:`, dbError);
                 // Consider returning an error state later if needed.
             }

            // M. Send Final Message to User (Keep this for now for WhatsApp)
            if (user.phoneNumber && user.contactPreference === 'whatsapp') {
                await this.sendWhatsAppMessage(user.phoneNumber, processedResult.message);
            }

            // N. Exit Loop - processing complete
            break;
        }
    } // End while loop

    if (loopCount >= MAX_LOOPS) {
        console.error(`Max loops (${MAX_LOOPS}) reached for user ${userId}. Aborting.`);
        // Send a fallback message to the user
         const fallbackMsg = "Sorry, I got stuck trying to process that. Could you try rephrasing?";
         await db.insert(messageHistory).values({ userId, content: fallbackMsg, type: "coach_response", status: "sent", createdAt: new Date() });
         if (user.phoneNumber && user.contactPreference === "whatsapp") {
            await this.sendWhatsAppMessage(user.phoneNumber, fallbackMsg);
         }
    }
    
    return finalAssistantMessage; // Return the final message content
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
      };

      // 2. Prepare Conversation History for API
       // System messages might not need deep history, but include some for context.
      let conversationHistory: ChatCompletionMessageParam[] = dbHistory.map(msg => ({
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
        content: processedResult.message,
        type: "coach_response", // Mark as coach response, metadata indicates system initiated
        status: "sent",
        metadata: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
        createdAt: new Date(),
      });

       // Only send interactive system messages (like summaries/proposals) to the user
       const shouldSendMessage = systemRequestType === 'morning_summary' || systemRequestType === 'reschedule_request';
       if (user.phoneNumber && user.contactPreference === 'whatsapp' && shouldSendMessage) {
            await this.sendWhatsAppMessage(user.phoneNumber, processedResult.message);
            console.log(`Sent system-initiated message (${systemRequestType}) to user ${userId}`);
        } else {
            console.log(`System message type ${systemRequestType} generated, but not sent directly to user.`);
        }

      return processedResult.message; // Return generated message content

    } catch (error) {
      console.error(`Error handling system message (${systemRequestType}) for user ${userId}:`, error);
      // Don't save or send anything on error
      return "Sorry, I encountered an error processing the system request.";
    }
  }


  // --- Supporting Functions (Keep Existing Implementations) ---

  // processLLMResponse (Modified for in-JSON function calls)
  processLLMResponse(content: string): {
    message: string;
    function_call?: { // Add optional function_call field
      name: string;
      arguments: Record<string, any>;
    };
    scheduleUpdates?: ScheduleUpdate[];
    scheduledMessages?: Array<{ type: string; scheduledFor: string; content: string; title?: string; }>;
    // agentMode?: boolean; // Removed agentMode flag as it's implicit now
    // requiredActions?: Array<{ name: string; params?: Record<string, any>; }>; // Removed requiredActions as it's replaced by function_call
  } {
    try {
      let cleanContent = content.trim();
      // Remove potential markdown code fences
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.substring(7);
        if (cleanContent.endsWith("```")) {
          cleanContent = cleanContent.substring(0, cleanContent.length - 3);
        }
      }
       cleanContent = cleanContent.trim(); // Trim again after removing fences

      // Try standard parsing
      const parsed = JSON.parse(cleanContent);

      // Basic validation - ensure message exists
       if (typeof parsed.message !== 'string') {
           console.warn("Parsed JSON response lacks a 'message' string field. Using raw content.", content);
           throw new Error("Missing message field"); // Trigger fallback
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

      // --- Add back any necessary processing/validation logic here ---
      // (e.g., Schedule proposal markers)

      return {
        message: parsed.message,
        function_call: functionCall, // Include parsed function call
        scheduleUpdates: Array.isArray(parsed.scheduleUpdates) ? parsed.scheduleUpdates : [],
        scheduledMessages: Array.isArray(parsed.scheduledMessages) ? parsed.scheduledMessages : [],
      };

    } catch (error: unknown) {
      // --- Fallback Logic ---
      console.warn("Could not parse LLM response as JSON. Treating raw content as message:", content);
      let fallbackMessage = content;
      if (content.trim().startsWith("{") && content.trim().endsWith("}")) {
          fallbackMessage = "Sorry, I had trouble formatting my response. Can you try asking again?";
      }

      return {
        message: fallbackMessage,
        // No function call in fallback
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
                 if(taskId) await storage.updateTask(taskId, { scheduledTime: update.scheduledTime, recurrencePattern: update.recurrencePattern });
                 break;
             case "complete":
                 if(taskId) await storage.completeTask(taskId);
                 break;
             case "skip":
                  if(taskId) console.log(`User requested to skip task ${taskId} today.`); // Log only for now
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
       console.error(`Error processing schedule updates for user ${userId}:`, error);
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
       console.error(`Error processing scheduled messages batch for user ${userId}:`, error);
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
        console.error(`Error scheduling follow-up for user ${userId}:`, error);
     }
   }

  // processPendingSchedules (Keep existing - consider if it needs updates for new structure)
  async processPendingSchedules(): Promise<void> {
    const now = new Date();
    const pendingSchedules = await db.select().from(messageSchedules).where(and(eq(messageSchedules.status, "pending"), lte(messageSchedules.scheduledFor, now)));

    for (const schedule of pendingSchedules) {
      try {
        console.log(`Processing schedule ${schedule.id} type ${schedule.type} for user ${schedule.userId}`);
        const [user] = await db.select().from(users).where(eq(users.id, schedule.userId)).limit(1);
        if (!user || !user.phoneNumber) continue; // Skip if user/phone missing

         // Map schedule type to system request type
         let systemRequestType: string = 'follow_up'; // Default
         if (schedule.type === 'morning_message') systemRequestType = 'morning_summary';
         // Add other mappings if needed

         // Use handleSystemMessage to generate and send the message
         const messageContent = await this.handleSystemMessage(
             schedule.userId,
             systemRequestType,
             { messageScheduleId: schedule.id } // Pass context if needed
         );

         // Check if message generation/sending was successful (handleSystemMessage sends it)
         // We might need better error propagation from handleSystemMessage if needed here
         if (messageContent && !messageContent.startsWith("Sorry")) {
             // Update schedule status if sent successfully
             await db.update(messageSchedules).set({ status: "sent", sentAt: now }).where(eq(messageSchedules.id, schedule.id));
             console.log(`Successfully processed and sent scheduled message ${schedule.id}`);

             // Reschedule recurring tasks like morning message?
             // if (schedule.type === 'morning_message') { /* Reschedule logic */ }

         } else {
            console.error(`Failed to generate/send message for schedule ${schedule.id}. Content: ${messageContent}`);
            // Optionally update status to 'failed'
             await db.update(messageSchedules).set({ status: "failed", updatedAt: now }).where(eq(messageSchedules.id, schedule.id));
         }
      } catch (error) {
        console.error(`Failed to process schedule ${schedule.id}:`, error);
         // Optionally update status to 'failed'
         try {
             await db.update(messageSchedules).set({ status: "failed", updatedAt: now }).where(eq(messageSchedules.id, schedule.id));
         } catch (dbError) {
             console.error(`Failed to update schedule ${schedule.id} status to failed:`, dbError);
         }
      }
    }
  }
}

export const messagingService = new MessagingService();
