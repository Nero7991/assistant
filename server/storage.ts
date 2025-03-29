import session from "express-session";
import createMemoryStore from "memorystore";
import { 
  User, Goal, CheckIn, Task, KnownUserFact, InsertKnownUserFact, InsertTask, Subtask, InsertSubtask,
  DailySchedule, ScheduleItem, ScheduleRevision, MessageSchedule,
  InsertDailySchedule, InsertScheduleItem, InsertScheduleRevision
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { 
  users, goals, checkIns, contactVerifications, knownUserFacts, tasks, subtasks, messageSchedules,
  dailySchedules, scheduleItems, scheduleRevisions 
} from "@shared/schema";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const MemoryStore = createMemoryStore(session);
const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: session.Store;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: { username: string; password: string; phoneNumber?: string; email: string; contactPreference?: string; isEmailVerified?: boolean; isPhoneVerified?: boolean; }): Promise<User>;
  updateUser(user: User): Promise<User>;
  deactivateUser(userId: number): Promise<void>;

  // Known User Facts methods
  getKnownUserFacts(userId: number): Promise<KnownUserFact[]>;
  addKnownUserFact(fact: InsertKnownUserFact & { userId: number }): Promise<KnownUserFact>;
  updateKnownUserFact(id: number, fact: Partial<KnownUserFact>): Promise<KnownUserFact>;
  deleteKnownUserFact(id: number): Promise<void>;

  // Task management methods
  getTasks(userId: number, type?: string): Promise<Task[]>;
  createTask(task: InsertTask & { userId: number }): Promise<Task>;
  updateTask(id: number, task: Partial<Task>): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  completeTask(id: number): Promise<Task>;

  // Contact verification methods
  createContactVerification(verification: {
    userId: number;
    type: string;
    code: string;
    expiresAt: Date;
  }): Promise<void>;
  getLatestContactVerification(userId: number): Promise<{
    type: string;
    code: string;
    expiresAt: Date;
    verified?: boolean;
  } | undefined>;
  markContactVerified(userId: number, type: string): Promise<void>;
  getVerifications(userId: number): Promise<Array<{
    type: string;
    code: string;
    expiresAt: Date;
    verified: boolean;
  }>>;

  getGoals(userId: number): Promise<Goal[]>;
  createGoal(goal: Omit<Goal, "id">): Promise<Goal>;
  updateGoal(id: number, goal: Partial<Goal>): Promise<Goal>;
  deleteGoal(id: number): Promise<void>;

  getCheckIns(userId: number): Promise<CheckIn[]>;
  createCheckIn(checkIn: Omit<CheckIn, "id">): Promise<CheckIn>;
  updateCheckIn(id: number, response: string): Promise<CheckIn>;
  clearPreviousVerifications(tempId: string, type: string): Promise<void>;

  // Subtask management methods
  createSubtask(taskId: number, subtask: InsertSubtask): Promise<Subtask>;
  getSubtasks(taskId: number): Promise<Subtask[]>;
  completeSubtask(id: number): Promise<Subtask>;
  updateSubtask(id: number, updates: Partial<Subtask>): Promise<Subtask>;
  deleteSubtask(taskId: number, subtaskId: number): Promise<void>;
  
  // Schedule management methods
  getDailySchedule(userId: number, date: Date): Promise<DailySchedule | undefined>;
  getDailySchedules(userId: number, limit?: number): Promise<DailySchedule[]>;
  createDailySchedule(schedule: InsertDailySchedule): Promise<DailySchedule>;
  updateDailySchedule(id: number, updates: Partial<DailySchedule>): Promise<DailySchedule>;
  confirmDailySchedule(id: number): Promise<DailySchedule>;
  
  // Schedule items methods
  getScheduleItems(scheduleId: number): Promise<ScheduleItem[]>;
  createScheduleItem(item: InsertScheduleItem): Promise<ScheduleItem>;
  updateScheduleItem(id: number, updates: Partial<ScheduleItem>): Promise<ScheduleItem>;
  completeScheduleItem(id: number): Promise<ScheduleItem>;
  deleteScheduleItem(id: number): Promise<void>;
  
  // Schedule revision methods
  getScheduleRevisions(scheduleId: number): Promise<ScheduleRevision[]>;
  createScheduleRevision(revision: InsertScheduleRevision): Promise<ScheduleRevision>;
  
  // Notification methods for scheduled items
  scheduleTaskNotification(taskId: number, scheduledTime: Date, context?: Record<string, any>): Promise<MessageSchedule>;
  scheduleItemNotification(itemId: number, scheduledTime: Date): Promise<MessageSchedule>;
  getUpcomingNotifications(userId: number): Promise<MessageSchedule[]>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      // Handle case where isActive column might not exist yet
      if (error instanceof Error && error.message.includes('column "is_active" does not exist')) {
        console.warn("is_active column doesn't exist yet. Using simplified select query.");
        // We'll just select specific columns instead of using * 
        const result = await db.select({
          id: users.id,
          username: users.username,
          password: users.password,
          email: users.email,
          phoneNumber: users.phoneNumber,
          contactPreference: users.contactPreference,
          isEmailVerified: users.isEmailVerified,
          isPhoneVerified: users.isPhoneVerified,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        }).from(users).where(eq(users.id, id));
        
        return result.length > 0 ? { ...result[0], isActive: true } as User : undefined;
      }
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    } catch (error) {
      // Handle case where isActive column might not exist yet
      if (error instanceof Error && error.message.includes('column "is_active" does not exist')) {
        console.warn("is_active column doesn't exist yet. Using simplified select query.");
        // We'll just select specific columns instead of using * 
        const result = await db.select({
          id: users.id,
          username: users.username,
          password: users.password,
          email: users.email,
          phoneNumber: users.phoneNumber,
          contactPreference: users.contactPreference,
          isEmailVerified: users.isEmailVerified,
          isPhoneVerified: users.isPhoneVerified,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        }).from(users).where(eq(users.username, username));
        
        return result.length > 0 ? { ...result[0], isActive: true } as User : undefined;
      }
      throw error;
    }
  }

  async createUser(insertUser: { username: string; password: string; phoneNumber?: string; email: string; contactPreference?: string; isEmailVerified?: boolean; isPhoneVerified?: boolean; }): Promise<User> {
    const [user] = await db.insert(users).values({
      ...insertUser,
      isPhoneVerified: insertUser.isPhoneVerified || false,
      isEmailVerified: insertUser.isEmailVerified || false,
      contactPreference: insertUser.contactPreference || 'email',
      phoneNumber: insertUser.phoneNumber || null,
      allowEmailNotifications: true,
      allowPhoneNotifications: false,
    }).returning();
    return user;
  }

  async updateUser(user: User): Promise<User> {
    const [updated] = await db
      .update(users)
      .set(user)
      .where(eq(users.id, user.id))
      .returning();
    return updated;
  }
  
  async deactivateUser(userId: number): Promise<void> {
    try {
      // First, set the user as inactive
      await db
        .update(users)
        .set({
          isActive: false,
          deactivatedAt: new Date()
        })
        .where(eq(users.id, userId));
    } catch (error) {
      // Handle case where isActive column doesn't exist yet
      if (error instanceof Error && error.message.includes('column "is_active" does not exist')) {
        console.warn("is_active column doesn't exist yet. Using raw SQL update instead.");
        // Need to run a database migration, but for now we'll just cancel the messages
        console.log(`User ${userId} cannot be marked as inactive due to missing column 'is_active'. Only cancelling messages.`);
      } else {
        throw error;
      }
    }
    
    // Cancel all pending message schedules regardless
    try {
      await db
        .update(messageSchedules)
        .set({
          status: 'cancelled'
        })
        .where(
          and(
            eq(messageSchedules.userId, userId),
            eq(messageSchedules.status, 'pending')
          )
        );
      
      console.log(`Pending message schedules for user ${userId} cancelled.`);
    } catch (error) {
      console.error("Failed to cancel message schedules:", error);
      throw new Error("Failed to cancel message schedules");
    }
    
    console.log(`User ${userId} deactivation process completed.`);
  }

  // Known User Facts methods
  async getKnownUserFacts(userId: number): Promise<KnownUserFact[]> {
    return db
      .select()
      .from(knownUserFacts)
      .where(eq(knownUserFacts.userId, userId))
      .orderBy(knownUserFacts.createdAt);
  }

  async addKnownUserFact(fact: InsertKnownUserFact & { userId: number }): Promise<KnownUserFact> {
    const now = new Date();
    const [newFact] = await db
      .insert(knownUserFacts)
      .values({
        ...fact,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return newFact;
  }

  async updateKnownUserFact(id: number, update: Partial<KnownUserFact>): Promise<KnownUserFact> {
    const [updated] = await db
      .update(knownUserFacts)
      .set({
        ...update,
        updatedAt: new Date(),
      })
      .where(eq(knownUserFacts.id, id))
      .returning();
    return updated;
  }

  async deleteKnownUserFact(id: number): Promise<void> {
    await db.delete(knownUserFacts).where(eq(knownUserFacts.id, id));
  }

  // Task management methods
  async getTasks(userId: number, type?: string): Promise<Task[]> {
    let query = db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId));

    if (type) {
      query = query.where(eq(tasks.taskType, type));
    }

    return query.orderBy(tasks.createdAt);
  }

  async createTask(task: InsertTask & { userId: number }): Promise<Task> {
    const now = new Date();
    const [newTask] = await db
      .insert(tasks)
      .values({
        ...task,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return newTask;
  }

  async updateTask(id: number, update: Partial<Task>): Promise<Task> {
    const [updated] = await db
      .update(tasks)
      .set({
        ...update,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async completeTask(id: number): Promise<Task> {
    const now = new Date();
    const [completed] = await db
      .update(tasks)
      .set({
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, id))
      .returning();
    return completed;
  }

  // Contact verification methods
  async createContactVerification(verification: {
    userId: number;
    type: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    // First get existing verifications for logging
    const existing = await db
      .select()
      .from(contactVerifications)
      .where(
        and(
          eq(contactVerifications.tempId, verification.userId.toString()),
          eq(contactVerifications.type, verification.type)
        )
      );

    console.log("Existing verifications before cleanup:", {
      tempId: verification.userId.toString(),
      type: verification.type,
      count: existing.length,
      verifications: existing
    });

    // Delete existing verifications
    await db
      .delete(contactVerifications)
      .where(
        and(
          eq(contactVerifications.tempId, verification.userId.toString()),
          eq(contactVerifications.type, verification.type)
        )
      );

    // Verify deletion
    const remaining = await db
      .select()
      .from(contactVerifications)
      .where(
        and(
          eq(contactVerifications.tempId, verification.userId.toString()),
          eq(contactVerifications.type, verification.type)
        )
      );

    console.log("Verifications after cleanup:", {
      tempId: verification.userId.toString(),
      type: verification.type,
      count: remaining.length,
      verifications: remaining
    });

    // Create the new verification
    await db.insert(contactVerifications).values({
      userId: 0, // Default userId for temporary verifications
      tempId: verification.userId.toString(), // Store the temporary ID as text
      type: verification.type,
      code: verification.code,
      expiresAt: verification.expiresAt,
      createdAt: new Date(),
    });

    // Verify creation
    const [latest] = await db
      .select()
      .from(contactVerifications)
      .where(
        and(
          eq(contactVerifications.tempId, verification.userId.toString()),
          eq(contactVerifications.type, verification.type)
        )
      )
      .orderBy(desc(contactVerifications.createdAt))
      .limit(1);

    console.log("New verification created:", {
      tempId: verification.userId.toString(),
      type: verification.type,
      code: latest.code,
      expiresAt: latest.expiresAt
    });
  }

  async getLatestContactVerification(userId: number): Promise<{
    type: string;
    code: string;
    expiresAt: Date;
    verified?: boolean;
  } | undefined> {
    // Get all verifications for this user
    const allVerifications = await db
      .select()
      .from(contactVerifications)
      .where(eq(contactVerifications.tempId, userId.toString()))
      .orderBy(desc(contactVerifications.createdAt));

    console.log("All verifications found:", {
      tempId: userId.toString(),
      count: allVerifications.length,
      verifications: allVerifications
    });

    // Get the latest one
    const [latest] = allVerifications;

    if (latest) {
      console.log("Using latest verification:", {
        tempId: userId.toString(),
        type: latest.type,
        code: latest.code,
        expiresAt: latest.expiresAt
      });
    }

    return latest;
  }

  async markContactVerified(userId: number, type: string): Promise<void> {
    console.log("Marking contact as verified:", {
      tempId: userId.toString(),
      type
    });

    // Mark the verification as verified in contact_verifications
    const [updated] = await db
      .update(contactVerifications)
      .set({ verified: true })
      .where(
        and(
          eq(contactVerifications.tempId, userId.toString()),
          eq(contactVerifications.type, type)
        )
      )
      .returning();

    console.log("Verification record updated:", {
      tempId: userId.toString(),
      type,
      updated
    });

    const user = await this.getUser(userId);
    if (user) {
      console.log("Updating user verification status:", {
        userId,
        currentEmailVerified: user.isEmailVerified,
        currentPhoneVerified: user.isPhoneVerified,
        type
      });

      const [updatedUser] = await db
        .update(users)
        .set({
          isEmailVerified: type === 'email' ? true : user.isEmailVerified,
          isPhoneVerified: type === 'phone' || type === 'whatsapp' ? true : user.isPhoneVerified,
        })
        .where(eq(users.id, userId))
        .returning();

      console.log("User verification status updated:", {
        userId,
        isEmailVerified: updatedUser.isEmailVerified,
        isPhoneVerified: updatedUser.isPhoneVerified
      });
    }
  }

  async getVerifications(userId: number): Promise<Array<{
    type: string;
    code: string;
    expiresAt: Date;
    verified: boolean;
  }>> {
    console.log("Getting verifications for user:", userId);

    const verifications = await db
      .select()
      .from(contactVerifications)
      .where(eq(contactVerifications.tempId, userId.toString()));

    console.log("Found verifications:", {
      tempId: userId.toString(),
      count: verifications.length,
      verifications: verifications.map(v => ({
        type: v.type,
        verified: v.verified,
        expiresAt: v.expiresAt
      }))
    });

    return verifications.map(v => ({
      type: v.type,
      code: v.code,
      expiresAt: v.expiresAt,
      verified: v.verified,
    }));
  }

  // Goals methods
  async getGoals(userId: number): Promise<Goal[]> {
    return db
      .select()
      .from(goals)
      .where(eq(goals.userId, userId));
  }

  async createGoal(goal: Omit<Goal, "id">): Promise<Goal> {
    const [newGoal] = await db
      .insert(goals)
      .values(goal)
      .returning();
    return newGoal;
  }

  async updateGoal(id: number, update: Partial<Goal>): Promise<Goal> {
    const [updated] = await db
      .update(goals)
      .set(update)
      .where(eq(goals.id, id))
      .returning();
    return updated;
  }

  async deleteGoal(id: number): Promise<void> {
    await db.delete(goals).where(eq(goals.id, id));
  }

  // Check-ins methods
  async getCheckIns(userId: number): Promise<CheckIn[]> {
    return db
      .select()
      .from(checkIns)
      .where(eq(checkIns.userId, userId))
      .orderBy(checkIns.createdAt);
  }

  async createCheckIn(checkIn: Omit<CheckIn, "id">): Promise<CheckIn> {
    const [newCheckIn] = await db
      .insert(checkIns)
      .values(checkIn)
      .returning();
    return newCheckIn;
  }

  async updateCheckIn(id: number, response: string): Promise<CheckIn> {
    const [updated] = await db
      .update(checkIns)
      .set({ response })
      .where(eq(checkIns.id, id))
      .returning();
    return updated;
  }
  async clearPreviousVerifications(tempId: string, type: string): Promise<void> {
    // First get existing verifications for logging
    const existing = await db
      .select()
      .from(contactVerifications)
      .where(
        and(
          eq(contactVerifications.tempId, tempId),
          eq(contactVerifications.type, type)
        )
      );

    console.log("Existing verifications before cleanup:", {
      tempId,
      type,
      count: existing.length,
      verifications: existing
    });

    // Delete existing verifications
    await db
      .delete(contactVerifications)
      .where(
        and(
          eq(contactVerifications.tempId, tempId),
          eq(contactVerifications.type, type)
        )
      );

    // Verify deletion
    const remaining = await db
      .select()
      .from(contactVerifications)
      .where(
        and(
          eq(contactVerifications.tempId, tempId),
          eq(contactVerifications.type, type)
        )
      );

    console.log("Verifications after cleanup:", {
      tempId,
      type,
      count: remaining.length,
      verifications: remaining
    });
  }

  // Subtask management methods
  async createSubtask(taskId: number, subtask: InsertSubtask): Promise<Subtask> {
    const now = new Date();
    const [newSubtask] = await db
      .insert(subtasks)
      .values({
        ...subtask,
        parentTaskId: taskId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return newSubtask;
  }

  async getSubtasks(taskId: number): Promise<Subtask[]> {
    return db
      .select()
      .from(subtasks)
      .where(eq(subtasks.parentTaskId, taskId))
      .orderBy(subtasks.createdAt);
  }

  async completeSubtask(id: number): Promise<Subtask> {
    const now = new Date();
    const [completed] = await db
      .update(subtasks)
      .set({
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(subtasks.id, id))
      .returning();
    return completed;
  }
  async updateSubtask(id: number, updates: Partial<Subtask>): Promise<Subtask> {
    const [updated] = await db
      .update(subtasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(subtasks.id, id))
      .returning();
    return updated;
  }
  
  async deleteSubtask(taskId: number, subtaskId: number): Promise<void> {
    await db.delete(subtasks)
      .where(
        and(
          eq(subtasks.parentTaskId, taskId),
          eq(subtasks.id, subtaskId)
        )
      );
  }

  // Daily Schedule methods
  async getDailySchedules(userId: number): Promise<typeof dailySchedules.$inferSelect[]> {
    try {
      return await db
        .select()
        .from(dailySchedules)
        .where(eq(dailySchedules.userId, userId))
        .orderBy(desc(dailySchedules.createdAt));
    } catch (error) {
      // If the table doesn't exist, return an empty array
      if (error instanceof Error && 
          error.message && 
          error.message.includes('relation') && 
          error.message.includes('does not exist')) {
        console.log("Daily schedules table doesn't exist yet - returning empty array");
        return [];
      }
      throw error;
    }
  }

  async getDailySchedule(idOrUserId: number, date?: Date): Promise<typeof dailySchedules.$inferSelect | undefined> {
    try {
      // Check if this is a userId + date query or a direct scheduleId query
      if (date) {
        // Format the date to match the database storage format (remove time component)
        const formattedDate = new Date(date);
        // Start of day
        formattedDate.setHours(0, 0, 0, 0);
        
        // End of day
        const endDate = new Date(formattedDate);
        endDate.setHours(23, 59, 59, 999);
        
        // Query by userId and date range
        const [schedule] = await db
          .select()
          .from(dailySchedules)
          .where(
            and(
              eq(dailySchedules.userId, idOrUserId),
              gte(dailySchedules.date, formattedDate),
              lte(dailySchedules.date, endDate)
            )
          )
          .orderBy(desc(dailySchedules.createdAt));
        
        return schedule;
      } else {
        // This is a direct scheduleId query
        const [schedule] = await db
          .select()
          .from(dailySchedules)
          .where(eq(dailySchedules.id, idOrUserId));
        
        return schedule;
      }
    } catch (error) {
      // If the table doesn't exist, log and return undefined
      if (error instanceof Error && 
          error.message && 
          error.message.includes('relation') && 
          error.message.includes('does not exist')) {
        console.log("Daily schedules table doesn't exist yet - returning undefined");
        return undefined;
      }
      throw error;
    }
  }

  async getScheduleItems(scheduleId: number): Promise<typeof scheduleItems.$inferSelect[]> {
    try {
      return await db
        .select()
        .from(scheduleItems)
        .where(eq(scheduleItems.scheduleId, scheduleId))
        .orderBy(scheduleItems.startTime);
    } catch (error) {
      // If the table doesn't exist, log and return an empty array
      if (error instanceof Error && 
          error.message && 
          error.message.includes('relation') && 
          error.message.includes('does not exist')) {
        console.log("Schedule items table doesn't exist yet - returning empty array");
        return [];
      }
      throw error;
    }
  }

  async updateScheduleItemStatus(itemId: number, status: string): Promise<typeof scheduleItems.$inferSelect> {
    try {
      const [updatedItem] = await db
        .update(scheduleItems)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(scheduleItems.id, itemId))
        .returning();
      return updatedItem;
    } catch (error) {
      // If the table doesn't exist, log the error
      if (error instanceof Error && 
          error.message && 
          error.message.includes('relation') && 
          error.message.includes('does not exist')) {
        console.error("Schedule items table doesn't exist yet - cannot update status");
        throw new Error("Cannot update schedule item status: table does not exist");
      }
      throw error;
    }
  }

  async scheduleItemNotification(itemId: number, scheduledTime: Date): Promise<typeof messageSchedules.$inferSelect> {
    try {
      try {
        // Get the schedule item to access related information
        const [item] = await db
          .select()
          .from(scheduleItems)
          .where(eq(scheduleItems.id, itemId));
        
        if (!item) {
          throw new Error(`Schedule item with ID ${itemId} not found`);
        }
        
        // Get the parent schedule to get the user ID
        const [schedule] = await db
          .select()
          .from(dailySchedules)
          .where(eq(dailySchedules.id, item.scheduleId));
        
        if (!schedule) {
          throw new Error(`Parent schedule with ID ${item.scheduleId} not found`);
        }
        
        // Get the task if this schedule item is linked to a task
        let taskTitle = item.title;
        let taskDescription = item.description || '';
        
        if (item.taskId) {
          const [task] = await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, item.taskId));
          
          if (task) {
            taskTitle = task.title;
            taskDescription = task.description || '';
          }
        }
        
        // Create metadata for the notification
        const metadata = {
          scheduleItemId: item.id,
          scheduleId: item.scheduleId,
          taskId: item.taskId,
          title: taskTitle,
          description: taskDescription,
          startTime: item.startTime,
          endTime: item.endTime
        };
        
        // Schedule the notification
        const [messageSchedule] = await db
          .insert(messageSchedules)
          .values({
            userId: schedule.userId,
            scheduledTime,
            type: 'schedule_notification',
            status: 'pending',
            context: JSON.stringify(metadata)
          })
          .returning();
        
        // Update the schedule item to indicate that a notification has been scheduled
        await db
          .update(scheduleItems)
          .set({
            notificationSent: true,
            updatedAt: new Date()
          })
          .where(eq(scheduleItems.id, item.id));
        
        return messageSchedule;
      } catch (dbError) {
        // Check if this is a "table doesn't exist" error
        if (dbError instanceof Error && 
            dbError.message && 
            dbError.message.includes('relation') && 
            dbError.message.includes('does not exist')) {
          console.log("One or more schedule-related tables don't exist yet - cannot schedule notification");
          
          // Create a mock message schedule to return instead of throwing
          const mockSchedule = {
            id: -1, // Use a negative ID to indicate this is a mock
            userId: -1,
            scheduledTime,
            type: 'schedule_notification',
            status: 'error_tables_missing',
            context: JSON.stringify({
              error: 'Database tables do not exist yet',
              scheduleItemId: itemId
            }),
            createdAt: new Date(),
            scheduledFor: scheduledTime,
            sentAt: null
          };
          
          return mockSchedule as typeof messageSchedules.$inferSelect;
        }
        throw dbError; // Re-throw if not a table existence error
      }
    } catch (error) {
      console.error("Error scheduling item notification:", error);
      throw error;
    }
  }

  async confirmDailySchedule(scheduleId: number): Promise<boolean> {
    try {
      try {
        // Update the schedule status
        await db
          .update(dailySchedules)
          .set({
            status: 'confirmed',
            confirmedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(dailySchedules.id, scheduleId));
        
        // Get all items in this schedule
        const items = await db
          .select()
          .from(scheduleItems)
          .where(eq(scheduleItems.scheduleId, scheduleId));
        
        // Schedule notifications for each item
        for (const item of items) {
          // Parse the start time to a Date object
          const timeMatch = item.startTime.match(/^(\d{1,2}):(\d{2})$/);
          if (!timeMatch) continue;
          
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          
          if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            continue;
          }
          
          // Create a Date object for today at the specified time
          const scheduledTime = new Date();
          scheduledTime.setHours(hours, minutes, 0, 0);
          
          // Only schedule notifications for future times
          if (scheduledTime > new Date()) {
            await this.scheduleItemNotification(item.id, scheduledTime);
          }
        }
      } catch (dbError) {
        // Check if the error is due to tables not existing
        if (dbError instanceof Error && 
            dbError.message && 
            dbError.message.includes('relation') && 
            dbError.message.includes('does not exist')) {
          console.log("One or more schedule-related tables don't exist yet - performing alternative confirmation");
          
          // Alternative approach: Just log that confirmation was attempted but tables don't exist
          console.log(`Schedule confirmation attempted for ID ${scheduleId} but tables don't exist yet`);
          
          // We still return true to indicate the operation was acknowledged
          return true;
        }
        throw dbError; // Re-throw if not a table existence error
      }
      
      return true;
    } catch (error) {
      console.error("Error confirming daily schedule:", error);
      return false;
    }
  }
}

export const storage = new DatabaseStorage();