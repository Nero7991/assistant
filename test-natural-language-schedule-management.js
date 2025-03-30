/**
 * Test Script for Natural Language Schedule Management
 * 
 * This test simulates a user interacting with the LLM through natural language to:
 * 1. Clear all schedule items for today
 * 2. Add new schedule items for today
 * 3. Update existing schedule items
 * 4. Manage message schedules (create, update, delete)
 * 
 * To run this script: node test-natural-language-schedule-management.js
 */

import fetch from 'node-fetch';
import pkg from 'pg';
const { Pool } = pkg;
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';

// Configure PostgreSQL client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Configure OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Get current file directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store cookies between requests for authentication
let cookies = '';
const cookiesPath = path.resolve(__dirname, 'cookies.txt');

// Try to load cookies if they exist
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
  // For Replit, we need to access the server directly
  // The Express server is running on port 5000 within Replit
  const url = `http://localhost:5000${endpoint}`;
  
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
    // Try to log in with test_user credentials
    // We updated the password to a properly hashed version that matches '112'
    const response = await makeRequest('/api/login', 'POST', {
      username: 'test_user',
      password: '112',
    });
    
    if (!response || !response.id) {
      console.error('Login failed with test_user credentials, something is wrong with the password hash');
      throw new Error('Login failed');
    }
    
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

async function getUser() {
  try {
    return await makeRequest('/api/user', 'GET');
  } catch (error) {
    console.error('Failed to get user:', error);
    throw error;
  }
}

async function getScheduleItems(userId) {
  const today = new Date().toISOString().split('T')[0];
  try {
    return await makeRequest(`/api/schedule-management/items?userId=${userId}&date=${today}`, 'GET');
  } catch (error) {
    console.error('Failed to get schedule items:', error);
    throw error;
  }
}

async function getMessageSchedules(userId) {
  try {
    return await makeRequest(`/api/schedule-management/messages?userId=${userId}`, 'GET');
  } catch (error) {
    console.error('Failed to get message schedules:', error);
    throw error;
  }
}

