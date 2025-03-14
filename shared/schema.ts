import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  phoneNumber: text("phone_number"),
  email: text("email"),
  contactPreference: text("contact_preference").notNull().default('email'),
  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
  isEmailVerified: boolean("is_email_verified").notNull().default(false),
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
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'email' or 'phone'
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).extend({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phoneNumber: z.string().regex(/^\+\d{1,3}\d{10}$/, "Please enter a valid phone number with country code (e.g. +1234567890)").optional(),
  email: z.string().email("Please enter a valid email address").optional(),
  contactPreference: z.enum(["whatsapp", "imessage", "email"], {
    required_error: "Please select a contact preference",
  }),
});

export const insertGoalSchema = createInsertSchema(goals).pick({
  title: true,
  description: true,
  deadline: true,
});

export const insertCheckInSchema = createInsertSchema(checkIns).pick({
  content: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;