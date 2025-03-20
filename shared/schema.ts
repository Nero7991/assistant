import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  phoneNumber: text("phone_number"),
  contactPreference: text("contact_preference").notNull().default('email'),
  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
  isEmailVerified: boolean("is_email_verified").notNull().default(false),
  allowEmailNotifications: boolean("allow_email_notifications").notNull().default(true),
  allowPhoneNotifications: boolean("allow_phone_notifications").notNull().default(false),
  preferredMessageTime: text("preferred_message_time"), // Format: "HH:mm"
  timeZone: text("time_zone"),
});

export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  completed: boolean("completed").notNull().default(false),
  deadline: timestamp("deadline"),
});

export const checkIns = pgTable("check_ins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  response: text("response"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contactVerifications = pgTable("contact_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), // This will be for real users
  tempId: text("temp_id"), // New field for temporary IDs as text
  type: text("type").notNull(), // 'email' or 'phone'
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  verified: boolean("verified").notNull().default(false),
});

// Known user facts table
export const knownUserFacts = pgTable("known_user_facts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  factType: text("fact_type").notNull(), // 'user-provided' or 'system-learned'
  category: text("category").notNull(), // e.g., 'preference', 'habit', 'achievement'
  content: text("content").notNull(),
  confidence: integer("confidence"), // For system-learned facts (0-100)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Task types enum
export const TaskType = {
  DAILY: 'daily',
  PERSONAL_PROJECT: 'personal_project',
  LONG_TERM_PROJECT: 'long_term_project',
  LIFE_GOAL: 'life_goal',
} as const;

// Tasks table with discriminator for different types
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull(), // One of TaskType values
  status: text("status").notNull().default('active'), // 'active', 'completed', 'archived'
  priority: integer("priority"), // 1-5, higher is more important
  estimatedDuration: text("estimated_duration"), // e.g., "30m", "2h", "3d", "2w"
  deadline: timestamp("deadline"),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"), // Type-specific data
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messagingPreferences = pgTable("messaging_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  timeZone: text("time_zone").notNull(),
  preferredTime: text("preferred_time").notNull(), // Format: "HH:mm"
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messageHistory = pgTable("message_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull(), // 'morning_message', 'follow_up', 'response'
  status: text("status").notNull(), // 'sent', 'delivered', 'failed'
  metadata: jsonb("metadata"), // Store additional context like tasks mentioned
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messageSchedules = pgTable("message_schedules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'morning_message', 'follow_up'
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  status: text("status").notNull().default('pending'), // 'pending', 'sent', 'cancelled'
  metadata: jsonb("metadata"), // Store context for message generation
  createdAt: timestamp("created_at").notNull().defaultNow(),
});


export const insertUserSchema = createInsertSchema(users).extend({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Please enter a valid email address"),
  phoneNumber: z.string().regex(/^\+\d{1,3}\d{10}$/, "Please enter a valid phone number with country code (e.g. +1234567890)").optional(),
  contactPreference: z.enum(["whatsapp", "imessage", "email"], {
    required_error: "Please select a contact preference",
  }),
  preferredMessageTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Invalid time format. Use HH:mm").optional(),
  timeZone: z.string().optional(),
});

export const insertGoalSchema = createInsertSchema(goals).pick({
  title: true,
  description: true,
  deadline: true,
});

export const insertCheckInSchema = createInsertSchema(checkIns).pick({
  content: true,
});

// Schema for inserting known user facts
export const insertKnownUserFactSchema = createInsertSchema(knownUserFacts).extend({
  factType: z.enum(['user-provided', 'system-learned']),
  category: z.enum(['preference', 'habit', 'achievement', 'goal', 'challenge', 'other']),
  confidence: z.number().min(0).max(100).optional(),
});

// Base task schema
const baseTaskSchema = {
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.number().min(1).max(5).optional(),
  status: z.enum(['active', 'completed', 'archived']).default('active'),
};

// Task-type specific schemas
export const dailyTaskSchema = z.object({
  ...baseTaskSchema,
  taskType: z.literal(TaskType.DAILY),
  estimatedDuration: z.string().regex(/^\d+[mh]$/, "Duration must be in minutes (m) or hours (h)"),
  deadline: z.date().optional(),
});

export const personalProjectSchema = z.object({
  ...baseTaskSchema,
  taskType: z.literal(TaskType.PERSONAL_PROJECT),
  estimatedDuration: z.string().regex(/^\d+[dw]$/, "Duration must be in days (d) or weeks (w)"),
  deadline: z.date().optional(),
});

export const longTermProjectSchema = z.object({
  ...baseTaskSchema,
  taskType: z.literal(TaskType.LONG_TERM_PROJECT),
  estimatedDuration: z.string().regex(/^\d+[mM]$/, "Duration must be in months (M)"),
  deadline: z.date().optional(),
});

export const lifeGoalSchema = z.object({
  ...baseTaskSchema,
  taskType: z.literal(TaskType.LIFE_GOAL),
  estimatedDuration: z.string().regex(/^\d+[yY]$/, "Duration must be in years (y)").optional(),
});

// Combined task schema using discriminated union
export const insertTaskSchema = z.discriminatedUnion("taskType", [
  dailyTaskSchema,
  personalProjectSchema,
  longTermProjectSchema,
  lifeGoalSchema,
]);

export const verificationCodeSchema = z.object({
  code: z.string().length(6, "Verification code must be 6 digits"),
});

export const insertMessagingPreferencesSchema = createInsertSchema(messagingPreferences).pick({
  timeZone: true,
  preferredTime: true,
  isEnabled: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type KnownUserFact = typeof knownUserFacts.$inferSelect;
export type InsertKnownUserFact = z.infer<typeof insertKnownUserFactSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type MessagingPreferences = typeof messagingPreferences.$inferSelect;
export type MessageHistory = typeof messageHistory.$inferSelect;
export type MessageSchedule = typeof messageSchedules.$inferSelect;
export type InsertMessagingPreferences = z.infer<typeof insertMessagingPreferencesSchema>;