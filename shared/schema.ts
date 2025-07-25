import { pgTable, text, serial, integer, boolean, timestamp, jsonb, index, json, varchar, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  phoneNumber: text("phone_number"),
  firstName: text("first_name"),
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
  preferredModel: text("preferred_model").default("gemini-2.5-flash"), // Default to gemini-2.5-flash, alternatives: gpt-4o, claude-4-opus, etc.
  customOpenaiServerUrl: text("custom_openai_server_url"), // e.g., http://localhost:8080/v1
  customOpenaiModelName: text("custom_openai_model_name"), // Specific model name for the custom server
  // DevLM LLM Settings
  devlmPreferredModel: text("devlm_preferred_model").default("gemini-2.5-flash"), // Default devlm model - same as Kona
  devlmCustomOpenaiServerUrl: text("devlm_custom_openai_server_url"), // Custom server URL for devlm
  devlmCustomOpenaiModelName: text("devlm_custom_openai_model_name"), // Custom model name for devlm
  isActive: boolean("is_active").notNull().default(true),
  deactivatedAt: timestamp("deactivated_at"),
  last_user_initiated_message_at: timestamp("last_user_initiated_message_at"), // New field to track last user text
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
  REGULAR: 'regular',
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
  deletedAt: timestamp("deleted_at"), // Soft delete field
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
  deletedAt: timestamp("deleted_at"), // Soft delete field
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
  sequenceId: text("sequence_id"), // Shared sequence ID for linking with function calls
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const functionCallHistory = pgTable("function_call_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sequenceId: text("sequence_id").notNull(), // Links to message_history.sequence_id
  interactionId: text("interaction_id").notNull(),
  stepNumber: integer("step_number").notNull(), // Order within the interaction
  type: text("type").notNull(), // 'function_call' or 'function_result'
  functionName: text("function_name").notNull(),
  content: text("content").notNull(), // Function args or result JSON
  metadata: jsonb("metadata"), // Additional context
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messageSchedules = pgTable("message_schedules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull().default('follow_up'), // 'morning_message', 'follow_up', 'reminder'
  title: text("title"), // Title to describe what the follow-up is for
  content: text("content"), // Optional content for the message
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  status: text("status").notNull().default('pending'), // 'pending', 'sent', 'cancelled'
  metadata: jsonb("metadata"), // Store context for message generation
  deletedAt: timestamp("deleted_at"), // Soft delete field
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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

// ---> NEW: Task Events Table
export const taskEvents = pgTable("task_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  subtaskId: integer("subtask_id").references(() => subtasks.id, { onDelete: 'set null' }), // Optional link to subtask
  eventType: text("event_type").notNull(), // e.g., 'completed', 'skipped_today'
  eventDate: timestamp("event_date").notNull(), // The date the event applies to (e.g., the day it was skipped)
  notes: text("notes"), // Optional notes
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
// <--- END NEW

// ---> NEW: Session Table Definition (to match connect-pg-simple)
// ---> UPDATED: Use types matching DB schema
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(), // Use varchar to match 'character varying'
  sess: json("sess").notNull(),
  // Use timestamp with precision, omit withTimezone to match 'without time zone'
  expire: timestamp("expire", { mode: 'date', precision: 6 }).notNull() 
});

// ---> Keep Index definition commented out for now
// export const sessionExpireIndex = index("IDX_session_expire").on(session.expire);

export const tasksRelations = relations(tasks, ({ many }) => ({
  subtasks: many(subtasks),
  scheduleItems: many(scheduleItems),
  events: many(taskEvents),
}));

export const subtasksRelations = relations(subtasks, ({ one, many }) => ({
  parentTask: one(tasks, {
    fields: [subtasks.parentTaskId],
    references: [tasks.id],
  }),
  scheduleItems: many(scheduleItems),
  events: many(taskEvents),
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

// ---> NEW: Relation for TaskEvents to User, Task, Subtask
export const taskEventsRelations = relations(taskEvents, ({ one }) => ({
  user: one(users, {
    fields: [taskEvents.userId],
    references: [users.id],
  }),
  task: one(tasks, {
    fields: [taskEvents.taskId],
    references: [tasks.id],
  }),
  subtask: one(subtasks, {
    fields: [taskEvents.subtaskId],
    references: [subtasks.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).extend({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Please enter a valid email address"),
  phoneNumber: z.string().regex(/^\+\d{1,3}\d{10}$/, "Please enter a valid phone number with country code (e.g. +1234567890)").optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  contactPreference: z.enum(["whatsapp", "imessage", "email"], {
    required_error: "Please select a contact preference",
  }),
  wakeTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Invalid time format. Use HH:mm").default("08:00"),
  routineStartTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Invalid time format. Use HH:mm").default("09:30"),
  sleepTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Invalid time format. Use HH:mm").default("23:00"),
  preferredMessageTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Invalid time format. Use HH:mm").optional(),
  timeZone: z.string().optional(),
  preferredModel: z.enum([
    "o1-mini", 
    "gpt-4o", 
    "gpt-4o-mini", 
    "gpt-4-turbo", 
    "gpt-4", 
    "gpt-3.5-turbo",
    "gemini-1.5-pro-latest",
    "gemini-1.5-flash-latest",
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.5-pro-preview-03-25",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "custom"
  ]).default("o1-mini"),
  devlmPreferredModel: z.enum([
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022", 
    "claude-3-opus-20240229",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
    "gemini-1.5-pro-latest",
    "gemini-1.5-flash-latest",
    "gemini-2.0-flash",
    "custom"
  ]).default("claude-3-5-sonnet-20241022"),
  devlmPreferredProvider: z.enum([
    "anthropic",
    "gcloud", 
    "openai",
    "custom"
  ]).default("anthropic"),
  devlmCustomOpenaiServerUrl: z.string().url().optional().nullable(),
  devlmCustomOpenaiModelName: z.string().optional().nullable(),
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
const timeRegexError = "Time must be in 24-hour format (HH:MM)";

// Base task schema fields
const baseTaskSchemaFields = {
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.number().min(1).max(5).optional(),
  status: z.enum(['active', 'completed', 'archived']).default('active'),
  // Allow empty string OR valid HH:MM format, and make the whole field optional
  scheduledTime: z.union([z.string().regex(timeRegex, timeRegexError), z.literal('')]).optional(),
  recurrencePattern: z.string().optional(),
};

// Task-type specific schemas (no longer need refine for scheduledTime)
export const regularTaskSchema = z.object({
  ...baseTaskSchemaFields,
  taskType: z.literal(TaskType.REGULAR),
  estimatedDuration: z.string().regex(/^\d+[mh]$/, "Duration must be minutes (m) or hours (h)"),
  deadline: z.date().optional(),
});

export const personalProjectSchema = z.object({
  ...baseTaskSchemaFields,
  taskType: z.literal(TaskType.PERSONAL_PROJECT),
  estimatedDuration: z.string().regex(/^\d+[dw]$/, "Duration must be days (d) or weeks (w)"),
  deadline: z.date().optional(),
});

export const longTermProjectSchema = z.object({
  ...baseTaskSchemaFields,
  taskType: z.literal(TaskType.LONG_TERM_PROJECT),
  estimatedDuration: z.string().regex(/^\d+[mM]$/, "Duration must be months (M)"),
  deadline: z.date().optional(),
});

export const lifeGoalSchema = z.object({
  ...baseTaskSchemaFields,
  taskType: z.literal(TaskType.LIFE_GOAL),
  estimatedDuration: z.string().regex(/^\d+[yY]$/, "Duration must be years (y)").optional(),
});

// Combined task schema using discriminated union and refinement
export const insertTaskSchema = z.discriminatedUnion("taskType", [
  regularTaskSchema,
  personalProjectSchema,
  longTermProjectSchema,
  lifeGoalSchema,
])
.superRefine((data, ctx) => {
  // REMOVED Rule 1 for scheduledTime as z.union handles it now.
  
  // Rule 2: Ensure estimatedDuration format matches taskType (Example)
  if (data.taskType === TaskType.REGULAR && data.estimatedDuration && !/^\d+[mh]$/.test(data.estimatedDuration)) {
     ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Regular task duration must be in minutes (m) or hours (h)", path: ["estimatedDuration"] });
  }
  if (data.taskType === TaskType.PERSONAL_PROJECT && data.estimatedDuration && !/^\d+[dw]$/.test(data.estimatedDuration)) {
     ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Personal project duration must be in days (d) or weeks (w)", path: ["estimatedDuration"] });
  }
  // Add similar checks for LONG_TERM_PROJECT (months) and LIFE_GOAL (years) if needed
   if (data.taskType === TaskType.LONG_TERM_PROJECT && data.estimatedDuration && !/^\d+[mM]$/.test(data.estimatedDuration)) {
     ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Long term project duration must be months (M)", path: ["estimatedDuration"] });
  }
  if (data.taskType === TaskType.LIFE_GOAL && data.estimatedDuration && !/^\d+[yY]$/.test(data.estimatedDuration)) {
     ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Life goal duration must be years (y)", path: ["estimatedDuration"] });
  }
});

// Update the insertSubtaskSchema to properly handle date strings and scheduling
export const insertSubtaskSchema = createInsertSchema(subtasks)
  .pick({
    title: true,
    description: true,
    estimatedDuration: true,
    deadline: true,
    // Add scheduledTime and recurrencePattern if needed for subtasks
    scheduledTime: true,
    recurrencePattern: true,
  })
  .extend({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    estimatedDuration: z.string().regex(/^\d+[mhdwMy]$/, "Duration must be in a valid format (e.g., 30m, 2h, 3d)"),
    deadline: z.coerce.date().optional().nullable(),
    scheduledTime: z.string().regex(timeRegex, timeRegexError).optional(), // Keep optional validation for subtasks
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
export type User = typeof users.$inferSelect & { isAdmin?: boolean };
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

// ---> NEW: DevLM Sessions Table
export const devlmSessions = pgTable("devlm_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionName: text("session_name").notNull(),
  taskDescription: text("task_description"), // NEW: For storing task input
  mode: text("mode").notNull().default('generate'), // 'test' or 'generate'
  model: text("model").default('claude'),
  source: text("source").default('anthropic'), // 'gcloud', 'anthropic', 'openai'
  publisher: text("publisher"), // NEW: 'google' or 'anthropic' (for gcloud source)
  anthropicApiKey: text("anthropic_api_key"), 
  openaiApiKey: text("openai_api_key"), 
  projectId: text("project_id"), // For gcloud source
  region: text("region"), // For gcloud source
  serverUrl: text("server_url"), // For openai source
  projectPath: text("project_path").default('.'),
  writeMode: text("write_mode").default('diff'), // 'direct', 'diff', or 'git_diff'
  debugPrompt: boolean("debug_prompt").default(false),
  noApproval: boolean("no_approval").default(false),
  frontend: boolean("frontend").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
// <--- END NEW

// ---> NEW: Relation for DevLM Sessions to User
export const devlmSessionsRelations = relations(devlmSessions, ({ one }) => ({
  user: one(users, {
    fields: [devlmSessions.userId],
    references: [users.id],
  }),
}));

// ---> NEW: Zod schema and types for DevLM Sessions
export const insertDevlmSessionSchema = createInsertSchema(devlmSessions)
  .pick({
    sessionName: true,
    taskDescription: true, // NEW: Pick the new field
    mode: true,
    model: true,
    source: true,
    publisher: true, // NEW
    anthropicApiKey: true, 
    openaiApiKey: true, 
    projectId: true,
    region: true,
    serverUrl: true,
    projectPath: true,
    writeMode: true,
    debugPrompt: true,
    noApproval: true,
    frontend: true,
  })
  .extend({
    sessionName: z.string().min(1, "Session name is required"),
    taskDescription: z.string().optional(), // NEW: Add to Zod schema, optional
    mode: z.enum(['generate', 'test']).default('generate'),
    writeMode: z.enum(['direct', 'diff', 'git_patch']).default('diff'), // Change git_diff to git_patch
    source: z.enum(['gcloud', 'anthropic', 'openai']).default('anthropic'),
    publisher: z.string().optional(), // NEW: Optional publisher
    anthropicApiKey: z.string().optional(), 
    openaiApiKey: z.string().optional(), 
    // Add specific validations if needed
  });

export type DevlmSession = typeof devlmSessions.$inferSelect;
export type InsertDevlmSession = z.infer<typeof insertDevlmSessionSchema>;
// <--- END NEW

// ---> NEW: Waitlist Table
export const waitlistEntries = pgTable("waitlist_entries", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries)
  .pick({
    firstName: true,
    email: true,
  })
  .extend({
    firstName: z.string().min(1, "First name is required"),
    email: z.string().email("Please enter a valid email address"),
  });

export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistEntrySchema>;
// <--- END NEW

// ---> NEW: App Settings Table
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(), // Setting name (e.g., 'registration_slots_available')
  value: text("value").notNull(),  // Setting value (stored as text)
});

export type AppSetting = typeof appSettings.$inferSelect;
// <--- END NEW

// ---> NEW: Password Reset Tokens Table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }), // Link to user, delete token if user is deleted
  tokenHash: text("token_hash").notNull().unique(), // Store a hash of the token, not the token itself
  expiresAt: timestamp("expires_at").notNull(), // When the token becomes invalid
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// ---> NEW: People Table
export const RelationshipType = {
  FAMILY: 'family',
  FRIEND: 'friend',
  COLLEAGUE: 'colleague',
  SIGNIFICANT_OTHER: 'significant_other',
  ACQUAINTANCE: 'acquaintance',
  OTHER: 'other',
} as const;

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }), // The user who added this person
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  nickname: text("nickname"),
  email: text("email"),
  phoneNumber: text("phone_number"),
  contactPreference: text("contact_preference").default('sms'), // 'sms' or 'whatsapp'
  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
  isEmailVerified: boolean("is_email_verified").notNull().default(false),
  birthday: date("birthday"),
  relationship: text("relationship").notNull(), // One of RelationshipType values
  relationshipDetails: text("relationship_details"), // More specific info about relationship
  notes: text("notes"),
  metadata: jsonb("metadata"), // For any additional data
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"), // For soft delete
});

// Table for verifying added people's contact info
export const peopleVerifications = pgTable("people_verifications", {
  id: serial("id").primaryKey(),
  personId: integer("person_id").notNull().references(() => people.id, { onDelete: 'cascade' }),
  type: text("type").notNull(), // 'email' or 'phone'
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  verified: boolean("verified").notNull().default(false),
});

// Relationships
export const peopleRelations = relations(people, ({ one }) => ({
  user: one(users, {
    fields: [people.userId],
    references: [users.id],
  }),
}));

// Schemas for people
export const insertPersonSchema = createInsertSchema(people)
  .pick({
    firstName: true,
    lastName: true,
    nickname: true,
    email: true,
    phoneNumber: true,
    contactPreference: true,
    birthday: true,
    relationship: true,
    relationshipDetails: true,
    notes: true,
  })
  .extend({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().optional(),
    nickname: z.string().optional(),
    email: z.string().email("Please enter a valid email").optional().nullable(),
    phoneNumber: z.string().regex(/^\+\d{1,3}\d{10}$/, "Please enter a valid phone number with country code (e.g. +1234567890)").optional().nullable(),
    contactPreference: z.enum(['sms', 'whatsapp']).default('sms'),
    birthday: z.coerce.date().optional().nullable(),
    relationship: z.enum([
      RelationshipType.FAMILY,
      RelationshipType.FRIEND,
      RelationshipType.COLLEAGUE,
      RelationshipType.SIGNIFICANT_OTHER,
      RelationshipType.ACQUAINTANCE,
      RelationshipType.OTHER
    ]),
    relationshipDetails: z.string().optional(),
    notes: z.string().optional(),
  });

// Schema for verification
export const personVerificationSchema = z.object({
  code: z.string().length(6, "Verification code must be 6 digits"),
});

// Types
export type Person = typeof people.$inferSelect;
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type PeopleVerification = typeof peopleVerifications.$inferSelect;
// <--- END NEW

// ---> NEW: Creations Tables
export const CreationStatus = {
  BRAINSTORMING: 'brainstorming',
  PLANNING: 'planning',
  APPROVED: 'approved', 
  BUILDING: 'building',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
} as const;

export const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress', 
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;

export const creations = pgTable("creations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default(CreationStatus.BRAINSTORMING),
  
  // Planning phase data
  planningPrompt: text("planning_prompt"),
  architecturePlan: text("architecture_plan"),
  techStack: jsonb("tech_stack"), // Array of technologies
  
  // Building phase data
  currentTaskId: integer("current_task_id"),
  currentSubtaskId: integer("current_subtask_id"),
  
  // Deployment data
  pageName: text("page_name"), // URL slug: https://pages.orenslab.com/{page_name}
  deploymentUrl: text("deployment_url"), // Full URL
  
  // Progress tracking
  totalTasks: integer("total_tasks").default(0),
  completedTasks: integer("completed_tasks").default(0),
  totalSubtasks: integer("total_subtasks").default(0),
  completedSubtasks: integer("completed_subtasks").default(0),
  
  // Metadata
  estimatedDuration: text("estimated_duration"), // e.g., "2h", "1d"
  actualDuration: integer("actual_duration_minutes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  // Partial unique index: page_name must be unique among non-deleted records
  uniquePageNameWhenNotDeleted: index("creations_page_name_unique_when_not_deleted")
    .on(table.pageName)
    .where(sql`deleted_at IS NULL`),
}));

export const creationTasks = pgTable("creation_tasks", {
  id: serial("id").primaryKey(),
  creationId: integer("creation_id").notNull().references(() => creations.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default(TaskStatus.PENDING),
  orderIndex: integer("order_index").notNull(), // For task ordering
  
  // Task details
  category: text("category").notNull(), // e.g., 'setup', 'frontend', 'backend', 'styling', 'testing'
  estimatedDuration: text("estimated_duration"), // e.g., "30m", "2h"
  actualDuration: integer("actual_duration_minutes"),
  
  // Progress tracking
  totalSubtasks: integer("total_subtasks").default(0),
  completedSubtasks: integer("completed_subtasks").default(0),
  
  // Gemini execution data
  geminiPrompt: text("gemini_prompt"),
  geminiResponse: text("gemini_response"),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const creationSubtasks = pgTable("creation_subtasks", {
  id: serial("id").primaryKey(),
  creationId: integer("creation_id").notNull().references(() => creations.id, { onDelete: 'cascade' }),
  taskId: integer("task_id").notNull().references(() => creationTasks.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default(TaskStatus.PENDING),
  orderIndex: integer("order_index").notNull(), // For subtask ordering within task
  
  // Subtask details
  filesPaths: jsonb("files_paths"), // Array of file paths this subtask will modify/create
  estimatedDuration: text("estimated_duration"), // e.g., "15m", "45m"
  actualDuration: integer("actual_duration_minutes"),
  
  // Gemini execution data
  geminiPrompt: text("gemini_prompt"),
  geminiResponse: text("gemini_response"),
  filesModified: jsonb("files_modified"), // Array of actual files modified
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

// Relations for creations
export const creationsRelations = relations(creations, ({ one, many }) => ({
  user: one(users, {
    fields: [creations.userId],
    references: [users.id],
  }),
  tasks: many(creationTasks),
  currentTask: one(creationTasks, {
    fields: [creations.currentTaskId],
    references: [creationTasks.id],
  }),
}));

export const creationTasksRelations = relations(creationTasks, ({ one, many }) => ({
  creation: one(creations, {
    fields: [creationTasks.creationId],
    references: [creations.id],
  }),
  subtasks: many(creationSubtasks),
}));

export const creationSubtasksRelations = relations(creationSubtasks, ({ one }) => ({
  creation: one(creations, {
    fields: [creationSubtasks.creationId],
    references: [creations.id],
  }),
  task: one(creationTasks, {
    fields: [creationSubtasks.taskId],
    references: [creationTasks.id],
  }),
}));

// Schemas for creations
export const insertCreationSchema = createInsertSchema(creations)
  .pick({
    title: true,
    description: true,
    pageName: true,
    techStack: true,
    estimatedDuration: true,
  })
  .extend({
    title: z.string().min(1, "Title is required").max(100, "Title too long"),
    description: z.string().min(10, "Please provide a detailed description").max(2000, "Description too long"),
    pageName: z.string()
      .min(3, "Page name must be at least 3 characters")
      .max(50, "Page name too long")
      .regex(/^[a-z0-9-]+$/, "Page name can only contain lowercase letters, numbers, and hyphens")
      .optional(),
    techStack: z.array(z.string()).optional(),
    estimatedDuration: z.string().optional(),
  });

export const insertCreationTaskSchema = createInsertSchema(creationTasks)
  .pick({
    title: true,
    description: true,
    category: true,
    orderIndex: true,
    estimatedDuration: true,
  })
  .extend({
    title: z.string().min(1, "Task title is required"),
    description: z.string().min(1, "Task description is required"),
    category: z.string().min(1, "Category is required"),
    orderIndex: z.number().min(0),
    estimatedDuration: z.string().optional(),
  });

export const insertCreationSubtaskSchema = createInsertSchema(creationSubtasks)
  .pick({
    title: true,
    description: true,
    orderIndex: true,
    filesPaths: true,
    estimatedDuration: true,
  })
  .extend({
    title: z.string().min(1, "Subtask title is required"),
    description: z.string().min(1, "Subtask description is required"),
    orderIndex: z.number().min(0),
    filesPaths: z.array(z.string()).optional(),
    estimatedDuration: z.string().optional(),
  });

// Types
export type Creation = typeof creations.$inferSelect;
export type InsertCreation = z.infer<typeof insertCreationSchema>;
export type CreationTask = typeof creationTasks.$inferSelect;
export type InsertCreationTask = z.infer<typeof insertCreationTaskSchema>;
export type CreationSubtask = typeof creationSubtasks.$inferSelect;
export type InsertCreationSubtask = z.infer<typeof insertCreationSubtaskSchema>;

// ---> NEW: External Services Tables
export const externalServices = pgTable("external_services", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceName: text("service_name").notNull(),
  serviceSlug: text("service_slug").notNull().unique(), // Globally unique for URL
  accessTokenHash: text("access_token_hash").notNull(), // Store hashed token
  isActive: boolean("is_active").notNull().default(true),
  rateLimit: integer("rate_limit").notNull().default(100), // Requests per hour
  lastUsedAt: timestamp("last_used_at"),
  metadata: jsonb("metadata"), // Additional service configuration
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Ensure service name is unique per user
  uniqueUserService: index("unique_user_service").on(table.userId, table.serviceName),
}));

export const externalServiceMessages = pgTable("external_service_messages", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => externalServices.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageContent: text("message_content").notNull(),
  deliveryStatus: text("delivery_status").notNull().default('pending'), // 'pending', 'sent', 'failed'
  deliveryMethod: text("delivery_method").notNull().default('all'), // 'text', 'whatsapp', 'email', 'all'
  errorMessage: text("error_message"), // Store error if delivery failed
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations for external services
export const externalServicesRelations = relations(externalServices, ({ one, many }) => ({
  user: one(users, {
    fields: [externalServices.userId],
    references: [users.id],
  }),
  messages: many(externalServiceMessages),
}));

export const externalServiceMessagesRelations = relations(externalServiceMessages, ({ one }) => ({
  service: one(externalServices, {
    fields: [externalServiceMessages.serviceId],
    references: [externalServices.id],
  }),
  user: one(users, {
    fields: [externalServiceMessages.userId],
    references: [users.id],
  }),
}));

// Schemas for external services
export const insertExternalServiceSchema = createInsertSchema(externalServices)
  .pick({
    serviceName: true,
    rateLimit: true,
    metadata: true,
  })
  .extend({
    serviceName: z.string().min(1, "Service name is required").max(100, "Service name too long"),
    rateLimit: z.number().min(1).max(1000).default(100),
    metadata: z.record(z.any()).optional(),
  });

export const updateExternalServiceSchema = z.object({
  serviceName: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  rateLimit: z.number().min(1).max(1000).optional(),
  metadata: z.record(z.any()).optional(),
});

// Types
export type ExternalService = typeof externalServices.$inferSelect;
export type InsertExternalService = z.infer<typeof insertExternalServiceSchema>;
export type UpdateExternalService = z.infer<typeof updateExternalServiceSchema>;
export type ExternalServiceMessage = typeof externalServiceMessages.$inferSelect;
// <--- END NEW