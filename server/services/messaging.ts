import OpenAI from "openai";
import twilio from "twilio";
import { Task, User, KnownUserFact, MessageHistory, MessageSchedule, messageHistory, messageSchedules, users, tasks, subtasks, knownUserFacts, TaskType, Subtask } from "@shared/schema";
import { db } from "../db";
import { eq, and, lte, desc, gt } from "drizzle-orm";
import { storage } from "../storage";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

interface MessageContext {
  user: User;
  tasks: Task[];
  facts: KnownUserFact[];
  previousMessages: MessageHistory[];
  currentDateTime: string;
  messageType: 'morning' | 'follow_up' | 'response';
  userResponse?: string;
}

interface ScheduleUpdate {
  taskId: number | string; // Can be numeric ID or task name string
  action: 'reschedule' | 'complete' | 'skip' | 'create';
  scheduledTime?: string;
  recurrencePattern?: string;
  title?: string;
  description?: string;
}

export class MessagingService {
  async generateMorningMessage(context: MessageContext): Promise<string> {
    const activeTasks = context.tasks.filter(task => task.status === "active");
    const todaysTasks = activeTasks.filter(task => {
      // Check if it's a daily task with scheduled time
      return task.taskType === TaskType.DAILY && task.scheduledTime;
    });
    
    // Get incomplete subtasks
    const subtaskList: Subtask[] = [];
    for (const task of activeTasks) {
      if (task.id) {
        const taskSubtasks = await storage.getSubtasks(task.id);
        const incompleteSubtasks = taskSubtasks.filter(st => !st.completedAt);
        subtaskList.push(...incompleteSubtasks);
      }
    }

    const prompt = `
      As an ADHD coach and accountability partner, create a concise, motivating morning message for ${context.user.username}.
      Current date and time: ${context.currentDateTime}

      Context about the user:
      ${context.facts.map(fact => `- ${fact.category}: ${fact.content}`).join('\n')}

      Their current tasks:
      ${context.tasks.map(task => 
        `- ${task.title} (${task.status})${task.scheduledTime ? ` scheduled at ${task.scheduledTime}` : ''}${task.recurrencePattern && task.recurrencePattern !== 'none' ? ` recurring: ${task.recurrencePattern}` : ''}`
      ).join('\n')}

      Active subtasks:
      ${subtaskList.map(st => {
        const parentTask = context.tasks.find(t => t.id === st.parentTaskId);
        return `- ${st.title} (for task: ${parentTask?.title || 'Unknown'})${st.scheduledTime ? ` scheduled at ${st.scheduledTime}` : ''}${st.recurrencePattern && st.recurrencePattern !== 'none' ? ` recurring: ${st.recurrencePattern}` : ''}`;
      }).join('\n')}

      Previous interactions (newest first):
      ${context.previousMessages.map(msg => `- ${msg.type}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`).join('\n')}

      Create a friendly, encouraging morning message that:
      1. Briefly acknowledges their ADHD characteristics based on their personal facts
      2. Suggests a plan for today with a specific schedule that includes 2-3 highest priority tasks with times
      3. Ask if they want to adjust the schedule or priorities
      4. Offers a quick strategy related to one of their known challenges
      5. Be conversational but KEEP IT BRIEF (under 1000 characters total)

      Format the response with minimal text, clear sections, and just a few helpful emojis.
      IMPORTANT: BE CONCISE. This message should be short enough to read quickly on a phone.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0].message.content || "Unable to generate message";
  }

  async generateFollowUpMessage(context: MessageContext): Promise<string> {
    const lastSentMessage = context.previousMessages.find(msg => msg.type === 'morning_message' || msg.type === 'follow_up');
    const metadata = context.previousMessages[0]?.metadata || {} as any;
    const responseType = metadata.sentiment?.type || 'neutral';
    
    const activeTasks = context.tasks.filter(task => task.status === "active");
    const todaysTasks = activeTasks.filter(task => {
      // Check if it's a daily task with scheduled time for today
      return task.taskType === TaskType.DAILY && task.scheduledTime;
    });

    const prompt = `
      As an ADHD coach and accountability partner, create a concise follow-up message for ${context.user.username}.
      Current date and time: ${context.currentDateTime}
      
      Context about the user:
      ${context.facts.map(fact => `- ${fact.category}: ${fact.content}`).join('\n')}
      
      Their current tasks:
      ${activeTasks.map(task => 
        `- ${task.title} (${task.status})${task.scheduledTime ? ` scheduled at ${task.scheduledTime}` : ''}${task.recurrencePattern && task.recurrencePattern !== 'none' ? ` recurring: ${task.recurrencePattern}` : ''}`
      ).join('\n')}
      
      Previous messages (newest first):
      ${context.previousMessages.slice(0, 5).map(msg => `- ${msg.type}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`).join('\n')}
      
      Last message sentiment: ${responseType}
      
      Create a brief, supportive follow-up message that:
      1. Quickly checks in on their progress with specific tasks
      2. For negative sentiment: offers quick support and a simple strategy
      3. For positive sentiment: gives brief encouragement
      4. Asks ONE specific question that requires a response
      
      Use a warm tone with minimal emojis. KEEP IT UNDER 500 CHARACTERS. 
      This must be brief enough to read in a few seconds on a phone.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0].message.content || "Unable to generate follow-up message";
  }

  async generateResponseMessage(context: MessageContext): Promise<{
    message: string;
    scheduleUpdates?: ScheduleUpdate[];
  }> {
    if (!context.userResponse) {
      throw new Error("User response is required for response generation");
    }

    const conversationHistory = context.previousMessages.slice(0, 10).map(msg => {
      if (msg.type === 'response') {
        return { role: "user" as const, content: msg.content };
      } else {
        return { role: "assistant" as const, content: msg.content };
      }
    }).reverse();

    const activeTasks = context.tasks.filter(task => task.status === "active");

    // Get subtasks for each active task
    const subtasksByTask: Record<number, Subtask[]> = {};
    for (const task of activeTasks) {
      if (task.id) {
        const taskSubtasks = await storage.getSubtasks(task.id);
        subtasksByTask[task.id] = taskSubtasks;
      }
    }

    const prompt = `
      You are an ADHD coach and accountability partner chatting with ${context.user.username} via WhatsApp.
      Current date and time: ${context.currentDateTime}
      
      Context about the user:
      ${context.facts.map(fact => `- ${fact.category}: ${fact.content}`).join('\n')}
      
      Their current active tasks:
      ${activeTasks.map(task => 
        `- ID:${task.id} | ${task.title} | Type: ${task.taskType}${task.scheduledTime ? ` | Scheduled at: ${task.scheduledTime}` : ''}${task.recurrencePattern && task.recurrencePattern !== 'none' ? ` | Recurring: ${task.recurrencePattern}` : ''}`
      ).join('\n')}
      
      Subtasks by task:
      ${Object.entries(subtasksByTask).map(([taskId, subtasks]) => 
        `Task ID:${taskId} subtasks:
        ${subtasks.map(st => 
          `  - ID:${st.id} | ${st.title} | Completed: ${st.completedAt ? 'Yes' : 'No'}${st.scheduledTime ? ` | Scheduled at: ${st.scheduledTime}` : ''}${st.recurrencePattern && st.recurrencePattern !== 'none' ? ` | Recurring: ${st.recurrencePattern}` : ''}`
        ).join('\n')}`
      ).join('\n')}
      
      The user just messaged you: "${context.userResponse}"
      
      First, analyze what the user is asking for:
      1. Are they asking to adjust their schedule?
      2. Are they reporting completion of a task?
      3. Are they struggling with a task?
      4. Are they asking for advice on a specific situation?
      5. Are they making a general comment or question?
      
      Then, respond conversationally as their ADHD coach with:
      1. A direct response to their message showing you understood them
      2. Any specific help, advice, or schedule adjustments they need
      3. Encouragement that's specific to their situation
      
      If the user is:
      - Rescheduling or adjusting tasks: Acknowledge and confirm the changes
      - Reporting a completed task: Celebrate their progress specifically
      - Struggling: Provide a concrete strategy that's tailored to their needs
      
      IMPORTANT: If the user wants to make schedule changes, you should generate JSON data about those changes. 
      
      Example format:
      {
        "message": "Your conversational response here",
        "scheduleUpdates": [
          {
            "taskId": 123,
            "action": "reschedule",
            "scheduledTime": "14:30",
            "recurrencePattern": "daily"
          },
          {
            "taskId": 456,
            "action": "complete"
          }
        ]
      }
      
      IMPORTANT: For special cases where the user wants to adjust multiple tasks:
      1. If they want to free up their afternoon or reschedule all afternoon tasks:
         - Use "all_afternoon_tasks" as the taskId
         - Example: {"taskId": "all_afternoon_tasks", "action": "reschedule", "scheduledTime": "tomorrow"}
      
      2. If they want to reschedule all tasks for today:
         - Use "all_today_tasks" as the taskId
         
      ONLY include the scheduleUpdates field if the user is specifically asking to change their schedule or mark tasks as complete.
      For specific tasks, reference them by their actual IDs from the task list provided to you.
      Default to no schedule changes unless explicitly requested.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        ...conversationHistory,
        { role: "user", content: context.userResponse }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) return { message: "I couldn't generate a response. Please try again." };

    try {
      const parsed = JSON.parse(content);
      return {
        message: parsed.message,
        scheduleUpdates: parsed.scheduleUpdates
      };
    } catch (error) {
      console.error("Failed to parse LLM response as JSON:", error);
      return { message: content };
    }
  }

  async generateMessage(context: MessageContext): Promise<string> {
    switch (context.messageType) {
      case 'morning':
        return this.generateMorningMessage(context);
      case 'follow_up':
        return this.generateFollowUpMessage(context);
      case 'response':
        const result = await this.generateResponseMessage(context);
        return result.message;
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
          to: `whatsapp:${to}`
        });
        console.log(`Successfully sent WhatsApp message to ${to}`);
        return true;
      }
      
      // Otherwise, truncate and indicate it was shortened
      const truncatedMessage = message.substring(0, MAX_MESSAGE_LENGTH) + 
        "\n\n[Message too long. Reply for more details]";
      
      await twilioClient.messages.create({
        body: truncatedMessage,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${to}`
      });
      console.log(`Successfully sent truncated WhatsApp message to ${to}`);
      return true;
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      return false;
    }
  }

  async handleUserResponse(userId: number, response: string): Promise<void> {
    try {
      console.log(`Processing response from user ${userId}: "${response.substring(0, 50)}..."`);
      
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
        .limit(10);
      
      // Analyze sentiment
      const sentiment = await this.analyzeSentiment(response);
      
      // Store the user's response in message history
      await db.insert(messageHistory).values({
        userId,
        content: response,
        type: 'response',
        status: 'received',
        metadata: { sentiment } as any, // Type assertion to fix compatibility
        createdAt: new Date()
      });
      
      // Generate a response based on context
      const messageContext: MessageContext = {
        user,
        tasks: userTasks,
        facts: userFacts,
        previousMessages,
        currentDateTime: new Date().toLocaleString(),
        messageType: 'response',
        userResponse: response
      };
      
      const responseResult = await this.generateResponseMessage(messageContext);
      
      // Apply schedule updates if provided
      if (responseResult.scheduleUpdates && responseResult.scheduleUpdates.length > 0) {
        await this.processScheduleUpdates(userId, responseResult.scheduleUpdates);
      }
      
      // Send the response to the user
      if (user.phoneNumber) {
        const success = await this.sendWhatsAppMessage(user.phoneNumber, responseResult.message);
        
        if (success) {
          // Store the sent message in history
          await db.insert(messageHistory).values({
            userId,
            content: responseResult.message,
            type: 'coach_response',
            status: 'sent',
            metadata: { scheduleUpdates: responseResult.scheduleUpdates } as any,
            createdAt: new Date()
          });
        }
      }
      
      // Schedule a follow-up based on sentiment if needed
      if (sentiment.needsFollowUp) {
        await this.scheduleFollowUp(userId, sentiment.type);
      }
    } catch (error) {
      console.error(`Error handling user response for user ${userId}:`, error);
    }
  }

  private async processScheduleUpdates(userId: number, updates: ScheduleUpdate[]): Promise<void> {
    try {
      console.log(`Processing ${updates.length} schedule updates for user ${userId}`);
      
      // Get all user tasks for lookup by name if needed
      const userTasks = await storage.getTasks(userId);
      
      for (const update of updates) {
        // Special case: Handle "all afternoon tasks" or "all tasks in afternoon"
        if (typeof update.taskId === 'string' && 
            (update.taskId.toLowerCase().includes('all') && 
             update.taskId.toLowerCase().includes('afternoon'))) {
          
          console.log(`Processing special case for all afternoon tasks`);
          
          // Define afternoon as tasks scheduled between 12:00 and 17:00
          const afternoonTasks = userTasks.filter(task => {
            if (!task.scheduledTime) return false;
            
            try {
              const scheduledTime = task.scheduledTime.toLowerCase();
              
              // Check for PM indicator
              if (scheduledTime.includes('pm') && !scheduledTime.includes('evening')) {
                return true;
              }
              
              // Check for specific hours
              if (scheduledTime.includes(':')) {
                const hourStr = scheduledTime.split(':')[0];
                const hour = parseInt(hourStr, 10);
                return hour >= 12 && hour < 17;
              }
              
              // Check for afternoon mention
              return scheduledTime.includes('afternoon');
            } catch (err) {
              return false;
            }
          });
          
          console.log(`Found ${afternoonTasks.length} afternoon tasks to process`);
          
          if (afternoonTasks.length > 0) {
            for (const task of afternoonTasks) {
              if (update.action === 'reschedule') {
                await storage.updateTask(task.id, {
                  scheduledTime: update.scheduledTime || 'tomorrow',
                  recurrencePattern: update.recurrencePattern
                });
                console.log(`Rescheduled afternoon task ${task.id}: ${task.title} to ${update.scheduledTime || 'tomorrow'}`);
              } else if (update.action === 'complete') {
                await storage.completeTask(task.id);
                console.log(`Marked afternoon task ${task.id} as complete`);
              }
            }
          }
          
          // Continue to next update after processing all afternoon tasks
          continue;
        }
        
        // Handle task lookup by name if taskId is not a number
        let taskId = typeof update.taskId === 'number' ? update.taskId : undefined;
        
        // If taskId is a string, try to find the task by title (case insensitive, partial match)
        if (!taskId && typeof update.taskId === 'string') {
          const taskName = update.taskId.toLowerCase();
          const matchedTask = userTasks.find(task => 
            task.title.toLowerCase().includes(taskName) || 
            (task.description && task.description.toLowerCase().includes(taskName))
          );
          
          if (matchedTask) {
            taskId = matchedTask.id;
            console.log(`Resolved task name "${update.taskId}" to task ID ${taskId}`);
          } else {
            console.log(`Could not find task matching name "${update.taskId}"`);
            continue; // Skip this update since we can't find the task
          }
        }
        
        switch (update.action) {
          case 'reschedule':
            if (taskId) {
              await storage.updateTask(taskId, {
                scheduledTime: update.scheduledTime,
                recurrencePattern: update.recurrencePattern
              });
              console.log(`Rescheduled task ${taskId} to ${update.scheduledTime}`);
            }
            break;
            
          case 'complete':
            if (taskId) {
              await storage.completeTask(taskId);
              console.log(`Marked task ${taskId} as complete`);
            }
            break;
            
          case 'skip':
            // Skip a single occurrence but keep the recurring task
            if (taskId) {
              // Just log it for now - we might want to add a "skipped" status or date tracking later
              console.log(`User requested to skip task ${taskId} today`);
            }
            break;
            
          case 'create':
            if (update.title) {
              const newTask = await storage.createTask({
                userId,
                title: update.title,
                description: update.description || '',
                taskType: TaskType.DAILY,
                status: 'active',
                estimatedDuration: "30 minutes", // Default reasonable duration
                scheduledTime: update.scheduledTime,
                recurrencePattern: update.recurrencePattern || 'none'
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

  private async analyzeSentiment(text: string): Promise<{
    type: 'positive' | 'negative' | 'neutral';
    needsFollowUp: boolean;
    urgency: number;
  }> {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Analyze the sentiment and urgency of this ADHD coaching response from a user. Return JSON with: type (positive/negative/neutral), needsFollowUp (boolean), urgency (1-5 where 5 is most urgent)."
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" }
    });

    if (!response.choices[0].message.content) {
      throw new Error("No response content from OpenAI");
    }

    return JSON.parse(response.choices[0].message.content);
  }

  async scheduleFollowUp(userId: number, responseType: 'positive' | 'negative' | 'neutral'): Promise<void> {
    // Check if the user already has a pending follow-up message
    const pendingFollowUps = await db
      .select()
      .from(messageSchedules)
      .where(
        and(
          eq(messageSchedules.userId, userId),
          eq(messageSchedules.type, 'follow_up'),
          eq(messageSchedules.status, 'pending')
        )
      );
      
    if (pendingFollowUps.length > 0) {
      console.log(`User ${userId} already has a pending follow-up scheduled for ${pendingFollowUps[0].scheduledFor}`);
      return;
    }
    
    // Adjust timing based on sentiment - more urgent for negative responses
    const followUpDelay = responseType === 'negative' ? 30 : responseType === 'neutral' ? 60 : 120; // minutes
    const scheduledFor = new Date(Date.now() + followUpDelay * 60000);

    await db.insert(messageSchedules).values({
      userId,
      type: 'follow_up',
      scheduledFor,
      status: 'pending',
      metadata: { responseType } as any,
      createdAt: new Date()
    });
    
    console.log(`Scheduled ${responseType} follow-up for user ${userId} at ${scheduledFor}`);
  }

  async processPendingSchedules(): Promise<void> {
    const now = new Date();
    const pendingSchedules = await db
      .select()
      .from(messageSchedules)
      .where(
        and(
          eq(messageSchedules.status, 'pending'),
          lte(messageSchedules.scheduledFor, now)
        )
      );

    for (const schedule of pendingSchedules) {
      try {
        console.log(`Processing schedule ${schedule.id} of type ${schedule.type} for user ${schedule.userId}`);
        
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
        const messageType = schedule.type === 'morning_message' ? 'morning' : 'follow_up';

        // Generate the message based on context
        const message = await this.generateMessage({
          user,
          tasks: userTasks,
          facts: userFacts,
          previousMessages,
          currentDateTime: now.toLocaleString(),
          messageType
        });

        // Send the message
        const success = await this.sendWhatsAppMessage(
          user.phoneNumber,
          message
        );

        if (success) {
          // Update schedule status to sent
          await db
            .update(messageSchedules)
            .set({ status: 'sent', sentAt: now })
            .where(eq(messageSchedules.id, schedule.id));

          // Add the message to history
          await db.insert(messageHistory).values({
            userId: user.id,
            content: message,
            type: schedule.type,
            status: 'sent',
            createdAt: now
          });
          
          console.log(`Successfully processed schedule ${schedule.id}`);
          
          // For morning messages, schedule a follow-up check in a few hours
          if (schedule.type === 'morning_message') {
            await this.scheduleFollowUp(user.id, 'neutral');
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