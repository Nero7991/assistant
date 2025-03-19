import session from "express-session";
import createMemoryStore from "memorystore";
import { User, Goal, CheckIn, Task, KnownUserFact, InsertKnownUserFact, InsertTask } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users, goals, checkIns, contactVerifications, knownUserFacts, tasks } from "@shared/schema";
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
    await db.insert(contactVerifications).values({
      userId: 0, // Default userId for temporary verifications
      tempId: verification.userId.toString(), // Store the temporary ID as text
      type: verification.type,
      code: verification.code,
      expiresAt: verification.expiresAt,
      createdAt: new Date(),
    });
  }

  async getLatestContactVerification(userId: number): Promise<{
    type: string;
    code: string;
    expiresAt: Date;
    verified?: boolean;
  } | undefined> {
    const [latest] = await db
      .select()
      .from(contactVerifications)
      .where(eq(contactVerifications.tempId, userId.toString()))
      .orderBy(contactVerifications.createdAt, "desc") // Change to DESC order
      .limit(1);
    return latest;
  }

  async markContactVerified(userId: number, type: string): Promise<void> {
    const user = await this.getUser(userId);
    if (user) {
      await db
        .update(users)
        .set({
          isEmailVerified: type === 'email' ? true : user.isEmailVerified,
          isPhoneVerified: type === 'phone' || type === 'whatsapp' ? true : user.isPhoneVerified,
        })
        .where(eq(users.id, userId));
    }
  }

  async getVerifications(userId: number): Promise<Array<{
    type: string;
    code: string;
    expiresAt: Date;
    verified: boolean;
  }>> {
    const verifications = await db
      .select()
      .from(contactVerifications)
      .where(eq(contactVerifications.tempId, userId.toString()));
    return verifications.map(v => ({
      type: v.type,
      code: v.code,
      expiresAt: v.expiresAt,
      verified: false, // We don't store verified status in the database
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
}

export const storage = new DatabaseStorage();