/**
 * Test Script for Soft Deletion Functionality of Tasks and Subtasks
 * 
 * This script tests the soft deletion functionality for tasks and subtasks.
 * It verifies that deletion works properly by:
 * 
 * 1. Creating a new task and subtask
 * 2. Confirming they were created successfully
 * 3. Soft-deleting them using the DELETE API endpoints
 * 4. Verifying they no longer appear in API results
 * 5. Directly querying the database to confirm the deletedAt timestamp was set
 * 
 * To run this script: node test-soft-deletion-tasks.js
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'pg';
const { Pool } = pkg;

// Use pool from env vars
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Get current file directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store cookies between requests
let cookies = '';
const cookiesPath = path.resolve(__dirname, 'cookies.txt');
try {
  if (fs.existsSync(cookiesPath)) {
    cookies = fs.readFileSync(cookiesPath, 'utf8');
  }
} catch (err) {
  console.error('Error reading cookies:', err);
}

function saveCookies(response) {
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    cookies = setCookieHeader;
    fs.writeFileSync(cookiesPath, cookies);
  }
}

async function makeRequest(endpoint, method, body = null) {
  // Use the Replit URL to make requests
  const url = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co${endpoint}`;
  
  console.log(`Making ${method} request to ${url}`);
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Only add cookie header if we have cookies
  if (cookies) {
    options.headers.Cookie = cookies;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    saveCookies(response);

    // Handle responses that might not be JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return data;
    } else {
      const text = await response.text();
      try {
        // Try to parse it as JSON anyway in case the content-type is wrong
        return JSON.parse(text);
      } catch (e) {
        // If it's not JSON, just return the text
        return text;
      }
    }
  } catch (error) {
    console.error(`Error making request to ${url}:`, error);
    throw error;
  }
}

async function login() {
  console.log('Logging in...');
  try {
    const response = await makeRequest('/api/login', 'POST', {
      username: 'orencollaco',
      password: '112233',
    });
    console.log('Login response:', response);
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

async function checkDatabaseColumn(table, id, field) {
  try {
    const result = await pool.query(
      `SELECT ${field} FROM ${table} WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return { exists: false, value: null };
    }
    
    return { exists: true, value: result.rows[0][field] };
  } catch (error) {
    console.error(`Error querying ${field} from ${table}:`, error);
    return { exists: false, error: error.message };
  }
}

async function testCreateTask(userId) {
  console.log('\n--- Testing Create Task ---');
  
  const task = {
    title: "Test task for soft deletion",
    description: "This task will be soft-deleted",
    taskType: "daily",
    priority: 3,
    userId: userId
  };
  
  try {
    const result = await makeRequest('/api/tasks', 'POST', task);
    console.log('Created task:', result);
    return result;
  } catch (error) {
    console.error('Failed to create task:', error);
    throw error;
  }
}

async function testCreateSubtask(taskId) {
  console.log('\n--- Testing Create Subtask ---');
  
  const subtask = {
    title: "Test subtask for soft deletion",
    description: "This subtask will be soft-deleted"
  };
  
  try {
    const result = await makeRequest(`/api/tasks/${taskId}/subtasks`, 'POST', subtask);
    console.log('Created subtask:', result);
    return result;
  } catch (error) {
    console.error('Failed to create subtask:', error);
    throw error;
  }
}

async function testSoftDeleteTask(task) {
  console.log('\n--- Testing Task Soft Deletion ---');
  
  try {
    // First, verify task exists in the database
    const beforeDelete = await checkDatabaseColumn('tasks', task.id, 'deleted_at');
    console.log(`Before deletion, task ${task.id} deleted_at = ${beforeDelete.value}`);
    
    // Perform the soft delete
    const result = await makeRequest(`/api/tasks/${task.id}`, 'DELETE');
    console.log('Soft delete result:', result);
    
    // Check if the task still appears in API results
    const tasks = await makeRequest(`/api/tasks?userId=${task.userId}`, 'GET');
    const stillVisible = tasks.some(t => t.id === task.id);
    
    if (stillVisible) {
      console.log(`Warning: Task ${task.id} still appears in API results after deletion`);
    } else {
      console.log(`Success: Task ${task.id} no longer appears in API results (as expected)`);
    }
    
    // Direct database check to confirm the deletedAt timestamp was set
    const afterDelete = await checkDatabaseColumn('tasks', task.id, 'deleted_at');
    console.log(`After deletion, task ${task.id} deleted_at = ${afterDelete.value}`);
    
    if (afterDelete.value) {
      console.log(`Confirmed: deletedAt timestamp was set to ${afterDelete.value}`);
      return { success: true, deletedAt: afterDelete.value };
    } else {
      console.log('Warning: deletedAt timestamp was not set correctly');
      return { success: false };
    }
  } catch (error) {
    console.error('Error in soft delete task test:', error);
    throw error;
  }
}

async function testSoftDeleteSubtask(task, subtask) {
  console.log('\n--- Testing Subtask Soft Deletion ---');
  
  try {
    // First, verify subtask exists in the database
    const beforeDelete = await checkDatabaseColumn('subtasks', subtask.id, 'deleted_at');
    console.log(`Before deletion, subtask ${subtask.id} deleted_at = ${beforeDelete.value}`);
    
    // Perform the soft delete
    const result = await makeRequest(`/api/tasks/${task.id}/subtasks/${subtask.id}`, 'DELETE');
    console.log('Soft delete result:', result);
    
    // Check if the subtask still appears in API results
    const subtasks = await makeRequest(`/api/tasks/${task.id}/subtasks`, 'GET');
    const stillVisible = subtasks.some(s => s.id === subtask.id);
    
    if (stillVisible) {
      console.log(`Warning: Subtask ${subtask.id} still appears in API results after deletion`);
    } else {
      console.log(`Success: Subtask ${subtask.id} no longer appears in API results (as expected)`);
    }
    
    // Direct database check to confirm the deletedAt timestamp was set
    const afterDelete = await checkDatabaseColumn('subtasks', subtask.id, 'deleted_at');
    console.log(`After deletion, subtask ${subtask.id} deleted_at = ${afterDelete.value}`);
    
    if (afterDelete.value) {
      console.log(`Confirmed: deletedAt timestamp was set to ${afterDelete.value}`);
      return { success: true, deletedAt: afterDelete.value };
    } else {
      console.log('Warning: deletedAt timestamp was not set correctly');
      return { success: false };
    }
  } catch (error) {
    console.error('Error in soft delete subtask test:', error);
    throw error;
  }
}

async function runTests() {
  try {
    console.log('Starting soft deletion tests for tasks and subtasks');
    
    // Login first to get session
    const user = await login();
    const userId = user.id;
    
    // Test task soft deletion
    const task = await testCreateTask(userId);
    const subtask = await testCreateSubtask(task.id);
    
    // Test soft deletions
    const subtaskDeletionResult = await testSoftDeleteSubtask(task, subtask);
    const taskDeletionResult = await testSoftDeleteTask(task);
    
    // Report overall results
    console.log('\n=== TEST RESULTS ===');
    console.log('Task Soft Deletion:', 
      taskDeletionResult.success ? 'SUCCESS ✅' : 'FAILED ❌');
    
    console.log('Subtask Soft Deletion:', 
      subtaskDeletionResult.success ? 'SUCCESS ✅' : 'FAILED ❌');
    
    // Close database pool when done
    await pool.end();
    
  } catch (error) {
    console.error('Test failed:', error);
    // Ensure pool is closed even if tests fail
    await pool.end();
    process.exit(1);
  }
}

// Run the tests
runTests();