/**
 * Test Script for Soft Deletion Functionality
 * 
 * This script tests the soft deletion functionality for both schedule items
 * and message schedules. It verifies that deletion works properly by:
 * 
 * 1. Creating a new schedule item and message schedule
 * 2. Confirming they were created successfully
 * 3. Soft-deleting them using the DELETE API endpoints
 * 4. Verifying they no longer appear in API results
 * 5. Directly querying the database to confirm the deletedAt timestamp was set
 * 
 * To run this script: node test-soft-deletion.js
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
  // Use the current host and port from the environment
  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || '3000';
  const url = `http://${host}:${port}${endpoint}`;
  
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

async function testCreateScheduleItem(userId) {
  console.log('\n--- Testing Create Schedule Item ---');
  
  const today = new Date();
  const item = {
    userId: userId,
    title: "Test item for soft deletion",
    description: "This item will be soft-deleted",
    date: today.toISOString(),
    startTime: "14:00",
    endTime: "15:00",
    status: "scheduled"
  };
  
  try {
    const result = await makeRequest('/api/schedule-management/items', 'POST', item);
    console.log('Created schedule item:', result);
    return result;
  } catch (error) {
    console.error('Failed to create schedule item:', error);
    throw error;
  }
}

async function testCreateMessageSchedule(userId) {
  console.log('\n--- Testing Create Message Schedule ---');
  
  // Schedule for 15 minutes from now
  const scheduledTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  
  const messageData = {
    userId,
    type: "follow_up",
    tone: "encouraging",
    title: "Test message for soft deletion",
    scheduledFor: scheduledTime
  };
  
  try {
    const result = await makeRequest('/api/schedule-management/messages', 'POST', messageData);
    console.log('Created message schedule:', result);
    return result;
  } catch (error) {
    console.error('Failed to create message schedule:', error);
    throw error;
  }
}

async function testSoftDeleteScheduleItem(item) {
  console.log('\n--- Testing Schedule Item Soft Deletion ---');
  
  try {
    // First, verify item exists in the database
    const beforeDelete = await checkDatabaseColumn('schedule_items', item.id, 'deleted_at');
    console.log(`Before deletion, schedule item ${item.id} deleted_at = ${beforeDelete.value}`);
    
    // Perform the soft delete
    const result = await makeRequest(`/api/schedule-management/items/${item.id}`, 'DELETE');
    console.log('Soft delete result:', result);
    
    // Check if the item still appears in API results
    const today = new Date().toISOString().split('T')[0];
    const items = await makeRequest(`/api/schedule-management/items?userId=${item.userId}&date=${today}`, 'GET');
    const stillVisible = items.some(i => i.id === item.id);
    
    if (stillVisible) {
      console.log(`Warning: Item ${item.id} still appears in API results after deletion`);
    } else {
      console.log(`Success: Item ${item.id} no longer appears in API results (as expected)`);
    }
    
    // Direct database check to confirm the deletedAt timestamp was set
    const afterDelete = await checkDatabaseColumn('schedule_items', item.id, 'deleted_at');
    console.log(`After deletion, schedule item ${item.id} deleted_at = ${afterDelete.value}`);
    
    if (afterDelete.value) {
      console.log(`Confirmed: deletedAt timestamp was set to ${afterDelete.value}`);
      return { success: true, deletedAt: afterDelete.value };
    } else {
      console.log('Warning: deletedAt timestamp was not set correctly');
      return { success: false };
    }
  } catch (error) {
    console.error('Error in soft delete test:', error);
    throw error;
  }
}

async function testSoftDeleteMessageSchedule(message) {
  console.log('\n--- Testing Message Schedule Soft Deletion ---');
  
  try {
    // First, verify message exists in the database
    const beforeDelete = await checkDatabaseColumn('message_schedules', message.id, 'deleted_at');
    console.log(`Before deletion, message ${message.id} deleted_at = ${beforeDelete.value}`);
    
    // Perform the soft delete
    const result = await makeRequest(`/api/schedule-management/messages/${message.id}`, 'DELETE');
    console.log('Soft delete result:', result);
    
    // Check if the message still appears in API results
    const messages = await makeRequest(`/api/schedule-management/messages?userId=${message.userId}`, 'GET');
    const stillVisible = messages.some(m => m.id === message.id);
    
    if (stillVisible) {
      console.log(`Warning: Message ${message.id} still appears in API results after deletion`);
    } else {
      console.log(`Success: Message ${message.id} no longer appears in API results (as expected)`);
    }
    
    // Direct database check to confirm the deletedAt timestamp was set
    const afterDelete = await checkDatabaseColumn('message_schedules', message.id, 'deleted_at');
    console.log(`After deletion, message ${message.id} deleted_at = ${afterDelete.value}`);
    
    if (afterDelete.value) {
      console.log(`Confirmed: deletedAt timestamp was set to ${afterDelete.value}`);
      return { success: true, deletedAt: afterDelete.value };
    } else {
      console.log('Warning: deletedAt timestamp was not set correctly');
      return { success: false };
    }
  } catch (error) {
    console.error('Error in soft delete test:', error);
    throw error;
  }
}

async function runTests() {
  try {
    console.log('Starting soft deletion tests');
    
    // Login first to get session
    const user = await login();
    const userId = user.id;
    
    // Test schedule item soft deletion
    const scheduleItem = await testCreateScheduleItem(userId);
    const scheduleItemDeletionResult = await testSoftDeleteScheduleItem(scheduleItem);
    
    // Test message schedule soft deletion
    const messageSchedule = await testCreateMessageSchedule(userId);
    const messageScheduleDeletionResult = await testSoftDeleteMessageSchedule(messageSchedule);
    
    // Report overall results
    console.log('\n=== TEST RESULTS ===');
    console.log('Schedule Item Soft Deletion:', 
      scheduleItemDeletionResult.success ? 'SUCCESS ✅' : 'FAILED ❌');
    
    console.log('Message Schedule Soft Deletion:', 
      messageScheduleDeletionResult.success ? 'SUCCESS ✅' : 'FAILED ❌');
    
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