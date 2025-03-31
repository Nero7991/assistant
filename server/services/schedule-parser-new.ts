import { Task, Subtask, dailySchedules, scheduleItems, scheduleRevisions } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { eq } from "drizzle-orm";

// Extended Task interface that includes subtasks (loaded from relations)
interface TaskWithSubtasks extends Task {
  subtasks?: Subtask[];
}

// Marker that signals the start of the final schedule in the LLM response
export const SCHEDULE_MARKER = "The final schedule is as follows:";

interface ScheduleItem {
  taskId?: number;       // Link to existing task or null for standalone items
  subtaskId?: number;    // Link to existing subtask or null for standalone items
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
      
      // Remove any leading ": " prefix in the title
      if (title.startsWith(': ')) {
        title = title.substring(2).trim();
      }
      
      // Extract task ID and subtask ID if present
      let taskId: number | undefined = undefined;
      let subtaskId: number | undefined = undefined;
      
      // Check for subtask ID pattern: "Something (Subtask ID: 123)"
      const subtaskIdMatch = title.match(/.*\(Subtask ID:?\s*(\d+)\)/i);
      if (subtaskIdMatch) {
        subtaskId = parseInt(subtaskIdMatch[1], 10);
        // Remove the subtask ID from the title
        title = title.replace(/\s*\(Subtask ID:?\s*\d+\)/i, '').trim();
      }
      
      // Check for task ID pattern: "Something (Task ID: 123)"
      const taskIdMatch = title.match(/.*\(Task ID:?\s*(\d+)\)/i);
      if (taskIdMatch) {
        taskId = parseInt(taskIdMatch[1], 10);
        // Remove the task ID from the title
        title = title.replace(/\s*\(Task ID:?\s*\d+\)/i, '').trim();
      }
      
