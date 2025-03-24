import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { generateCoachingResponse } from "./coach";
import { insertGoalSchema, insertCheckInSchema, insertKnownUserFactSchema, insertTaskSchema, insertSubtaskSchema } from "@shared/schema";
import { handleWhatsAppWebhook } from "./webhook";
import { messageScheduler } from "./scheduler";
import { generateTaskSuggestions } from "./services/task-suggestions";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // WhatsApp Webhook endpoint
  app.post("/api/webhook/whatsapp", handleWhatsAppWebhook);

  // Test endpoint for scheduling messages (only in development)
  if (process.env.NODE_ENV === 'development') {
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
        res.status(500).json({ error: error.message });
      }
    });
  }

  // Start the message scheduler
  messageScheduler.start();

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

  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const taskData = parsed.data;

    try {
      // For specific task types, generate suggestions
      let suggestions = null;
      if (
        taskData.taskType === 'personal_project' ||
        taskData.taskType === 'long_term_project' ||
        taskData.taskType === 'life_goal'
      ) {
        suggestions = await generateTaskSuggestions(
          taskData.taskType,
          taskData.title,
          taskData.description || ''
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


  // Add new routes for subtasks
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

    const goal = await storage.createGoal({
      ...parsed.data,
      userId: req.user.id,
      completed: false
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

  const httpServer = createServer(app);

  // Graceful shutdown
  httpServer.on('close', () => {
    messageScheduler.stop();
  });

  return httpServer;
}