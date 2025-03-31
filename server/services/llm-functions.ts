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

      const pendingSchedules = await db
        .select()
        .from(messageSchedules)
        .where(
          and(
            eq(messageSchedules.userId, context.userId),
            eq(messageSchedules.status, 'pending'),
            isNull(messageSchedules.deletedAt),
            gte(messageSchedules.scheduledFor, today),
            lt(messageSchedules.scheduledFor, tomorrow)
          )
        )
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
      
      let query = db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, context.userId),
            isNull(tasks.deletedAt)
          )
        );
        
      // Apply status filter if not 'all'
      if (status === 'active') {
        query = query.where(isNull(tasks.completedAt));
      } else if (status === 'completed') {
        query = query.where(isNull(tasks.completedAt).not());
      }
      
      const taskList = await query;
      
      // For each task, get its subtasks
      const result = await Promise.all(taskList.map(async (task) => {
        const subtaskList = await db
          .select()
          .from(subtasks)
          .where(
            and(
              eq(subtasks.taskId, task.id!),
              isNull(subtasks.deletedAt)
            )
          );
          
        return {
          ...task,
          subtasks: subtaskList.map(st => ({
            id: st.id,
            title: st.title,
            status: st.completedAt ? 'completed' : 'active',
            dueDate: st.dueDate ? format(new Date(st.dueDate), 'yyyy-MM-dd') : null
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
      let query = db
        .select()
        .from(knownUserFacts)
        .where(eq(knownUserFacts.userId, context.userId));
        
      // Apply category filter if provided
      if (params.category) {
        query = query.where(eq(knownUserFacts.category, params.category));
      }
      
      const facts = await query;
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
      const now = context.date || new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get the daily schedule for today
      const [dailySchedule] = await db
        .select()
        .from(dailySchedules)
        .where(
          and(
            eq(dailySchedules.userId, context.userId),
            gte(sql`${dailySchedules.date}::date`, sql`${today}::date`),
            lt(sql`${dailySchedules.date}::date`, sql`${tomorrow}::date`)
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
              isNull(scheduleItems.deletedAt),
              gte(sql`${scheduleItems.startTime}::date`, sql`${today}::date`),
              lt(sql`${scheduleItems.startTime}::date`, sql`${tomorrow}::date`)
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

        const relatedTasks = taskIds.length > 0 
          ? await db
              .select()
              .from(tasks)
              .where(
                and(
                  eq(tasks.userId, context.userId),
                  isNull(tasks.deletedAt)
                )
              )
              .where(tasks.id.in(taskIds))
          : [];

        const tasksById = relatedTasks.reduce((acc, task) => {
          acc[task.id!] = task;
          return acc;
        }, {} as Record<number, typeof relatedTasks[0]>);

        // Format the schedule items with task info
        const formattedItems = scheduleItemsResult.map(item => {
          const task = item.taskId ? tasksById[item.taskId] : null;
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
            isNull(scheduleItems.deletedAt)
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
            .where(eq(tasks.id, item.taskId!));
            
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