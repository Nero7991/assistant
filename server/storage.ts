import session from "express-session";
import createMemoryStore from "memorystore";
import { User, Goal, CheckIn, Task, KnownUserFact, InsertKnownUserFact, InsertTask, Subtask, InsertSubtask } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { users, goals, checkIns, contactVerifications, knownUserFacts, tasks, subtasks } from "@shared/schema";
import type { User, Goal, CheckIn, Task, KnownUserFact, InsertKnownUserFact, InsertTask } from "@shared/schema";
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
  deleteSubtask(taskId: number, subtaskId: number): Promise<void>;
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
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
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
  async deleteSubtask(taskId: number, subtaskId: number): Promise<void> {
    await db.delete(subtasks)
      .where(
        and(
          eq(subtasks.parentTaskId, taskId),
          eq(subtasks.id, subtaskId)
        )
      );
  }
}

export const storage = new DatabaseStorage();