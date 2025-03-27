import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { generateCoachingResponse } from "./coach";
import { insertGoalSchema, insertCheckInSchema, insertKnownUserFactSchema, insertTaskSchema, insertSubtaskSchema, messageHistory, messageSchedules } from "@shared/schema";
import { handleWhatsAppWebhook } from "./webhook";
import { messageScheduler } from "./scheduler";
import { messagingService } from "./services/messaging";
import { generateTaskSuggestions } from "./services/task-suggestions";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

// Assuming TaskType enum exists elsewhere in the project.  This needs to be added if it doesn't exist.
enum TaskType {
  PERSONAL_PROJECT = 'personal_project',
  LONG_TERM_PROJECT = 'long_term_project',
  LIFE_GOAL = 'life_goal',
}


export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // WhatsApp Webhook endpoint
  app.post("/api/webhook/whatsapp", handleWhatsAppWebhook);

  // Test endpoints for scheduling messages and testing webhooks (only in development)
  if (process.env.NODE_ENV === 'development' || true) { // Force enable for testing
    // Endpoint to clear pending messages (for testing)
    app.post("/api/test/clear-pending-messages", async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      try {
        // Delete all pending follow-up messages for the current user
        const deleteResult = await db
          .delete(messageSchedules)
          .where(
            and(
              eq(messageSchedules.userId, req.user.id),
              eq(messageSchedules.status, 'pending')
            )
          )
          .returning();
          
        res.json({
          message: "Pending messages cleared",
          userId: req.user.id,
          messagesDeleted: deleteResult.length,
          deletedMessages: deleteResult
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
      }
    });
    
    app.post("/api/test/schedule-message", async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      try {
        const scheduledTime = await messageScheduler.scheduleTestMessage(req.user.id);
        res.json({
          message: "Test message scheduled",
          scheduledFor: scheduledTime,
          userId: req.user.id
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
      }
    });
    
    // Test endpoint to verify duplicate follow-up prevention
    app.post("/api/test/duplicate-followups", async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      try {
        // Attempt to schedule multiple follow-ups for the same user
        const results = [];
        
        // First attempt - should succeed
        await messagingService.scheduleFollowUp(req.user.id, 'neutral');
        results.push("First follow-up scheduled");
        
        // Second attempt - should be prevented by our duplicate check
        await messagingService.scheduleFollowUp(req.user.id, 'positive');
        results.push("Second follow-up attempted");
        
        // Third attempt - should also be prevented
        await messagingService.scheduleFollowUp(req.user.id, 'negative');
        results.push("Third follow-up attempted");
        
        // Check the database to see what was actually scheduled
        const pendingMessages = await db
          .select()
          .from(messageSchedules)
          .where(
            and(
              eq(messageSchedules.userId, req.user.id),
              eq(messageSchedules.type, 'follow_up'),
              eq(messageSchedules.status, 'pending')
            )
          );
        
        res.json({
          message: "Test completed successfully",
          results,
          scheduledFollowUps: pendingMessages.length,
          pendingMessages
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
      }
    });

    // Special test endpoint for simulating incoming WhatsApp messages
    app.post("/api/test/simulate-whatsapp", async (req, res) => {
      try {
        const { userId, message } = req.body;
        
        if (!userId || !message) {
          return res.status(400).json({
            error: "Missing required fields: userId and message"
          });
        }
        
        // Get user info to validate and get phone number
        const user = await storage.getUser(parseInt(userId));
        if (!user) {
          return res.status(404).json({
            error: `User with ID ${userId} not found`
          });
        }
        
        console.log(`Simulating WhatsApp message from user ${userId}: ${message}`);
        
        // Process the message using the message service
        await messagingService.handleUserResponse(parseInt(userId), message);
        
        res.json({
          success: true,
          message: "Message processed successfully"
        });
      } catch (error) {
        console.error("Error in simulate-whatsapp endpoint:", error);
        res.status(500).json({
          error: "Failed to process simulated message",
          details: error instanceof Error ? error.message : 'An unknown error occurred'
        });
      }
    });
  }

  // Start the message scheduler
  messageScheduler.start();

  // User Settings Endpoint
  app.patch("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Extract only the fields we want to allow updating
      const { 
        contactPreference, 
        phoneNumber, 
        email, 
        isPhoneVerified, 
        isEmailVerified,
        allowEmailNotifications,
        allowPhoneNotifications,
        preferredMessageTime,
        timeZone
      } = req.body;
      
      // Build the update object with only defined values
      const updateData: Record<string, any> = {};
      if (contactPreference !== undefined) updateData.contactPreference = contactPreference;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (email !== undefined) updateData.email = email;
      if (isPhoneVerified !== undefined) updateData.isPhoneVerified = isPhoneVerified;
      if (isEmailVerified !== undefined) updateData.isEmailVerified = isEmailVerified;
      if (allowEmailNotifications !== undefined) updateData.allowEmailNotifications = allowEmailNotifications;
      if (allowPhoneNotifications !== undefined) updateData.allowPhoneNotifications = allowPhoneNotifications;
      if (preferredMessageTime !== undefined) updateData.preferredMessageTime = preferredMessageTime;
      if (timeZone !== undefined) updateData.timeZone = timeZone;
      
      // Apply the update
      const updatedUser = await storage.updateUser({
        ...req.user,
        ...updateData
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user settings" });
    }
  });
  
  // User Deactivation Endpoint
  app.post("/api/user/deactivate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      await storage.deactivateUser(req.user.id);
      
      // Logout the user after deactivation
      req.logout((err) => {
        if (err) {
          console.error("Error logging out after deactivation:", err);
          return res.status(500).json({ error: "Account deactivated but session logout failed" });
        }
        res.status(200).json({ message: "Account successfully deactivated" });
      });
    } catch (error) {
      console.error("Error deactivating user account:", error);
      res.status(500).json({ error: "Failed to deactivate account" });
    }
  });

  // Known User Facts Endpoints
  app.get("/api/known-facts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const facts = await storage.getKnownUserFacts(req.user.id);
    res.json(facts);
  });

  app.post("/api/known-facts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertKnownUserFactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const fact = await storage.addKnownUserFact({
      ...parsed.data,
      userId: req.user.id,
    });
    res.status(201).json(fact);
  });

  app.patch("/api/known-facts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const updatedFact = await storage.updateKnownUserFact(parseInt(req.params.id), req.body);
    res.json(updatedFact);
  });

  app.delete("/api/known-facts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteKnownUserFact(parseInt(req.params.id));
    res.sendStatus(204);
  });

  // Tasks Endpoints
  app.get("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const type = req.query.type as string | undefined;
    const tasks = await storage.getTasks(req.user.id, type);
    res.json(tasks);
  });

  // Task creation endpoint with task suggestions
  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const taskData = parsed.data;

    try {
      // For specific task types, generate suggestions
      let suggestions = null;
      if (
        taskData.taskType === TaskType.PERSONAL_PROJECT ||
        taskData.taskType === TaskType.LONG_TERM_PROJECT ||
        taskData.taskType === TaskType.LIFE_GOAL
      ) {
        suggestions = await generateTaskSuggestions(
          taskData.taskType,
          taskData.title,
          taskData.description || '',
          req.user.id,
          taskData.estimatedDuration
        );
      }

      // Create the main task
      const task = await storage.createTask({
        ...taskData,
        userId: req.user.id,
      });

      // If we have suggestions, return them with the task
      if (suggestions) {
        return res.status(201).json({
          task,
          suggestions,
        });
      }

      res.status(201).json({ task });
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const updatedTask = await storage.updateTask(parseInt(req.params.id), req.body);
    res.json(updatedTask);
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteTask(parseInt(req.params.id));
    res.sendStatus(204);
  });

  app.post("/api/tasks/:taskId/complete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const completedTask = await storage.completeTask(parseInt(req.params.taskId));
    res.json(completedTask);
  });


  // Subtask creation endpoint
  app.post("/api/tasks/:taskId/subtasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const taskId = parseInt(req.params.taskId);
    console.log('Creating subtask for task:', taskId, 'Data:', req.body);

    const parsed = insertSubtaskSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error('Subtask validation failed:', parsed.error);
      return res.status(400).json(parsed.error);
    }

    try {
      const subtask = await storage.createSubtask(taskId, parsed.data);
      console.log('Created subtask:', subtask);
      res.status(201).json(subtask);
    } catch (error) {
      console.error("Error creating subtask:", error);
      res.status(500).json({ message: "Failed to create subtask" });
    }
  });

  app.get("/api/tasks/:taskId/subtasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const taskId = parseInt(req.params.taskId);
    const subtasks = await storage.getSubtasks(taskId);
    res.json(subtasks);
  });

  // Add route to mark subtask as complete
  app.post("/api/subtasks/:id/complete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const subtaskId = parseInt(req.params.id);
    const completedSubtask = await storage.completeSubtask(subtaskId);
    res.json(completedSubtask);
  });

  // Add new route for deleting subtasks
  app.delete("/api/tasks/:taskId/subtasks/:subtaskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const taskId = parseInt(req.params.taskId);
    const subtaskId = parseInt(req.params.subtaskId);

    try {
      await storage.deleteSubtask(taskId, subtaskId);
      res.sendStatus(204);
    } catch (error) {
      console.error("Error deleting subtask:", error);
      res.status(500).json({ message: "Failed to delete subtask" });
    }
  });
  
  // Update a subtask's schedule information
  app.patch("/api/tasks/:taskId/subtasks/:subtaskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const taskId = parseInt(req.params.taskId);
    const subtaskId = parseInt(req.params.subtaskId);
    const updates = req.body;
    
    try {
      // Verify the task belongs to the user
      const tasks = await storage.getTasks(req.user.id, undefined);
      const task = tasks.find(t => t.id === taskId);
      
      if (!task) {
        return res.status(404).send("Task not found");
      }
      
      // Get the subtasks to verify the subtask exists
      const subtasks = await storage.getSubtasks(taskId);
      const subtaskExists = subtasks.some(s => s.id === subtaskId);
      
      if (!subtaskExists) {
        return res.status(404).send("Subtask not found");
      }
      
      // Only allow updating schedule-related fields
      const allowedUpdates = {
        scheduledTime: updates.scheduledTime,
        recurrencePattern: updates.recurrencePattern
      };
      
      // Update the subtask
      const subtask = await storage.updateSubtask(subtaskId, allowedUpdates);
      res.status(200).json(subtask);
    } catch (error) {
      console.error("Error updating subtask:", error);
      res.status(500).send("Error updating subtask");
    }
  });

  // Goals
  app.get("/api/goals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const goals = await storage.getGoals(req.user.id);
    res.json(goals);
  });

  app.post("/api/goals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertGoalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error);

    // Ensure deadline is null rather than undefined if not provided
    const goal = await storage.createGoal({
      ...parsed.data,
      userId: req.user.id,
      completed: false,
      deadline: parsed.data.deadline || null
    });
    res.status(201).json(goal);
  });

  app.patch("/api/goals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const goal = await storage.updateGoal(parseInt(req.params.id), req.body);
    res.json(goal);
  });

  app.delete("/api/goals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteGoal(parseInt(req.params.id));
    res.sendStatus(204);
  });
  
  // Daily Schedule endpoints
  app.get("/api/daily-schedules", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const schedules = await storage.getDailySchedules(req.user.id);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching daily schedules:", error);
      res.status(500).json({ error: "Failed to fetch daily schedules" });
    }
  });
  
  // Endpoint to create a new daily schedule from an LLM response
  app.post("/api/daily-schedules/from-llm", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { llmResponse } = req.body;
      
      if (!llmResponse || typeof llmResponse !== 'string') {
        return res.status(400).json({ error: "LLM response is required" });
      }
      
      // Import the schedule parser functions
      const { parseScheduleFromLLMResponse, createDailyScheduleFromParsed } = await import('./services/schedule-parser');
      
      // Parse the schedule from the LLM response
      const parsedSchedule = parseScheduleFromLLMResponse(llmResponse);
      
      if (!parsedSchedule) {
        return res.status(400).json({ error: "No schedule found in the LLM response" });
      }
      
      // Get the user's tasks for matching
      const tasks = await storage.getTasks(req.user.id);
      
      // Create a daily schedule from the parsed schedule
      const scheduleId = await createDailyScheduleFromParsed(req.user.id, parsedSchedule, tasks);
      
      res.status(201).json({ 
        message: "Daily schedule created successfully", 
        scheduleId,
        parsedItems: parsedSchedule.scheduleItems.length
      });
    } catch (error) {
      console.error("Error creating daily schedule from LLM response:", error);
      res.status(500).json({ error: "Failed to create daily schedule" });
    }
  });
  
  // Generate a schedule using the AI coach
  app.post("/api/daily-schedules/generate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Import required functions and components
      const { generateDailySchedule } = await import('./coach');
      const { parseScheduleFromLLMResponse, createDailyScheduleFromParsed } = await import('./services/schedule-parser');
      
      // Get tasks and user facts
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      
      // Optional custom instructions
      const { customInstructions } = req.body;
      
      // Generate the schedule with the AI
      const llmResponse = await generateDailySchedule(tasks, facts, customInstructions);
      
      // Parse the schedule from the LLM response
      const parsedSchedule = parseScheduleFromLLMResponse(llmResponse);
      
      if (!parsedSchedule) {
        return res.status(400).json({ 
          error: "No schedule could be generated", 
          llmResponse 
        });
      }
      
      // Create a daily schedule from the parsed schedule
      const scheduleId = await createDailyScheduleFromParsed(req.user.id, parsedSchedule, tasks);
      
      res.status(201).json({
        message: "Daily schedule generated successfully",
        scheduleId,
        parsedItems: parsedSchedule.scheduleItems.length,
        llmResponse
      });
    } catch (error) {
      console.error("Error generating daily schedule:", error);
      res.status(500).json({ error: "Failed to generate daily schedule" });
    }
  });
  
  // Add back the removed route handlers
  app.get("/api/daily-schedules/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const scheduleId = parseInt(req.params.id);
      const schedule = await storage.getDailySchedule(scheduleId);
      
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      
      res.json(schedule);
    } catch (error) {
      console.error("Error fetching daily schedule:", error);
      res.status(500).json({ error: "Failed to fetch daily schedule" });
    }
  });
  
  app.get("/api/daily-schedules/:id/items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const scheduleId = parseInt(req.params.id);
      const items = await storage.getScheduleItems(scheduleId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching schedule items:", error);
      res.status(500).json({ error: "Failed to fetch schedule items" });
    }
  });
  
  app.post("/api/daily-schedules/:id/confirm", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const scheduleId = parseInt(req.params.id);
      const success = await storage.confirmDailySchedule(scheduleId);
      
      if (success) {
        res.json({ message: "Schedule confirmed successfully" });
      } else {
        res.status(400).json({ error: "Failed to confirm schedule" });
      }
    } catch (error) {
      console.error("Error confirming schedule:", error);
      res.status(500).json({ error: "Failed to confirm schedule" });
    }
  });
  
  app.patch("/api/schedule-items/:id/status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const itemId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || typeof status !== 'string') {
        return res.status(400).json({ error: "Invalid status value" });
      }
      
      const updatedItem = await storage.updateScheduleItemStatus(itemId, status);
      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating schedule item status:", error);
      res.status(500).json({ error: "Failed to update schedule item status" });
    }
  });

  // Check-ins
  app.get("/api/checkins", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const checkIns = await storage.getCheckIns(req.user.id);
    res.json(checkIns);
  });

  app.post("/api/checkins", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertCheckInSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error);

    const checkIns = await storage.getCheckIns(req.user.id);
    const previousResponses = checkIns
      .slice(0, 3)
      .map(ci => ci.response)
      .filter((response): response is string => response !== null);

    const coachingResponse = await generateCoachingResponse(
      parsed.data.content,
      previousResponses
    );

    const checkIn = await storage.createCheckIn({
      userId: req.user.id,
      content: parsed.data.content,
      response: JSON.stringify(coachingResponse),
      createdAt: new Date()
    });

    res.status(201).json({ checkIn, coachingResponse });
  });

  // Message History endpoint
  app.get("/api/message-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      // Get message history from the database
      const messages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(limit);
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching message history:", error);
      res.status(500).json({ error: "Failed to fetch message history" });
    }
  });
  
  // Get scheduled messages and notifications
  app.get("/api/schedule", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get pending message schedules
      const pendingSchedules = await db
        .select()
        .from(messageSchedules)
        .where(
          and(
            eq(messageSchedules.userId, req.user.id),
            eq(messageSchedules.status, 'pending')
          )
        )
        .orderBy(messageSchedules.scheduledFor);
      
      // Get active tasks with scheduled times
      const activeTasks = await storage.getTasks(req.user.id);
      const scheduledTasks = activeTasks.filter(task => 
        task.status === 'active' && task.scheduledTime
      );
      
      // Get all subtasks for active tasks
      const subtasksByTask: Record<number, any[]> = {};
      for (const task of scheduledTasks) {
        if (task.id) {
          const subtasks = await storage.getSubtasks(task.id);
          const scheduledSubtasks = subtasks.filter(st => 
            !st.completedAt && st.scheduledTime
          );
          if (scheduledSubtasks.length > 0) {
            subtasksByTask[task.id] = scheduledSubtasks;
          }
        }
      }
      
      // Get the most recent schedule update from message history
      const recentScheduleMessages = await db
        .select()
        .from(messageHistory)
        .where(
          and(
            eq(messageHistory.userId, req.user.id),
            eq(messageHistory.type, 'morning_message')
          )
        )
        .orderBy(desc(messageHistory.createdAt))
        .limit(1);
      
      // Return combined schedule data
      res.json({
        pendingNotifications: pendingSchedules,
        scheduledTasks,
        scheduledSubtasks: subtasksByTask,
        lastScheduleUpdate: recentScheduleMessages[0] || null
      });
    } catch (error) {
      console.error("Error fetching schedule data:", error);
      res.status(500).json({ error: "Failed to fetch schedule data" });
    }
  });

  // Web Chat Message endpoint - for sending messages from the web UI
  app.post("/api/chat/send", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // First, store the user's message in the history with the correct type
      // This is important for the chat UI to display outgoing messages correctly
      await db.insert(messageHistory).values({
        userId: req.user.id,
        content: message,
        type: 'user_message', // Use 'user_message' type to mark this as a message from the user
        status: 'received',
        createdAt: new Date()
      });
      
      // Process the message using the same service that handles WhatsApp messages
      // This will generate a response and also store it in the message history
      await messagingService.handleUserResponse(req.user.id, message);
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error sending chat message:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // Reschedule day endpoint
  app.post("/api/chat/reschedule-day", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = await storage.getUser(req.user.id);
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Get current time for context
      const currentTime = new Date();
      
      // Create context for the rescheduling message
      const context = {
        user: user!,
        tasks,
        facts,
        previousMessages,
        currentDateTime: currentTime.toLocaleString(),
        messageType: 'reschedule' as const,
      };
      
      // Generate the reschedule message using a similar approach to morning messages
      // but focused on the current time of day and remaining tasks
      const rescheduleMessage = await messagingService.generateRescheduleMessage(context);
      
      // Store the message in history
      const messageId = await db.insert(messageHistory).values({
        userId: req.user.id,
        content: rescheduleMessage.message,
        type: 'reschedule_message',
        status: 'sent',
        metadata: { scheduleUpdates: rescheduleMessage.scheduleUpdates } as any,
        createdAt: new Date()
      }).returning({ id: messageHistory.id });

      // Schedule appropriate follow-ups based on the new schedule
      if (rescheduleMessage.scheduleUpdates && rescheduleMessage.scheduleUpdates.length > 0) {
        // Find the next task to schedule a follow-up for
        const sortedUpdates = [...rescheduleMessage.scheduleUpdates].sort((a, b) => {
          const timeA = a.scheduledTime ? new Date(a.scheduledTime).getTime() : Number.MAX_SAFE_INTEGER;
          const timeB = b.scheduledTime ? new Date(b.scheduledTime).getTime() : Number.MAX_SAFE_INTEGER;
          return timeA - timeB;
        });
        
        // Find the next task that's scheduled after the current time
        const nextTask = sortedUpdates.find(task => {
          if (!task.scheduledTime) return false;
          const taskTime = new Date(task.scheduledTime);
          return taskTime.getTime() > currentTime.getTime();
        });
        
        if (nextTask && nextTask.scheduledTime) {
          const taskTime = new Date(nextTask.scheduledTime);
          const delayMinutes = Math.max(1, Math.round((taskTime.getTime() - currentTime.getTime()) / 60000));
          await messageScheduler.scheduleFollowUp(req.user.id, delayMinutes, { 
            rescheduled: true,
            taskId: nextTask.taskId
          });
        }
      }
      
      res.json({
        id: messageId[0].id,
        content: rescheduleMessage.message,
        scheduleUpdates: rescheduleMessage.scheduleUpdates || []
      });
    } catch (error) {
      console.error("Error generating reschedule message:", error);
      res.status(500).json({ error: "Failed to reschedule day" });
    }
  });

  // Chat test endpoints
  app.post("/api/test/chat/trigger", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { timeOfDay } = req.body;
      if (!timeOfDay || !['morning', 'afternoon', 'evening'].includes(timeOfDay)) {
        return res.status(400).json({ error: "Invalid time of day. Use 'morning', 'afternoon', or 'evening'" });
      }
      
      const user = await storage.getUser(req.user.id);
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      const messages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);

      // Use the appropriate timeOfDay context and adjust current time
      let currentTime = new Date();
      let messageType: 'morning' | 'follow_up' = 'follow_up';
      
      if (timeOfDay === 'morning') {
        currentTime.setHours(8, 0, 0);
        messageType = 'morning';
      } else if (timeOfDay === 'afternoon') {
        currentTime.setHours(13, 0, 0);
      } else if (timeOfDay === 'evening') {
        currentTime.setHours(18, 0, 0);
      }
      
      const context = {
        user: user!,
        tasks,
        facts,
        previousMessages: messages,
        currentDateTime: currentTime.toLocaleString(),
        messageType
      };
      
      let message;
      if (messageType === 'morning') {
        message = await messagingService.generateMorningMessage(context);
      } else {
        message = await messagingService.generateFollowUpMessage(context);
      }
      
      // Store the test message in the message history
      const messageId = await db.insert(messageHistory).values({
        userId: req.user.id,
        content: message,
        type: messageType === 'morning' ? 'morning_message' : 'follow_up',
        status: 'sent',
        metadata: { test: true } as any,
        createdAt: currentTime
      }).returning({ id: messageHistory.id });

      res.json({ 
        id: messageId[0].id,
        type: messageType === 'morning' ? 'morning_message' : 'follow_up',
        direction: 'incoming',
        content: message,
        createdAt: currentTime.toISOString()
      });
    } catch (error) {
      console.error("Error generating test chat message:", error);
      res.status(500).json({ error: "Failed to generate test message" });
    }
  });

  // Message history endpoint for the chat UI
  app.get("/api/message-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Fetch message history for the current user
      const history = await db
        .select({
          id: messageHistory.id,
          userId: messageHistory.userId,
          content: messageHistory.content,
          type: messageHistory.type,
          status: messageHistory.status,
          createdAt: messageHistory.createdAt,
          metadata: messageHistory.metadata
        })
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(50); // Limit to the last 50 messages
      
      // Transform the results to match the expected format in the chat UI
      const transformedHistory = history.map(msg => {
        let direction: 'incoming' | 'outgoing';
        
        // Determine message direction based on type
        // Outgoing messages are sent by the user
        // Incoming messages are sent by the system
        if (msg.type === 'user_message') {
          direction = 'outgoing';
        } else {
          direction = 'incoming';
        }
        
        return {
          id: msg.id,
          userId: msg.userId,
          content: msg.content,
          direction,
          createdAt: msg.createdAt.toISOString(),
          metadata: msg.metadata
        };
      });
      
      // Return the most recent messages first in the UI, but they'll be sorted
      // properly for display in the ChatPage component
      res.json(transformedHistory);
    } catch (error) {
      console.error("Error fetching message history:", error);
      res.status(500).json({ error: "Failed to fetch message history" });
    }
  });

  app.post("/api/test/chat/respond", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // Store the user's message in history
      const userMessageId = await db.insert(messageHistory).values({
        userId: req.user.id,
        content: message,
        type: 'response',
        status: 'received',
        metadata: { test: true } as any,
        createdAt: new Date()
      }).returning({ id: messageHistory.id });

      // Get context data for generating a response
      const user = await storage.getUser(req.user.id);
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Generate the coach's response
      const responseContext = {
        user: user!,
        tasks,
        facts,
        previousMessages,
        currentDateTime: new Date().toLocaleString(),
        messageType: 'response' as const,
        userResponse: message
      };
      
      const responseResult = await messagingService.generateResponseMessage(responseContext);
      
      // Store the response in history
      const responseId = await db.insert(messageHistory).values({
        userId: req.user.id,
        content: responseResult.message,
        type: 'coach_response',
        status: 'sent',
        metadata: { test: true, scheduleUpdates: responseResult.scheduleUpdates } as any,
        createdAt: new Date()
      }).returning({ id: messageHistory.id });

      // Return both messages for the UI
      res.json({
        userMessage: {
          id: userMessageId[0].id,
          type: 'response',
          direction: 'outgoing',
          content: message,
          createdAt: new Date().toISOString()
        },
        coachResponse: {
          id: responseId[0].id,
          type: 'coach_response',
          direction: 'incoming',
          content: responseResult.message,
          createdAt: new Date().toISOString(),
          hasScheduleUpdates: responseResult.scheduleUpdates && responseResult.scheduleUpdates.length > 0
        }
      });
    } catch (error) {
      console.error("Error processing test chat response:", error);
      res.status(500).json({ error: "Failed to process response" });
    }
  });

  // Chat related endpoints
  app.get("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get message history for the current user
      const messages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(50);  // Limit to the most recent 50 messages
      
      // Transform the results to match the expected format in the chat UI
      const transformedMessages = messages.map(msg => {
        return {
          id: msg.id,
          content: msg.content,
          sender: msg.type === 'user_message' ? 'user' : 'assistant',
          timestamp: msg.createdAt.toISOString(),
          metadata: msg.metadata || {}
        };
      });
      
      res.json(transformedMessages.reverse());  // Reverse to get chronological order
    } catch (error) {
      console.error("Error fetching message history:", error);
      res.status(500).json({ message: "Failed to fetch message history" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: "Message content is required" });
    }
    
    try {
      // First, save the user's message to the history
      const [userMessage] = await db
        .insert(messageHistory)
        .values({
          userId: req.user.id,
          content,
          type: 'user_message',
          status: 'received'
          // createdAt will use the default value
        })
        .returning();
      
      // Generate a coaching response
      const coachingResponse = await generateCoachingResponse(content);
      const response = coachingResponse.message;
      
      // Save the assistant's response to the history
      const [assistantMessage] = await db
        .insert(messageHistory)
        .values({
          userId: req.user.id,
          content: response,
          type: 'response',
          status: 'sent'
          // createdAt will use the default value
        })
        .returning();
      
      // Return both messages in the expected format for the chat UI
      res.status(201).json({
        userMessage: {
          id: userMessage.id,
          content: userMessage.content,
          sender: 'user',
          timestamp: userMessage.createdAt.toISOString(),
          metadata: userMessage.metadata || {}
        },
        assistantMessage: {
          id: assistantMessage.id,
          content: assistantMessage.content,
          sender: 'assistant',
          timestamp: assistantMessage.createdAt.toISOString(),
          metadata: assistantMessage.metadata || {}
        }
      });
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  const httpServer = createServer(app);

  // Graceful shutdown
  httpServer.on('close', () => {
    messageScheduler.stop();
  });

  return httpServer;
}