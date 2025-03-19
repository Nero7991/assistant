import session from "express-session";
import connectPg from "connect-pg-simple";
import { eq, desc } from "drizzle-orm";
import { User, Goal, CheckIn, Task, KnownUserFact, InsertKnownUserFact } from "@shared/schema";
import { db, pool } from "./db";
import { users, goals, checkIns, tasks, knownUserFacts, contactVerifications } from "@shared/schema";

const PostgresSessionStore = connectPg(session);

interface IStorage {
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

  // User methods
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
      contactPreference: insertUser.contactPreference || 'email',
      isEmailVerified: insertUser.isEmailVerified || false,
      isPhoneVerified: insertUser.isPhoneVerified || false,
      allowEmailNotifications: true,
      allowPhoneNotifications: false,
    }).returning();
    return user;
  }

  async updateUser(user: User): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set(user)
      .where(eq(users.id, user.id))
      .returning();
    return updatedUser;
  }

  // Known User Facts methods
  async getKnownUserFacts(userId: number): Promise<KnownUserFact[]> {
    return await db
      .select()
      .from(knownUserFacts)
      .where(eq(knownUserFacts.userId, userId))
      .orderBy(desc(knownUserFacts.createdAt));
  }

  async addKnownUserFact(fact: InsertKnownUserFact & { userId: number }): Promise<KnownUserFact> {
    const [newFact] = await db
      .insert(knownUserFacts)
      .values({
        ...fact,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newFact;
  }

  async updateKnownUserFact(id: number, update: Partial<KnownUserFact>): Promise<KnownUserFact> {
    const [updatedFact] = await db
      .update(knownUserFacts)
      .set({
        ...update,
        updatedAt: new Date(),
      })
      .where(eq(knownUserFacts.id, id))
      .returning();
    return updatedFact;
  }

  async deleteKnownUserFact(id: number): Promise<void> {
    await db.delete(knownUserFacts).where(eq(knownUserFacts.id, id));
  }

  // Task methods
  async getTasks(userId: number, type?: string): Promise<Task[]> {
    const query = db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId));

    if (type) {
      query.where(eq(tasks.taskType, type));
    }

    return await query.orderBy(desc(tasks.createdAt));
  }

  async createTask(task: InsertTask & { userId: number }): Promise<Task> {
    const [newTask] = await db
      .insert(tasks)
      .values({
        ...task,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        metadata: task.metadata || null,
      })
      .returning();
    return newTask;
  }

  async updateTask(id: number, update: Partial<Task>): Promise<Task> {
    const [updatedTask] = await db
      .update(tasks)
      .set({
        ...update,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async completeTask(id: number): Promise<Task> {
    const [completedTask] = await db
      .update(tasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();
    return completedTask;
  }

  // Contact verification methods
  async createContactVerification(verification: {
    userId: number;
    type: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    await db.insert(contactVerifications).values({
      ...verification,
      createdAt: new Date(),
    });
  }

  async getLatestContactVerification(userId: number): Promise<{
    type: string;
    code: string;
    expiresAt: Date;
    verified?: boolean;
  } | undefined> {
    const [verification] = await db
      .select()
      .from(contactVerifications)
      .where(eq(contactVerifications.userId, userId))
      .orderBy(desc(contactVerifications.createdAt));
    return verification;
  }

  async markContactVerified(userId: number, type: string): Promise<void> {
    // Get the latest verification
    const [verification] = await db
      .select()
      .from(contactVerifications)
      .where(eq(contactVerifications.userId, userId))
      .orderBy(desc(contactVerifications.createdAt));

    if (verification) {
      // Update the verification status
      await db
        .update(contactVerifications)
        .set({ verified: true })
        .where(eq(contactVerifications.id, verification.id));

      // Update user verification status if it exists
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      if (user) {
        await db
          .update(users)
          .set({
            isEmailVerified: type === 'email' ? true : user.isEmailVerified,
            isPhoneVerified: (type === 'phone' || type === 'whatsapp') ? true : user.isPhoneVerified,
          })
          .where(eq(users.id, userId));
      }
    }
  }

  async getVerifications(userId: number): Promise<Array<{
    type: string;
    code: string;
    expiresAt: Date;
    verified: boolean;
  }>> {
    return await db
      .select()
      .from(contactVerifications)
      .where(eq(contactVerifications.userId, userId));
  }

  // Goals methods
  async getGoals(userId: number): Promise<Goal[]> {
    return await db
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
    const [updatedGoal] = await db
      .update(goals)
      .set(update)
      .where(eq(goals.id, id))
      .returning();
    return updatedGoal;
  }

  async deleteGoal(id: number): Promise<void> {
    await db.delete(goals).where(eq(goals.id, id));
  }

  // Check-ins methods
  async getCheckIns(userId: number): Promise<CheckIn[]> {
    return await db
      .select()
      .from(checkIns)
      .where(eq(checkIns.userId, userId))
      .orderBy(desc(checkIns.createdAt));
  }

  async createCheckIn(checkIn: Omit<CheckIn, "id">): Promise<CheckIn> {
    const [newCheckIn] = await db
      .insert(checkIns)
      .values(checkIn)
      .returning();
    return newCheckIn;
  }

  async updateCheckIn(id: number, response: string): Promise<CheckIn> {
    const [updatedCheckIn] = await db
      .update(checkIns)
      .set({ response })
      .where(eq(checkIns.id, id))
      .returning();
    return updatedCheckIn;
  }
}

export const storage = new DatabaseStorage();