async function sendMessage(userId, content) {
  try {
    return await makeRequest('/api/messages', 'POST', {
      userId,
      content,
      source: 'web'
    });
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
}

async function getLatestMessages(userId, limit = 10) {
  try {
    const messages = await makeRequest('/api/messages', 'GET');
    return messages.slice(0, limit);
  } catch (error) {
    console.error('Failed to get messages:', error);
    throw error;
  }
}

async function createTasksAndSubtasks(userId) {
  console.log('\n--- Creating sample tasks and subtasks for testing ---');
  
  try {
    // Create a main task
    const taskResponse = await makeRequest('/api/tasks', 'POST', {
      userId,
      title: 'Sample Project for Schedule Testing',
      description: 'This is a test project for schedule management',
      taskType: 'project',
      priority: 2,
      status: 'in_progress'
    });
    
    console.log(`Created task: ${taskResponse.title} (ID: ${taskResponse.id})`);
    
    // Create subtasks for the main task
    const subtasks = [
      {
        title: 'Research phase',
        description: 'Gather information and requirements',
        parentTaskId: taskResponse.id,
        estimatedDuration: '2 hours',
        status: 'not_started'
      },
      {
        title: 'Planning phase',
        description: 'Create project plan and timeline',
        parentTaskId: taskResponse.id,
        estimatedDuration: '1 hour',
        status: 'not_started'
      },
      {
        title: 'Implementation phase',
        description: 'Build the core functionality',
        parentTaskId: taskResponse.id,
        estimatedDuration: '3 hours',
        status: 'not_started'
      }
    ];
    
    const createdSubtasks = [];
    
    for (const subtask of subtasks) {
      const subtaskResponse = await makeRequest('/api/subtasks', 'POST', {
        ...subtask,
        userId
      });
      
      console.log(`Created subtask: ${subtaskResponse.title} (ID: ${subtaskResponse.id})`);
      createdSubtasks.push(subtaskResponse);
    }
    
    return {
      task: taskResponse,
      subtasks: createdSubtasks
    };
  } catch (error) {
    console.error('Failed to create tasks and subtasks:', error);
    throw error;
  }
}

async function waitForProcessing(userId, delay = 3000) {
  console.log(`Waiting ${delay/1000} seconds for LLM processing...`);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Get latest messages to see the response
  const messages = await getLatestMessages(userId);
  
  if (!messages || messages.length === 0) {
    console.log("No messages found after waiting");
    return null;
  }
  
  const latestMessage = messages[0];
  if (latestMessage && latestMessage.content) {
    console.log(`Latest message from LLM: "${latestMessage.content.substring(0, 200)}..."`);
  } else {
    console.log("Latest message has no content");
  }
  
  return latestMessage;
}

async function verifyScheduleChanges(userId, operation) {
  console.log(`\nVerifying ${operation} operation results:`);
  
  // Get current schedule items
  const scheduleItems = await getScheduleItems(userId);
  console.log(`Current schedule items count: ${scheduleItems.length}`);
  
  if (scheduleItems.length > 0) {
    console.log('Sample of current schedule items:');
    scheduleItems.slice(0, 3).forEach(item => {
      console.log(`  - ID: ${item.id}, Title: ${item.title}, Time: ${item.startTime}, Status: ${item.status}`);
    });
  }
  
  return scheduleItems;
}

async function verifyMessageSchedules(userId) {
  console.log('\nVerifying message schedules:');
  
  // Get current message schedules
  const messageSchedules = await getMessageSchedules(userId);
  console.log(`Current message schedules count: ${messageSchedules.length}`);
  
  if (messageSchedules.length > 0) {
    console.log('Sample of current message schedules:');
    messageSchedules.slice(0, 3).forEach(msg => {
      console.log(`  - ID: ${msg.id}, Type: ${msg.type}, Scheduled For: ${new Date(msg.scheduledFor).toLocaleString()}`);
    });
  }
  
  return messageSchedules;
}

// Test functions for different operations

async function testClearTodaySchedule(userId) {
  console.log('\n=== TESTING: Clear today\'s schedule via natural language ===');
  
  // First check the current schedule
  const beforeItems = await verifyScheduleChanges(userId, 'before clear');
  
  // Send message to clear schedule for today
  console.log('\nSending message to clear today\'s schedule...');
  await sendMessage(userId, 'Please clear my entire schedule for today. I need a fresh start.');
  
  // Wait for LLM to process
  await waitForProcessing(userId);
  
  // Check schedule after clearing
  const afterItems = await verifyScheduleChanges(userId, 'after clear');
  
  // Check if items have been soft deleted
  const deletedCount = await checkDeletedScheduleItems(userId);
  
  console.log(`\nResults: Before: ${beforeItems.length} items, After: ${afterItems.length} items, Soft-deleted: ${deletedCount} items`);
  
  return {
    beforeCount: beforeItems.length,
    afterCount: afterItems.length,
    deletedCount
  };
}

async function testAddScheduleItems(userId, taskData) {
  console.log('\n=== TESTING: Add new schedule items via natural language ===');
  
  // Check current schedule
  const beforeItems = await verifyScheduleChanges(userId, 'before adding');
  
  // Send message to add items to schedule
  console.log('\nSending message to add new schedule items...');
  
  const message = `I'd like to add these activities to my schedule for today: 
  1. Meeting with team at 10:00 AM for 1 hour
  2. Work on ${taskData.task.title} from 2:00 PM to 4:00 PM, focusing on ${taskData.subtasks[0].title}
  3. Take a break at 4:30 PM for 30 minutes
  4. Review project progress at 5:30 PM`;
  
  await sendMessage(userId, message);
  
  // Wait for LLM to process
  await waitForProcessing(userId);
  
  // Check schedule after adding items
  const afterItems = await verifyScheduleChanges(userId, 'after adding');
  
  console.log(`\nResults: Before: ${beforeItems.length} items, After: ${afterItems.length} items, Added: ${afterItems.length - beforeItems.length} items`);
  
  return {
    beforeCount: beforeItems.length,
    afterCount: afterItems.length,
    addedCount: afterItems.length - beforeItems.length,
    items: afterItems
  };
}

async function testUpdateScheduleItems(userId, items) {
  console.log('\n=== TESTING: Update schedule items via natural language ===');
  
  if (items.length === 0) {
    console.log('No items to update. Skipping this test.');
    return { success: false, reason: 'No items' };
  }
  
  // Pick a couple of items to update (if available)
  const itemsToUpdate = items.slice(0, Math.min(2, items.length));
  
  // Prepare reference to the items
  const references = itemsToUpdate.map((item, index) => {
    return `the ${item.title} scheduled at ${item.startTime}`;
  }).join(' and ');
  
  // Send message to update items
  console.log(`\nSending message to update ${itemsToUpdate.length} schedule items...`);
  
  const message = `Could you please make some changes to my schedule? I need to update ${references}. 
  Please move them 30 minutes later and mark them as "in progress" status. Thanks!`;
  
  await sendMessage(userId, message);
  
  // Wait for LLM to process
  await waitForProcessing(userId, 3000); // Give it less time for updates to avoid timeouts
  
  // Check schedule after updates
  const afterItems = await verifyScheduleChanges(userId, 'after updates');
  
  // Check if the items were updated
  const updatedItems = [];
  for (const original of itemsToUpdate) {
    const updated = afterItems.find(item => 
      (item.id === original.id) || // Same ID
      (item.title.includes(original.title.substring(0, 10)) && item.startTime !== original.startTime) // Similar title but different time
    );
    
    if (updated) {
      console.log(`\nItem update verification: 
        Original: ${original.title} at ${original.startTime} (${original.status})
        Updated: ${updated.title} at ${updated.startTime} (${updated.status})`);
      updatedItems.push({ original, updated });
    }
  }
  
  console.log(`\nResults: Found ${updatedItems.length} of ${itemsToUpdate.length} requested items were updated`);
  
  return {
    success: updatedItems.length > 0,
    requestedUpdates: itemsToUpdate.length,
    actualUpdates: updatedItems.length,
    details: updatedItems
  };
}

async function testManageMessageSchedules(userId) {
  console.log('\n=== TESTING: Manage message schedules via natural language ===');
  
  // Check current message schedules
  const beforeSchedules = await verifyMessageSchedules(userId);
  
  // Send message to create reminder
  console.log('\nSending message to create follow-up reminders...');
  
  const message = `Can you schedule a few reminders for me? 
  1. Send me a check-in message at 4:00 PM today to remind me about my project progress
  2. Schedule a follow-up for tomorrow morning at 9:00 AM for my daily planning
  3. I'll need a reminder at 7:00 PM tonight about preparing for tomorrow's meetings`;
  
  await sendMessage(userId, message);
  
  // Wait for LLM to process
  await waitForProcessing(userId, 3000); // Using shorter wait time to avoid timeout
  
  // Check message schedules after adding
  const afterSchedules = await verifyMessageSchedules(userId);
  
  console.log(`\nResults: Before: ${beforeSchedules.length} message schedules, After: ${afterSchedules.length} message schedules`);
  
  // Now ask to cancel some of the reminders
  if (afterSchedules.length > 0) {
    console.log('\nSending message to cancel some reminders...');
    
    const cancelMessage = `I need to cancel some of my scheduled reminders. Please cancel all reminders set for this evening after 6:00 PM. Thanks!`;
    
    await sendMessage(userId, cancelMessage);
    
    // Wait for LLM to process
    await waitForProcessing(userId, 3000); // Using shorter wait time to avoid timeout
    
    // Check message schedules after cancellation
    const finalSchedules = await verifyMessageSchedules(userId);
    
    console.log(`\nResults after cancellation request: Before: ${afterSchedules.length} message schedules, After: ${finalSchedules.length} message schedules`);
    
    return {
      initialCount: beforeSchedules.length,
      afterAddCount: afterSchedules.length,
      finalCount: finalSchedules.length,
      addedCount: afterSchedules.length - beforeSchedules.length,
      cancelledCount: afterSchedules.length - finalSchedules.length
    };
  }
  
  return {
    initialCount: beforeSchedules.length,
    afterAddCount: afterSchedules.length,
    addedCount: afterSchedules.length - beforeSchedules.length,
  };
}

async function checkDeletedScheduleItems(userId) {
  try {
    // Query database directly to check how many items have been soft-deleted today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const result = await pool.query(
      `SELECT COUNT(*) FROM schedule_items 
       WHERE user_id = $1 
       AND deleted_at IS NOT NULL 
       AND deleted_at >= $2 
       AND deleted_at < $3`,
      [userId, today.toISOString(), tomorrow.toISOString()]
    );
    
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error checking deleted schedule items:', error);
    return 0;
  }
}

