/**
 * Test script to directly test database functionality
 * by running SQL queries directly against the database
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

async function runTests() {
  try {
    console.log('Connecting to database...');
    
    // Get all subtasks directly from the database
    console.log('\n=== Getting all subtasks directly from the database ===');
    const subtasksResult = await pool.query('SELECT * FROM subtasks');
    const allSubtasks = subtasksResult.rows;
    console.log(`Found ${allSubtasks.length} subtasks in the database`);
    
    if (allSubtasks.length > 0) {
      console.log('First subtask:', allSubtasks[0]);
      
      // Get the task that the first subtask belongs to
      const taskId = allSubtasks[0].task_id;
      const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      const task = taskResult.rows[0];
      console.log(`This subtask belongs to task: ${task?.title || 'Unknown'}`);
      
      // Check if schedule items table has the subtask_id column
      console.log('\n=== Checking if schedule_items table has subtask_id column ===');
      try {
        const columnCheckResult = await pool.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'schedule_items' AND column_name = 'subtask_id'
        `);
        
        if (columnCheckResult.rows.length > 0) {
          console.log('schedule_items table has subtask_id column ✓');
          
          // Get any schedule items with subtask_id
          const scheduleItemsResult = await pool.query(`
            SELECT * FROM schedule_items WHERE subtask_id IS NOT NULL LIMIT 5
          `);
          
          console.log(`Found ${scheduleItemsResult.rows.length} schedule items with subtask_id`);
          if (scheduleItemsResult.rows.length > 0) {
            console.log('Example schedule item with subtask_id:', scheduleItemsResult.rows[0]);
          }
        } else {
          console.log('schedule_items table does NOT have subtask_id column ✗');
        }
      } catch (error) {
        console.error('Error checking subtask_id column:', error.message);
      }
      
    } else {
      console.log('No subtasks found in the database');
      
      // If there are no subtasks, check if there are tasks
      const tasksResult = await pool.query('SELECT * FROM tasks');
      const allTasks = tasksResult.rows;
      console.log(`Found ${allTasks.length} tasks in the database`);
      
      if (allTasks.length > 0) {
        console.log('First task:', allTasks[0]);
        
        // Create a test subtask for the first task
        console.log('\n=== Creating a test subtask ===');
        const taskId = allTasks[0].id;
        const userId = allTasks[0].user_id;
        
        const insertResult = await pool.query(`
          INSERT INTO subtasks (
            task_id, title, description, status, estimated_duration, 
            deadline, scheduled_time, recurrence_pattern, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          ) RETURNING *
        `, [
          taskId,
          "Test subtask created by script",
          "This is a test subtask created by the test script",
          "active",
          "30 minutes",
          null,
          null,
          null,
          new Date(),
          new Date()
        ]);
        
        console.log('Created test subtask:', insertResult.rows[0]);
        
        // Now fetch again to confirm
        const updatedSubtasksResult = await pool.query('SELECT * FROM subtasks');
        console.log(`Now have ${updatedSubtasksResult.rows.length} subtasks in the database`);
      }
    }
    
    // Check API endpoint responses
    console.log('\n=== Testing the new subtask endpoints ===');
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('http://localhost:5000/api/subtasks/all', {
        headers: { 'Cookie': 'connect.sid=s%3AJYh3O2OhHZZZLzYLz6q0ajEjTkHaKANJ.%2B6t7wixS94sJUfLOYdYo8l5Xo1YHsS3QfPWACQN72vM' }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`API endpoint returned ${data.length} subtasks`);
        if (data.length > 0) {
          console.log('First subtask from API:', data[0]);
        }
      } else {
        console.log(`API endpoint returned status ${response.status}`);
      }
    } catch (error) {
      console.error('Error testing API endpoint:', error.message);
    }
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    // Close the pool connection
    await pool.end();
    console.log('Database connection closed.');
  }
}

// Run the tests
runTests();