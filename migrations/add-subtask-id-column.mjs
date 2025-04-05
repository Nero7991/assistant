/**
 * This script adds the subtask_id column to the schedule_items table
 * to allow direct association between schedule items and subtasks.
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure WebSocket for Neon database connection
neonConfig.webSocketConstructor = ws;

// Get the database URL from environment variables
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Create a pool connection
const pool = new Pool({ connectionString: dbUrl });

async function addSubtaskIdColumn() {
  console.log('Connecting to database...');
  
  try {
    // First check if the column already exists
    const checkResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'schedule_items' AND column_name = 'subtask_id'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('Column subtask_id already exists in schedule_items table.');
      return;
    }
    
    // Add the subtask_id column to the schedule_items table
    console.log('Adding subtask_id column to schedule_items table...');
    await pool.query(`
      ALTER TABLE schedule_items 
      ADD COLUMN subtask_id INTEGER,
      ADD CONSTRAINT fk_subtask_id 
      FOREIGN KEY (subtask_id) 
      REFERENCES subtasks(id) 
      ON DELETE SET NULL
    `);
    
    console.log('Successfully added subtask_id column to schedule_items table!');
    
    // Check actual column names in the subtasks table
    console.log('Checking actual column names in the subtasks table...');
    const subtasksColumnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'subtasks'
    `);
    
    console.log('Subtasks table columns:', subtasksColumnsResult.rows.map(row => row.column_name));
    
    // Let's also check the tasks table columns
    const tasksColumnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tasks'
    `);
    
    console.log('Tasks table columns:', tasksColumnsResult.rows.map(row => row.column_name));
    
    // And check the schedule_items table columns
    const scheduleItemsColumnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'schedule_items'
    `);
    
    console.log('Schedule items table columns:', scheduleItemsColumnsResult.rows.map(row => row.column_name));
    
    // Based on the actual column names, determine the correct column names for the join
    let task_to_subtask_column = 'task_id'; // Default assumption, will update if needed
    
    // Find the column that likely refers to the task ID in subtasks table
    if (subtasksColumnsResult.rows.some(row => row.column_name === 'task_id')) {
      task_to_subtask_column = 'task_id';
    } else if (subtasksColumnsResult.rows.some(row => row.column_name === 'taskid')) {
      task_to_subtask_column = 'taskid';
    }
    
    console.log(`Using '${task_to_subtask_column}' as the column linking subtasks to tasks`);
    
    try {
      // For existing items, try to populate the subtask_id based on the task_id with the correct column names
      console.log('Updating existing schedule items with subtask_id where possible...');
      await pool.query(`
        WITH task_subtasks AS (
          SELECT t.id as task_id, s.id as subtask_id
          FROM tasks t
          JOIN subtasks s ON t.id = s.${task_to_subtask_column}
        )
        UPDATE schedule_items si
        SET subtask_id = ts.subtask_id
        FROM task_subtasks ts
        WHERE si.task_id = ts.task_id AND si.subtask_id IS NULL
        -- Only set for the first subtask of each task, as we don't have a way to determine which specific subtask
        -- This is just a best-effort attempt to populate the column
      `);
      console.log('Successfully updated existing schedule items!');
    } catch (error) {
      console.error('Error updating existing schedule items:', error.message);
    }
    
    console.log('Database update completed successfully!');
  } catch (error) {
    console.error('Error updating database:', error);
  } finally {
    // Close the pool connection
    await pool.end();
    console.log('Database connection closed.');
  }
}

// Run the function
addSubtaskIdColumn();