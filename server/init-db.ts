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
  )`,
  
  // Alter users table to add the new time-related columns if they don't exist
  `DO $$ 
  BEGIN 
    BEGIN
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wake_time" TEXT DEFAULT '08:00';
    EXCEPTION
      WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "routine_start_time" TEXT DEFAULT '09:30';
    EXCEPTION
      WHEN duplicate_column THEN NULL;
    END;
    
    BEGIN
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sleep_time" TEXT DEFAULT '23:00';
    EXCEPTION
      WHEN duplicate_column THEN NULL;
    END;
  END $$;`
];

/**
 * Initialize database tables if they don't exist
 */
export async function initDatabase() {
  try {
    console.log("Starting database initialization...");
    
    // Execute each table creation query
    for (const query of tableCreationQueries) {
      try {
        await db.execute(sql.raw(query));
        console.log("Successfully executed table creation query");
      } catch (error) {
        console.error("Error executing table creation query:", error);
        // Continue with other queries even if one fails
      }
    }
    
    console.log("Database initialization complete");
    return true;
  } catch (error) {
    console.error("Database initialization failed:", error);
    return false;
  }
}