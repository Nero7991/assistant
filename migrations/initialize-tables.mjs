/**
 * This script initializes the database tables for the Kona assistant application.
 * It creates all the necessary tables based on the schema definition.
 */

import { Pool } from '@neondatabase/serverless';

// Get the database URL from environment variables
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Create a pool connection
const pool = new Pool({ connectionString: dbUrl });

// Define the SQL statements to create the required tables
const sqlStatements = [
  // Daily schedules table
  `CREATE TABLE IF NOT EXISTS daily_schedules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    original_content TEXT NOT NULL,
    formatted_schedule JSONB,
    confirmed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  
  // Schedule items table
  `CREATE TABLE IF NOT EXISTS schedule_items (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL,
    task_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_schedule_id FOREIGN KEY (schedule_id) REFERENCES daily_schedules(id) ON DELETE CASCADE
  )`,
  
  // Schedule revisions table
  `CREATE TABLE IF NOT EXISTS schedule_revisions (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL,
    revision_type TEXT NOT NULL,
    changes JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_schedule_id FOREIGN KEY (schedule_id) REFERENCES daily_schedules(id) ON DELETE CASCADE
  )`
];

async function createTables() {
  console.log('Connecting to database with URL:', dbUrl.substring(0, 30) + '...');
  
  try {
    // Execute each SQL statement
    for (const sql of sqlStatements) {
      console.log(`Executing: ${sql.substring(0, 50)}...`);
      await pool.query(sql);
      console.log('SQL statement executed successfully.');
    }
    
    console.log('All tables created successfully!');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    // Close the pool connection
    await pool.end();
    console.log('Database connection closed.');
  }
}

// Run the function
createTables();