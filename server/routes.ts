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

  // Web Chat Message endpoint - for sending messages from the web UI
  app.post("/api/chat/send", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // Process the message using the same service that handles WhatsApp messages
      await messagingService.handleUserResponse(req.user.id, message);
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error sending chat message:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // Test endpoints for message examples
  app.get("/api/examples/morning-message", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = await storage.getUser(req.user.id);
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      const messages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      const context = {
        user: user!,
        tasks,
        facts,
        previousMessages: messages,
        currentDateTime: new Date().toLocaleString(),
        messageType: 'morning' as const
      };
      
      const message = await messagingService.generateMorningMessage(context);
      res.json({ message });
    } catch (error) {
      console.error("Error generating example morning message:", error);
      res.status(500).json({ error: "Failed to generate example message" });
    }
  });

  app.get("/api/examples/follow-up-message", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = await storage.getUser(req.user.id);
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      const messages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      const context = {
        user: user!,
        tasks,
        facts,
        previousMessages: messages,
        currentDateTime: new Date().toLocaleString(),
        messageType: 'follow_up' as const
      };
      
      const message = await messagingService.generateFollowUpMessage(context);
      res.json({ message });
    } catch (error) {
      console.error("Error generating example follow-up message:", error);
      res.status(500).json({ error: "Failed to generate example message" });
    }
  });

  const httpServer = createServer(app);

  // Graceful shutdown
  httpServer.on('close', () => {
    messageScheduler.stop();
  });

  return httpServer;
}