/**
 * Test Script for LLM Natural Language Schedule Operations
 * 
 * This script tests the LLM's ability to perform three key operations via natural language:
 * 1. Add new schedule items and message reminders
 * 2. Update/revise existing schedule items and message reminders
 * 3. Soft delete (mark as deleted) schedule items and message reminders
 * 
 * To run this script: node test-schedule-operations.js
 */

import fetch from 'node-fetch';
import fs from 'fs';

// Store cookies between requests for authentication
let cookies = '';

async function makeRequest(endpoint, method, body = null) {
  const url = `http://localhost:5000${endpoint}`;
  console.log(`Making ${method} request to ${url}`);
  
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (cookies) {
    options.headers.Cookie = cookies;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      cookies = setCookieHeader;
    }

    // Handle responses that might not be JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return data;
    } else {
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (e) {
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
      username: 'test_user',
      password: '112',
    });
    
    if (!response || !response.id) {
      console.error('Login failed with test_user credentials');
      throw new Error('Login failed');
    }
    
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

async function getScheduleItems(userId) {
  const today = new Date().toISOString().split('T')[0];
  try {
    return await makeRequest(`/api/schedule-management/items?userId=${userId}&date=${today}`, 'GET');
  } catch (error) {
    console.error('Failed to get schedule items:', error);
    return [];
  }
}

