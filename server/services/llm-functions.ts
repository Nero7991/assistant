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
  dailySchedules 
} from '@shared/schema';
import { format } from 'date-fns';

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
            time: format(new Date(item.startTime), 'h:mm a'),
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
          time: format(new Date(item.startTime), 'h:mm a'),
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
}

export const llmFunctions = new LLMFunctions();