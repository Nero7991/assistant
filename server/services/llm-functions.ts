import { db } from '../db';
import { and, eq, isNull, gte, lt, SQL, sql } from 'drizzle-orm';
import { 
  tasks, 
  subtasks, 
  messageSchedules, 
  knownUserFacts, 
  goals,
  scheduleItems,
  users,
  dailySchedules,
  taskEvents
} from '@shared/schema';
import { format } from 'date-fns';
import { storage } from '../storage'; // Import storage

// Define simplified types for use in this file
type Task = {
  id?: number;
  userId: number;
  title: string;
  description?: string | null;
  taskType: string;
  status: string;
  priority?: number | null;
  estimatedDuration?: string | null;
  deadline?: Date | null;
  scheduledTime?: string | null;
  recurrencePattern?: string | null;
  completedAt?: Date | null;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

type Subtask = {
  id?: number;
  parentTaskId: number;
  title: string;
  description?: string | null;
  status: string;
  estimatedDuration?: string | null;
  deadline?: Date | null;
  scheduledTime?: string | null;
  recurrencePattern?: string | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

/**
 * LLM Functions
 * 
 * This module provides a set of functions that can be called by the LLM to access
 * database information and perform operations. These functions are designed to be
 * called from within the LLM's response generation process.
 */

interface LLMFunctionContext {
  userId: number;
  date?: Date; // If provided, use this date instead of today
}

// Function definitions that will be provided to the LLM
export const llmFunctionDefinitions = [
  {
    name: 'get_todays_notifications',
    description: 'Get all notifications/follow-ups scheduled for today',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_task_list',
    description: 'Get all tasks for the user, optionally filtered by status',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'completed', 'all'],
          description: 'Filter tasks by status'
        }
      },
      required: []
    }
  },
  {
    name: 'get_user_facts',
    description: 'Get known facts about the user',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional category to filter facts'
        }
      },
      required: []
    }
  },
  {
    name: 'get_todays_schedule',
    description: 'Get the schedule for today',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'create_task',
    description: 'Creates a new task for the user. IMPORTANT: Before calling this, you MUST first call \'get_task_list\' to check for existing tasks with similar titles. Only proceed if no duplicates are found or the user confirms they want a duplicate.',
    parameters: {
      type: 'object',
      properties: {
        title: { 
          type: 'string', 
          description: 'The title of the task.' 
        },
        taskType: { 
          type: 'string', 
          description: "The category/type of the task (e.g., daily task, project, goal). Recurrence is handled separately.",
          enum: ['daily', 'personal_project', 'long_term_project', 'life_goal'] // Use schema enum
        },
        description: { 
          type: 'string', 
          description: 'Optional description for the task.' 
        },
        scheduledTime: { 
          type: 'string', 
          description: "Optional scheduled time (e.g., '14:30', 'evening'). Relevant mainly for 'daily' tasks."
        },
        recurrencePattern: { 
          type: 'string', 
          description: "Optional recurrence pattern (e.g., 'daily', 'weekly:1,3,5' for MWF, 'monthly:15', 'none')."
        },
        // Add other relevant properties if needed, e.g., estimatedDuration, deadline
        estimatedDuration: { 
          type: 'string',
          description: "Optional estimated duration (e.g., '30m', '2h' for daily; '3d', '2w' for projects; '6M' for long-term; '1y' for goals)."
        },
        deadline: {
          type: 'string',
          format: 'date',
          description: "Optional deadline (YYYY-MM-DD)."
        }
      },
      required: ['title', 'taskType'], // Title and type category are essential
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task using its ID. Use get_task_list first to find the ID.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { 
          type: 'integer', 
          description: 'The unique ID of the task to update.' 
        },
        updates: { 
          type: 'object',
          description: 'An object containing the fields to update (e.g., title, description, status, dueDate, scheduledTime).'
          // Define specific properties within 'updates' if needed, mirroring task schema
        }
      },
      required: ['taskId', 'updates']
    }
  },
  {
    name: 'delete_task',
    description: 'Delete a task using its ID. Use get_task_list first to find the ID.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { 
          type: 'integer', 
          description: 'The unique ID of the task to delete.' 
        }
      },
      required: ['taskId']
    }
  },
  {
    name: 'create_subtask',
    description: 'Create a new subtask for a parent task. Use get_task_list first to find the parent task ID.',
    parameters: {
      type: 'object',
      properties: {
        parentTaskId: { 
          type: 'integer', 
          description: 'The ID of the parent task.' 
        },
        title: { 
          type: 'string', 
          description: 'The title of the subtask.' 
        },
        description: { 
          type: 'string', 
          description: 'Optional description for the subtask.' 
        }
        // Add other relevant subtask fields if needed
      },
      required: ['parentTaskId', 'title']
    }
  },
  {
    name: 'update_subtask',
    description: 'Update an existing subtask using its ID.',
    parameters: {
      type: 'object',
      properties: {
        subtaskId: { 
          type: 'integer', 
          description: 'The unique ID of the subtask to update.' 
        },
        updates: { 
          type: 'object',
          description: 'An object containing the fields to update (e.g., title, description, status).'
        }
      },
      required: ['subtaskId', 'updates']
    }
  },
  {
    name: 'delete_subtask',
    description: 'Delete a subtask using its ID.',
    parameters: {
      type: 'object',
      properties: {
        subtaskId: { 
          type: 'integer', 
          description: 'The unique ID of the subtask to delete.' 
        },
        parentTaskId: { // Needed for storage.deleteSubtask which requires both
          type: 'integer',
          description: 'The ID of the parent task.'
        }
      },
      required: ['subtaskId', 'parentTaskId']
    }
  },
  {
    name: 'mark_task_skipped_today',
    description: 'Marks a specific task as skipped for the current day. Call this if the user explicitly indicates they did not or will not complete a task today in response to a follow-up.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { 
          type: 'integer',
          description: 'The unique ID of the task to mark as skipped for today.'
        }
      },
      required: ['taskId']
    }
  },
  {
    name: 'create_schedule_item',
    description: 'Add an item to a specific daily schedule. Find schedule ID using get_todays_schedule if needed.',
    parameters: {
      type: 'object',
      properties: {
        scheduleId: { 
          type: 'integer', 
          description: 'The ID of the daily schedule to add this item to.' 
        },
        title: { 
          type: 'string', 
          description: 'The title of the schedule item.' 
        },
        startTime: { 
          type: 'string', 
          format: 'time', // HH:MM (24-hour)
          description: 'The start time for the item (HH:MM 24-hour format).' 
        },
        endTime: { 
          type: 'string', 
          format: 'time', // HH:MM (24-hour)
          description: 'Optional end time for the item (HH:MM 24-hour format).' 
        },
        description: { 
          type: 'string', 
          description: 'Optional description.' 
        },
        taskId: { 
          type: 'integer', 
          description: 'Optional ID of a task to link this schedule item to.' 
        }
      },
      required: ['scheduleId', 'title', 'startTime']
    }
  },
  {
    name: 'update_schedule_item',
    description: 'Update an existing schedule item using its ID.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { 
          type: 'integer', 
          description: 'The unique ID of the schedule item to update.' 
        },
        updates: { 
          type: 'object',
          description: 'An object containing the fields to update (e.g., title, startTime, endTime, status).'
        }
      },
      required: ['itemId', 'updates']
    }
  },
  {
    name: 'delete_schedule_item',
    description: 'Delete a schedule item using its ID.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { 
          type: 'integer', 
          description: 'The unique ID of the schedule item to delete.' 
        }
      },
      required: ['itemId']
    }
  },
  {
    name: 'schedule_message',
    description: 'Schedule a message (like a reminder or follow-up) to be sent at a specific time.',
    parameters: {
      type: 'object',
      properties: {
        content: { 
          type: 'string', 
          description: 'The content of the message to be sent.' 
        },
        scheduledFor: { 
          type: 'string', 
          format: 'date-time', 
          description: 'The exact date and time (ISO 8601 format or similar parsable string) when the message should be sent.' 
        },
        type: { 
          type: 'string', 
          enum: ['reminder', 'follow_up', 'check_in', 'other'], 
          description: 'The type of message being scheduled.' 
        },
        title: { 
          type: 'string', 
          description: 'Optional title for the scheduled message (e.g., \'Reminder: Call Mom\').' 
        },
        context: { 
          type: 'object', 
          description: 'Optional JSON object for additional context (e.g., related taskId).' 
        }
      },
      required: ['content', 'scheduledFor', 'type']
    }
  },
  {
    name: 'delete_scheduled_message',
    description: 'Delete a scheduled message/notification using its ID.',
    parameters: {
      type: 'object',
      properties: {
        messageScheduleId: { type: 'integer', description: 'The ID of the scheduled message to delete.' }
      },
      required: ['messageScheduleId']
    }
  }
];

