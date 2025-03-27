import { Task, Subtask, dailySchedules, scheduleItems, scheduleRevisions } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { eq } from "drizzle-orm";

// Marker that signals the start of the final schedule in the LLM response
export const SCHEDULE_MARKER = "The final schedule is as follows:";

interface ScheduleItem {
  taskId?: number;       // Link to existing task or null for standalone items
  title: string;         // Title of the schedule item
  description?: string;  // Optional description
  startTime: string;     // Format: "HH:MM" in 24-hour format
  endTime?: string;      // Format: "HH:MM" in 24-hour format (optional)
}

interface ParsedSchedule {
  scheduleItems: ScheduleItem[];
  rawScheduleText: string;
}

/**
 * Parse a schedule from an LLM response that contains the schedule marker
 * 
 * @param llmResponse The full LLM response that may contain a schedule
 * @returns ParsedSchedule if a schedule was found, null otherwise
 */
export function parseScheduleFromLLMResponse(llmResponse: string): ParsedSchedule | null {
  // Check if response contains the schedule marker (case insensitive)
  const lowerCaseResponse = llmResponse.toLowerCase();
  const lowerCaseMarker = SCHEDULE_MARKER.toLowerCase();
  const markerIndex = lowerCaseResponse.indexOf(lowerCaseMarker);
  if (markerIndex === -1) {
    return null;
  }
  
  // Get the actual position in the original text
  const actualMarkerIndex = llmResponse.indexOf(llmResponse.substring(markerIndex, markerIndex + SCHEDULE_MARKER.length));
  
  // Extract the schedule part starting from the marker
  const scheduleText = llmResponse.substring(actualMarkerIndex + SCHEDULE_MARKER.length).trim();
  
  // Parse the schedule items
  const scheduleItems: ScheduleItem[] = [];
  const lines = scheduleText.split('\n');
  
  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;
    
    // Try to extract time and title from each line
    const timeMatch = line.match(/(\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?)(?:\s*-\s*(\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?))?/);
    
    if (timeMatch) {
      const startTimeStr = timeMatch[1];
      const endTimeStr = timeMatch[2]; // May be undefined
      
      // Convert to 24-hour format
      const startTime = convertToStandardTimeFormat(startTimeStr);
      const endTime = endTimeStr ? convertToStandardTimeFormat(endTimeStr) : undefined;
      
      // Get the title by removing the time part
      let title = line.replace(timeMatch[0], '').trim();
      
      // Remove any bullet points or other common markers
      title = title.replace(/^[•\-–—*]\s*/, '');
      
      if (title && startTime) {
        scheduleItems.push({
          title,
          startTime,
          endTime
        });
      }
    }
  }
  
  return {
    scheduleItems,
    rawScheduleText: scheduleText
  };
}

/**
 * Convert 12-hour or ambiguous time format to standard 24-hour format (HH:MM)
 */
function convertToStandardTimeFormat(timeStr: string): string {
  // Handle 12-hour format with AM/PM
  const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1]);
    const minutes = ampmMatch[2];
    const period = ampmMatch[3].toLowerCase();
    
    // Convert to 24-hour format
    if (period === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period === 'am' && hours === 12) {
      hours = 0;
    }
    
    // Format with leading zeros
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  
  // Already in 24-hour format or missing AM/PM (assume as is)
  const hourMinuteMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (hourMinuteMatch) {
    const hours = parseInt(hourMinuteMatch[1]);
    const minutes = hourMinuteMatch[2];
    
    // Format with leading zeros
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  
  // If we can't parse it, return as is
  return timeStr;
}

/**
 * Try to match schedule items with existing tasks by name similarity or time
 */
function matchScheduleItemsWithTasks(items: ScheduleItem[], tasks: Task[]): ScheduleItem[] {
  return items.map(item => {
    // Try to find a matching task by name similarity
    const matchingTask = tasks.find(task => {
      // Exact title match is a direct hit
      if (task.title.toLowerCase() === item.title.toLowerCase()) {
        return true;
      }
      
      // If item title contains the task title, it's a likely match
      if (item.title.toLowerCase().includes(task.title.toLowerCase())) {
        return true;
      }
      
      // If task has scheduled time matching the item's time, it's another signal
      if (task.scheduledTime === item.startTime) {
        return true;
      }
      
      return false;
    });
    
    if (matchingTask && matchingTask.id) {
      return {
        ...item,
        taskId: matchingTask.id
      };
    }
    
    return item;
  });
}

/**
 * Create a new daily schedule and associated items from a parsed schedule
 */
export async function createDailyScheduleFromParsed(
  userId: number, 
  parsedSchedule: ParsedSchedule,
  tasks: Task[]
): Promise<number> {
  try {
    // Match items with tasks
    const matchedItems = matchScheduleItemsWithTasks(parsedSchedule.scheduleItems, tasks);
    
    // Insert the daily schedule
    const [newSchedule] = await db
      .insert(dailySchedules)
      .values({
        userId,
        date: new Date(),
        status: 'draft',
        originalContent: parsedSchedule.rawScheduleText,
        formattedSchedule: JSON.stringify(matchedItems)
      })
      .returning();
    
    // Insert each schedule item
    for (const item of matchedItems) {
      await db
        .insert(scheduleItems)
        .values({
          scheduleId: newSchedule.id,
          taskId: item.taskId,
          title: item.title,
          description: item.description || null,
          startTime: item.startTime,
          endTime: item.endTime || null
        });
    }
    
    // Create initial revision
    await db
      .insert(scheduleRevisions)
      .values({
        scheduleId: newSchedule.id,
        revisionType: 'initial',
        changes: JSON.stringify({
          scheduleItems: matchedItems
        })
      });
    
    return newSchedule.id;
  } catch (error) {
    console.error("Error creating daily schedule:", error);
    throw error;
  }
}

/**
 * Confirm a schedule, which will schedule notifications for each item
 */
export async function confirmSchedule(scheduleId: number, userId: number): Promise<boolean> {
  try {
    // Update the schedule status
    await db
      .update(dailySchedules)
      .set({
        status: 'confirmed',
        confirmedAt: new Date()
      })
      .where(eq(dailySchedules.id, scheduleId));
    
    // Get all items in this schedule
    const items = await db
      .select()
      .from(scheduleItems)
      .where(eq(scheduleItems.scheduleId, scheduleId));
    
    // Schedule notifications for each item that has a task association
    for (const item of items) {
      if (item.taskId) {
        const scheduledTime = parseTimeToDate(item.startTime);
        
        if (scheduledTime && scheduledTime > new Date()) {
          await storage.scheduleItemNotification(item.id, scheduledTime);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error confirming schedule:", error);
    return false;
  }
}

/**
 * Convert a time string (HH:MM) to a Date object for today at that time
 */
function parseTimeToDate(timeStr: string): Date | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  
  return date;
}