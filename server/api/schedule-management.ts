/**
 * Schedule Management API
 * 
 * This module provides API endpoints for the LLM to directly manage schedule items and message schedules.
 * These endpoints are intended to be used by the messaging service, not directly by the client.
 */

import type { Express, Request, Response } from "express";
import { 
  createScheduleItem, 
  deleteScheduleItem, 
  getScheduleItemsForDay, 
  getPendingMessageSchedules,
  scheduleMessage, 
  updateScheduleItem 
} from "../services/schedule-service";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";

// Utility to parse a date from string or use current date
function parseDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  try {
    return new Date(dateStr);
  } catch (e) {
    console.error("Invalid date format:", e);
    return new Date();
  }
}

// Verify that user exists
async function validateUser(userId: number): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return !!user;
}

export function registerScheduleManagementAPI(app: Express) {
  // Get schedule items for a specific day
  app.get("/api/schedule-management/items", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.query.userId as string);
      const date = parseDate(req.query.date as string | undefined);
      
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid userId parameter" });
      }

      const userExists = await validateUser(userId);
      if (!userExists) {
        return res.status(404).json({ error: "User not found" });
      }

      const items = await getScheduleItemsForDay(userId, date);
      res.json(items);
    } catch (error) {
      console.error("Error retrieving schedule items:", error);
      res.status(500).json({ 
        error: "Failed to retrieve schedule items",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Create a new schedule item
  app.post("/api/schedule-management/items", async (req: Request, res: Response) => {
    try {
      const { 
        userId, 
        title, 
        description, 
        startTime, 
        endTime, 
        taskId, 
        subtaskId, 
        date 
      } = req.body;

      if (!userId || !title || !startTime) {
        return res.status(400).json({ 
          error: "Missing required fields", 
          requiredFields: ["userId", "title", "startTime"] 
        });
      }

      const parsedUserId = parseInt(userId);
      if (isNaN(parsedUserId)) {
        return res.status(400).json({ error: "Invalid userId" });
      }

      const userExists = await validateUser(parsedUserId);
      if (!userExists) {
        return res.status(404).json({ error: "User not found" });
      }

      const parsedDate = date ? parseDate(date) : undefined;
      
      const item = await createScheduleItem({
        userId: parsedUserId,
        title,
        description: description || "",
        startTime,
        endTime: endTime || undefined,
        taskId: taskId ? parseInt(taskId) : undefined,
        subtaskId: subtaskId ? parseInt(subtaskId) : undefined,
        date: parsedDate
      });

      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating schedule item:", error);
      res.status(500).json({ 
        error: "Failed to create schedule item",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update an existing schedule item
  app.put("/api/schedule-management/items/:id", async (req: Request, res: Response) => {
    try {
      // Log the request body as a separate response for debugging
      console.log("Request body debug:", JSON.stringify(req.body));
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid schedule item ID" });
      }
      
      // For debugging, output all we get
      res.status(200).json({
        message: "Received update request",
        id,
        body: req.body,
        hasStatus: 'status' in req.body,
        statusValue: req.body.status
      });
      
      return; // Stop here for diagnostic purposes
      
      // Normal code will resume below after debugging

      const item = await updateScheduleItem(id, {
        title,
        description,
        startTime,
        endTime,
        taskId: taskId ? parseInt(taskId) : undefined,
        subtaskId: subtaskId ? parseInt(subtaskId) : undefined,
        status
      });

      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }

      res.json(item);
    } catch (error) {
      console.error("Error updating schedule item:", error);
      res.status(500).json({ 
        error: "Failed to update schedule item",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Delete a schedule item
  app.delete("/api/schedule-management/items/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid schedule item ID" });
      }

      const result = await deleteScheduleItem(id);
      if (!result) {
        return res.status(404).json({ error: "Schedule item not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting schedule item:", error);
      res.status(500).json({ 
        error: "Failed to delete schedule item",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get pending message schedules for a user
  app.get("/api/schedule-management/messages", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.query.userId as string);
      const date = parseDate(req.query.date as string | undefined);
      
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid userId parameter" });
      }

      const userExists = await validateUser(userId);
      if (!userExists) {
        return res.status(404).json({ error: "User not found" });
      }

      const messages = await getPendingMessageSchedules(userId, date);
      res.json(messages);
    } catch (error) {
      console.error("Error retrieving message schedules:", error);
      res.status(500).json({ 
        error: "Failed to retrieve message schedules",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Schedule a follow-up message
  app.post("/api/schedule-management/messages", async (req: Request, res: Response) => {
    try {
      const { 
        userId, 
        type, 
        tone, 
        title, 
        scheduledFor,
        taskId,
        subtaskId
      } = req.body;

      if (!userId || !type || !scheduledFor) {
        return res.status(400).json({ 
          error: "Missing required fields", 
          requiredFields: ["userId", "type", "scheduledFor"] 
        });
      }

      const parsedUserId = parseInt(userId);
      if (isNaN(parsedUserId)) {
        return res.status(400).json({ error: "Invalid userId" });
      }

      const userExists = await validateUser(parsedUserId);
      if (!userExists) {
        return res.status(404).json({ error: "User not found" });
      }

      const messageSchedule = await scheduleMessage({
        userId: parsedUserId,
        type,
        tone: tone || 'neutral',
        title: title || '',
        scheduledFor: new Date(scheduledFor),
        taskId: taskId ? parseInt(taskId) : undefined,
        subtaskId: subtaskId ? parseInt(subtaskId) : undefined
      });

      res.status(201).json(messageSchedule);
    } catch (error) {
      console.error("Error scheduling message:", error);
      res.status(500).json({ 
        error: "Failed to schedule message",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
}