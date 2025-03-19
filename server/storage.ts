import session from "express-session";
import createMemoryStore from "memorystore";
import { User, Goal, CheckIn, Task, KnownUserFact, InsertKnownUserFact, InsertTask } from "@shared/schema";

const MemoryStore = createMemoryStore(session);

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

  // Keep existing contact verification methods
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

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private knownUserFacts: Map<number, KnownUserFact>;
  private tasks: Map<number, Task>;
  private goals: Map<number, Goal>;
  private checkIns: Map<number, CheckIn>;
  private verifications: Map<number, Array<{
    userId: number;
    type: string;
    code: string;
    expiresAt: Date;
    createdAt: Date;
    verified?: boolean;
  }>>;
  sessionStore: session.Store;
  private currentId: number;
  private sessionTempUserId?: number;

  constructor() {
    this.users = new Map();
    this.knownUserFacts = new Map();
    this.tasks = new Map();
    this.goals = new Map();
    this.checkIns = new Map();
    this.verifications = new Map();
    this.currentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: { username: string; password: string; phoneNumber?: string; email: string; contactPreference?: string; isEmailVerified?: boolean; isPhoneVerified?: boolean; }): Promise<User> {
    const id = this.currentId++;

    // Check temporary user verifications if they exist
    let isEmailVerified = insertUser.isEmailVerified || false;
    let isPhoneVerified = insertUser.isPhoneVerified || false;

    if (this.sessionTempUserId) {
      const verifications = await this.getVerifications(this.sessionTempUserId);
      isEmailVerified = isEmailVerified || verifications.some(v => v.type === 'email' && v.verified);
      isPhoneVerified = isPhoneVerified || verifications.some(v => (v.type === 'phone' || v.type === 'whatsapp') && v.verified);
    }

    const user = {
      ...insertUser,
      id,
      isPhoneVerified,
      isEmailVerified,
      contactPreference: insertUser.contactPreference || 'email',
      phoneNumber: insertUser.phoneNumber || null,
      allowEmailNotifications: true,
      allowPhoneNotifications: false
    };

    this.users.set(id, user);
    console.log("Created user with verification status:", {
      id: user.id,
      username: user.username,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified
    });

    return user;
  }

  // Known User Facts methods
  async getKnownUserFacts(userId: number): Promise<KnownUserFact[]> {
    return Array.from(this.knownUserFacts.values())
      .filter(fact => fact.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async addKnownUserFact(fact: InsertKnownUserFact & { userId: number }): Promise<KnownUserFact> {
    const id = this.currentId++;
    const newFact: KnownUserFact = {
      ...fact,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.knownUserFacts.set(id, newFact);
    return newFact;
  }

  async updateKnownUserFact(id: number, update: Partial<KnownUserFact>): Promise<KnownUserFact> {
    const fact = this.knownUserFacts.get(id);
    if (!fact) throw new Error("Known user fact not found");

    const updatedFact = {
      ...fact,
      ...update,
      updatedAt: new Date(),
    };
    this.knownUserFacts.set(id, updatedFact);
    return updatedFact;
  }

  async deleteKnownUserFact(id: number): Promise<void> {
    this.knownUserFacts.delete(id);
  }

  // Task management methods
  async getTasks(userId: number, type?: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(task => task.userId === userId && (!type || task.taskType === type))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createTask(task: InsertTask & { userId: number }): Promise<Task> {
    const id = this.currentId++;
    const newTask: Task = {
      ...task,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      metadata: task.metadata || null,
    };
    this.tasks.set(id, newTask);
    return newTask;
  }

  async updateTask(id: number, update: Partial<Task>): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) throw new Error("Task not found");

    const updatedTask = {
      ...task,
      ...update,
      updatedAt: new Date(),
    };
    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  async deleteTask(id: number): Promise<void> {
    this.tasks.delete(id);
  }

  async completeTask(id: number): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) throw new Error("Task not found");

    const completedTask = {
      ...task,
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    };
    this.tasks.set(id, completedTask);
    return completedTask;
  }

  async createContactVerification(verification: {
    userId: number;
    type: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    const verificationList = this.verifications.get(verification.userId) || [];
    verificationList.push({
      ...verification,
      createdAt: new Date(),
      verified: false
    });
    this.verifications.set(verification.userId, verificationList);

    console.log("Created verification:", {
      userId: verification.userId,
      type: verification.type,
      code: verification.code,
      expiresAt: verification.expiresAt
    });
  }

  async getLatestContactVerification(userId: number): Promise<{
    type: string;
    code: string;
    expiresAt: Date;
    verified?: boolean;
  } | undefined> {
    const verificationList = this.verifications.get(userId) || [];
    const latest = verificationList
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      [0];

    console.log("Retrieved latest verification:", {
      userId,
      verification: latest
    });

    return latest;
  }

  async markContactVerified(userId: number, type: string): Promise<void> {
    console.log("Marking contact as verified:", { userId, type });

    // Get verification list and latest verification
    const verificationList = this.verifications.get(userId) || [];
    const latestVerification = verificationList
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      [0];

    if (!latestVerification) {
      console.warn(`No verification found for ID ${userId}`);
      return;
    }

    // Mark the verification as verified
    latestVerification.verified = true;
    this.verifications.set(userId, verificationList);

    // If this is a real user (not a temporary one), update their verification status
    const user = this.users.get(userId);
    if (user) {
      if (type === 'phone' || type === 'whatsapp') {
        user.isPhoneVerified = true;
        console.log(`Set isPhoneVerified to true for user ${userId}`);
      } else if (type === 'email') {
        user.isEmailVerified = true;
        console.log(`Set isEmailVerified to true for user ${userId}`);
      }

      // Save the updated user
      this.users.set(userId, user);
      console.log("Updated user verification status:", {
        userId,
        type,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        user
      });
    } else {
      console.log(`No user found for ID ${userId} - this is likely a temporary verification`);
    }

    console.log("Marked verification as verified:", {
      userId,
      type: latestVerification.type,
      verified: true,
      verification: latestVerification
    });
  }

  async getVerifications(userId: number): Promise<Array<{
    type: string;
    code: string;
    expiresAt: Date;
    verified: boolean;
  }>> {
    const verificationList = this.verifications.get(userId) || [];
    return verificationList.map(v => ({
      type: v.type,
      code: v.code,
      expiresAt: v.expiresAt,
      verified: v.verified || false
    }));
  }
  async updateUser(user: User): Promise<User> {
    // Ensure user exists
    if (!this.users.has(user.id)) {
      throw new Error(`User ${user.id} not found`);
    }

    // Update user with verification flags
    this.users.set(user.id, {
      ...user,
      isEmailVerified: user.isEmailVerified || false,
      isPhoneVerified: user.isPhoneVerified || false
    });

    return this.users.get(user.id)!;
  }

  async getGoals(userId: number): Promise<Goal[]> {
    return Array.from(this.goals.values()).filter(
      (goal) => goal.userId === userId,
    );
  }

  async createGoal(goal: Omit<Goal, "id">): Promise<Goal> {
    const id = this.currentId++;
    const newGoal = { ...goal, id };
    this.goals.set(id, newGoal);
    return newGoal;
  }

  async updateGoal(id: number, update: Partial<Goal>): Promise<Goal> {
    const goal = this.goals.get(id);
    if (!goal) throw new Error("Goal not found");
    const updatedGoal = { ...goal, ...update };
    this.goals.set(id, updatedGoal);
    return updatedGoal;
  }

  async deleteGoal(id: number): Promise<void> {
    this.goals.delete(id);
  }

  async getCheckIns(userId: number): Promise<CheckIn[]> {
    return Array.from(this.checkIns.values())
      .filter((checkIn) => checkIn.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createCheckIn(checkIn: Omit<CheckIn, "id">): Promise<CheckIn> {
    const id = this.currentId++;
    const newCheckIn = { ...checkIn, id };
    this.checkIns.set(id, newCheckIn);
    return newCheckIn;
  }

  async updateCheckIn(id: number, response: string): Promise<CheckIn> {
    const checkIn = this.checkIns.get(id);
    if (!checkIn) throw new Error("Check-in not found");
    const updatedCheckIn = { ...checkIn, response };
    this.checkIns.set(id, updatedCheckIn);
    return updatedCheckIn;
  }
}

export const storage = new MemStorage();