// Implementation of LLM functions
export class LLMFunctions {
  /**
   * Get notifications scheduled for today
   */
  async getTodaysNotifications(context: LLMFunctionContext) {
    try {
      const now = context.date || new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Build conditions for the query
      const conditions = [
        sql`${messageSchedules.userId} = ${context.userId}`,
        sql`${messageSchedules.status} = ${'pending'}`,
        sql`${messageSchedules.deletedAt} IS NULL`,
        sql`${messageSchedules.scheduledFor} >= ${today}::timestamp`,
        sql`${messageSchedules.scheduledFor} < ${tomorrow}::timestamp`
      ];
      
      // Combine conditions with AND
      const whereClause = sql.join(conditions, sql` AND `);

      const pendingSchedules = await db
        .select()
        .from(messageSchedules)
        .where(whereClause)
        .orderBy(messageSchedules.scheduledFor);

      // Format the results to be more readable
      return pendingSchedules.map(notification => {
        const scheduledTime = format(new Date(notification.scheduledFor), 'h:mm a');
        
        return {
          id: notification.id,
          type: notification.type,
          title: notification.title || (notification.type === 'morning_message' ? 'Daily Morning Schedule' : 'Follow-up Check-in'),
          scheduledTime,
          taskId: notification.metadata && typeof notification.metadata === 'object' ? (notification.metadata as any).taskId || null : null
        };
      });
    } catch (error) {
      console.error('Error getting today\'s notifications:', error);
      return { error: 'Failed to retrieve notifications' };
    }
  }

