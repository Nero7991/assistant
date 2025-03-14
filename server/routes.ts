import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { generateCoachingResponse } from "./coach";
import { insertGoalSchema, insertCheckInSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

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
      .filter(Boolean);

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
  return httpServer;
}
