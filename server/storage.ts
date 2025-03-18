import session from "express-session";
import createMemoryStore from "memorystore";
import { User, Goal, CheckIn } from "@shared/schema";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  sessionStore: session.Store;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: { username: string; password: string; phoneNumber?: string; email: string; contactPreference?: string }): Promise<User>;

  getGoals(userId: number): Promise<Goal[]>;
  createGoal(goal: Omit<Goal, "id">): Promise<Goal>;
  updateGoal(id: number, goal: Partial<Goal>): Promise<Goal>;
  deleteGoal(id: number): Promise<void>;

  getCheckIns(userId: number): Promise<CheckIn[]>;
  createCheckIn(checkIn: Omit<CheckIn, "id">): Promise<CheckIn>;
  updateCheckIn(id: number, response: string): Promise<CheckIn>;

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
  } | undefined>;
  markContactVerified(userId: number, type: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
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

  constructor() {
    this.users = new Map();
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

  async createUser(insertUser: { username: string; password: string; phoneNumber?: string; email: string; contactPreference?: string }): Promise<User> {
    const id = this.currentId++;
    const user = { 
      ...insertUser, 
      id,
      isPhoneVerified: false,
      isEmailVerified: false,
      contactPreference: insertUser.contactPreference || 'email',
      phoneNumber: insertUser.phoneNumber || null,
      allowEmailNotifications: true,
      allowPhoneNotifications: false
    };
    this.users.set(id, user);
    return user;
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
  }

  async getLatestContactVerification(userId: number): Promise<{
    type: string;
    code: string;
    expiresAt: Date;
    verified?: boolean;
  } | undefined> {
    const verificationList = this.verifications.get(userId) || [];
    return verificationList
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      [0];
  }

  async markContactVerified(userId: number, type: string): Promise<void> {
    // Check if it's a regular user
    const user = this.users.get(userId);
    if (user) {
      // Update regular user verification status
      const updatedUser = { ...user };
      if (type === 'phone' || type === 'whatsapp') {
        updatedUser.isPhoneVerified = true;
      } else if (type === 'email') {
        updatedUser.isEmailVerified = true;
      }
      this.users.set(userId, updatedUser);
    }

    // Mark the verification as verified regardless of user existence
    const verificationList = this.verifications.get(userId) || [];
    const latestVerification = verificationList
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      [0];

    if (latestVerification) {
      latestVerification.verified = true;
      this.verifications.set(userId, verificationList);
    }
  }
}

export const storage = new MemStorage();