  /**
   * Get user's tasks
   */
  async getTaskList(context: LLMFunctionContext, params: { status?: 'active' | 'completed' | 'all' }) {
    try {
      const status = params.status || 'active';
      
      // Build conditions for the task query
      let conditions = [
        sql`${tasks.userId} = ${context.userId}`,
        sql`${tasks.deletedAt} IS NULL`
      ];
      
      // Add status condition
      if (status === 'active') {
        conditions.push(sql`${tasks.completedAt} IS NULL`);
      } else if (status === 'completed') {
        conditions.push(sql`${tasks.completedAt} IS NOT NULL`);
      }
      // For 'all' status, no additional condition needed
      
      // Combine conditions with AND
      const whereClause = sql.join(conditions, sql` AND `);
      
      // Get all tasks with the appropriate filters
      const taskList = await db
        .select()
        .from(tasks)
        .where(whereClause);
      
      // For each task, get its subtasks
      const result = await Promise.all(taskList.map(async (task: Task) => {
        // Skip tasks with no ID
        if (!task.id) {
          return {
            ...task,
            subtasks: []
          };
        }
        
        // Construct subtasks query
        const subtasksConditions = [
          sql`${subtasks.parentTaskId} = ${task.id}`,
          sql`${subtasks.deletedAt} IS NULL`
        ];
        
        const subtasksWhereClause = sql.join(subtasksConditions, sql` AND `);
        
        // Get the subtasks for this task
        const subtaskList = await db
          .select()
          .from(subtasks)
          .where(subtasksWhereClause);
          
        return {
          ...task,
          subtasks: subtaskList.map((st: Subtask) => ({
            id: st.id,
            title: st.title,
            status: st.completedAt ? 'completed' : 'active',
            deadline: st.deadline ? format(new Date(st.deadline), 'yyyy-MM-dd') : null
          }))
        };
      }));
      
      return result;
    } catch (error) {
      console.error('Error getting task list:', error);
      return { error: 'Failed to retrieve tasks' };
    }
  }