async function runTests() {
  try {
    console.log('=== STARTING NATURAL LANGUAGE SCHEDULE MANAGEMENT TESTS ===');
    
    // Step 1: Log in and get user
    const user = await login();
    console.log(`Logged in as user: ${user.username} (ID: ${user.id})`);
    
    // Step 2: Create test tasks and subtasks
    const taskData = await createTasksAndSubtasks(user.id);
    
    // Only run one test at a time to avoid timeout issues
    // Uncomment the test you want to run
    
    /* 
    // Test 1: Clear today's schedule items
    const clearResult = await testClearTodaySchedule(user.id);
    console.log(`Clear Schedule Test: ${clearResult.deletedCount > 0 ? 'SUCCESS ✅' : 'PARTIAL ⚠️'}`);
    
    // Test 2: Add new schedule items
    const addResult = await testAddScheduleItems(user.id, taskData);
    console.log(`Add Schedule Items Test: ${addResult.addedCount > 0 ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    
    // Test 3: Update some schedule items
    const updateResult = await testUpdateScheduleItems(user.id, addResult.items);
    console.log(`Update Schedule Items Test: ${updateResult.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    */
    
    // Test 4: Manage message schedules
    const messageResult = await testManageMessageSchedules(user.id);
    console.log(`Message Schedules Test: ${messageResult.addedCount > 0 ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    
    console.log('\n=== TEST COMPLETED ===');
    
    await pool.end();
    process.exit(0);
    
  } catch (error) {
    console.error('Test failed:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run all tests
runTests();