import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

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
  wakeTime: text("wake_time").default("08:00"), // Format: "HH:mm", Default: 8am
  routineStartTime: text("routine_start_time").default("09:30"), // Format: "HH:mm", Default: 9:30am
  sleepTime: text("sleep_time").default("23:00"), // Format: "HH:mm", Default: 11pm
  preferredMessageTime: text("preferred_message_time"), // Format: "HH:mm", Will be phased out in favor of routineStartTime
  timeZone: text("time_zone"),
  preferredModel: text("preferred_model").default("o1-mini"), // Default to o1-mini, alternatives: gpt-4o, gpt-4o-mini, etc.
  isActive: boolean("is_active").notNull().default(true),
  deactivatedAt: timestamp("deactivated_at"),
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
  factType: text("fact_type").notNull(), // Now supports custom types
  category: text("category").notNull(), // 'life_event', 'core_memory', 'traumatic_experience', 'personality', 'attachment_style', 'custom'
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
  scheduledTime: text("scheduled_time"), // Time of day in HH:MM format (e.g., "09:00")
  recurrencePattern: text("recurrence_pattern"), // "daily", "weekly:1,3,5" (days), "monthly:15" (date), "none"
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"), // Type-specific data
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const subtasks = pgTable("subtasks", {
  id: serial("id").primaryKey(),
  parentTaskId: integer("parent_task_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default('active'), // 'active', 'completed', 'archived'
  estimatedDuration: text("estimated_duration"), // e.g., "30m", "2h", "3d"
  deadline: timestamp("deadline"),
  scheduledTime: text("scheduled_time"), // Time of day in HH:MM format (e.g., "09:00")
  recurrencePattern: text("recurrence_pattern"), // "daily", "weekly:1,3,5" (days), "monthly:15" (date), "none"
  completedAt: timestamp("completed_at"),
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
  type: text("type").notNull(), // 'morning_message', 'follow_up', 'reminder'
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  status: text("status").notNull().default('pending'), // 'pending', 'sent', 'cancelled'
  metadata: jsonb("metadata"), // Store context for message generation
  deletedAt: timestamp("deleted_at"), // Soft delete field
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Daily schedule table to store the confirmed schedules
export const dailySchedules = pgTable("daily_schedules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: timestamp("date").notNull(),
  status: text("status").notNull().default('draft'), // 'draft', 'confirmed', 'completed'
  originalContent: text("original_content").notNull(), // The original LLM response
  formattedSchedule: jsonb("formatted_schedule"), // Parsed structured schedule data
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Schedule item table for individual items in a daily schedule
export const scheduleItems = pgTable("schedule_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), // User who owns this schedule item
  scheduleId: integer("schedule_id").references(() => dailySchedules.id, { onDelete: 'set null' }), // Optional reference to a daily schedule
  date: timestamp("date").notNull().defaultNow(), // Which date this item is scheduled for
  taskId: integer("task_id").references(() => tasks.id), // Optional link to a task
  subtaskId: integer("subtask_id").references(() => subtasks.id), // Optional link to a subtask
  title: text("title").notNull(),
  description: text("description"),
  startTime: text("start_time").notNull(), // Format: "HH:mm"
  endTime: text("end_time"), // Format: "HH:mm", optional for non-duration items
  status: text("status").notNull().default('scheduled'), // 'scheduled', 'in_progress', 'completed', 'skipped'
  notificationSent: boolean("notification_sent").notNull().default(false),
  deletedAt: timestamp("deleted_at"), // Soft delete field
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Schedule revision history table
export const scheduleRevisions = pgTable("schedule_revisions", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").notNull().references(() => dailySchedules.id, { onDelete: 'cascade' }),
  revisionType: text("revision_type").notNull(), // 'initial', 'user_edit', 'coach_edit'
  changes: jsonb("changes").notNull(), // Store the changes made in this revision
  createdAt: timestamp("created_at").notNull().defaultNow(),
});


export const tasksRelations = relations(tasks, ({ many }) => ({
  subtasks: many(subtasks),
  scheduleItems: many(scheduleItems),
}));

export const subtasksRelations = relations(subtasks, ({ one, many }) => ({
  parentTask: one(tasks, {
    fields: [subtasks.parentTaskId],
    references: [tasks.id],
  }),
  scheduleItems: many(scheduleItems),
}));

export const dailySchedulesRelations = relations(dailySchedules, ({ one, many }) => ({
  user: one(users, {
    fields: [dailySchedules.userId],
    references: [users.id],
  }),
  items: many(scheduleItems),
  revisions: many(scheduleRevisions),
}));

export const scheduleItemsRelations = relations(scheduleItems, ({ one }) => ({
  user: one(users, {
    fields: [scheduleItems.userId],
    references: [users.id],
  }),
  schedule: one(dailySchedules, {
    fields: [scheduleItems.scheduleId],
    references: [dailySchedules.id],
  }),
  task: one(tasks, {
    fields: [scheduleItems.taskId],
    references: [tasks.id],
  }),
  subtask: one(subtasks, {
    fields: [scheduleItems.subtaskId],
    references: [subtasks.id],
  }),
}));

export const scheduleRevisionsRelations = relations(scheduleRevisions, ({ one }) => ({
  schedule: one(dailySchedules, {
    fields: [scheduleRevisions.scheduleId],
    references: [dailySchedules.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).extend({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Please enter a valid email address"),
  phoneNumber: z.string().regex(/^\+\d{1,3}\d{10}$/, "Please enter a valid phone number with country code (e.g. +1234567890)").optional(),
  contactPreference: z.enum(["whatsapp", "imessage", "email"], {
    required_error: "Please select a contact preference",
  }),
  wakeTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Invalid time format. Use HH:mm").default("08:00"),
  routineStartTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Invalid time format. Use HH:mm").default("09:30"),
  sleepTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Invalid time format. Use HH:mm").default("23:00"),
  preferredMessageTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Invalid time format. Use HH:mm").optional(),
  timeZone: z.string().optional(),
  preferredModel: z.enum(["o1-mini", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"]).default("o1-mini"),
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
export const insertKnownUserFactSchema = createInsertSchema(knownUserFacts)
  .pick({
    factType: true,
    category: true,
    content: true,
  })
  .extend({
    factType: z.string().min(1, "Fact type is required"),
    category: z.enum(['life_event', 'core_memory', 'traumatic_experience', 'personality', 'attachment_style', 'custom'], {
      required_error: "Please select a category",
    }),
    content: z.string().min(3, "Please provide more detail about this fact"),
  });

// Define recurrence patterns
export const RecurrenceType = {
  NONE: 'none',
  DAILY: 'daily',
  WEEKLY: 'weekly', // Format: "weekly:1,3,5" for Monday, Wednesday, Friday
  MONTHLY: 'monthly', // Format: "monthly:15" for 15th of each month
} as const;

// Time validation regex for HH:MM format (24-hour)
const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

// Base task schema
const baseTaskSchema = {
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.number().min(1).max(5).optional(),
  status: z.enum(['active', 'completed', 'archived']).default('active'),
  scheduledTime: z.string().regex(timeRegex, "Time must be in 24-hour format (HH:MM)").optional(),
  recurrencePattern: z.string().optional(),
};

// Task-type specific schemas
export const dailyTaskSchema = z.object({
  ...baseTaskSchema,
  taskType: z.literal(TaskType.DAILY),
  estimatedDuration: z.string().regex(/^\d+[mh]$/, "Duration must be in minutes (m) or hours (h)"),
  deadline: z.date().optional(),
  // For daily tasks, we encourage scheduling
  scheduledTime: z.string().regex(timeRegex, "Time must be in 24-hour format (HH:MM)").optional(),
  recurrencePattern: z.string().optional(),
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

// Update the insertSubtaskSchema to properly handle date strings and scheduling
export const insertSubtaskSchema = createInsertSchema(subtasks)
  .pick({
    title: true,
    description: true,
    estimatedDuration: true,
    deadline: true,
  })
  .extend({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    estimatedDuration: z.string().regex(/^\d+[mhdwMy]$/, "Duration must be in a valid format (e.g., 30m, 2h, 3d)"),
    deadline: z.coerce.date(),
    scheduledTime: z.string().regex(timeRegex, "Time must be in 24-hour format (HH:MM)").optional(),
    recurrencePattern: z.string().optional(),
  });

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
export type Subtask = typeof subtasks.$inferSelect;
export type InsertSubtask = z.infer<typeof insertSubtaskSchema>;

// New schedule-related types
export type DailySchedule = typeof dailySchedules.$inferSelect;
export type ScheduleItem = typeof scheduleItems.$inferSelect;
export type ScheduleRevision = typeof scheduleRevisions.$inferSelect;

// Create insert schemas for schedule-related tables
export const insertDailyScheduleSchema = createInsertSchema(dailySchedules)
  .pick({
    userId: true,
    date: true,
    status: true,
    originalContent: true,
    formattedSchedule: true,
  });

export const insertScheduleItemSchema = createInsertSchema(scheduleItems)
  .pick({
    userId: true,
    date: true,
    scheduleId: true,
    taskId: true,
    subtaskId: true,
    title: true,
    description: true,
    startTime: true,
    endTime: true,
    status: true,
  });

export const insertScheduleRevisionSchema = createInsertSchema(scheduleRevisions)
  .pick({
    scheduleId: true,
    revisionType: true,
    changes: true,
  });

export type InsertDailySchedule = z.infer<typeof insertDailyScheduleSchema>;
export type InsertScheduleItem = z.infer<typeof insertScheduleItemSchema>;
export type InsertScheduleRevision = z.infer<typeof insertScheduleRevisionSchema>;

// Add some example facts for the UI
export const factExamples = {
  life_event: [
    "Got married in 2020",
    "Started a new job at Tech Corp",
    "Moved to a new city"
  ],
  core_memory: [
    "First time succeeding at a difficult task",
    "A moment of deep connection with family",
    "Overcoming a significant challenge"
  ],
  traumatic_experience: [
    "Lost a loved one",
    "Experienced a difficult breakup",
    "Went through a challenging life change"
  ],
  personality: [
    "INFJ personality type",
    "Highly empathetic and sensitive",
    "Strong preference for structured environments"
  ],
  attachment_style: [
    "Secure attachment style",
    "Anxious-preoccupied attachment",
    "Working on building secure attachments"
  ],
  custom: [
    "Daily meditation practice",
    "Strong connection to nature",
    "Value system based on compassion"
  ]
} as const;