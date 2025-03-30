/**
 * Schedule Service
 * 
 * This service provides direct management of schedule items and message schedules,
 * allowing the LLM to create, update, and delete schedule items without requiring
 * a daily schedule parent record.
 */

import { db } from "../db";
import { scheduleItems, messageSchedules } from "@shared/schema";
import { and, eq, gte, lt, isNull } from "drizzle-orm";

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
    
    // Query non-deleted schedule items for this user on this date
    const items = await db
      .select()
      .from(scheduleItems)
      .where(
        and(
          eq(scheduleItems.userId, userId),
          gte(scheduleItems.date, startDate),
          lt(scheduleItems.date, endDate),
          isNull(scheduleItems.deletedAt) // Only include non-deleted items
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
 * Soft delete a schedule item by setting the deletedAt timestamp
 */
export async function deleteScheduleItem(id: number): Promise<boolean> {
  try {
    const [softDeletedItem] = await db
      .update(scheduleItems)
      .set({
        deletedAt: new Date(),
        status: 'cancelled' // Also update the status to reflect the item is cancelled
      })
      .where(eq(scheduleItems.id, id))
      .returning();
    
    return !!softDeletedItem;
  } catch (error) {
    console.error("Error in soft delete schedule item:", error);
    throw error;
  }
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
  
  try {
    console.log(`Getting pending message schedules for user ${userId} on ${date.toISOString().split('T')[0]}`);
    
    // Query pending message schedules for this user on this date
    const messages = await db
      .select()
      .from(messageSchedules)
      .where(
        and(
          eq(messageSchedules.userId, userId),
          eq(messageSchedules.status, 'pending'),
          gte(messageSchedules.scheduledFor, startDate),
          lt(messageSchedules.scheduledFor, endDate),
          isNull(messageSchedules.deletedAt) // Only include non-deleted messages
        )
      );
    
    console.log(`Found ${messages.length} pending message schedules for user ${userId}`);
    
    // Log details of returned messages for debugging
    if (messages.length > 0) {
      messages.forEach(msg => {
        console.log(`Message ID: ${msg.id}, Status: ${msg.status}, DeletedAt: ${msg.deletedAt || 'null'}`);
      });
    }
    
    return messages;
  } catch (error) {
    console.error(`Error in getPendingMessageSchedules for user ${userId}:`, error);
    throw error;
  }
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
  try {
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
  } catch (error) {
    console.error("Error in schedule message:", error);
    throw error;
  }
}

/**
 * Soft delete a message schedule by setting the deletedAt timestamp
 */
export async function deleteMessageSchedule(id: number): Promise<boolean> {
  try {
    console.log(`Soft deleting message schedule with ID: ${id}`);
    
    // First check if the message exists
    const existingMessages = await db
      .select()
      .from(messageSchedules)
      .where(eq(messageSchedules.id, id));
    
    if (!existingMessages || existingMessages.length === 0) {
      console.log(`Message schedule with ID ${id} not found`);
      return false;
    }
    
    const timestamp = new Date();
    console.log(`Setting deletedAt to ${timestamp.toISOString()} for message ID ${id}`);
    
    const [softDeletedMessage] = await db
      .update(messageSchedules)
      .set({
        deletedAt: timestamp,
        status: 'cancelled' // Also update the status to reflect the message is cancelled
      })
      .where(eq(messageSchedules.id, id))
      .returning();
    
    console.log(`Soft delete result: `, softDeletedMessage ? "Success" : "Failed");
    
    if (softDeletedMessage) {
      console.log(`Successfully soft-deleted message: ${JSON.stringify(softDeletedMessage)}`);
    }
    
    return !!softDeletedMessage;
  } catch (error) {
    console.error("Error in soft delete message schedule:", error);
    throw error;
  }
}