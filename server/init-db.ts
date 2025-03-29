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
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP NOT NULL DEFAULT NOW(),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "originalContent" TEXT NOT NULL,
    "formattedSchedule" JSONB,
    "confirmedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  
  // Schedule Items table
  `CREATE TABLE IF NOT EXISTS "schedule_items" (
    "id" SERIAL PRIMARY KEY,
    "scheduleId" INTEGER NOT NULL,
    "taskId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "schedule_items_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "daily_schedules"("id") ON DELETE CASCADE
  )`,
  
  // Schedule Revisions table
  `CREATE TABLE IF NOT EXISTS "schedule_revisions" (
    "id" SERIAL PRIMARY KEY,
    "scheduleId" INTEGER NOT NULL,
    "revisionType" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "schedule_revisions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "daily_schedules"("id") ON DELETE CASCADE
  )`
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