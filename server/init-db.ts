/**
 * Database initialization module
 * This module contains the logic to initialize required database tables
 * if they don't exist yet. It's called during application startup.
 */

import { db } from './db';
import * as schema from '@shared/schema';
import { sql } from 'drizzle-orm';

// List of table creation queries
const tableCreationQueries = [
  // First check if the users table exists
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL PRIMARY KEY,
    "username" TEXT NOT NULL UNIQUE,
    "email" TEXT NOT NULL UNIQUE,
    "password" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT DEFAULT 'America/New_York',
    "wake_time" TEXT DEFAULT '08:00',
    "routine_start_time" TEXT DEFAULT '09:30',
    "sleep_time" TEXT DEFAULT '23:00',
    "preferred_model" TEXT DEFAULT 'gpt-4o',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Contact Verifications table
  `CREATE TABLE IF NOT EXISTS "contact_verifications" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Goals table
  `CREATE TABLE IF NOT EXISTS "goals" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "target_date" TIMESTAMP,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Check-ins table
  `CREATE TABLE IF NOT EXISTS "check_ins" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "mood" INTEGER NOT NULL,
    "energy" INTEGER NOT NULL,
    "focus" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Known User Facts table
  `CREATE TABLE IF NOT EXISTS "known_user_facts" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "fact_type" TEXT NOT NULL,
    "fact_value" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Tasks table
  `CREATE TABLE IF NOT EXISTS "tasks" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "task_type" TEXT NOT NULL,
    "due_date" TIMESTAMP,
    "scheduled_time" TEXT,
    "specific_date" TIMESTAMP,
    "recurrence_type" TEXT,
    "recurrence_config" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "estimated_duration" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Subtasks table
  `CREATE TABLE IF NOT EXISTS "subtasks" (
    "id" SERIAL PRIMARY KEY,
    "task_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "subtasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE
  )`,

  // Messaging Preferences table
  `CREATE TABLE IF NOT EXISTS "messaging_preferences" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL UNIQUE,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "morning_check_in" TEXT,
    "afternoon_check_in" TEXT,
    "evening_check_in" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Message History table
  `CREATE TABLE IF NOT EXISTS "message_history" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "message_type" TEXT DEFAULT 'chat',
    "metadata" JSONB
  )`,

  // Message Schedules table
  `CREATE TABLE IF NOT EXISTS "message_schedules" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "content" TEXT,
    "scheduled_for" TIMESTAMP NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP,
    "message_type" TEXT NOT NULL DEFAULT 'follow_up',
    "context" JSONB,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Daily Schedules table
  `CREATE TABLE IF NOT EXISTS "daily_schedules" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "date" TIMESTAMP NOT NULL DEFAULT NOW(),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "original_content" TEXT NOT NULL,
    "formatted_schedule" JSONB,
    "confirmed_at" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  
  // Schedule Items table
  `CREATE TABLE IF NOT EXISTS "schedule_items" (
    "id" SERIAL PRIMARY KEY,
    "schedule_id" INTEGER NOT NULL,
    "task_id" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notification_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "schedule_items_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "daily_schedules"("id") ON DELETE CASCADE
  )`,
  
  // Schedule Revisions table
  `CREATE TABLE IF NOT EXISTS "schedule_revisions" (
    "id" SERIAL PRIMARY KEY,
    "schedule_id" INTEGER NOT NULL,
    "revision_type" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "schedule_revisions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "daily_schedules"("id") ON DELETE CASCADE
  )`
];

/**
 * Initialize database tables if they don't exist
 */
export async function initDatabase() {
  try {
    console.log("Starting database initialization...");
    
    // Execute each table creation query in sequence
    for (const query of tableCreationQueries) {
      try {
        await db.execute(sql.raw(query));
        console.log("Successfully executed table creation query:", query.split('\n')[0]);
      } catch (error) {
        console.error("Error executing table creation query:", error);
        // Continue with other queries even if one fails
      }
    }
    
    // Verify that required tables exist
    try {
      const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('daily_schedules', 'schedule_items', 'schedule_revisions')
      `;
      
      const result = await db.execute(sql.raw(tablesQuery));
      const tables = result.rows.map((row: any) => row.table_name);
      
      console.log("Verified existing tables:", tables);
      
      if (!tables.includes('daily_schedules')) {
        console.error("WARNING: daily_schedules table was not successfully created!");
      }
      
      if (!tables.includes('schedule_items')) {
        console.error("WARNING: schedule_items table was not successfully created!");
      }
      
      if (!tables.includes('schedule_revisions')) {
        console.error("WARNING: schedule_revisions table was not successfully created!");
      }
    } catch (error) {
      console.error("Error verifying tables:", error);
    }
    
    console.log("Database initialization complete");
    return true;
  } catch (error) {
    console.error("Database initialization failed:", error);
    return false;
  }
}