  /**
   * Get known facts about the user
   */
  async getUserFacts(context: LLMFunctionContext, params: { category?: string }) {
    try {
      // Build the condition for the where clause
      let conditions = [
        sql`${knownUserFacts.userId} = ${context.userId}`
      ];
      
      // Apply category filter if provided
      if (params.category) {
        conditions.push(sql`${knownUserFacts.category} = ${params.category}`);
      }
      
      // Combine conditions with AND
      const whereClause = sql.join(conditions, sql` AND `);
      
      // Execute the query
      const facts = await db
        .select()
        .from(knownUserFacts)
        .where(whereClause);
      
      return facts;
    } catch (error) {
      console.error('Error getting user facts:', error);
      return { error: 'Failed to retrieve user facts' };
    }
  }

  /**
   * Get today's schedule
   */
  async getTodaysSchedule(context: LLMFunctionContext) {
    try {
      // Ensure we're working with a proper Date object
      let now: Date;
      if (context.date && context.date instanceof Date) {
        now = context.date;
      } else {
        now = new Date();
      }
      
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Format date as string in a way that PostgreSQL can handle
      const todayStr = format(today, 'yyyy-MM-dd');
      
      // Get the daily schedule for today
      const [dailySchedule] = await db
        .select()
        .from(dailySchedules)
        .where(
          and(
            eq(dailySchedules.userId, context.userId),
            sql`date_trunc('day', ${dailySchedules.date}::timestamp) = date_trunc('day', ${format(today, 'yyyy-MM-dd')}::timestamp)`
          )
        )
        .limit(1);

      if (!dailySchedule) {
        // If no daily schedule exists, check for individual schedule items
        const scheduleItemsResult = await db
          .select({
            id: scheduleItems.id,
            title: scheduleItems.title,
            description: scheduleItems.description,
            startTime: scheduleItems.startTime,
            endTime: scheduleItems.endTime,
            status: scheduleItems.status,
            taskId: scheduleItems.taskId
          })
          .from(scheduleItems)
          .where(
            and(
              eq(scheduleItems.userId, context.userId),
              sql`${scheduleItems.deletedAt} IS NULL`,
              sql`date_trunc('day', ${scheduleItems.date}::timestamp) = date_trunc('day', ${format(today, 'yyyy-MM-dd')}::timestamp)`
            )
          )
          .orderBy(scheduleItems.startTime);

        if (!scheduleItemsResult.length) {
          return { 
            hasSchedule: false, 
            message: "No schedule has been created for today yet."
          };
        }

        // Get related task information for schedule items
        const taskIds = scheduleItemsResult
          .map(item => item.taskId)
          .filter((id): id is number => id !== null);

        // Use a different query approach to get related tasks
        let relatedTasks: any[] = [];
        if (taskIds.length > 0) {
          // For each task ID, perform an individual query
          for (const taskId of taskIds) {
            const [task] = await db
              .select()
              .from(tasks)
              .where(
                and(
                  eq(tasks.id, taskId),
                  eq(tasks.userId, context.userId),
                  sql`${tasks.deletedAt} IS NULL`
                )
              );
            
            if (task) {
              relatedTasks.push(task);
            }
          }
        }

        const tasksById = relatedTasks.reduce((acc: Record<number, any>, task: any) => {
          if (task && task.id !== undefined) {
            acc[task.id] = task;
          }
          return acc;
        }, {} as Record<number, typeof relatedTasks[0]>);

        // Format the schedule items with task info
        const formattedItems = scheduleItemsResult.map(item => {
          const task = item.taskId && tasksById[item.taskId] ? tasksById[item.taskId] : null;
          return {
            id: item.id,
            title: item.title,
            description: item.description,
            time: item.startTime ? format(new Date(item.startTime), 'h:mm a') : null,
            endTime: item.endTime ? format(new Date(item.endTime), 'h:mm a') : null,
            status: item.status,
            taskInfo: task ? {
              id: task.id,
              title: task.title,
              taskType: task.taskType
            } : null
          };
        });

        return {
          hasSchedule: true,
          isConfirmed: true, // Individual schedule items are treated as confirmed
          items: formattedItems
        };
      }

      // If we have a daily schedule, get the schedule items for it
      const scheduleItemsResult = await db
        .select()
        .from(scheduleItems)
        .where(
          and(
            eq(scheduleItems.scheduleId, dailySchedule.id),
            sql`${scheduleItems.deletedAt} IS NULL`
          )
        )
        .orderBy(scheduleItems.startTime);

      // Format the results
      const formattedItems = await Promise.all(scheduleItemsResult.map(async item => {
        let taskInfo = null;
        
        if (item.taskId) {
          const [task] = await db
            .select()
            .from(tasks)
            .where(sql`${tasks.id} = ${item.taskId}`);
            
          if (task) {
            taskInfo = {
              id: task.id,
              title: task.title,
              taskType: task.taskType
            };
          }
        }
        
        return {
          id: item.id,
          title: item.title,
          description: item.description,
          time: item.startTime ? format(new Date(item.startTime), 'h:mm a') : null,
          endTime: item.endTime ? format(new Date(item.endTime), 'h:mm a') : null,
          status: item.status,
          taskInfo
        };
      }));

      return {
        hasSchedule: true,
        isConfirmed: !!dailySchedule.confirmedAt,
        scheduleId: dailySchedule.id,
        items: formattedItems
      };
    } catch (error) {
      console.error('Error getting today\'s schedule:', error);
      return { error: 'Failed to retrieve schedule' };
    }
  }

