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
  deleteMessageSchedule,
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
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid schedule item ID" });
      }
      
      // Create a completely new implementation
      const updateData: any = {};
      
      // Explicitly check for each field in the request body
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.startTime !== undefined) updateData.startTime = req.body.startTime;
      if (req.body.endTime !== undefined) updateData.endTime = req.body.endTime;
      if (req.body.status !== undefined) updateData.status = req.body.status;
      
      // Handle IDs specially since they need parsing
      if (req.body.taskId !== undefined) {
        updateData.taskId = req.body.taskId ? parseInt(req.body.taskId) : null;
      }
      
      if (req.body.subtaskId !== undefined) {
        updateData.subtaskId = req.body.subtaskId ? parseInt(req.body.subtaskId) : null;
      }
      
      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields provided for update" });
      }

      const item = await updateScheduleItem(id, updateData);

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

  // Soft delete a schedule item (sets deletedAt timestamp)
  app.delete("/api/schedule-management/items/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      console.log(`API: Processing delete request for schedule item ID ${id}`);
      
      if (isNaN(id)) {
        console.log(`API: Invalid schedule item ID: ${req.params.id}`);
        return res.status(400).json({ error: "Invalid schedule item ID" });
      }

      const result = await deleteScheduleItem(id);
      console.log(`API: Delete result for schedule item ${id}:`, result);
      
      if (!result) {
        console.log(`API: Schedule item with ID ${id} not found or already deleted`);
        return res.status(404).json({ error: "Schedule item not found" });
      }

      // Use 204 No Content for successful deletes to be consistent with message schedules endpoint
      console.log(`API: Successfully deleted schedule item ${id}, sending 204 response`);
      return res.status(204).end();
    } catch (error) {
      console.error("Error soft-deleting schedule item:", error);
      res.status(500).json({ 
        error: "Failed to soft-delete schedule item",
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

  // Soft delete a message schedule (sets deletedAt timestamp)
  app.delete("/api/schedule-management/messages/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      console.log(`API: Processing delete request for message schedule ID ${id}`);
      
      if (isNaN(id)) {
        console.log(`API: Invalid message schedule ID: ${req.params.id}`);
        return res.status(400).json({ error: "Invalid message schedule ID" });
      }

      const result = await deleteMessageSchedule(id);
      console.log(`API: Delete result for message ${id}:`, result);
      
      if (!result) {
        console.log(`API: Message schedule with ID ${id} not found or already deleted`);
        return res.status(404).json({ error: "Message schedule not found" });
      }

      // Use 204 No Content for consistency with the schedule items endpoint
      console.log(`API: Successfully deleted message schedule ${id}, sending 204 response`);
      return res.status(204).end();
    } catch (error) {
      console.error("Error soft-deleting message schedule:", error);
      return res.status(500).json({ 
        error: "Failed to soft-delete message schedule",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
}