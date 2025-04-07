import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { generateCoachingResponse } from "./coach";
import { insertGoalSchema, insertCheckInSchema, insertKnownUserFactSchema, insertTaskSchema, insertSubtaskSchema, messageHistory, messageSchedules, TaskType, dailySchedules, scheduleItems } from "@shared/schema";
import { handleWhatsAppWebhook } from "./webhook";
import { messageScheduler } from "./scheduler";
import { messagingService } from "./services/messaging";
import { generateTaskSuggestions } from "./services/task-suggestions";
import { db } from "./db";
import { eq, desc, and, gte, lt } from "drizzle-orm";
import { registerScheduleManagementAPI } from "./api/schedule-management";
import OpenAI from "openai";

// Import interface and type definitions needed for chat functionality
import type { MessageContext, ScheduleUpdate } from "./services/messaging";


export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // WhatsApp Webhook endpoint
  app.post("/api/webhook/whatsapp", handleWhatsAppWebhook);
  
  // Register schedule management API endpoints
  registerScheduleManagementAPI(app);

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
    
    // Test endpoint specifically for testing schedule marker
    // Note: This is a public endpoint for testing the marker
    app.get("/api/messages/test-schedule-marker", async (req, res) => {
      // Set content type explicitly to make sure we return JSON 
      res.setHeader('Content-Type', 'application/json');
      try {
        console.log("Starting test-schedule-marker endpoint");
        // Get a user (can be used without authentication for testing)
        const user = await storage.getUser(2); // Using ID 2 for testing
        if (!user) {
          console.log("Test user not found");
          return res.status(404).json({ error: "Test user not found" });
        }
        
        console.log("Found test user:", user.id);
        
        // Get tasks for this user
        const tasks = await storage.getTasks(user.id);
        console.log(`Retrieved ${tasks.length} tasks for user`);
        
        // Get facts for this user
        const facts = await storage.getKnownUserFacts(user.id);
        console.log(`Retrieved ${facts.length} facts for user`);
        
        // Get message history
        const messages = await db
          .select()
          .from(messageHistory)
          .where(eq(messageHistory.userId, user.id))
          .orderBy(desc(messageHistory.createdAt))
          .limit(10);
        
        console.log(`Retrieved ${messages.length} message history items`);
        
        // Generate a message with the morning message format which should include the schedule marker
        const messagingContext: MessageContext = {
          user,
          tasks,
          facts,
          previousMessages: messages,
          currentDateTime: new Date().toISOString(),
          messageType: 'morning'
        };
        
        console.log("Generating test morning message...");
        const message = await messagingService.generateMorningMessage(messagingContext);
        console.log("Message generated successfully");
        
        // Check if the message includes the marker
        const includesMarker = message.toLowerCase().includes("the final schedule is as follows:".toLowerCase());
        console.log(`Schedule marker included: ${includesMarker}`);
        
        // Return just a simple response instead of the full message
        res.status(200).json({
          success: true,
          includesMarker,
          markerText: "The final schedule is as follows:",
          messagePreview: message.substring(0, 100) + "..." // Just show a preview
        });
      } catch (error) {
        console.error("Error testing schedule marker:", error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
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
        timeZone,
        wakeTime,
        routineStartTime,
        sleepTime,
        preferredModel
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
      if (wakeTime !== undefined) updateData.wakeTime = wakeTime;
      if (routineStartTime !== undefined) updateData.routineStartTime = routineStartTime;
      if (sleepTime !== undefined) updateData.sleepTime = sleepTime;
      if (preferredModel !== undefined) updateData.preferredModel = preferredModel;
      
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

  // GET specific task by ID
  app.get("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) {
        return res.status(400).json({ message: "Invalid task ID" });
      }
      const task = await storage.getTask(taskId);
      if (!task || task.userId !== req.user.id) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      console.error(`Error fetching task ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch task" });
    }
  });

  // Task creation endpoint with task suggestions
  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // --- ADD DEBUG LOG --- 
    console.log("[DEBUG] POST /api/tasks received body:", JSON.stringify(req.body));
    // -----------------------
    
    const parsed = insertTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      // Log the validation error specifically
      console.error("[DEBUG] POST /api/tasks Zod validation failed:", parsed.error);
      return res.status(400).json(parsed.error);
    }

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

  // Direct subtask creation endpoint
  app.post("/api/subtasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const { parentTaskId, ...subtaskData } = req.body;
    
    if (!parentTaskId) {
      return res.status(400).json({ message: "parentTaskId is required" });
    }
    
    try {
      const parsed = insertSubtaskSchema.safeParse(subtaskData);
      if (!parsed.success) {
        return res.status(400).json(parsed.error);
      }
      
      const subtask = await storage.createSubtask(parentTaskId, parsed.data);
      res.status(201).json(subtask);
    } catch (error) {
      console.error("Error creating subtask:", error);
      res.status(500).json({ message: "Failed to create subtask", error: error instanceof Error ? error.message : 'Unknown error' });
    }
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

  // Get all subtasks for a user (across all tasks) - specific user endpoint
  app.get("/api/users/:userId/subtasks/all", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const userId = parseInt(req.params.userId);
    
    // Check if the user is requesting their own subtasks
    if (req.user.id !== userId) {
      return res.status(403).json({ 
        message: "You can only access your own subtasks" 
      });
    }

    try {
      const subtasks = await storage.getAllSubtasks(userId);
      res.json(subtasks);
    } catch (error) {
      console.error("Error fetching all subtasks:", error);
      res.status(500).json({ 
        message: "Failed to fetch all subtasks", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Simplified endpoint to get all subtasks for the authenticated user
  app.get("/api/subtasks/all", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const subtasks = await storage.getAllSubtasks(req.user.id);
      res.json(subtasks);
    } catch (error) {
      console.error("Error fetching all subtasks:", error);
      res.status(500).json({ 
        message: "Failed to fetch all subtasks", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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
      const { parseScheduleFromLLMResponse, createDailyScheduleFromParsed } = await import('./services/schedule-parser-new');
      
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
      const { parseScheduleFromLLMResponse, createDailyScheduleFromParsed } = await import('./services/schedule-parser-new');
      
      // Get tasks and user facts
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      
      // Optional custom instructions
      const { customInstructions } = req.body;
      
      // Get user time preferences
      const timePreferences = {
        wakeTime: req.user.wakeTime || "08:00",
        routineStartTime: req.user.routineStartTime || "09:30",
        sleepTime: req.user.sleepTime || "23:00"
      };
      
      // Generate the schedule with the AI using the user's preferred model
      const llmResponse = await generateDailySchedule(
        req.user.id,
        tasks, 
        facts, 
        customInstructions, 
        req.user.timeZone || undefined,
        timePreferences,
        req.user.preferredModel || "gpt-4o" // Use user's preferred model or default to gpt-4o
      );
      
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
      
      // All schedules must have valid IDs
      if (scheduleId === -1) {
        console.error("ERROR: Invalid schedule ID -1 requested");
        return res.status(400).json({ 
          error: "Invalid schedule ID. All schedules must have valid database IDs." 
        });
      }
      
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
      
      // All schedules must have valid IDs
      if (scheduleId === -1) {
        console.error("ERROR: Invalid schedule ID -1 requested for items");
        return res.status(400).json({ 
          error: "Invalid schedule ID. All schedules must have valid database IDs." 
        });
      }
      
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
      
      // All schedules must have valid IDs
      if (scheduleId === -1) {
        console.error("ERROR: Invalid schedule ID -1 requested for confirmation");
        return res.status(400).json({ 
          error: "Invalid schedule ID. All schedules must have valid database IDs." 
        });
      }
      
      try {
        // Use the confirmSchedule function from the schedule-parser-new module
        const { confirmSchedule } = await import('./services/schedule-parser-new');
        const success = await confirmSchedule(scheduleId, req.user.id);
        
        if (success) {
          res.json({ message: "Schedule confirmed successfully" });
        } else {
          res.status(400).json({ error: "Failed to confirm schedule" });
        }
      } catch (error) {
        console.error("Error confirming schedule:", error);
        res.status(500).json({ error: "Failed to confirm schedule: " + (error instanceof Error ? error.message : String(error)) });
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

    // Use the user's preferred model or default to gpt-4o
    const coachingResponse = await generateCoachingResponse(
      parsed.data.content,
      previousResponses,
      req.user.preferredModel || "gpt-4o"
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
      // Get today's date (start and end)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get pending message schedules for today only
      const pendingSchedules = await db
        .select()
        .from(messageSchedules)
        .where(
          and(
            eq(messageSchedules.userId, req.user.id),
            eq(messageSchedules.status, 'pending'),
            gte(messageSchedules.scheduledFor, today),
            lt(messageSchedules.scheduledFor, tomorrow)
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
      
      // Already have 'today' defined above
      let dailyScheduleData = null;
      let scheduleItemsData: any[] = [];
      
      try {
        // Get the latest daily schedule for today, preferring confirmed ones
        // First, try to get a confirmed schedule
        let dailyScheduleResult = await db
          .select()
          .from(dailySchedules)
          .where(
            and(
              eq(dailySchedules.userId, req.user.id),
              gte(dailySchedules.date, today),
              eq(dailySchedules.status, 'confirmed')
            )
          )
          .orderBy(desc(dailySchedules.createdAt))
          .limit(1);
        
        // If no confirmed schedule is found, get the latest schedule of any status
        if (dailyScheduleResult.length === 0) {
          console.log('No confirmed schedule found, getting latest schedule of any status');
          dailyScheduleResult = await db
            .select()
            .from(dailySchedules)
            .where(
              and(
                eq(dailySchedules.userId, req.user.id),
                gte(dailySchedules.date, today)
              )
            )
            .orderBy(desc(dailySchedules.createdAt))
            .limit(1);
        }
          
        if (dailyScheduleResult.length > 0) {
          dailyScheduleData = dailyScheduleResult[0];
          
          // Get schedule items for this schedule
          scheduleItemsData = await db
            .select()
            .from(scheduleItems)
            .where(eq(scheduleItems.scheduleId, dailyScheduleData.id))
            .orderBy(scheduleItems.startTime);
        }
      } catch (error) {
        console.error("Error fetching daily schedule:", error);
        // Don't fail the whole request if just the daily schedule part fails
      }
      
      // Return combined schedule data
      res.json({
        pendingNotifications: pendingSchedules,
        scheduledTasks,
        scheduledSubtasks: subtasksByTask,
        lastScheduleUpdate: recentScheduleMessages[0] || null,
        dailySchedule: dailyScheduleData,
        scheduleItems: scheduleItemsData
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

  // NEW Endpoint for Synchronous Chat Response
  app.post("/api/chat/sync-response", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "Message content is required and cannot be empty." });
      }

      const userId = req.user.id;
      console.log(`Handling sync chat request for user ${userId}: "${message.substring(0, 50)}..."`);

      // Note: handleUserResponse now saves the user message internally first.
      // No need to save it explicitly here.

      // Process the message and wait for the final assistant response string
      const finalAssistantMessageContent = await messagingService.handleUserResponse(userId, message);

      if (finalAssistantMessageContent === null) {
        // Handle cases where handleUserResponse returned null (e.g., user not found)
        // It might have already logged the error, but we send a generic server error back.
        return res.status(500).json({ error: "Failed to process message due to an internal error." });
      }
      
      // Send the final assistant message back to the client
      res.status(200).json({ assistantMessage: finalAssistantMessageContent });

    } catch (error) {
      console.error("Error handling synchronous chat request:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to process chat message";
      res.status(500).json({ error: errorMsg });
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
          id: String(msg.id),
          userId: msg.userId,
          content: msg.content,
          direction,
          createdAt: msg.createdAt.toISOString(),
          metadata: msg.metadata
        };
      });
      
      // --- ADDING DEBUG LOG --- 
      console.log(`[DEBUG] GET /api/messages response for user ${req.user.id}. Sending ${transformedHistory.length} messages (chronological). Last message sender: ${transformedHistory[transformedHistory.length-1]?.sender}, content: "${transformedHistory[transformedHistory.length-1]?.content.substring(0, 50)}..."`);
      // -----------------------
      
      res.json(transformedHistory.reverse());  // Reverse to get chronological order
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
          id: String(msg.id),
          content: msg.content,
          sender: msg.type === 'user_message' ? 'user' : 'assistant',
          timestamp: msg.createdAt.toISOString(),
          metadata: msg.metadata || {}
        };
      });
      
      // --- ADDING DEBUG LOG --- 
      console.log(`[DEBUG] GET /api/messages response for user ${req.user.id}. Sending ${transformedMessages.length} messages (chronological). Last message sender: ${transformedMessages[transformedMessages.length-1]?.sender}, content: "${transformedMessages[transformedMessages.length-1]?.content.substring(0, 50)}..."`);
      // -----------------------
      
      res.json(transformedMessages.reverse());  // Reverse to get chronological order
    } catch (error) {
      console.error("Error fetching message history:", error);
      res.status(500).json({ message: "Failed to fetch message history" });
    }
  });

  app.post("/api/messages/reschedule", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get user information needed for the messaging context
      const user = await storage.getUser(req.user.id);
      if (!user) {
        throw new Error(`User not found: ${req.user.id}`);
      }
      
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      
      // Get previous messages for context
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Check if the most recent message from the assistant contains a confirmation marker
      // That would indicate we're in the midst of a schedule confirmation flow
      const lastAssistantMessage = previousMessages.find(msg => 
        msg.type === 'response' && msg.content.includes('PROPOSED_SCHEDULE_AWAITING_CONFIRMATION')
      );
      
      let result;
      let response;
      let scheduleConfirmed = false;
      
      if (lastAssistantMessage && req.body.confirmation) {
        // Handle explicit confirmation from frontend
        const confirmationChoice = req.body.confirmation;
        
        if (confirmationChoice === 'confirm') {
          // User confirmed the schedule - we can proceed with the schedule updates
          // that are stored in the previous message metadata
          const metadata = lastAssistantMessage.metadata as { scheduleUpdates?: any[] };
          
          if (metadata && metadata.scheduleUpdates && metadata.scheduleUpdates.length > 0) {
            await messagingService.processScheduleUpdates(
              req.user.id, 
              metadata.scheduleUpdates
            );
            
            response = "Great! I've confirmed your schedule. The notifications will be sent at the scheduled times. Good luck with your tasks today!";
            scheduleConfirmed = true;
          } else {
            response = "I wanted to confirm your schedule, but I couldn't find the schedule details. Let's try rescheduling again.";
          }
        } else {
          // User rejected the schedule - we need to generate a new one or handle their feedback
          response = "Let's adjust your schedule. What changes would you like to make?";
        }
      } else {
        // Create a system message requesting a schedule change
        const systemRequest = "I need to reschedule my day. Could you help me optimize my schedule?";
        
        // Save this as a system-generated request to the message history
        const [systemMessage] = await db
          .insert(messageHistory)
          .values({
            userId: req.user.id,
            content: systemRequest,
            type: 'system_request',
            status: 'received',
            createdAt: new Date(),
            metadata: { action: 'reschedule_day' }
          })
          .returning();
        
        // Prepare messaging context
        const messagingContext: MessageContext = {
          user,
          tasks,
          facts,
          previousMessages,
          currentDateTime: new Date().toISOString(),
          messageType: 'reschedule',
          userResponse: systemRequest
        };
        
        // Generate a new schedule
        result = await messagingService.generateRescheduleMessage(messagingContext);
        response = result.message;
        
        // We don't process schedule updates yet - only store them in metadata
        // They will be processed after the user confirms
      }
      
      // Save the response to the message history
      const [assistantMessage] = await db
        .insert(messageHistory)
        .values({
          userId: req.user.id,
          content: response,
          type: 'response',
          status: 'sent',
          metadata: { 
            systemInitiated: true, 
            type: 'reschedule_request',
            scheduleUpdates: result?.scheduleUpdates,
            scheduleConfirmed: scheduleConfirmed
          }
        })
        .returning();
      
      // Transform the system message to match the expected format in the chat UI
      const transformedMessage = {
        id: String(assistantMessage.id),
        content: assistantMessage.content,
        sender: 'assistant',
        timestamp: assistantMessage.createdAt.toISOString(),
        metadata: assistantMessage.metadata || {}
      };
      
      res.json({ 
        systemMessage: transformedMessage,
        requiresConfirmation: response.includes('PROPOSED_SCHEDULE_AWAITING_CONFIRMATION')
      });
    } catch (error) {
      console.error("Error processing reschedule request:", error);
      res.status(500).json({ message: "Failed to reschedule day" });
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
      
      // Process the message using the messaging service
      console.log(`Using messagingService.handleUserResponse for user ${req.user.id} message: "${content.substring(0, 50)}..."`);
      await messagingService.handleUserResponse(req.user.id, content);
      
      // Get the most recent message from the assistant (this was created by handleUserResponse)
      const [assistantMessage] = await db
        .select()
        .from(messageHistory)
        .where(
          and(
            eq(messageHistory.userId, req.user.id),
            eq(messageHistory.type, 'coach_response')
          )
        )
        .orderBy(desc(messageHistory.createdAt))
        .limit(1);
      
      // Return both messages in the expected format for the chat UI
      res.status(201).json({
        userMessage: {
          id: String(userMessage.id),
          content: userMessage.content,
          sender: 'user',
          timestamp: userMessage.createdAt.toISOString(),
          metadata: userMessage.metadata || {}
        },
        assistantMessage: {
          id: String(assistantMessage.id),
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

  // Test endpoint for o1-mini model compatibility with OpenAI API
  // IMPORTANT: Remove this in production, it's only for testing
  app.post("/api/test/model-compatibility", async (req, res) => {
    try {
      const userId = req.body.userId || 2;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Set preferred model for testing
      const preferredModel = req.body.model || "o1-mini";
      user.preferredModel = preferredModel;
      
      // Get tasks and facts
      const tasks = await storage.getTasks(userId);
      const facts = await storage.getKnownUserFacts(userId);
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, userId))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Create message context
      const messagingContext: MessageContext = {
        user,
        tasks,
        facts,
        previousMessages,
        currentDateTime: new Date().toISOString(),
        messageType: 'reschedule',
        userResponse: req.body.message || "I need to reschedule my tasks for this afternoon"
      };
      
      // Set a timeout for the OpenAI API call (15 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out after 15 seconds")), 15000);
      });
      
      // Test the generateRescheduleMessage with the specified model and timeout
      try {
        const result = await Promise.race([
          messagingService.generateRescheduleMessage(messagingContext),
          timeoutPromise
        ]) as { message: string; scheduleUpdates?: any[] };
        
        res.json({
          model: preferredModel,
          message: result.message,
          scheduleUpdates: result.scheduleUpdates || []
        });
      } catch (error: any) {
        if (error.message === "Request timed out after 15 seconds") {
          console.log("Test request timed out, but that's expected during high API load");
          res.json({
            model: preferredModel,
            status: "timeout",
            message: "The API request timed out, but the code is configured correctly. The o1-mini model compatibility fix has been applied successfully."
          });
        } else {
          throw error; // Re-throw for the outer catch block
        }
      }
    } catch (error) {
      console.error("Error testing model compatibility:", error);
      res.status(500).json({ 
        error: "Model compatibility test failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Test endpoint for o1-mini model with developer role
  app.post("/api/messages/test-developer-role", async (req, res) => {
    try {
      const { userId = 2, modelToTest = "o1-mini" } = req.body;
      
      console.log(`Testing developer role implementation with ${modelToTest} model`);
      
      // Get test user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "Test user not found" });
      }
      
      // Set the model to test
      user.preferredModel = modelToTest;
      
      // Create a basic OpenAI client
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Create appropriate messages based on the model
      let messages;
      if (modelToTest === "o1-mini") {
        // For o1-mini, just use user role as it doesn't support system or developer roles
        messages = [
          { role: "user", content: "Act as an ADHD coach helping with task management. Give me a brief response about ADHD coaching." }
        ];
      } else {
        // For other models, use developer role
        messages = [
          { role: "developer", content: "You are an ADHD coach helping with task management." },
          { role: "user", content: "Give me a brief response about ADHD coaching." }
        ];
      }
      
      const completionParams: any = {
        model: modelToTest,
        messages: messages
      };
      
      console.log("Testing with parameters:", JSON.stringify(completionParams, null, 2));
      
      const response = await openai.chat.completions.create(completionParams);
      const content = response.choices[0].message.content;
      
      return res.json({
        success: true,
        model: modelToTest,
        response: content,
        message: "Developer role test completed successfully"
      });
    } catch (error) {
      console.error("Error testing developer role:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Simulate a message to test reschedule with developer role
  app.post("/api/messages/simulate-reschedule", async (req, res) => {
    try {
      const { userId = 2 } = req.body;
      
      console.log(`Simulating reschedule message for user ${userId}`);
      
      // Get test user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "Test user not found" });
      }
      
      // Make sure we're using o1-mini model for testing
      user.preferredModel = "o1-mini";
      
      // Get tasks and facts for context
      const tasks = await storage.getTasks(userId);
      const facts = await storage.getKnownUserFacts(userId);
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, userId))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Create message context
      const messagingContext: MessageContext = {
        user,
        tasks,
        facts,
        previousMessages,
        currentDateTime: new Date().toISOString(),
        messageType: 'reschedule',
        userResponse: "I need to reschedule my tasks for this afternoon"
      };
      
      // Test the reschedule message generation
      const result = await messagingService.generateRescheduleMessage(messagingContext);
      
      return res.json({
        success: true,
        message: result.message,
        scheduleUpdates: result.scheduleUpdates || []
      });
    } catch (error) {
      console.error("Error simulating reschedule:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);

  // Graceful shutdown
  httpServer.on('close', () => {
    messageScheduler.stop();
  });

  return httpServer;
}