  /**
   * Create a new task
   */
  async create_task(context: LLMFunctionContext, params: any) {
    console.log("[LLM Function] create_task called with params:", params);
    try {
      // Validate required parameters (title, taskType)
      if (!params.title || !params.taskType) {
        return { error: "Missing required fields: title and taskType are required." };
      }
      
      const taskData = {
        userId: context.userId,
        title: params.title,
        description: params.description || null,
        taskType: params.taskType,
        // Convert dueDate string to Date object if present
        deadline: params.deadline ? new Date(params.deadline) : null, 
        scheduledTime: params.scheduledTime || null,
        // TODO: Handle other potential params like priority, recurrence, etc.
        status: 'active', // Default status
      };

      const newTask = await storage.createTask(taskData as any); // Use 'as any' carefully or refine type
      console.log("[LLM Function] Task created:", newTask);
      return { success: true, taskId: newTask.id, title: newTask.title };
    } catch (error) {
      console.error('[LLM Function] Error creating task:', error);
      return { error: `Failed to create task: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Update an existing task
   */
  async update_task(context: LLMFunctionContext, params: any) {
    console.log("[LLM Function] update_task called with raw params:", params);
    const { userId } = context;
    const { taskId, ...otherParams } = params;

    // Basic validation
    if (typeof taskId !== 'number') {
      console.error("[LLM Function] update_task error: Invalid or missing taskId.");
      return { error: 'Invalid or missing taskId.' };
    }

    // Construct the updates object from otherParams
    const updates: Partial<Task> = { ...otherParams };

    // Ensure updates object is not empty
    if (Object.keys(updates).length === 0) {
      console.error("[LLM Function] update_task error: No update fields provided.");
      return { error: 'No update fields provided besides taskId.' };
    }

    console.log(`[LLM Function] Attempting updateTask for taskId ${taskId} with updates:`, updates);

    try {
      // Call storage.updateTask with taskId and the constructed updates object
      const updatedTask = await storage.updateTask(taskId, updates);
      if (!updatedTask) {
        return { error: `Task with ID ${taskId} not found or update failed.` };
      }
      return { success: true, updatedTask };
    } catch (error: any) {
      console.error(`[LLM Function] Error in storage.updateTask for taskId ${taskId}:`, error);
      return { error: `Failed to update task ${taskId}: ${error.message}` };
    }
  }

  /**
   * Delete a task
   */
  async delete_task(context: LLMFunctionContext, params: { taskId: number }) {
    console.log("[LLM Function] delete_task called with params:", params);
    try {
      if (!params.taskId) {
        return { error: "Missing required field: taskId is required." };
      }

      // Ensure userId from context matches task being deleted (optional security check)
      const task = await storage.getTask(params.taskId); // Assuming getTask exists in storage
      if (!task || task.userId !== context.userId) {
        return { error: "Task not found or permission denied." };
      }

      await storage.deleteTask(params.taskId);
      console.log("[LLM Function] Task deleted:", params.taskId);
      return { success: true, taskId: params.taskId };
    } catch (error) {
      console.error('[LLM Function] Error deleting task:', error);
      return { error: `Failed to delete task: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Create a new subtask
   */
  async create_subtask(context: LLMFunctionContext, params: { parentTaskId: number; title: string; description?: string }) {
    console.log("[LLM Function] create_subtask called with params:", params);
    try {
      if (!params.parentTaskId || !params.title) {
        return { error: "Missing required fields: parentTaskId and title are required." };
      }
      // Verify parent task belongs to user
      const parentTask = await storage.getTask(params.parentTaskId);
      if (!parentTask || parentTask.userId !== context.userId) {
        return { error: "Parent task not found or permission denied." };
      }
      
      const subtaskData = { 
        title: params.title, 
        description: params.description || null,
        status: 'active' // Default status 
      };
      const newSubtask = await storage.createSubtask(params.parentTaskId, subtaskData as any);
      console.log("[LLM Function] Subtask created:", newSubtask);
      return { success: true, subtaskId: newSubtask.id, title: newSubtask.title };
    } catch (error) {
      console.error('[LLM Function] Error creating subtask:', error);
      return { error: `Failed to create subtask: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Update an existing subtask
   */
  async update_subtask(context: LLMFunctionContext, params: { subtaskId: number; updates: Partial<Subtask> }) {
    console.log("[LLM Function] update_subtask called with params:", params);
    try {
      if (!params.subtaskId || !params.updates || Object.keys(params.updates).length === 0) {
        return { error: "Missing required fields: subtaskId and a non-empty updates object are required." };
      }
      // Optional: Verify subtask belongs to user via parent task ID
      // const subtask = await storage.getSubtask(params.subtaskId); // Assumes getSubtask exists
      // const parentTask = subtask ? await storage.getTask(subtask.parentTaskId) : null;
      // if (!parentTask || parentTask.userId !== context.userId) return { error: "Permission denied." };

      const updatedSubtask = await storage.updateSubtask(params.subtaskId, params.updates);
      console.log("[LLM Function] Subtask updated:", updatedSubtask);
      return { success: true, subtaskId: updatedSubtask.id };
    } catch (error) {
      console.error('[LLM Function] Error updating subtask:', error);
      return { error: `Failed to update subtask: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Delete a subtask
   */
  async delete_subtask(context: LLMFunctionContext, params: { subtaskId: number; parentTaskId: number }) {
    console.log("[LLM Function] delete_subtask called with params:", params);
    try {
      if (!params.subtaskId || !params.parentTaskId) {
        return { error: "Missing required fields: subtaskId and parentTaskId are required." };
      }
      // Verify parent task belongs to user
      const parentTask = await storage.getTask(params.parentTaskId);
      if (!parentTask || parentTask.userId !== context.userId) {
        return { error: "Parent task not found or permission denied." };
      }

      await storage.deleteSubtask(params.parentTaskId, params.subtaskId);
      console.log("[LLM Function] Subtask deleted:", params.subtaskId);
      return { success: true, subtaskId: params.subtaskId };
    } catch (error) {
      console.error('[LLM Function] Error deleting subtask:', error);
      return { error: `Failed to delete subtask: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  
  /**
   * Create a schedule item
   */
  async create_schedule_item(context: LLMFunctionContext, params: any) {
    console.log("[LLM Function] create_schedule_item called with params:", params);
    try {
      if (!params.scheduleId || !params.title || !params.startTime) {
        return { error: "Missing required fields: scheduleId, title, and startTime are required." };
      }
      // Optional: Verify scheduleId belongs to user
      // const schedule = await storage.getDailySchedule(params.scheduleId);
      // if (!schedule || schedule.userId !== context.userId) return { error: "Permission denied." };
      
      const itemData = {
        scheduleId: params.scheduleId,
        title: params.title,
        startTime: params.startTime,
        endTime: params.endTime || null,
        description: params.description || null,
        taskId: params.taskId || null,
        status: 'scheduled' // Default status
      };
      const newItem = await storage.createScheduleItem(itemData as any);
      console.log("[LLM Function] Schedule item created:", newItem);
      return { success: true, itemId: newItem.id, title: newItem.title };
    } catch (error) {
      console.error('[LLM Function] Error creating schedule item:', error);
      return { error: `Failed to create schedule item: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Update a schedule item
   */
  async update_schedule_item(context: LLMFunctionContext, params: { itemId: number; updates: Partial<ScheduleItem> }) {
    console.log("[LLM Function] update_schedule_item called with params:", params);
    try {
      if (!params.itemId || !params.updates || Object.keys(params.updates).length === 0) {
        return { error: "Missing required fields: itemId and a non-empty updates object are required." };
      }
      // Optional: Verify item belongs to user via schedule ID
      // const item = await storage.getScheduleItem(params.itemId); // Assumes getScheduleItem exists
      // const schedule = item ? await storage.getDailySchedule(item.scheduleId) : null;
      // if (!schedule || schedule.userId !== context.userId) return { error: "Permission denied." };

      const updatedItem = await storage.updateScheduleItem(params.itemId, params.updates);
      console.log("[LLM Function] Schedule item updated:", updatedItem);
      return { success: true, itemId: updatedItem.id };
    } catch (error) {
      console.error('[LLM Function] Error updating schedule item:', error);
      return { error: `Failed to update schedule item: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Delete a schedule item
   */
  async delete_schedule_item(context: LLMFunctionContext, params: { itemId: number }) {
    console.log("[LLM Function] delete_schedule_item called with params:", params);
    try {
      if (!params.itemId) {
        return { error: "Missing required field: itemId is required." };
      }
      // Optional: Verify item belongs to user

      await storage.deleteScheduleItem(params.itemId);
      console.log("[LLM Function] Schedule item deleted:", params.itemId);
      return { success: true, itemId: params.itemId };
    } catch (error) {
      console.error('[LLM Function] Error deleting schedule item:', error);
      return { error: `Failed to delete schedule item: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Schedule a message
   */
  async schedule_message(context: LLMFunctionContext, params: { content: string; scheduledFor: string; type: string; title?: string; context?: object }) {
    console.log("[LLM Function] schedule_message called with params:", params);
    try {
      if (!params.content || !params.scheduledFor || !params.type) {
        return { error: "Missing required fields: content, scheduledFor, and type are required." };
      }
      
      // Parse scheduledFor date/time string
      const scheduledTime = new Date(params.scheduledFor); // Attempt direct parsing
      if (isNaN(scheduledTime.getTime())) {
          return { error: "Invalid format for scheduledFor. Please use a standard date-time format (e.g., ISO 8601)." };
      }

      // Use db directly as storage interface doesn't have a direct scheduleMessage function
      const [newMessage] = await db.insert(messageSchedules).values({
          userId: context.userId,
          content: params.content,
          scheduledFor: scheduledTime,
          type: params.type,
          title: params.title || null,
          context: params.context || null,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
      }).returning();

      console.log("[LLM Function] Message scheduled:", newMessage);
      return { success: true, messageScheduleId: newMessage.id };
    } catch (error) {
      console.error('[LLM Function] Error scheduling message:', error);
      return { error: `Failed to schedule message: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Delete a scheduled message
   */
  async delete_scheduled_message(context: LLMFunctionContext, params: { messageScheduleId: number }) {
    console.log("[LLM Function] delete_scheduled_message called with params:", params);
    try {
      if (!params.messageScheduleId) {
        return { error: "Missing required field: messageScheduleId is required." };
      }
      
      // Optional: Verify message belongs to user
      // const message = await db.select().from(messageSchedules).where(eq(messageSchedules.id, params.messageScheduleId)).limit(1);
      // if (!message[0] || message[0].userId !== context.userId) return { error: "Permission denied." };

      // Use db directly as storage interface doesn't have a direct deleteMessageSchedule function
      // Assuming soft delete by setting status to 'cancelled' or 'deleted'
      await db.update(messageSchedules)
        .set({ status: 'cancelled', updatedAt: new Date() }) // Or use a deletedAt timestamp
        .where(eq(messageSchedules.id, params.messageScheduleId));

      console.log("[LLM Function] Scheduled message deleted (cancelled):", params.messageScheduleId);
      return { success: true, messageScheduleId: params.messageScheduleId };
    } catch (error) {
      console.error('[LLM Function] Error deleting scheduled message:', error);
      return { error: `Failed to delete scheduled message: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  // Mark a task as skipped for today
  async mark_task_skipped_today(context: LLMFunctionContext, params: { taskId: number }) {
    console.log("[LLM Function] mark_task_skipped_today called with params:", params);
    const { userId } = context;
    const { taskId } = params;

    if (typeof taskId !== 'number') {
      return { error: 'Invalid or missing taskId.' };
    }

    try {
      const task = await storage.getTask(taskId);
      if (!task || task.userId !== userId) {
        return { error: `Task ${taskId} not found or permission denied.` };
      }

      // Get today's date in YYYY-MM-DD format (use UTC for consistency)
      const todayDateStr = format(new Date(), 'yyyy-MM-dd'); 
      
      const currentMetadata = task.metadata || {};
      const updatedMetadata = { ...currentMetadata, skippedDate: todayDateStr };

      // Use storage.updateTask to update only the metadata
      const updatedTask = await storage.updateTask(taskId, { metadata: updatedMetadata });

      if (!updatedTask) {
        return { error: `Failed to update metadata for task ${taskId}.` };
      }

      console.log(`[LLM Function] Marked task ${taskId} as skipped for ${todayDateStr}.`);

      // ---> NEW: Log the skip event
      try {
        await db.insert(taskEvents).values({
          userId: userId,
          taskId: taskId,
          eventType: 'skipped_today',
          eventDate: new Date(), // Log when the skip was recorded (effectively today)
          notes: 'Marked skipped via LLM response.', 
          createdAt: new Date(),
        });
        console.log(`[LLM Function] Logged 'skipped_today' event for task ${taskId}.`);
      } catch (eventError) {
        console.error(`[LLM Function] Failed to log 'skipped_today' event for task ${taskId}:`, eventError);
        // Don't fail the whole function if logging fails, but log the error
      }
      // <--- END NEW

      return { success: true, taskId: taskId, skippedDate: todayDateStr };
    } catch (error: any) {
      console.error(`[LLM Function] Error marking task ${taskId} skipped:`, error);
      return { error: `Failed to mark task ${taskId} as skipped: ${error.message}` };
    }
  }
}

// --- Create and Export the Function Executor Map ---

const llmFunctionsInstance = new LLMFunctions();

// Map function names (matching definitions) to the actual class methods
export const llmFunctionExecutors: { [key: string]: Function } = {
  get_todays_notifications: llmFunctionsInstance.getTodaysNotifications.bind(llmFunctionsInstance),
  get_task_list: llmFunctionsInstance.getTaskList.bind(llmFunctionsInstance), // Note the method name difference
  get_user_facts: llmFunctionsInstance.getUserFacts.bind(llmFunctionsInstance),
  get_todays_schedule: llmFunctionsInstance.getTodaysSchedule.bind(llmFunctionsInstance),
  create_task: llmFunctionsInstance.create_task.bind(llmFunctionsInstance),
  update_task: llmFunctionsInstance.update_task.bind(llmFunctionsInstance),
  delete_task: llmFunctionsInstance.delete_task.bind(llmFunctionsInstance),
  create_subtask: llmFunctionsInstance.create_subtask.bind(llmFunctionsInstance),
  update_subtask: llmFunctionsInstance.update_subtask.bind(llmFunctionsInstance),
  delete_subtask: llmFunctionsInstance.delete_subtask.bind(llmFunctionsInstance),
  create_schedule_item: llmFunctionsInstance.create_schedule_item.bind(llmFunctionsInstance),
  update_schedule_item: llmFunctionsInstance.update_schedule_item.bind(llmFunctionsInstance),
  delete_schedule_item: llmFunctionsInstance.delete_schedule_item.bind(llmFunctionsInstance),
  schedule_message: llmFunctionsInstance.schedule_message.bind(llmFunctionsInstance),
  delete_scheduled_message: llmFunctionsInstance.delete_scheduled_message.bind(llmFunctionsInstance),
  mark_task_skipped_today: llmFunctionsInstance.mark_task_skipped_today.bind(llmFunctionsInstance),
};