async function getMessageSchedules(userId) {
  try {
    return await makeRequest(`/api/schedule-management/messages?userId=${userId}`, 'GET');
  } catch (error) {
    console.error('Failed to get message schedules:', error);
    return [];
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

async function getLatestMessages(userId, limit = 5) {
  try {
    const messages = await makeRequest('/api/messages', 'GET');
    return messages.slice(0, limit);
  } catch (error) {
    console.error('Failed to get messages:', error);
    return [];
  }
}

async function waitForProcessing(delay = 5000) {
  console.log(`Waiting ${delay/1000} seconds for LLM processing...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function createTaskForTesting(userId) {
  try {
    const task = await makeRequest('/api/tasks', 'POST', {
      userId,
      title: "Test Project",
      description: "A test project for schedule operations",
      status: "not_started",
      estimatedDuration: "2 hours",
      deadline: null,
      scheduledTime: null,
    });
    
    console.log(`Created task: ${task.title} (ID: ${task.id})`);
    return task;
  } catch (error) {
    console.error('Failed to create task:', error);
    throw error;
  }
}

async function createSubtaskForTesting(userId, taskId) {
  try {
    const subtask = await makeRequest('/api/subtasks', 'POST', {
      userId,
      taskId,
      title: "Test Subtask",
      description: "A test subtask for schedule operations",
      status: "not_started",
      estimatedDuration: "1 hour",
      deadline: null,
      scheduledTime: null,
    });
    
    console.log(`Created subtask: ${subtask.title} (ID: ${subtask.id})`);
    return subtask;
  } catch (error) {
    console.error('Failed to create subtask:', error);
    throw error;
  }
}

// Test adding new schedule items via natural language
async function testAddScheduleItems(userId, task, subtask) {
  console.log('\n=== TESTING: Add schedule items via natural language ===');
  
  // Check current schedule
  const beforeItems = await getScheduleItems(userId);
  console.log(`Current schedule items count: ${beforeItems.length}`);
  
  // Send message to add schedule items
  console.log('\nSending message to add schedule items...');
  const message = `I need to schedule some activities for today:
1. Work on Test Project (task ID: ${task.id}) from 2:00 PM to 4:00 PM
2. Complete Test Subtask (subtask ID: ${subtask.id}) at 5:00 PM for 1 hour
3. Take a break at 6:30 PM for 30 minutes`;

  await sendMessage(userId, message);
  
  // Wait for LLM to process
  await waitForProcessing();
  
  // Get the latest messages to see the response
  const messages = await getLatestMessages(userId);
  if (messages.length > 0) {
    console.log(`LLM response: "${messages[0].content.substring(0, 100)}..."`);
  }
  
  // Check schedule after adding
  const afterItems = await getScheduleItems(userId);
  console.log(`Schedule items after adding: ${afterItems.length}`);
  if (afterItems.length > 0) {
    console.log('First few schedule items:');
    afterItems.slice(0, 3).forEach(item => {
      console.log(`- ${item.title} at ${item.startTime}`);
    });
  }
  
  return {
    beforeCount: beforeItems.length,
    afterCount: afterItems.length,
    success: afterItems.length > beforeItems.length,
    items: afterItems
  };
}

// Test adding message reminders via natural language
async function testAddMessageReminders(userId) {
  console.log('\n=== TESTING: Add message reminders via natural language ===');
  
  // Check current message schedules
  const beforeMessages = await getMessageSchedules(userId);
  console.log(`Current message schedule count: ${beforeMessages.length}`);
  
  // Send message to add reminders
  console.log('\nSending message to add reminders...');
  await sendMessage(userId, `Can you send me these reminders today:
1. Reminder to check project progress at 4:30 PM
2. Reminder to prepare for tomorrow's meeting at 7:00 PM
3. Reminder to relax and unwind at 9:00 PM`);
  
  // Wait for LLM to process
  await waitForProcessing();
  
  // Get the latest messages to see the response
  const messages = await getLatestMessages(userId);
  if (messages.length > 0) {
    console.log(`LLM response: "${messages[0].content.substring(0, 100)}..."`);
  }
  
  // Check message schedules after adding
  const afterMessages = await getMessageSchedules(userId);
  console.log(`Message schedules after adding: ${afterMessages.length}`);
  if (afterMessages.length > 0) {
    console.log('First few message schedules:');
    afterMessages.slice(0, 3).forEach(msg => {
      console.log(`- ${msg.type} at ${msg.scheduledTime}: ${msg.content?.substring(0, 30)}...`);
    });
  }
  
  return {
    beforeCount: beforeMessages.length,
    afterCount: afterMessages.length,
    success: afterMessages.length > beforeMessages.length,
    messages: afterMessages
  };
}

// Test updating existing schedule items via natural language
async function testUpdateScheduleItems(userId, scheduleItems) {
  console.log('\n=== TESTING: Update schedule items via natural language ===');
  
  if (scheduleItems.length === 0) {
    console.log('No schedule items to update. Skipping test.');
    return { success: false };
  }
  
  // Send message to update schedule items
  console.log('\nSending message to update schedule items...');
  await sendMessage(userId, `I need to reschedule my activities:
1. Move my work on Test Project to 3:00 PM instead of 2:00 PM
2. Change my break time from 6:30 PM to 7:00 PM`);
  
  // Wait for LLM to process
  await waitForProcessing();
  
  // Get the latest messages to see the response
  const messages = await getLatestMessages(userId);
  if (messages.length > 0) {
    console.log(`LLM response: "${messages[0].content.substring(0, 100)}..."`);
  }
  
  // Check schedule after updating
  const updatedItems = await getScheduleItems(userId);
  console.log(`Schedule items after updating: ${updatedItems.length}`);
  if (updatedItems.length > 0) {
    console.log('Updated schedule items:');
    updatedItems.slice(0, 3).forEach(item => {
      console.log(`- ${item.title} at ${item.startTime}`);
    });
  }
  
  // Check if any items were actually updated (this is a simplistic check)
  const changesDetected = updatedItems.some(item => 
    item.startTime.includes('15:00:00') || // 3:00 PM
    item.startTime.includes('19:00:00')    // 7:00 PM
  );
  
  return {
    success: changesDetected,
    items: updatedItems
  };
}

// Test updating message reminders via natural language
async function testUpdateMessageReminders(userId, messageSchedules) {
  console.log('\n=== TESTING: Update message reminders via natural language ===');
  
  if (messageSchedules.length === 0) {
    console.log('No message schedules to update. Skipping test.');
    return { success: false };
  }
  
  // Send message to update reminders
  console.log('\nSending message to update reminders...');
  await sendMessage(userId, `I need to change my reminders:
1. Move the project progress check reminder to 5:00 PM instead of 4:30 PM
2. Change the wording of my 9:00 PM reminder to "Time to relax and practice mindfulness"`);
  
  // Wait for LLM to process
  await waitForProcessing();
  
  // Get the latest messages to see the response
  const messages = await getLatestMessages(userId);
  if (messages.length > 0) {
    console.log(`LLM response: "${messages[0].content.substring(0, 100)}..."`);
  }
  
  // Check message schedules after updating
  const updatedMessages = await getMessageSchedules(userId);
  console.log(`Message schedules after updating: ${updatedMessages.length}`);
  if (updatedMessages.length > 0) {
    console.log('Updated message schedules:');
    updatedMessages.slice(0, 3).forEach(msg => {
      console.log(`- ${msg.type} at ${msg.scheduledTime}: ${msg.content?.substring(0, 30)}...`);
    });
  }
  
  // Check if any messages were actually updated (this is a simplistic check)
  const changesDetected = updatedMessages.some(msg => 
    msg.scheduledTime.includes('17:00:00') || // 5:00 PM
    (msg.content && msg.content.includes('mindfulness'))
  );
  
  return {
    success: changesDetected,
    messages: updatedMessages
  };
}

// Test deleting schedule items via natural language
async function testDeleteScheduleItems(userId) {
  console.log('\n=== TESTING: Delete schedule items via natural language ===');
  
  // Check current schedule
  const beforeItems = await getScheduleItems(userId);
  console.log(`Current schedule items count: ${beforeItems.length}`);
  
  if (beforeItems.length === 0) {
    console.log('No schedule items to delete. Skipping test.');
    return { success: false };
  }
  
  // Send message to delete schedule items
  console.log('\nSending message to delete schedule items...');
  await sendMessage(userId, `I need to cancel my Test Subtask activity at 5:00 PM completely.`);
  
  // Wait for LLM to process
  await waitForProcessing();
  
  // Get the latest messages to see the response
  const messages = await getLatestMessages(userId);
  if (messages.length > 0) {
    console.log(`LLM response: "${messages[0].content.substring(0, 100)}..."`);
  }
  
  // Check schedule after deleting
  const afterItems = await getScheduleItems(userId);
  console.log(`Schedule items after deletion attempt: ${afterItems.length}`);
  
  // Since we're doing soft deletion, items may still show up in the API
  // So we check for specific item removal
  const subtaskDeleted = !afterItems.some(item => 
    item.title.includes('Test Subtask') && item.startTime.includes('17:00:00')
  );
  
  return {
    beforeCount: beforeItems.length,
    afterCount: afterItems.length,
    success: subtaskDeleted,
    items: afterItems
  };
}

// Test deleting message reminders via natural language
async function testDeleteMessageReminders(userId) {
  console.log('\n=== TESTING: Delete message reminders via natural language ===');
  
  // Check current message schedules
  const beforeMessages = await getMessageSchedules(userId);
  console.log(`Current message schedule count: ${beforeMessages.length}`);
  
  if (beforeMessages.length === 0) {
    console.log('No message schedules to delete. Skipping test.');
    return { success: false };
  }
  
  // Send message to delete reminders
  console.log('\nSending message to delete reminders...');
  await sendMessage(userId, `Please cancel my 7:00 PM reminder about tomorrow's meeting. I no longer need it.`);
  
  // Wait for LLM to process
  await waitForProcessing();
  
  // Get the latest messages to see the response
  const messages = await getLatestMessages(userId);
  if (messages.length > 0) {
    console.log(`LLM response: "${messages[0].content.substring(0, 100)}..."`);
  }
  
  // Check message schedules after deleting
  const afterMessages = await getMessageSchedules(userId);
  console.log(`Message schedules after deletion attempt: ${afterMessages.length}`);
  
  // Check for specific message removal
  const reminderDeleted = !afterMessages.some(msg => 
    msg.scheduledTime.includes('19:00:00') && // 7:00 PM
    msg.content && msg.content.includes('meeting')
  );
  
  return {
    beforeCount: beforeMessages.length,
    afterCount: afterMessages.length,
    success: reminderDeleted,
    messages: afterMessages
  };
}

async function runTests() {
  try {
    console.log('=== STARTING SCHEDULE OPERATIONS TESTS ===');
    
    // Log in and get user
    const user = await login();
    console.log(`Logged in as user: ${user.username} (ID: ${user.id})`);
    
    // Create test task and subtask for reference
    const task = await createTaskForTesting(user.id);
    const subtask = await createSubtaskForTesting(user.id, task.id);
    
    // Run add tests first
    const addItemsResult = await testAddScheduleItems(user.id, task, subtask);
    const addRemindersResult = await testAddMessageReminders(user.id);
    
    // If add tests succeed, run update tests
    let updateItemsResult = { success: false };
    let updateRemindersResult = { success: false };
    if (addItemsResult.success) {
      updateItemsResult = await testUpdateScheduleItems(user.id, addItemsResult.items);
    }
    if (addRemindersResult.success) {
      updateRemindersResult = await testUpdateMessageReminders(user.id, addRemindersResult.messages);
    }
    
    // Finally, run delete tests
    const deleteItemResult = await testDeleteScheduleItems(user.id);
    const deleteReminderResult = await testDeleteMessageReminders(user.id);
    
    // Print summary
    console.log('\n=== TEST SUMMARY ===');
    console.log(`Add schedule items: ${addItemsResult.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`Add message reminders: ${addRemindersResult.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`Update schedule items: ${updateItemsResult.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`Update message reminders: ${updateRemindersResult.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`Delete schedule items: ${deleteItemResult.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`Delete message reminders: ${deleteReminderResult.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    
    console.log('\n=== TESTS COMPLETED ===');
    
  } catch (error) {
    console.error('Tests failed:', error);
  }
}

// Run the tests
runTests();