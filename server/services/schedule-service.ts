/**
 * Schedule Service
 * 
 * This service provides direct management of schedule items and message schedules,
 * allowing the LLM to create, update, and delete schedule items without requiring
 * a daily schedule parent record.
 */

import { db } from "../db";
import { scheduleItems, messageSchedules } from "@shared/schema";
import { and, eq, gte, lt } from "drizzle-orm";

/**
 * Get all schedule items for a specific date for a user
 */
export async function getScheduleItemsForDay(userId: number, date: Date): Promise<typeof scheduleItems.$inferSelect[]> {
  try {
    // Create start and end date for the day (midnight to midnight)
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    
    // Query schedule items for this user on this date
    const items = await db
      .select()
      .from(scheduleItems)
      .where(
        and(
          eq(scheduleItems.userId, userId),
          gte(scheduleItems.date, startDate),
          lt(scheduleItems.date, endDate)
        )
      );
    
    return items;
  } catch (error) {
    console.error("Error in getScheduleItemsForDay:", error);
    throw error;
  }
}

/**
 * Create a new schedule item directly (not linked to a daily schedule)
 */
export async function createScheduleItem(
  data: {
    userId: number;
    title: string;
    description?: string;
    startTime: string;
    endTime?: string;
    taskId?: number;
    subtaskId?: number;
    date?: Date; // Defaults to today if not provided
  }
): Promise<typeof scheduleItems.$inferSelect> {
  // Default to today if no date is provided
  const itemDate = data.date || new Date();
  
  // Create the schedule item
  const [newItem] = await db
    .insert(scheduleItems)
    .values({
      userId: data.userId,
      title: data.title,
      description: data.description || "",
      startTime: data.startTime,
      endTime: data.endTime,
      taskId: data.taskId,
      subtaskId: data.subtaskId,
      date: itemDate,
      status: 'pending'
    })
    .returning();
  
  return newItem;
}

/**
 * Update an existing schedule item
 */
export async function updateScheduleItem(
  id: number,
  data: {
    title?: string;
    description?: string;
    startTime?: string;
    endTime?: string;
    taskId?: number;
    subtaskId?: number;
    status?: string;
  }
): Promise<typeof scheduleItems.$inferSelect | null> {
  // Build the update object with only defined values
  const updateData: Record<string, any> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.taskId !== undefined) updateData.taskId = data.taskId;
  if (data.subtaskId !== undefined) updateData.subtaskId = data.subtaskId;
  if (data.status !== undefined) updateData.status = data.status;
  
  // Update the schedule item
  const [updatedItem] = await db
    .update(scheduleItems)
    .set(updateData)
    .where(eq(scheduleItems.id, id))
    .returning();
  
  return updatedItem || null;
}

/**
 * Delete a schedule item
 */
export async function deleteScheduleItem(id: number): Promise<boolean> {
  const [deletedItem] = await db
    .delete(scheduleItems)
    .where(eq(scheduleItems.id, id))
    .returning();
  
  return !!deletedItem;
}

/**
 * Get all pending message schedules for a user for a specific date
 */
export async function getPendingMessageSchedules(userId: number, date: Date): Promise<typeof messageSchedules.$inferSelect[]> {
  // Create start and end date for the day (midnight to midnight)
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  // Query pending message schedules for this user on this date
  const messages = await db
    .select()
    .from(messageSchedules)
    .where(
      and(
        eq(messageSchedules.userId, userId),
        eq(messageSchedules.status, 'pending'),
        gte(messageSchedules.scheduledFor, startDate),
        lt(messageSchedules.scheduledFor, endDate)
      )
    );
  
  return messages;
}

/**
 * Schedule a follow-up message for a specific time
 */
export async function scheduleMessage(
  data: {
    userId: number;
    type: string;
    tone: string;
    title: string;
    scheduledFor: Date;
    taskId?: number;
    subtaskId?: number;
  }
): Promise<typeof messageSchedules.$inferSelect> {
  // Create the message schedule
  const [newSchedule] = await db
    .insert(messageSchedules)
    .values({
      userId: data.userId,
      type: data.type,
      scheduledFor: data.scheduledFor,
      status: 'pending',
      metadata: {
        tone: data.tone,
        title: data.title,
        taskId: data.taskId,
        subtaskId: data.subtaskId
      }
    })
    .returning();
  
  return newSchedule;
}