      if (title && startTime) {
        scheduleItems.push({
          title,
          startTime,
          endTime,
          taskId,
          subtaskId
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
 * Try to match schedule items with existing tasks and subtasks by name similarity or time
 */
function matchScheduleItemsWithTasks(items: ScheduleItem[], tasks: (Task | TaskWithSubtasks)[]): ScheduleItem[] {
  return items.map(item => {
    // First, try to find a matching subtask in any of the tasks
    let foundSubtask = null;
    
    // Iterate through all tasks to check their subtasks
    for (const task of tasks) {
      // Type guard to check if this task has subtasks property
      if ('subtasks' in task && task.subtasks && task.subtasks.length > 0) {
        // Look for a matching subtask
        const matchingSubtask = task.subtasks.find((subtask: Subtask) => {
          // Exact title match is a direct hit
          if (subtask.title.toLowerCase() === item.title.toLowerCase()) {
            return true;
          }
          
          // If item title contains the subtask title, it's a likely match
          if (item.title.toLowerCase().includes(subtask.title.toLowerCase())) {
            return true;
          }
          
          // If subtask has scheduled time matching the item's time, it's another signal
          if (subtask.scheduledTime === item.startTime) {
            return true;
          }
          
          return false;
        });
        
        if (matchingSubtask) {
          foundSubtask = { subtask: matchingSubtask, parentTaskId: task.id };
          break; // Found a match, no need to continue searching
        }
      }
    }
    
    // If we found a matching subtask, return with both taskId and subtaskId
    if (foundSubtask && foundSubtask.subtask.id) {
      return {
        ...item,
        taskId: foundSubtask.parentTaskId,
        subtaskId: foundSubtask.subtask.id
      };
    }
    
    // If no subtask match, try to find a matching task by name similarity
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
 * Requires proper database tables to already exist for schedules
 * Will update task times and then attempt to create schedule entries
 * Will throw an error if schedule tables don't exist
 */
export async function createDailyScheduleFromParsed(
  userId: number, 
  parsedSchedule: ParsedSchedule,
  tasks: (Task | TaskWithSubtasks)[]
): Promise<number> {
  try {
    // Get all subtasks for the user for validation
    const allSubtasks: Subtask[] = await storage.getAllSubtasks(userId);
    
    // Match items with tasks
    const matchedItems = matchScheduleItemsWithTasks(parsedSchedule.scheduleItems, tasks);
    
    // First, let's update the task times since this will always work
    // regardless of whether the schedule tables exist
    for (const item of matchedItems) {
      if (item.taskId) {
        try {
          await storage.updateTask(item.taskId, {
            scheduledTime: item.startTime
          });
          console.log(`Updated task ${item.taskId} with start time ${item.startTime}`);
        } catch (taskUpdateError) {
          console.error(`Error updating task ${item.taskId}:`, taskUpdateError);
        }
      }
    }
    
    // Now try to use the schedule tables if they exist
    try {
      // Try to insert the daily schedule
      const [newSchedule] = await db
        .insert(dailySchedules)
        .values({
          userId: userId,
          date: new Date(),
          status: 'draft',
          originalContent: parsedSchedule.rawScheduleText,
          formattedSchedule: JSON.stringify(matchedItems)
        })
        .returning();
      
      // Before inserting, verify which tasks and subtasks actually exist in the database
      // This prevents foreign key constraint errors
      const existingTaskIds = tasks.map(task => task.id);
      const existingSubtaskIds = allSubtasks.map((subtask: Subtask) => subtask.id);
      
      // Filter out schedule items with invalid task or subtask IDs
      const validItems = matchedItems.map(item => {
        const validItem = { ...item };
        
        // Check if taskId exists in our known tasks
        if (item.taskId && !existingTaskIds.includes(item.taskId)) {
          console.log(`Warning: Task ID ${item.taskId} referenced in schedule does not exist, removing reference`);
          validItem.taskId = undefined;
        }
        
        // Check if subtaskId exists in our known subtasks
        if (item.subtaskId && !existingSubtaskIds.includes(item.subtaskId)) {
          console.log(`Warning: Subtask ID ${item.subtaskId} referenced in schedule does not exist, removing reference`);
          validItem.subtaskId = undefined;
        }
        
        return validItem;
      });
      
      // Log the validation results for debugging
      console.log('Existing task IDs:', existingTaskIds);
      console.log('Existing subtask IDs:', existingSubtaskIds);
      console.log('Original matched items:', JSON.stringify(matchedItems.map(item => ({ 
        title: item.title, 
        taskId: item.taskId, 
        subtaskId: item.subtaskId 
      }))));
      console.log('Valid items after filtering:', JSON.stringify(validItems.map(item => ({ 
        title: item.title, 
        taskId: item.taskId, 
        subtaskId: item.subtaskId 
      }))));
      
      
      // Try to insert each valid schedule item
      for (const item of validItems) {
        try {
          await db
            .insert(scheduleItems)
            .values({
              userId: userId,
              date: new Date(),
              scheduleId: newSchedule.id,
              taskId: item.taskId !== undefined ? item.taskId : null, // Make sure to use null if taskId is undefined
              subtaskId: item.subtaskId !== undefined ? item.subtaskId : null, // Include the subtask ID if available
              title: item.title,
              description: item.description || null,
              startTime: item.startTime,
              endTime: item.endTime || null,
              status: 'scheduled'
            });
          console.log(`Successfully inserted schedule item: ${item.title} at ${item.startTime}`);
        } catch (insertError) {
          console.error(`Failed to insert schedule item ${item.title}:`, insertError);
          // Continue with other items even if one fails
        }
      }
      
      // Try to create initial revision
      await db
        .insert(scheduleRevisions)
        .values({
          scheduleId: newSchedule.id,
          revisionType: 'initial',
          changes: JSON.stringify({
            scheduleItems: matchedItems
          })
        });
      
      console.log(`Successfully created schedule with ID ${newSchedule.id}`);
      return newSchedule.id;
    } catch (error) {
      // Check if the error is due to missing tables
      if (error instanceof Error && 
          error.message && 
          error.message.includes('relation') && 
          error.message.includes('does not exist')) {
        
        console.error("ERROR: Schedule tables don't exist - cannot create schedule without proper database tables");
        // Throw an error to ensure we don't proceed without proper database tables
        throw new Error("Schedule tables don't exist. Daily schedules require proper database tables for notifications.");
      } else {
        // For any other error, rethrow to ensure we don't proceed with invalid data
        console.error("Error creating schedule tables:", error);
        throw error;
      }
    }
  } catch (error) {
    console.error("ERROR: Error processing schedule:", error);
    // Always throw errors to ensure proper error handling and database dependency
    throw new Error("Error processing schedule: " + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Confirm a schedule, which will schedule notifications for each item
 * Requires proper database tables to be already created
 * Will throw an error if tables don't exist or if using invalid schedule ID
 */
export async function confirmSchedule(scheduleId: number, userId: number): Promise<boolean> {
  try {
    // If we got a placeholder scheduleId (-1), it's invalid - all schedules must have proper IDs
    if (scheduleId === -1) {
      console.error("ERROR: Cannot confirm schedule with ID -1. Invalid schedule ID.");
      throw new Error("Invalid schedule ID. Schedule confirmation requires a valid schedule ID.");
    }

    // Try to update the schedule status and schedule notifications
    try {
      // Update the schedule status
      await db
        .update(dailySchedules)
        .set({
          status: 'confirmed',
          confirmedAt: new Date()
        })
        .where(eq(dailySchedules.id, scheduleId));
      
      console.log(`Marked schedule ${scheduleId} as confirmed`);
      return true;
    } catch (error) {
      // Check if the error is due to missing tables
      if (error instanceof Error && 
          error.message && 
          error.message.includes('relation') && 
          error.message.includes('does not exist')) {
        
        console.error("ERROR: Schedule tables don't exist - cannot confirm schedule without proper database tables");
        throw new Error("Schedule tables don't exist. Daily schedule confirmation requires proper database tables for notifications.");
      }
      
      // For any other error, rethrow
      console.error("Error confirming schedule:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error in confirmSchedule:", error);
    throw error;
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