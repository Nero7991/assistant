/**
 * Reminders API
 * 
 * Provides CRUD operations for message schedules (reminders) with proper validation
 * and duplicate prevention.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { messageSchedules, users, tasks } from "@shared/schema";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { z } from "zod";

// Validation schemas
const reminderRequestSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(['pre_reminder', 'reminder', 'post_reminder_follow_up', 'follow_up', 'morning_message']),
  scheduledFor: z.string().datetime(),
  taskId: z.number().optional(),
  content: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const reminderUpdateSchema = reminderRequestSchema.partial();

const snoozeRequestSchema = z.object({
  minutes: z.number().min(1).max(1440) // 1 minute to 24 hours
});

interface ReminderResponse {
  id: number;
  title: string;
  type: string;
  scheduledFor: string;
  status: string;
  taskId?: number;
  taskTitle?: string;
  content?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export function registerRemindersAPI(app: Express) {
  
  // Get user's reminders
  app.get("/api/reminders", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const userId = req.user.id;
      const status = req.query.status as string || 'pending';
      const limit = parseInt(req.query.limit as string) || 50;
      
      // Query reminders with optional task information
      const reminders = await db
        .select({
          id: messageSchedules.id,
          title: messageSchedules.title,
          type: messageSchedules.type,
          scheduledFor: messageSchedules.scheduledFor,
          status: messageSchedules.status,
          content: messageSchedules.content,
          metadata: messageSchedules.metadata,
          createdAt: messageSchedules.createdAt,
          updatedAt: messageSchedules.updatedAt,
          taskId: sql<number | null>`(${messageSchedules.metadata}->>'taskId')::integer`,
          taskTitle: tasks.title
        })
        .from(messageSchedules)
        .leftJoin(
          tasks, 
          sql`(${messageSchedules.metadata}->>'taskId')::integer = ${tasks.id}`
        )
        .where(
          and(
            eq(messageSchedules.userId, userId),
            status !== 'all' ? eq(messageSchedules.status, status) : undefined
          )
        )
        .orderBy(asc(messageSchedules.scheduledFor))
        .limit(limit);
      
      const response: ReminderResponse[] = reminders.map(r => ({
        id: r.id,
        title: r.title || '',
        type: r.type,
        scheduledFor: r.scheduledFor.toISOString(),
        status: r.status,
        taskId: r.taskId || undefined,
        taskTitle: r.taskTitle || undefined,
        content: r.content || undefined,
        metadata: r.metadata as Record<string, any> || undefined,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      }));
      
      res.json(response);
      
    } catch (error) {
      console.error('Error fetching reminders:', error);
      res.status(500).json({ error: 'Failed to fetch reminders' });
    }
  });
  
  // Get specific reminder
  app.get("/api/reminders/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const reminderId = parseInt(req.params.id);
      const userId = req.user.id;
      
      if (isNaN(reminderId)) {
        return res.status(400).json({ error: 'Invalid reminder ID' });
      }
      
      const [reminder] = await db
        .select({
          id: messageSchedules.id,
          title: messageSchedules.title,
          type: messageSchedules.type,
          scheduledFor: messageSchedules.scheduledFor,
          status: messageSchedules.status,
          content: messageSchedules.content,
          metadata: messageSchedules.metadata,
          createdAt: messageSchedules.createdAt,
          updatedAt: messageSchedules.updatedAt,
          taskId: sql<number | null>`(${messageSchedules.metadata}->>'taskId')::integer`,
          taskTitle: tasks.title
        })
        .from(messageSchedules)
        .leftJoin(
          tasks, 
          sql`(${messageSchedules.metadata}->>'taskId')::integer = ${tasks.id}`
        )
        .where(
          and(
            eq(messageSchedules.id, reminderId),
            eq(messageSchedules.userId, userId)
          )
        );
      
      if (!reminder) {
        return res.status(404).json({ error: 'Reminder not found' });
      }
      
      const response: ReminderResponse = {
        id: reminder.id,
        title: reminder.title || '',
        type: reminder.type,
        scheduledFor: reminder.scheduledFor.toISOString(),
        status: reminder.status,
        taskId: reminder.taskId || undefined,
        taskTitle: reminder.taskTitle || undefined,
        content: reminder.content || undefined,
        metadata: reminder.metadata as Record<string, any> || undefined,
        createdAt: reminder.createdAt.toISOString(),
        updatedAt: reminder.updatedAt.toISOString()
      };
      
      res.json(response);
      
    } catch (error) {
      console.error('Error fetching reminder:', error);
      res.status(500).json({ error: 'Failed to fetch reminder' });
    }
  });
  
  // Create new reminder
  app.post("/api/reminders", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const userId = req.user.id;
      const validation = reminderRequestSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request data',
          details: validation.error.errors
        });
      }
      
      const { title, type, scheduledFor, taskId, content, metadata } = validation.data;
      const scheduledDate = new Date(scheduledFor);
      
      // Validate task exists if taskId provided
      if (taskId) {
        const [task] = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
          .limit(1);
          
        if (!task) {
          return res.status(400).json({ error: 'Task not found' });
        }
      }
      
      // Create reminder with transaction for safety
      const result = await db.transaction(async (tx) => {
        const [newReminder] = await tx
          .insert(messageSchedules)
          .values({
            userId,
            type,
            title,
            content,
            scheduledFor: scheduledDate,
            status: 'pending',
            metadata: {
              ...metadata,
              ...(taskId ? { taskId } : {}),
              createdViaUI: true,
              createdAt: new Date().toISOString()
            },
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();
          
        return newReminder;
      });
      
      // Return the created reminder with task info if applicable
      const response: ReminderResponse = {
        id: result.id,
        title: result.title || '',
        type: result.type,
        scheduledFor: result.scheduledFor.toISOString(),
        status: result.status,
        taskId: taskId,
        content: result.content || undefined,
        metadata: result.metadata as Record<string, any> || undefined,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString()
      };
      
      res.status(201).json(response);
      
    } catch (error) {
      console.error('Error creating reminder:', error);
      
      // Handle unique constraint violations
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        return res.status(409).json({ 
          error: 'A similar reminder already exists',
          code: 'DUPLICATE_REMINDER'
        });
      }
      
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  });
  
  // Update reminder
  app.put("/api/reminders/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const reminderId = parseInt(req.params.id);
      const userId = req.user.id;
      
      if (isNaN(reminderId)) {
        return res.status(400).json({ error: 'Invalid reminder ID' });
      }
      
      const validation = reminderUpdateSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request data',
          details: validation.error.errors
        });
      }
      
      const updates = validation.data;
      
      // Validate task exists if taskId provided
      if (updates.taskId) {
        const [task] = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, updates.taskId), eq(tasks.userId, userId)))
          .limit(1);
          
        if (!task) {
          return res.status(400).json({ error: 'Task not found' });
        }
      }
      
      // Update reminder
      const [updatedReminder] = await db
        .update(messageSchedules)
        .set({
          ...(updates.title && { title: updates.title }),
          ...(updates.type && { type: updates.type }),
          ...(updates.scheduledFor && { scheduledFor: new Date(updates.scheduledFor) }),
          ...(updates.content !== undefined && { content: updates.content }),
          ...(updates.metadata && { 
            metadata: {
              ...updates.metadata,
              ...(updates.taskId ? { taskId: updates.taskId } : {}),
              updatedViaUI: true,
              updatedAt: new Date().toISOString()
            }
          }),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(messageSchedules.id, reminderId),
            eq(messageSchedules.userId, userId),
            eq(messageSchedules.status, 'pending') // Only allow updating pending reminders
          )
        )
        .returning();
      
      if (!updatedReminder) {
        return res.status(404).json({ error: 'Reminder not found or cannot be updated' });
      }
      
      const response: ReminderResponse = {
        id: updatedReminder.id,
        title: updatedReminder.title || '',
        type: updatedReminder.type,
        scheduledFor: updatedReminder.scheduledFor.toISOString(),
        status: updatedReminder.status,
        taskId: updates.taskId,
        content: updatedReminder.content || undefined,
        metadata: updatedReminder.metadata as Record<string, any> || undefined,
        createdAt: updatedReminder.createdAt.toISOString(),
        updatedAt: updatedReminder.updatedAt.toISOString()
      };
      
      res.json(response);
      
    } catch (error) {
      console.error('Error updating reminder:', error);
      res.status(500).json({ error: 'Failed to update reminder' });
    }
  });
  
  // Delete reminder
  app.delete("/api/reminders/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const reminderId = parseInt(req.params.id);
      const userId = req.user.id;
      
      if (isNaN(reminderId)) {
        return res.status(400).json({ error: 'Invalid reminder ID' });
      }
      
      const [deletedReminder] = await db
        .delete(messageSchedules)
        .where(
          and(
            eq(messageSchedules.id, reminderId),
            eq(messageSchedules.userId, userId),
            eq(messageSchedules.status, 'pending') // Only allow deleting pending reminders
          )
        )
        .returning();
      
      if (!deletedReminder) {
        return res.status(404).json({ error: 'Reminder not found or cannot be deleted' });
      }
      
      res.json({ success: true, message: 'Reminder deleted successfully' });
      
    } catch (error) {
      console.error('Error deleting reminder:', error);
      res.status(500).json({ error: 'Failed to delete reminder' });
    }
  });
  
  // Snooze reminder (postpone by specified minutes)
  app.post("/api/reminders/:id/snooze", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const reminderId = parseInt(req.params.id);
      const userId = req.user.id;
      
      if (isNaN(reminderId)) {
        return res.status(400).json({ error: 'Invalid reminder ID' });
      }
      
      const validation = snoozeRequestSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid snooze duration',
          details: validation.error.errors
        });
      }
      
      const { minutes } = validation.data;
      
      // Get current reminder
      const [currentReminder] = await db
        .select()
        .from(messageSchedules)
        .where(
          and(
            eq(messageSchedules.id, reminderId),
            eq(messageSchedules.userId, userId),
            eq(messageSchedules.status, 'pending')
          )
        );
      
      if (!currentReminder) {
        return res.status(404).json({ error: 'Reminder not found or cannot be snoozed' });
      }
      
      // Calculate new time
      const newScheduledFor = new Date(currentReminder.scheduledFor.getTime() + minutes * 60000);
      
      // Update the reminder
      const [updatedReminder] = await db
        .update(messageSchedules)
        .set({
          scheduledFor: newScheduledFor,
          metadata: {
            ...(currentReminder.metadata as any || {}),
            snoozed: true,
            snoozeMinutes: minutes,
            originalTime: currentReminder.scheduledFor.toISOString(),
            snoozedAt: new Date().toISOString()
          },
          updatedAt: new Date()
        })
        .where(eq(messageSchedules.id, reminderId))
        .returning();
      
      res.json({
        success: true,
        message: `Reminder snoozed for ${minutes} minutes`,
        newTime: updatedReminder.scheduledFor.toISOString()
      });
      
    } catch (error) {
      console.error('Error snoozing reminder:', error);
      res.status(500).json({ error: 'Failed to snooze reminder' });
    }
  });
  
  // Duplicate reminder
  app.post("/api/reminders/:id/duplicate", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const reminderId = parseInt(req.params.id);
      const userId = req.user.id;
      
      if (isNaN(reminderId)) {
        return res.status(400).json({ error: 'Invalid reminder ID' });
      }
      
      // Get original reminder
      const [originalReminder] = await db
        .select()
        .from(messageSchedules)
        .where(
          and(
            eq(messageSchedules.id, reminderId),
            eq(messageSchedules.userId, userId)
          )
        );
      
      if (!originalReminder) {
        return res.status(404).json({ error: 'Reminder not found' });
      }
      
      // Create duplicate with new time (1 hour later by default)
      const newScheduledFor = new Date(originalReminder.scheduledFor.getTime() + 60 * 60000);
      
      const [newReminder] = await db
        .insert(messageSchedules)
        .values({
          userId,
          type: originalReminder.type,
          title: `${originalReminder.title} (Copy)`,
          content: originalReminder.content,
          scheduledFor: newScheduledFor,
          status: 'pending',
          metadata: {
            ...(originalReminder.metadata as any || {}),
            duplicatedFrom: reminderId,
            duplicatedAt: new Date().toISOString()
          },
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      const response: ReminderResponse = {
        id: newReminder.id,
        title: newReminder.title || '',
        type: newReminder.type,
        scheduledFor: newReminder.scheduledFor.toISOString(),
        status: newReminder.status,
        content: newReminder.content || undefined,
        metadata: newReminder.metadata as Record<string, any> || undefined,
        createdAt: newReminder.createdAt.toISOString(),
        updatedAt: newReminder.updatedAt.toISOString()
      };
      
      res.status(201).json(response);
      
    } catch (error) {
      console.error('Error duplicating reminder:', error);
      res.status(500).json({ error: 'Failed to duplicate reminder' });
    }
  });
}