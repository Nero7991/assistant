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
} from "@shared/schema";
import { db } from "../db";
import { eq, and, lte, desc, gt, isNull } from "drizzle-orm";
import { storage } from "../storage";
import {
  parseScheduleFromLLMResponse,
  createDailyScheduleFromParsed,
  confirmSchedule,
} from "./schedule-parser-new";
import { llmFunctions, llmFunctionDefinitions } from "./llm-functions";

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
  previousMessages: MessageHistory[];
  currentDateTime: string;
  messageType:
    | "morning"
    | "follow_up"
    | "response"
    | "reschedule"
    | "schedule_confirmation_response";
  userResponse?: string;
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
  // Add a method to get the user's preferred model or use the default
  private async getUserPreferredModel(userId: number): Promise<string> {
    try {
      const user = await storage.getUser(userId);
      return user?.preferredModel || "gpt-4o"; // Default to gpt-4o if no preference set
    } catch (error) {
      console.error("Error getting user preferred model:", error);
      return "gpt-4o"; // Fall back to default model on error
    }
  }
  async generateMorningMessage(context: MessageContext): Promise<string> {
    const activeTasks = context.tasks.filter(
      (task) => task.status === "active",
    );
    const todaysTasks = activeTasks.filter((task) => {
      // Check if it's a daily task with scheduled time
      return task.taskType === TaskType.DAILY && task.scheduledTime;
    });

    // Get incomplete subtasks
    const subtaskList: Subtask[] = [];
    for (const task of activeTasks) {
      if (task.id) {
        const taskSubtasks = await storage.getSubtasks(task.id);
        const incompleteSubtasks = taskSubtasks.filter((st) => !st.completedAt);
        subtaskList.push(...incompleteSubtasks);
      }
    }

    // Format current date and time in user's timezone if available
    let formattedDateTime;
    if (context.user.timeZone) {
      formattedDateTime = new Date().toLocaleString("en-US", {
        timeZone: context.user.timeZone,
        dateStyle: "full",
        timeStyle: "long",
      });
    } else {
      formattedDateTime = context.currentDateTime;
    }

    const prompt = `
      You are an ADHD coach and accountability partner. Create a friendly, to-the-point morning message for ${context.user.username}.
      Current date and time: ${formattedDateTime}
      
      User time preferences:
      - Wake up time: ${context.user.wakeTime || "08:00"}
      - Routine start time: ${context.user.routineStartTime || "09:30"}
      - Sleep time: ${context.user.sleepTime || "23:00"}

      Here's what you know about the user (use this to inform your tone, but don't explicitly mention these facts):
      ${context.facts.map((fact) => `- ${fact.category}: ${fact.content}`).join("\n")}

      Their current tasks:
      ${context.tasks
        .map(
          (task) =>
            `- ID:${task.id} | ${task.title} (${task.status})${task.scheduledTime ? ` scheduled at ${task.scheduledTime}` : ""}${task.recurrencePattern && task.recurrencePattern !== "none" ? ` recurring: ${task.recurrencePattern}` : ""}`,
        )
        .join("\n")}

      Active subtasks:
      ${subtaskList
        .map((st) => {
          const parentTask = context.tasks.find(
            (t) => t.id === st.parentTaskId,
          );
          return `- ${st.title} (for task: ${parentTask?.title || "Unknown"})${st.scheduledTime ? ` scheduled at ${st.scheduledTime}` : ""}${st.recurrencePattern && st.recurrencePattern !== "none" ? ` recurring: ${st.recurrencePattern}` : ""}`;
        })
        .join("\n")}

      Previous interactions (newest first, to understand recent context):
      ${context.previousMessages.map((msg) => `- ${msg.type}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? "..." : ""}`).join("\n")}

      INSTRUCTION:
      When scheduling the day with the user, if the user confirms the schedule, include "The final schedule is as follows" string as this will be detected by the scheduling system. When the user confirm, respond again with the final schedule including the string.

      Your message must follow this structure:
      1. Brief, friendly greeting (e.g., "Morning, [name]!")
      2. 2-3 sentence introduction including a positive note
      3. Today's suggested schedule formatted as:
         • Short bullet points with task names and SPECIFIC times (e.g., "9:30 AM - Send project update")
         • Include start times for all tasks, and optionally end times for longer tasks
         • List tasks in chronological order throughout the day
         • Include 5-8 priority tasks with specific times
         • For each task with an ID, use the exact task title and include the ID in parentheses
      4. End with a single simple question asking if they need any changes

      Example format:
      "Morning, ${context.user.username}! Hope you slept well. Let's make today productive but manageable.

      - 8:00 AM: Morning routine
      - 9:30 AM: Work on project X (Task ID: 123)
      - 12:00 PM: Lunch break
      - 1:00 PM: Team meeting (Task ID: 124)
      - 3:00 PM: Deep work session (Task ID: 125)
      - 5:00 PM: Wrap up and plan tomorrow

      How does this schedule look? Need any adjustments?"

      DO NOT include "The final schedule is as follows" unless the user confirms the schedule.

      IMPORTANT MESSAGING GUIDELINES:
      - Write as if you're texting a friend
      - Use minimal text with clear, concise sentences
      - At most one emoji if appropriate
      - Make it easy to read at a glance on a phone
      - Sound encouraging but not overwhelming
      - Focus on clarity and brevity above all
    `;

    // DEBUG: Print the morning message prompt
    console.log("\n===== MESSAGING DEBUG: MORNING MESSAGE PROMPT =====");
    console.log(prompt);
    console.log("========================================\n");
    
    // Get the user's preferred model
    const preferredModel = await this.getUserPreferredModel(context.user.id);
    console.log(`Using user's preferred model: ${preferredModel} for morning message`);

    // Different models require different parameters
    let completionParams: any = {
      model: preferredModel,
    };
    
    // Handle different model requirements
    if (preferredModel === "o1-mini" || preferredModel === "o3-mini") {
      // For o1-mini/o3-mini, use only user role as these models don't support system or developer roles
      completionParams.messages = [
        { role: "user", content: "Act as an ADHD coach helping with scheduling. " + prompt }
      ];
      console.log("Using model with simple user role prompt for o1-mini model");
      // No temperature parameter - using default
    } else {
      // For standard models
      completionParams.messages = [
        { role: "system", content: "You are an ADHD coach helping with scheduling." },
        { role: "user", content: prompt }
      ];
      completionParams.temperature = 0.7;
    }
    
    const response = await openai.chat.completions.create(completionParams);

    return response.choices[0].message.content || "Unable to generate message";
  }

  async generateFollowUpMessage(context: MessageContext): Promise<string> {
    const lastSentMessage = context.previousMessages.find(
      (msg) => msg.type === "morning_message" || msg.type === "follow_up",
    );
    const metadata = context.previousMessages[0]?.metadata || ({} as any);
    const responseType = metadata.sentiment?.type || "neutral";

    const activeTasks = context.tasks.filter(
      (task) => task.status === "active",
    );
    const todaysTasks = activeTasks.filter((task) => {
      // Check if it's a daily task with scheduled time for today
      return task.taskType === TaskType.DAILY && task.scheduledTime;
    });

    // Format current date and time in user's timezone if available
    let formattedDateTime;
    if (context.user.timeZone) {
      formattedDateTime = new Date().toLocaleString("en-US", {
        timeZone: context.user.timeZone,
        dateStyle: "full",
        timeStyle: "long",
      });
    } else {
      formattedDateTime = context.currentDateTime;
    }

    const prompt = `
      You are an ADHD coach and accountability partner. Create a friendly, to-the-point follow-up message for ${context.user.username}.
      Current date and time: ${formattedDateTime}
      
      User time preferences:
      - Wake up time: ${context.user.wakeTime || "08:00"}
      - Routine start time: ${context.user.routineStartTime || "09:30"}
      - Sleep time: ${context.user.sleepTime || "23:00"}
      
      Here's what you know about the user (use this to inform your tone, but don't explicitly mention these facts):
      ${context.facts.map((fact) => `- ${fact.category}: ${fact.content}`).join("\n")}
      
      Their current tasks:
      ${activeTasks
        .map(
          (task) =>
            `- ID:${task.id} | ${task.title} (${task.status})${task.scheduledTime ? ` scheduled at ${task.scheduledTime}` : ""}${task.recurrencePattern && task.recurrencePattern !== "none" ? ` recurring: ${task.recurrencePattern}` : ""}`,
        )
        .join("\n")}
      
      Previous messages (newest first, to understand recent context):
      ${context.previousMessages
        .slice(0, 5)
        .map(
          (msg) =>
            `- ${msg.type}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? "..." : ""}`,
        )
        .join("\n")}
      
      Last message sentiment: ${responseType}
      
      VERY IMPORTANT INSTRUCTION:
      When scheduling the day with the user, if the user confirms the schedule, include "The final schedule is as follows" string as this will be detected by the scheduling system. When the user confirm, respond againg with the final schedule including the string.
      
      Your message should be:
      1. Brief and friendly check-in on their progress with a specific task mentioned in recent messages
      2. Only include supportive encouragement (based on sentiment: ${responseType})
      3. End with a simple, direct question that's easy to answer

      IMPORTANT FORMATTING RULES:
      - Keep the message under 400 characters total
      - Write as if you're checking in with a friend via text
      - Use minimal text with clear, concise sentences
      - At most one emoji if appropriate
      - Make it easy to read on a phone at a glance
    `;

    // log the prompt
    console.log("Follow-up prompt:", prompt);
    
    // Get the user's preferred model
    const preferredModel = await this.getUserPreferredModel(context.user.id);
    console.log(`Using user's preferred model: ${preferredModel} for follow-up message`);

    // Different models require different parameters
    let completionParams: any = {
      model: preferredModel,
    };
    
    // Handle different model requirements
    if (preferredModel === "o1-mini" || preferredModel === "o3-mini") {
      // For o1-mini/o3-mini, use only user role as these models don't support system or developer roles
      completionParams.messages = [
        { role: "user", content: "Act as an ADHD coach helping with scheduling. " + prompt }
      ];
      console.log("Using model with simple user role prompt for o1-mini model");
      // No temperature parameter - using default
    } else {
      // For standard models
      completionParams.messages = [
        { role: "system", content: "You are an ADHD coach helping with scheduling." },
        { role: "user", content: prompt }
      ];
      completionParams.temperature = 0.7;
    }
    
    const response = await openai.chat.completions.create(completionParams);

    return (
      response.choices[0].message.content ||
      "Unable to generate follow-up message"
    );
  }

  async generateResponseMessage(
    context: MessageContext,
    existingScheduleUpdates: ScheduleUpdate[] = [],
  ): Promise<{
    message: string;
    scheduleUpdates?: ScheduleUpdate[];
    scheduledMessages?: Array<{
      type: string;
      scheduledFor: string;
      content: string;
    }>;
  }> {
    if (!context.userResponse) {
      throw new Error("User response is required for response generation");
    }

    // Format past messages with timestamps to give better context - increased to 20 messages
    const formattedPreviousMessages = context.previousMessages
      .slice(0, 20)
      .map((msg) => {
        const messageTime = new Date(msg.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const messageType = msg.type === "user_message" ? "User" : "Coach";
        return `[${messageTime}] ${messageType}: ${msg.content}`;
      })
      .reverse()
      .join("\n\n");

    const conversationHistory = context.previousMessages
      .slice(0, 20)
      .map((msg) => {
        if (msg.type === "user_message" || msg.type === "system_request") {
          return { role: "user" as const, content: msg.content };
        } else {
          return { role: "assistant" as const, content: msg.content };
        }
      })
      .reverse();

    const activeTasks = context.tasks.filter(
      (task) => task.status === "active",
    );

    // Get subtasks for each active task
    const subtasksByTask: Record<number, Subtask[]> = {};
    for (const task of activeTasks) {
      if (task.id) {
        const taskSubtasks = await storage.getSubtasks(task.id);
        subtasksByTask[task.id] = taskSubtasks;
      }
    }

    // Format current date and time in user's timezone if available
    let formattedDateTime;
    if (context.user.timeZone) {
      formattedDateTime = new Date().toLocaleString("en-US", {
        timeZone: context.user.timeZone,
        dateStyle: "full",
        timeStyle: "long",
      });
    } else {
      formattedDateTime = context.currentDateTime;
    }

    // Create a single unified prompt that lets the LLM determine the context and response type
    const prompt = `
      You are an ADHD coach and accountability partner chatting with ${context.user.username}.
      Current date and time: ${formattedDateTime}
      
      User time preferences:
      - Wake up time: ${context.user.wakeTime || "08:00"}
      - Routine start time: ${context.user.routineStartTime || "09:30"}
      - Sleep time: ${context.user.sleepTime || "23:00"}
      
      Here's what you know about the user (use this to inform your tone, but don't explicitly mention these facts):
      ${context.facts.map((fact) => `- ${fact.category}: ${fact.content}`).join("\n")}
      
      Their current active tasks (with IDs you'll need for scheduling):
      ${activeTasks
        .map(
          (task) =>
            `- ID:${task.id} | ${task.title} | Type: ${task.taskType}${task.scheduledTime ? ` | Scheduled at: ${task.scheduledTime}` : ""}${task.recurrencePattern && task.recurrencePattern !== "none" ? ` | Recurring: ${task.recurrencePattern}` : ""}`,
        )
        .join("\n")}
      
      Recent conversation history (newest first):
      ${formattedPreviousMessages}
      
      The user just messaged you: "${context.userResponse}"
      
      YOU HAVE ACCESS TO THE FOLLOWING FUNCTIONS:
      1. get_todays_notifications() - Returns notifications scheduled for today
      2. get_task_list({ status }) - Returns tasks with optional status filter ('active', 'completed', 'all')
      3. get_user_facts({ category }) - Returns known facts about the user, optionally filtered by category
      4. get_todays_schedule() - Returns the schedule for today
      
      IMPORTANT: HOW TO CALL FUNCTIONS:
      - If you need any information from these sources, use the appropriate function
      - Ask one question at a time that requires access to this data
      - For example: If the user asks "What's on my schedule today?", call get_todays_schedule()
      - After you receive data, incorporate it into your response in a helpful way
      
      CONTEXT ANALYSIS INSTRUCTIONS:
      1. Understand the user's intention from their natural language request
      2. If user wants to add a reminder, check-in, or follow-up, create an appropriate scheduleUpdate
      3. If user wants to modify their schedule, interpret which tasks they're referring to
      4. If user is confirming a schedule you proposed, prepare the final schedule
      5. Extract specific times, tasks, or activities mentioned by the user
      
      RESPONSE CAPABILITIES:
      1. SCHEDULE TASKS: Use scheduleUpdates with action "reschedule" to set times for tasks
      2. CREATE CHECK-INS: Include scheduledMessages to create follow-ups at specific times
      3. COMPLETE TASKS: Use scheduleUpdates with action "complete" to mark tasks as done
      4. CREATE NEW TASKS: Use scheduleUpdates with action "create" to add new tasks
      5. CLEAR SCHEDULE: Use appropriate scheduleUpdates to modify the user's day
      
      SCHEDULE CONFIRMATION:
      - If the user confirms a proposed schedule, include "The final schedule is as follows:"
      - For new schedule proposals, do NOT include the confirmation phrase
      - For schedule proposals, add "PROPOSED_SCHEDULE_AWAITING_CONFIRMATION" at the end
      
      ALWAYS FORMAT YOUR RESPONSE AS A JSON OBJECT:
      {
        "message": "Your conversational response to the user",
        "scheduleUpdates": [  // For updating tasks or creating new ones
          {
            "taskId": 123,   // Task ID or descriptive string for new tasks
            "action": "reschedule|complete|skip|create", 
            "scheduledTime": "16:30",  // 24-hour format
            "title": "New task name",  // Only for action "create"
            "description": "Details"   // Only for action "create"
          }
        ],
        "scheduledMessages": [  // For creating follow-up messages/reminders
          {
            "type": "follow_up",
            "scheduledFor": "20:30",  // 24-hour format
            "content": "Brief description of what this reminder is about"
          }
        ]
      }
      
      ${
        existingScheduleUpdates && existingScheduleUpdates.length > 0
          ? `IMPORTANT: If the user is confirming a schedule, use these existing schedule updates in your response:
        ${JSON.stringify(existingScheduleUpdates, null, 2)}`
          : ""
      }
    `;

    // DEBUG: Print the complete prompt being sent to the LLM
    console.log("\n===== MESSAGING DEBUG: RESPONSE PROMPT =====");
    console.log(prompt);
    console.log("\n===== MESSAGING DEBUG: USER RESPONSE =====");
    console.log(context.userResponse);
    console.log("\n===== MESSAGING DEBUG: CONVERSATION HISTORY =====");
    console.log(JSON.stringify(conversationHistory, null, 2));
    console.log("========================================\n");
    
    // Get the user's preferred model
    const preferredModel = await this.getUserPreferredModel(context.user.id);
    console.log(`Using user's preferred model: ${preferredModel} for response message`);

    // Send the prompt to the LLM for processing
    // Different models require different parameters
    let completionParams: any = {
      model: preferredModel,
    };
    
    // Set up function calling for supported models
    const isMiniModel = ["o1-mini", "o3-mini"].includes(preferredModel);
    const supportsFunctionCalling = !isMiniModel;
    
    if (supportsFunctionCalling) {
      // Add function definitions for supported models
      completionParams.tools = llmFunctionDefinitions.map(func => ({
        type: "function",
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters
        }
      }));
    }

    // o1-mini and o3-mini models don't support system messages or response_format
    if (preferredModel === "o1-mini" || preferredModel === "o3-mini") {
      // For o1-mini/o3-mini, use only user role as these models don't support system or developer roles
      console.log("Using model with simple user role prompt for o1-mini model");
      
      // Combine the instructions into the user message for models that don't support system role
      const combinedUserMessage = `Act as an ADHD coach helping with task management.

${prompt}

SPECIAL INSTRUCTIONS FOR FUNCTION CALLING:
Since you can't directly call functions, here's what to do:
1. If you need to get today's schedule, say "I need to get your schedule" in your response
2. If you need to get task information, say "I need to check your tasks" in your response
3. If you need user facts, say "I need to review your preferences" in your response
4. If you need notifications, say "I need to check your notifications" in your response

I'll make sure to provide that information to you in a follow-up message.

Now, please respond to this user message: "${context.userResponse}"`;
      
      // Set only compatible parameters using user role
      completionParams.messages = [
        { role: "user", content: combinedUserMessage }
      ];
      // No temperature parameter set - using default
    } else {
      // For models that support system role, use normal message structure
      completionParams.messages = [
        { role: "system", content: prompt },
        ...conversationHistory,
        { role: "user", content: context.userResponse },
      ];
      
      // Add response_format for models that support it
      completionParams.response_format = { type: "json_object" };
      completionParams.temperature = 0.7;
    }
    
    const response = await openai.chat.completions.create(completionParams);

    // Process function calls if present
    if (response.choices[0].message.tool_calls && response.choices[0].message.tool_calls.length > 0) {
      // Process each function call
      const functionResults: Record<string, any> = {};
      
      for (const toolCall of response.choices[0].message.tool_calls) {
        if (toolCall.type === 'function') {
          const functionName = toolCall.function.name;
          let functionArgs = {};
          
          try {
            functionArgs = JSON.parse(toolCall.function.arguments);
          } catch (error) {
            console.error(`Failed to parse function arguments for ${functionName}:`, error);
          }
          
          // Execute the corresponding function
          try {
            let result;
            switch (functionName) {
              case 'get_todays_notifications':
                result = await llmFunctions.getTodaysNotifications({ userId: context.user.id });
                break;
              case 'get_task_list':
                result = await llmFunctions.getTaskList({ userId: context.user.id }, functionArgs);
                break;
              case 'get_user_facts':
                result = await llmFunctions.getUserFacts({ userId: context.user.id }, functionArgs);
                break;
              case 'get_todays_schedule':
                result = await llmFunctions.getTodaysSchedule({ userId: context.user.id });
                break;
              default:
                console.warn(`Unknown function called by LLM: ${functionName}`);
                result = { error: `Unknown function: ${functionName}` };
            }
            
            functionResults[toolCall.function.name] = result;
          } catch (error) {
            console.error(`Error executing function ${functionName}:`, error);
            functionResults[toolCall.function.name] = { error: `Error executing function: ${error instanceof Error ? error.message : String(error)}` };
          }
        }
      }
      
      // Now continue the conversation with the function results
      console.log("Function results:", JSON.stringify(functionResults, null, 2));
      
      // Add the function results to the conversation
      if (isMiniModel) {
        // For o1-mini, we need to combine everything into a single user message
        const functionUserMessage = `Act as an ADHD coach helping with task management.
         
         Previous context:
         ${prompt}
         
         User's message: ${context.userResponse}
         
         I requested the following information:
         ${Object.keys(functionResults).map(fn => `Function: ${fn}`).join("\n")}
         
         And received these results:
         ${JSON.stringify(functionResults, null, 2)}
         
         Based on this information, please provide a helpful response as an ADHD coach.`;
        
        const followUpMessages = [{ role: "user", content: functionUserMessage }];
        
        const functionResponseParams: any = {
          model: completionParams.model,
          messages: followUpMessages
        };
        
        console.log(`Sending follow-up request for mini model`);
        const functionResponse = await openai.chat.completions.create(functionResponseParams);
        
        // Use this as our final response
        const content = functionResponse.choices[0].message.content;
        if (!content)
          return { message: "I couldn't generate a response. Please try again." };
          
        console.log("Function-based response:", content);
        
        return this.processLLMResponse(content);
      } else {
        // For standard models, use the OpenAI function calling protocol
        try {
          // First, add the assistant message with tool calls
          const messages = [
            ...completionParams.messages,
            response.choices[0].message
          ];
          
          // Then add each tool response separately for ALL tool calls
          if (response.choices[0].message.tool_calls) {
            for (const toolCall of response.choices[0].message.tool_calls) {
              if (toolCall.type === 'function') {
                const functionName = toolCall.function.name;
                const result = functionResults[functionName] || { error: "Function not executed" };
                
                messages.push({
                  role: "tool" as const,
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(result)
                });
              }
            }
          }
          
          // Log the complete messages array for debugging
          console.log("Function call messages:", JSON.stringify(messages.map(m => ({
            role: m.role,
            tool_call_id: 'tool_call_id' in m ? m.tool_call_id : undefined,
            content_length: m.content ? m.content.length : 0,
            tool_calls: 'tool_calls' in m ? m.tool_calls?.length : undefined
          })), null, 2));
          
          // Continue the conversation with the function results
          const functionResponseParams: any = {
            model: completionParams.model,
            messages: messages,
            temperature: 0.7,
            response_format: { type: "json_object" },
          };
          
          console.log(`Sending follow-up request for standard model`);
          const functionResponse = await openai.chat.completions.create(functionResponseParams);
          
          // Use this as our final response
          const content = functionResponse.choices[0].message.content;
          if (!content)
            return { message: "I couldn't generate a response. Please try again." };
            
          console.log("Function-based response:", content);
          
          return this.processLLMResponse(content);
        } catch (error) {
          console.error("Error in function call processing:", error);
          // Fallback to standard response without function calling
          return {
            message: "I encountered an issue while processing your request. Let me try to help anyway: " +
                     "Based on the information available, I can help you manage your tasks and schedule. " +
                     "What specifically would you like assistance with today?"
          };
        }
      }
    }

    // Handle standard (non-function) responses
    const content = response.choices[0].message.content || "";
    if (!content)
      return { message: "I couldn't generate a response. Please try again." };

    // DEBUG: Print the raw LLM response
    console.log("\n===== MESSAGING DEBUG: RAW LLM RESPONSE =====");
    console.log(content);
    console.log("========================================\n");

    return this.processLLMResponse(content);
  }

  processLLMResponse(content: string): {
    message: string;
    scheduleUpdates?: ScheduleUpdate[];
    scheduledMessages?: Array<{
      type: string;
      scheduledFor: string;
      content: string;
    }>;
  } {
    try {
      // Clean up the content if it contains markdown formatting
      let cleanContent = content;
      if (content.includes("```json")) {
        cleanContent = content.replace(/```json\n/g, "").replace(/\n```/g, "");
      }
      
      const parsed = JSON.parse(cleanContent);

      // Ensure schedule proposals have the proper marker
      if (
        parsed.scheduleUpdates &&
        parsed.scheduleUpdates.length > 0 &&
        !parsed.message.includes("The final schedule is as follows:") &&
        !parsed.message.includes("PROPOSED_SCHEDULE_AWAITING_CONFIRMATION")
      ) {
        parsed.message += "\n\nPROPOSED_SCHEDULE_AWAITING_CONFIRMATION";
      }

      // Process the response to ensure proper formatting
      if (parsed.scheduleUpdates && parsed.scheduleUpdates.length > 0) {
        console.log("Processing message with schedule updates");

        // Check if this is a confirmation (contains the final schedule marker)
        const isConfirmation = parsed.message.includes(
          "The final schedule is as follows:",
        );

        if (isConfirmation) {
          console.log(
            "Message contains final schedule marker - this is a CONFIRMATION",
          );
          // No need to modify the message, it already has the correct marker
        } else {
          console.log(
            "Message does not contain final schedule marker - this is a PROPOSAL",
          );

          // Make sure we don't have any final schedule markers in proposals
          if (parsed.message.includes("The final schedule is as follows:")) {
            parsed.message = parsed.message.replace(
              "The final schedule is as follows:",
              "Here's a proposed schedule:",
            );
            console.log(
              "Replaced final schedule marker with proposed schedule text",
            );
          }
        }
      }

      return {
        message: parsed.message,
        scheduleUpdates: parsed.scheduleUpdates || [],
        scheduledMessages: parsed.scheduledMessages || [],
      };
    } catch (error) {
      console.error("Failed to parse LLM response as JSON:", error);
      return { message: content };
    }
  }

  async generateRescheduleMessage(context: MessageContext): Promise<{
    message: string;
    scheduleUpdates?: ScheduleUpdate[];
    scheduledMessages?: Array<{
      type: string;
      scheduledFor: string;
      content: string;
    }>;
  }> {
    const activeTasks = context.tasks.filter(
      (task) => task.status === "active",
    );

    // Get subtasks for each active task
    const subtasksByTask: Record<number, Subtask[]> = {};
    for (const task of activeTasks) {
      if (task.id) {
        const taskSubtasks = await storage.getSubtasks(task.id);
        subtasksByTask[task.id] = taskSubtasks;
      }
    }

    // Get current time in user's timezone for context
    let currentDateTime;
    let currentTimeFormatted;
    let currentTime;

    // Format current date and time in user's timezone if available
    if (context.user.timeZone) {
      const now = new Date();

      // Full date and time format
      currentDateTime = now.toLocaleString("en-US", {
        timeZone: context.user.timeZone,
        dateStyle: "full",
        timeStyle: "long",
      });

      // Time-only format (for display in schedule)
      currentTimeFormatted = now.toLocaleString("en-US", {
        timeZone: context.user.timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      currentTime = now;
    } else {
      currentDateTime = context.currentDateTime;
      currentTime = new Date(context.currentDateTime);
      currentTimeFormatted = currentTime.toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    // Format past messages with timestamps converted to user's timezone
    const formattedPreviousMessages = context.previousMessages
      .slice(0, 10)
      .map((msg) => {
        let messageTime;

        if (context.user.timeZone) {
          // Convert to user's timezone
          messageTime = new Date(msg.createdAt).toLocaleTimeString("en-US", {
            timeZone: context.user.timeZone,
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          // Fallback to system timezone
          messageTime = new Date(msg.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        }

        const messageType = msg.type === "user_message" ? "User" : "Coach";
        return `[${messageTime}] ${messageType}: ${msg.content}`;
      })
      .reverse()
      .join("\n\n");

    const prompt = `
      You are an ADHD coach and accountability partner helping ${context.user.username} reschedule their day.
      Current date and time: ${currentDateTime}
      Current time in 24-hour format: ${currentTimeFormatted}
      
      User time preferences:
      - Wake up time: ${context.user.wakeTime || "08:00"}
      - Routine start time: ${context.user.routineStartTime || "09:30"}
      - Sleep time: ${context.user.sleepTime || "23:00"}
      
      Here's what you know about the user (use this to inform your tone, but don't explicitly mention these facts):
      ${context.facts.map((fact) => `- ${fact.category}: ${fact.content}`).join("\n")}
      
      Their current active tasks (with IDs you'll need for scheduling):
      ${activeTasks
        .map(
          (task) =>
            `- ID:${task.id} | ${task.title} | Type: ${task.taskType}${task.scheduledTime ? ` | Scheduled at: ${task.scheduledTime}` : ""}${task.recurrencePattern && task.recurrencePattern !== "none" ? ` | Recurring: ${task.recurrencePattern}` : ""} | Description: ${task.description || "No description"}`,
        )
        .join("\n")}
      
      Subtasks by task:
      ${Object.entries(subtasksByTask)
        .map(
          ([taskId, subtasks]) =>
            `Task ID:${taskId} subtasks:
        ${subtasks
          .map(
            (st) =>
              `  - ID:${st.id} | ${st.title} | Completed: ${st.completedAt ? "Yes" : "No"}${st.scheduledTime ? ` | Scheduled at: ${st.scheduledTime}` : ""}${st.recurrencePattern && st.recurrencePattern !== "none" ? ` | Recurring: ${st.recurrencePattern}` : ""}`,
          )
          .join("\n")}`,
        )
        .join("\n")}
      
      Recent conversation history:
      ${formattedPreviousMessages}

      VERY IMPORTANT INSTRUCTION:
      This is a PROPOSED schedule that will require user confirmation. Do NOT include the final schedule marker ("The final schedule is as follows:") in your response. The system will add appropriate markers automatically after the user confirms the schedule.

      The user has asked to reschedule their day.
      
      Create a new schedule for them that:
      1. Takes into account the current time (${currentTimeFormatted})
      2. Prioritizes tasks that are most time-sensitive
      3. Spaces out tasks appropriately with breaks
      4. Includes specific times for remaining tasks
      
      IMPORTANT CONSIDERATIONS:
      - Consider the user's time preferences (wake time, routine start time, and especially sleep time) when creating the schedule
      - If it's late in the day and approaching their sleep time, intelligently adjust your suggestions to emphasize:
        * Focusing only on essential tasks
        * Considering rest/relaxation if there are no urgent tasks
        * Including more frequent breaks if they're working late
        * Unwinding activities as valid and healthy options
        * Do not schedule beyond their sleep time.
      - If it's morning or mid-day, focus on helping them make the most of their productive hours
      - Be sensitive to how much time is remaining in their day based on their sleep time preference

      IMPORTANT RULES:
      - Be friendly but concise (max 800 characters)
      - Format your message as a short greeting followed by a bullet list of scheduled tasks with times
      - End by asking if they want to confirm this schedule or make changes
      - Be realistic about what can be done in the remaining day
      - Only schedule tasks for today, not future days
      - Always include a clear question asking for confirmation, like "Does this schedule work for you?" or "Would you like to make any changes to this schedule?"
      
      You MUST respond with a JSON object containing:
      1. A message field with your friendly schedule message including the bullet list and confirmation question
      2. A scheduleUpdates array with precise times for each task
      3. A marker string that will be automatically detected: "PROPOSED_SCHEDULE_AWAITING_CONFIRMATION"

      Example of required response format:
      {
        "message": "Here's a proposed schedule for your evening:\\n\\n- 19:30: Task A (Task ID: 123)\\n- 20:30: Short break\\n- 20:45: Task B (Task ID: 456)\\n\\nDoes this schedule work for you, or would you like to make any changes?\\n\\nPROPOSED_SCHEDULE_AWAITING_CONFIRMATION",
        "scheduleUpdates": [
          {
            "taskId": 123,
            "action": "reschedule",
            "scheduledTime": "19:30"
          },
          {
            "taskId": 456,
            "action": "reschedule",
            "scheduledTime": "20:45"
          }
        ]
      }
    `;

    // DEBUG: Print the reschedule prompt
    console.log("\n===== MESSAGING DEBUG: RESCHEDULE PROMPT =====");
    console.log(prompt);
    console.log("========================================\n");
    
    // Get the user's preferred model
    const preferredModel = await this.getUserPreferredModel(context.user.id);
    console.log(`Using user's preferred model: ${preferredModel} for reschedule message`);

    // Different models require different parameters
    let completionParams: any = {
      model: preferredModel,
    };
    
    // Handle different model requirements
    if (preferredModel === "o1-mini" || preferredModel === "o3-mini") {
      // For o1-mini/o3-mini
      // Use only user role as these models don't support system or developer roles
      completionParams.messages = [
        { role: "user", content: "Act as an ADHD coach helping with scheduling. " + prompt }
      ];
      console.log("Using model with simple user role prompt for o1-mini model");
      // No temperature parameter - using default
      // No response_format - not supported for o1-mini
    } else {
      // For standard models
      completionParams.messages = [
        { role: "system", content: "You are an ADHD coach helping with scheduling." },
        { role: "user", content: prompt }
      ];
      completionParams.response_format = { type: "json_object" };
      completionParams.temperature = 0.7;
    }
    
    // The o1-mini model doesn't support the temperature parameter,
    // so we need to check and remove it if it's present but model is o1-mini/o3-mini
    if ((preferredModel === "o1-mini" || preferredModel === "o3-mini") && 'temperature' in completionParams) {
      delete completionParams.temperature;
      console.log("Removed temperature parameter for o1-mini/o3-mini model compatibility");
    }
    
    const response = await openai.chat.completions.create(completionParams);

    const content = response.choices[0].message.content;
    if (!content)
      return {
        message:
          "I couldn't create a schedule for you right now. Please try again.",
      };

    // DEBUG: Print the raw reschedule response
    console.log("\n===== MESSAGING DEBUG: RESCHEDULE RAW RESPONSE =====");
    console.log(content);
    console.log("========================================\n");

    try {
      // Clean up the content if it contains markdown formatting
      let cleanContent = content;
      if (content.includes("```json")) {
        cleanContent = content.replace(/```json\n/g, "").replace(/\n```/g, "");
      }
      
      const parsed = JSON.parse(cleanContent);
      // Ensure the message contains the confirmation marker
      if (!parsed.message.includes("PROPOSED_SCHEDULE_AWAITING_CONFIRMATION")) {
        parsed.message += "\n\nPROPOSED_SCHEDULE_AWAITING_CONFIRMATION";
      }

      return {
        message: parsed.message,
        scheduleUpdates: parsed.scheduleUpdates,
        scheduledMessages: parsed.scheduledMessages || [],
      };
    } catch (error) {
      console.error("Failed to parse LLM response as JSON:", error);
      console.log("Attempted to parse content:", content);
      return { message: content };
    }
  }

  async generateMessage(context: MessageContext): Promise<string> {
    switch (context.messageType) {
      case "morning":
        return this.generateMorningMessage(context);
      case "follow_up":
        return this.generateFollowUpMessage(context);
      case "response":
        const result = await this.generateResponseMessage(context);
        return result.message;
      case "schedule_confirmation_response":
        const confirmResult = await this.generateResponseMessage(context);
        return confirmResult.message;
      case "reschedule":
        const rescheduleResult = await this.generateRescheduleMessage(context);
        return rescheduleResult.message;
      default:
        return this.generateMorningMessage(context);
    }
  }

  async sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
    try {
      // Twilio WhatsApp has a 1600 character limit
      const MAX_MESSAGE_LENGTH = 1500; // Keep a buffer

      // If message fits in a single message, send it
      if (message.length <= MAX_MESSAGE_LENGTH) {
        await twilioClient.messages.create({
          body: message,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${to}`,
        });
        console.log(`Successfully sent WhatsApp message to ${to}`);
        return true;
      }

      // Otherwise, truncate and indicate it was shortened
      const truncatedMessage =
        message.substring(0, MAX_MESSAGE_LENGTH) +
        "\n\n[Message too long. Reply for more details]";

      await twilioClient.messages.create({
        body: truncatedMessage,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${to}`,
      });
      console.log(`Successfully sent truncated WhatsApp message to ${to}`);
      return true;
    } catch (error) {
      console.error("Failed to send WhatsApp message:", error);
      return false;
    }
  }

  async handleSystemMessage(
    userId: number,
    messageType: "reschedule_request" | "morning_summary" | "task_suggestion",
    context: Record<string, any> = {},
  ): Promise<string> {
    try {
      // Get user information
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Get user tasks and known facts
      const tasks = await storage.getTasks(userId);
      const facts = await storage.getKnownUserFacts(userId);

      // Get previous messages for context
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, userId))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);

      // Format current date and time in user's timezone if available
      let currentDateTime;
      if (user.timeZone) {
        currentDateTime = new Date().toLocaleString("en-US", {
          timeZone: user.timeZone,
          dateStyle: "full",
          timeStyle: "long",
        });
      } else {
        currentDateTime = new Date().toISOString();
      }

      // Prepare messaging context
      const messagingContext: MessageContext = {
        user,
        tasks,
        facts,
        previousMessages,
        currentDateTime,
        messageType:
          messageType === "reschedule_request" ? "reschedule" : "response",
        userResponse: context.userRequest || undefined,
      };

      let response: string;
      let metadata: any = { systemInitiated: true, type: messageType };

      // Generate appropriate message based on type
      if (messageType === "reschedule_request") {
        // Generate a new schedule
        const result = await this.generateRescheduleMessage(messagingContext);
        response = result.message;

        // Store the schedule updates in metadata instead of processing them immediately
        // They will only be processed after user confirmation
        if (result.scheduleUpdates && result.scheduleUpdates.length > 0) {
          metadata.scheduleUpdates = result.scheduleUpdates;
          console.log(
            `Storing ${result.scheduleUpdates.length} schedule updates in metadata for user confirmation`,
          );
        }
      } else if (messageType === "morning_summary") {
        response = await this.generateMorningMessage(messagingContext);
      } else if (messageType === "task_suggestion") {
        // TODO: Implement task suggestion generation logic
        response = "Here are some task suggestions to help you make progress.";
      } else {
        response = "I'm here to help! What would you like to do today?";
      }

      // Save the assistant's response to message history
      await db.insert(messageHistory).values({
        userId,
        content: response,
        type: "response",
        status: "sent",
        metadata: metadata,
      });

      return response;
    } catch (error) {
      console.error(
        `Error handling system message (${messageType}) for user ${userId}:`,
        error,
      );
      return "Sorry, I encountered an error while processing your request. Please try again.";
    }
  }

  async handleUserResponse(userId: number, response: string): Promise<void> {
    try {
      console.log(
        `Processing response from user ${userId}: "${response.substring(0, 50)}..."`,
      );
      
      // Store the user's message first
      await db.insert(messageHistory).values({
        userId,
        content: response,
        type: "user_message",
        status: "received",
        createdAt: new Date(),
      });

      // Get user information
      const user = await storage.getUser(userId);
      if (!user) {
        console.error(`User not found: ${userId}`);
        return;
      }

      // Get user's tasks
      const userTasks = await storage.getTasks(userId);

      // Get user's facts
      const userFacts = await storage.getKnownUserFacts(userId);

      // Get previous messages (most recent first)
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, userId))
        .orderBy(desc(messageHistory.createdAt))
        .limit(20); // Increased to 20 to match the generateResponseMessage

      // Check if the last assistant message has schedule updates in the metadata
      // that should be passed along to the response generation
      const lastAssistantMessage = previousMessages.find(
        (msg) => msg.type === "response" || msg.type === "coach_response",
      );

      let existingScheduleUpdates: ScheduleUpdate[] = [];
      if (lastAssistantMessage?.metadata) {
        const metadata = lastAssistantMessage.metadata as {
          scheduleUpdates?: any[];
        };
        if (metadata.scheduleUpdates && metadata.scheduleUpdates.length > 0) {
          existingScheduleUpdates = metadata.scheduleUpdates;
          console.log(
            `Found ${existingScheduleUpdates.length} existing schedule updates in last message`,
          );
        }
      }

      // Format current date and time in user's timezone if available
      let currentDateTime;
      if (user.timeZone) {
        currentDateTime = new Date().toLocaleString("en-US", {
          timeZone: user.timeZone,
          dateStyle: "full",
          timeStyle: "long",
        });
      } else {
        currentDateTime = new Date().toLocaleString();
      }

      // Create a single messaging context for all responses
      const messageContext: MessageContext = {
        user,
        tasks: userTasks,
        facts: userFacts,
        previousMessages,
        currentDateTime,
        messageType: "response", // We'll let the LLM determine the actual type
        userResponse: response,
      };

      // DEBUG: Print the messaging context before generating response
      console.log("\n===== USER MESSAGE DEBUG: INCOMING MESSAGE =====");
      console.log(`User ${userId} sent message: "${response}"`);
      console.log("\n===== USER MESSAGE DEBUG: MESSAGE CONTEXT =====");
      console.log(`User: ${messageContext.user.username}`);
      console.log(`Tasks: ${messageContext.tasks.length} tasks`);
      console.log(`Facts: ${messageContext.facts.length} facts`);
      console.log(
        `Previous Messages: ${messageContext.previousMessages.length} messages`,
      );
      console.log(
        `Existing Schedule Updates: ${existingScheduleUpdates.length}`,
      );
      console.log("========================================\n");

      // Check if this is a mini model response requesting functions
      const isFunctionRequest = (
        response.includes("I need to get your schedule") ||
        response.includes("I need to check your tasks") ||
        response.includes("I need to review your preferences") ||
        response.includes("I need to check your notifications")
      );
      
      const preferredModel = await this.getUserPreferredModel(userId);
      const isMiniModel = ["o1-mini", "o3-mini"].includes(preferredModel);
      
      let responseResult;
      
      if (isMiniModel && isFunctionRequest) {
        console.log("Detected function request from o1-mini model, fetching requested data");
        
        // Create a response with all the data the mini model might need
        let functionResults: Record<string, any> = {};
        
        if (response.includes("I need to get your schedule")) {
          functionResults["get_todays_schedule"] = await llmFunctions.getTodaysSchedule({ userId });
        }
        
        if (response.includes("I need to check your tasks")) {
          functionResults["get_task_list"] = await llmFunctions.getTaskList({ userId }, { status: 'active' });
        }
        
        if (response.includes("I need to review your preferences")) {
          functionResults["get_user_facts"] = await llmFunctions.getUserFacts({ userId }, {});
        }
        
        if (response.includes("I need to check your notifications")) {
          functionResults["get_todays_notifications"] = await llmFunctions.getTodaysNotifications({ userId });
        }
        
        // Create a special prompt with all the requested information
        const functionUserMessage = `Act as an ADHD coach helping with task management.
         
         I requested the following information:
         ${Object.keys(functionResults).map(fn => `Function: ${fn}`).join("\n")}
         
         And received these results:
         ${JSON.stringify(functionResults, null, 2)}
         
         The user previously said: "${response}"
         
         Based on this information, please provide a helpful response as an ADHD coach.
         Remember to format your response as a JSON object with message, scheduleUpdates, and scheduledMessages.`;
        
        // Create a new context with this as the user message
        const functionContext: MessageContext = {
          ...messageContext,
          userResponse: functionUserMessage
        };
        
        // Generate the response 
        responseResult = await this.generateResponseMessage(
          functionContext,
          existingScheduleUpdates,
        );
        
        console.log("Generated function-augmented response for o1-mini model");
      } else {
        // Generate the normal response
        responseResult = await this.generateResponseMessage(
          messageContext,
          existingScheduleUpdates,
        );
      }

      // Check if the response contains a confirmed schedule (has the marker)
      const hasConfirmedSchedule = responseResult.message.includes(
        "The final schedule is as follows:",
      );

      if (hasConfirmedSchedule) {
        console.log("Detected confirmed schedule in response - processing it");

        // Extract and process the schedule
        const parsedSchedule = parseScheduleFromLLMResponse(
          responseResult.message,
        );
        if (parsedSchedule) {
          console.log(`Parsed confirmed schedule, creating daily schedule`);

          try {
            const scheduleId = await createDailyScheduleFromParsed(
              userId,
              parsedSchedule,
              userTasks,
            );
            console.log(`Created new daily schedule with ID ${scheduleId}`);

            // Automatically confirm the schedule since the marker indicates a final schedule
            await confirmSchedule(scheduleId, userId);
            console.log(`Confirmed schedule with ID ${scheduleId}`);
            
            // Add a system message confirming the schedule has been created and notifications are set
            await db.insert(messageHistory).values({
              userId,
              content: "✅ Schedule confirmed! I've set up your notifications for today's tasks.",
              type: "system_notification",
              status: "sent",
              createdAt: new Date(),
            });
            console.log("Added system confirmation message to chat");
          } catch (error) {
            console.error(
              "Error creating schedule from parsed response:",
              error,
            );
          }
        }
        // Also process any explicit schedule updates if they exist
        else if (
          responseResult.scheduleUpdates &&
          responseResult.scheduleUpdates.length > 0
        ) {
          console.log(
            `Processing ${responseResult.scheduleUpdates.length} schedule updates from confirmation`,
          );
          await this.processScheduleUpdates(
            userId,
            responseResult.scheduleUpdates,
          );
          
          // Add a system message confirming that schedule updates have been applied
          await db.insert(messageHistory).values({
            userId,
            content: "✅ Schedule confirmed! I've updated your tasks with the new times.",
            type: "system_notification",
            status: "sent",
            createdAt: new Date(),
          });
          console.log("Added system notification for schedule updates");
        }
      }
      // Check if this is a new proposed schedule (not confirmed yet)
      else if (
        responseResult.message.includes(
          "PROPOSED_SCHEDULE_AWAITING_CONFIRMATION",
        )
      ) {
        console.log(
          "Detected proposed schedule awaiting confirmation - not processing yet",
        );
        // We don't process schedule updates for proposed schedules,
        // they will be processed after user confirmation
      }
      // For regular responses, still check for any schedule updates to process
      else if (
        responseResult.scheduleUpdates &&
        responseResult.scheduleUpdates.length > 0
      ) {
        console.log(
          `Processing ${responseResult.scheduleUpdates.length} schedule updates from regular response`,
        );
        await this.processScheduleUpdates(
          userId,
          responseResult.scheduleUpdates,
        );
        
        // Add a system message confirming that task updates have been applied
        await db.insert(messageHistory).values({
          userId,
          content: "✅ I've updated your tasks with the changes you requested.",
          type: "system_notification",
          status: "sent",
          createdAt: new Date(),
        });
        console.log("Added system notification for task updates");
      }

      // Analyze message sentiment to determine if we need a follow-up
      const sentiment = await this.analyzeSentiment(response, userId);
      if (sentiment.needsFollowUp) {
        console.log(
          `Scheduling follow-up based on ${sentiment.type} sentiment`,
        );
        await this.scheduleFollowUp(userId, sentiment.type);
      }

      // Always store the coach's response in the message history
      // This is needed for both the web UI and WhatsApp
      const coachMessageInsert = await db
        .insert(messageHistory)
        .values({
          userId,
          content: responseResult.message,
          type: "coach_response",
          status: "sent",
          metadata: { scheduleUpdates: responseResult.scheduleUpdates } as any,
          createdAt: new Date(),
        })
        .returning({ id: messageHistory.id });

      // For WhatsApp users, also send the message via WhatsApp
      if (user.phoneNumber && user.contactPreference === "whatsapp") {
        await this.sendWhatsAppMessage(
          user.phoneNumber,
          responseResult.message,
        );
      }
    } catch (error) {
      console.error(`Error handling user response for user ${userId}:`, error);
    }
  }

  async processScheduledMessages(
    userId: number,
    messages: Array<{
      type: string;
      scheduledFor: string;
      content: string;
    }>
  ): Promise<void> {
    try {
      if (!messages || messages.length === 0) {
        return;
      }
      
      console.log(`Processing ${messages.length} scheduled messages for user ${userId}`);
      
      const user = await storage.getUser(userId);
      if (!user) {
        console.error(`Can't schedule messages: User ${userId} not found`);
        return;
      }
      
      const now = new Date();
      const today = new Date(now);
      
      for (const message of messages) {
        try {
          // Parse the time (supports 24-hour format like "20:30")
          const [hours, minutes] = message.scheduledFor.split(':').map(n => parseInt(n, 10));
          
          if (isNaN(hours) || isNaN(minutes)) {
            console.error(`Invalid time format in scheduled message: ${message.scheduledFor}`);
            continue;
          }
          
          // Create a date object for the scheduled time
          const scheduledDateTime = new Date(today);
          scheduledDateTime.setHours(hours, minutes, 0, 0);
          
          // If the time is in the past for today, schedule it for tomorrow
          if (scheduledDateTime < now) {
            scheduledDateTime.setDate(scheduledDateTime.getDate() + 1);
            console.log(`Time ${message.scheduledFor} is in the past, scheduling for tomorrow instead`);
          }
          
          // Create the message schedule
          await db.insert(messageSchedules).values({
            userId: userId,
            type: message.type || 'follow_up',
            scheduledFor: scheduledDateTime,
            content: message.content || 'Check-in',
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          
          console.log(`Created ${message.type} message scheduled for ${scheduledDateTime.toISOString()}`);
        } catch (error) {
          console.error(`Error scheduling message: ${error}`);
        }
      }
    } catch (error) {
      console.error(`Error processing scheduled messages: ${error}`);
    }
  }

  async processScheduleUpdates(
    userId: number,
    updates: ScheduleUpdate[],
  ): Promise<void> {
    try {
      if (!updates || updates.length === 0) {
        return;
      }
      
      console.log(
        `Processing ${updates.length} schedule updates for user ${userId}`,
      );

      // Get all user tasks for lookup by name if needed
      const userTasks = await storage.getTasks(userId);

      for (const update of updates) {
        // Special case: Handle "all afternoon tasks" or "all tasks in afternoon"
        if (
          typeof update.taskId === "string" &&
          update.taskId.toLowerCase().includes("all") &&
          update.taskId.toLowerCase().includes("afternoon")
        ) {
          console.log(`Processing special case for all afternoon tasks`);

          // Define afternoon as tasks scheduled between 12:00 and 17:00
          const afternoonTasks = userTasks.filter((task) => {
            if (!task.scheduledTime) return false;

            try {
              const scheduledTime = task.scheduledTime.toLowerCase();

              // Check for PM indicator
              if (
                scheduledTime.includes("pm") &&
                !scheduledTime.includes("evening")
              ) {
                return true;
              }

              // Check for specific hours
              if (scheduledTime.includes(":")) {
                const hourStr = scheduledTime.split(":")[0];
                const hour = parseInt(hourStr, 10);
                return hour >= 12 && hour < 17;
              }

              // Check for afternoon mention
              return scheduledTime.includes("afternoon");
            } catch (err) {
              return false;
            }
          });

          console.log(
            `Found ${afternoonTasks.length} afternoon tasks to process`,
          );

          if (afternoonTasks.length > 0) {
            for (const task of afternoonTasks) {
              if (update.action === "reschedule") {
                await storage.updateTask(task.id, {
                  scheduledTime: update.scheduledTime || "tomorrow",
                  recurrencePattern: update.recurrencePattern,
                });
                console.log(
                  `Rescheduled afternoon task ${task.id}: ${task.title} to ${update.scheduledTime || "tomorrow"}`,
                );
              } else if (update.action === "complete") {
                await storage.completeTask(task.id);
                console.log(`Marked afternoon task ${task.id} as complete`);
              }
            }
          }

          // Continue to next update after processing all afternoon tasks
          continue;
        }

        // Handle task lookup by name if taskId is not a number
        let taskId =
          typeof update.taskId === "number" ? update.taskId : undefined;

        // If taskId is a string, try to find the task by title (case insensitive, partial match)
        if (!taskId && typeof update.taskId === "string") {
          const taskName = update.taskId.toLowerCase();
          const matchedTask = userTasks.find(
            (task) =>
              task.title.toLowerCase().includes(taskName) ||
              (task.description &&
                task.description.toLowerCase().includes(taskName)),
          );

          if (matchedTask) {
            taskId = matchedTask.id;
            console.log(
              `Resolved task name "${update.taskId}" to task ID ${taskId}`,
            );
          } else {
            console.log(`Could not find task matching name "${update.taskId}"`);
            continue; // Skip this update since we can't find the task
          }
        }

        switch (update.action) {
          case "reschedule":
            if (taskId) {
              await storage.updateTask(taskId, {
                scheduledTime: update.scheduledTime,
                recurrencePattern: update.recurrencePattern,
              });
              console.log(
                `Rescheduled task ${taskId} to ${update.scheduledTime}`,
              );
            }
            break;

          case "complete":
            if (taskId) {
              await storage.completeTask(taskId);
              console.log(`Marked task ${taskId} as complete`);
            }
            break;

          case "skip":
            // Skip a single occurrence but keep the recurring task
            if (taskId) {
              // Just log it for now - we might want to add a "skipped" status or date tracking later
              console.log(`User requested to skip task ${taskId} today`);
            }
            break;

          case "create":
            if (update.title) {
              const newTask = await storage.createTask({
                userId,
                title: update.title,
                description: update.description || "",
                taskType: TaskType.DAILY,
                status: "active",
                estimatedDuration: "30 minutes", // Default reasonable duration
                scheduledTime: update.scheduledTime,
                recurrencePattern: update.recurrencePattern || "none",
              });
              console.log(`Created new task ${newTask.id}: ${newTask.title}`);
            }
            break;
        }
      }
    } catch (error) {
      console.error(`Error processing schedule updates:`, error);
    }
  }

  private async analyzeSentiment(text: string, userId?: number): Promise<{
    type: "positive" | "negative" | "neutral";
    needsFollowUp: boolean;
    urgency: number;
  }> {
    // Get the user's preferred model if userId is provided
    let preferredModel = "gpt-4o"; // Default model
    if (userId) {
      try {
        preferredModel = await this.getUserPreferredModel(userId);
        console.log(`Using user's preferred model: ${preferredModel} for sentiment analysis`);
      } catch (error) {
        console.error("Error getting user preferred model for sentiment analysis:", error);
      }
    }
    
    // Different models require different parameters
    let completionParams: any = {
      model: preferredModel
    };
    
    // o1-mini and o3-mini models don't support system messages or response_format
    if (preferredModel === "o1-mini" || preferredModel === "o3-mini") {
      // For o1-mini/o3-mini models, use only user role as these models don't support system or developer roles
      const instructionsAndText = `
        Act as a sentiment analysis tool. Analyze the sentiment and urgency of this ADHD coaching response from a user. 
        Return JSON with: type (positive/negative/neutral), needsFollowUp (boolean), urgency (1-5 where 5 is most urgent).
        
        User's response: ${text}
        
        Respond ONLY with a JSON object and nothing else:
        {"type": "positive|negative|neutral", "needsFollowUp": true|false, "urgency": 1-5}
      `;
      
      completionParams.messages = [
        { role: "user", content: instructionsAndText }
      ];
      
      console.log("Using model with user role prompt for o1-mini model");
      // No temperature parameter for o1-mini/o3-mini - using default
    } else {
      // For models that support system role and response_format
      completionParams.messages = [
        {
          role: "system",
          content: "Analyze the sentiment and urgency of this ADHD coaching response from a user. Return JSON with: type (positive/negative/neutral), needsFollowUp (boolean), urgency (1-5 where 5 is most urgent)."
        },
        { role: "user", content: text }
      ];
      
      completionParams.response_format = { type: "json_object" };
      completionParams.temperature = 0.3;
    }
    
    const response = await openai.chat.completions.create(completionParams);

    if (!response.choices[0].message.content) {
      throw new Error("No response content from OpenAI");
    }
    
    // Clean up the content if it contains markdown formatting
    let content = response.choices[0].message.content;
    if (content.includes("```json")) {
      content = content.replace(/```json\n/g, "").replace(/\n```/g, "");
    }
    
    try {
      return JSON.parse(content);
    } catch (error) {
      console.error("Failed to parse sentiment response as JSON:", error);
      console.log("Raw content:", content);
      // Return a default neutral sentiment if parsing fails
      return {
        type: "neutral",
        needsFollowUp: true,
        urgency: 3
      };
    }
  }

  async scheduleFollowUp(
    userId: number,
    responseType: "positive" | "negative" | "neutral",
  ): Promise<void> {
    // Check if the user already has a pending follow-up message
    const pendingFollowUps = await db
      .select()
      .from(messageSchedules)
      .where(
        and(
          eq(messageSchedules.userId, userId),
          eq(messageSchedules.type, "follow_up"),
          eq(messageSchedules.status, "pending"),
        ),
      );

    if (pendingFollowUps.length > 0) {
      console.log(
        `User ${userId} already has a pending follow-up scheduled for ${pendingFollowUps[0].scheduledFor}`,
      );
      return;
    }

    // Adjust timing based on sentiment - more urgent for negative responses
    const followUpDelay =
      responseType === "negative" ? 30 : responseType === "neutral" ? 60 : 120; // minutes
    const scheduledFor = new Date(Date.now() + followUpDelay * 60000);

    await db.insert(messageSchedules).values({
      userId: userId,
      type: "follow_up",
      scheduledFor: scheduledFor,
      status: "pending",
      metadata: { responseType } as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(
      `Scheduled ${responseType} follow-up for user ${userId} at ${scheduledFor}`,
    );
  }

  async processPendingSchedules(): Promise<void> {
    const now = new Date();
    const pendingSchedules = await db
      .select()
      .from(messageSchedules)
      .where(
        and(
          eq(messageSchedules.status, "pending"),
          lte(messageSchedules.scheduledFor, now),
        ),
      );

    for (const schedule of pendingSchedules) {
      try {
        console.log(
          `Processing schedule ${schedule.id} of type ${schedule.type}${schedule.title ? ` (${schedule.title})` : ''} for user ${schedule.userId}`,
        );

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, schedule.userId))
          .limit(1);

        if (!user) {
          console.log(`User ${schedule.userId} not found, skipping`);
          continue;
        }

        if (!user.phoneNumber) {
          console.log(`User ${schedule.userId} has no phone number, skipping`);
          continue;
        }

        // Fetch user's tasks
        const userTasks = await db
          .select()
          .from(tasks)
          .where(eq(tasks.userId, schedule.userId));

        // Fetch user's facts
        const userFacts = await db
          .select()
          .from(knownUserFacts)
          .where(eq(knownUserFacts.userId, schedule.userId));

        // Fetch previous messages
        const previousMessages = await db
          .select()
          .from(messageHistory)
          .where(eq(messageHistory.userId, schedule.userId))
          .orderBy(desc(messageHistory.createdAt))
          .limit(10);

        // Determine message type based on schedule type
        const messageType =
          schedule.type === "morning_message" ? "morning" : "follow_up";

        // Format current date and time in user's timezone if available
        let currentDateTime;
        if (user.timeZone) {
          currentDateTime = now.toLocaleString("en-US", {
            timeZone: user.timeZone,
            dateStyle: "full",
            timeStyle: "long",
          });
        } else {
          currentDateTime = now.toLocaleString();
        }

        // Generate the message based on context
        const message = await this.generateMessage({
          user,
          tasks: userTasks,
          facts: userFacts,
          previousMessages,
          currentDateTime,
          messageType,
        });

        // Send the message
        const success = await this.sendWhatsAppMessage(
          user.phoneNumber,
          message,
        );

        if (success) {
          // Update schedule status to sent
          await db
            .update(messageSchedules)
            .set({ status: "sent", sentAt: now })
            .where(eq(messageSchedules.id, schedule.id));

          // Add the message to history
          await db.insert(messageHistory).values({
            userId: user.id,
            content: message,
            type: schedule.type,
            status: "sent",
            createdAt: now,
          });

          // Check if the message contains a schedule using the parser
          const parsedSchedule = parseScheduleFromLLMResponse(message);
          if (parsedSchedule) {
            console.log(
              `Detected schedule in scheduled message, creating daily schedule`,
            );

            try {
              // Create a daily schedule from the parsed schedule
              const scheduleId = await createDailyScheduleFromParsed(
                user.id,
                parsedSchedule,
                userTasks,
              );
              console.log(`Created new daily schedule with ID ${scheduleId}`);

              // Automatically confirm the schedule and create notifications
              await confirmSchedule(scheduleId, user.id);
              console.log(`Confirmed schedule with ID ${scheduleId}`);
            } catch (error) {
              console.error(
                "Error creating schedule from parsed response:",
                error,
              );
            }
          }

          console.log(`Successfully processed schedule ${schedule.id}`);

          // For morning messages, schedule a follow-up check in a few hours
          if (schedule.type === "morning_message") {
            await this.scheduleFollowUp(user.id, "neutral");
          }
        } else {
          console.error(`Failed to send message for schedule ${schedule.id}`);
        }
      } catch (error) {
        console.error(`Failed to process schedule ${schedule.id}:`, error);
      }
    }
  }
}

export const messagingService = new MessagingService();
