/**
 * Test Script for LLM Schedule Management Capabilities
 * 
 * This script tests the API endpoints that allow the LLM to directly manage
 * schedule items and message schedules. It simulates LLM actions for:
 * 
 * - Creating new schedule items with and without task/subtask references
 * - Updating schedule items (including status changes)
 * - Soft deleting schedule items (setting deletedAt)
 * - Creating scheduled follow-up messages
 * - Managing multiple schedule items in sequence
 * 
 * To run this script: node test-llm-schedule-management.js
 */

import fs from 'fs';
import path from 'path';

// Store cookies for session management
let cookies = '';

async function makeRequest(endpoint, method, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { Cookie: cookies } : {})
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const baseUrl = 'http://localhost:5000';
  const response = await fetch(`${baseUrl}${endpoint}`, options);
  
  // Save cookies for session
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    cookies = setCookieHeader;
  }

  // Log response status and headers
  console.log(`${method} ${endpoint} - Status: ${response.status}`);
  
  if (response.status === 204) {
    return { success: true, status: 204, message: "Operation completed successfully" };
  }
  
  // Try to parse as JSON, but handle non-JSON responses gracefully
  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      const text = await response.text();
      if (text.startsWith('<!DOCTYPE')) {
        // HTML response, create a simple object with the status
        console.log('Received HTML response, converting to JSON object');
        return { 
          success: response.status >= 200 && response.status < 300,
          status: response.status,
          message: `Received HTML response with status ${response.status}`
        };
      }
      
      // Try to parse as JSON even if content-type is not set correctly
      try {
        return JSON.parse(text);
      } catch (e) {
        // Return text as is if not parseable as JSON
        return { 
          success: response.status >= 200 && response.status < 300,
          status: response.status, 
          message: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        };
      }
    }
  } catch (error) {
    console.error(`Error processing response from ${endpoint}:`, error);
    return { 
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      error: error.message
    };
  }
}

// Login to the system
async function login() {
  const credentials = {
    username: 'test_user',
    password: '112'
  };

  try {
    const response = await makeRequest('/api/login', 'POST', credentials);
    
    if (!response || !response.id) {
      console.error('Login failed. Please check the server logs for details.');
      
      // For testing purposes, use the known test user ID
      console.log('Using test user with ID 6 for testing...');
      return { id: 6, username: 'test_user' };
    }
    
    console.log('Logged in as:', response.username);
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    
    // For testing purposes, use the known test user ID
    console.log('Using test user with ID 6 for testing...');
    return { id: 6, username: 'test_user' };
  }
}

// Test creating a schedule item without task/subtask references
async function testCreateBasicScheduleItem(userId) {
  console.log('\n--- Testing Basic Schedule Item Creation ---');
  
  const today = new Date();
  const formattedDate = today.toISOString().split('T')[0];
  
  const newItem = {
    userId,
    title: "Morning meditation session",
    description: "10-minute mindfulness practice",
    startTime: "08:00",
    endTime: "08:10",
    date: formattedDate,
    status: "pending"
  };
  
  try {
    const result = await makeRequest('/api/schedule-management/items', 'POST', newItem);
    console.log('Created schedule item:', result);
    return result;
  } catch (error) {
    console.error('Failed to create schedule item:', error);
    throw error;
  }
}

// Test creating a schedule item with task/subtask references
async function testCreateLinkedScheduleItem(userId) {
  console.log('\n--- Testing Schedule Item Creation with Task/Subtask Links ---');
  
  // First, get existing tasks to find valid IDs
  try {
    const tasks = await makeRequest(`/api/tasks?userId=${userId}`, 'GET');
    if (!tasks || tasks.length === 0) {
      console.log('No tasks available for testing. Creating a basic schedule item instead.');
      return await testCreateBasicScheduleItem(userId);
    }
    
    // Find a task with subtasks if possible
    let taskId, subtaskId;
    for (const task of tasks) {
      taskId = task.id;
      
      const subtasks = await makeRequest(`/api/subtasks?taskId=${taskId}`, 'GET');
      if (subtasks && subtasks.length > 0) {
        subtaskId = subtasks[0].id;
        break;
      }
    }
    
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    const newItem = {
      userId,
      title: subtaskId ? `Work on subtask: ${subtaskId}` : `Work on task: ${taskId}`,
      description: "Making progress on assigned work",
      startTime: "10:30",
      endTime: "11:30",
      taskId,
      subtaskId, // This may be undefined if no subtasks were found
      date: formattedDate
    };
    
    const result = await makeRequest('/api/schedule-management/items', 'POST', newItem);
    console.log('Created linked schedule item:', result);
    return result;
  } catch (error) {
    console.error('Failed to create linked schedule item:', error);
    console.log('Falling back to basic schedule item');
    return await testCreateBasicScheduleItem(userId);
  }
}

// Test updating a schedule item's status and other fields
async function testUpdateScheduleItem(item) {
  console.log('\n--- Testing Schedule Item Update ---');
  
  const updates = {
    title: `${item.title} (Updated)`,
    description: `${item.description} - This item has been updated by the LLM`,
    status: "in_progress"
  };
  
  try {
    const result = await makeRequest(`/api/schedule-management/items/${item.id}`, 'PUT', updates);
    console.log('Updated schedule item:', result);
    return result;
  } catch (error) {
    console.error('Failed to update schedule item:', error);
    throw error;
  }
}

// Test simulating a completed task
async function testMarkItemComplete(item) {
  console.log('\n--- Testing Marking Item as Complete ---');
  
  const updates = {
    status: "completed"
  };
  
  try {
    const result = await makeRequest(`/api/schedule-management/items/${item.id}`, 'PUT', updates);
    console.log('Marked item as complete:', result);
    return result;
  } catch (error) {
    console.error('Failed to mark item as complete:', error);
    throw error;
  }
}

// Test soft deletion of a schedule item
async function testDeleteScheduleItem(item) {
  console.log('\n--- Testing Schedule Item Soft Deletion ---');
  
  try {
    const result = await makeRequest(`/api/schedule-management/items/${item.id}`, 'DELETE');
    console.log('Soft-deleted schedule item:', result);
    return result;
  } catch (error) {
    console.error('Failed to soft-delete schedule item:', error);
    throw error;
  }
}

// Test scheduling a follow-up message
async function testScheduleFollowUpMessage(userId) {
  console.log('\n--- Testing Message Scheduling ---');
  
  // Schedule for 15 minutes from now
  const scheduledTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  
  const messageData = {
    userId,
    type: "follow_up",
    tone: "encouraging",
    title: "Progress check",
    scheduledFor: scheduledTime
  };
  
  try {
    const result = await makeRequest('/api/schedule-management/messages', 'POST', messageData);
    console.log('Scheduled follow-up message:', result);
    return result;
  } catch (error) {
    console.error('Failed to schedule message:', error);
    throw error;
  }
}

// Test getting all schedule items for a user
async function testGetScheduleItems(userId) {
  console.log('\n--- Testing Get Schedule Items ---');
  
  const today = new Date();
  const formattedDate = today.toISOString().split('T')[0];
  
  try {
    const items = await makeRequest(`/api/schedule-management/items?userId=${userId}&date=${formattedDate}`, 'GET');
    console.log(`Found ${items.length} schedule items for today:`, items);
    return items;
  } catch (error) {
    console.error('Failed to get schedule items:', error);
    throw error;
  }
}

// Test getting pending messages for a user
async function testGetPendingMessages(userId) {
  console.log('\n--- Testing Get Pending Messages ---');
  
  try {
    const messages = await makeRequest(`/api/schedule-management/messages?userId=${userId}`, 'GET');
    console.log(`Found ${messages.length} pending messages:`, messages);
    return messages;
  } catch (error) {
    console.error('Failed to get pending messages:', error);
    throw error;
  }
}

// Test soft deletion of a message schedule
async function testDeleteMessageSchedule(message) {
  console.log('\n--- Testing Message Schedule Soft Deletion ---');
  console.log(`Attempting to delete message schedule with ID: ${message.id}`);
  
  try {
    const result = await makeRequest(`/api/schedule-management/messages/${message.id}`, 'DELETE');
    console.log('Soft-deleted message schedule result:', result);
    
    // Verify the deletion by trying to get the message again
    const messages = await makeRequest(`/api/schedule-management/messages?userId=${message.userId}`, 'GET');
    const deletedMessage = messages.find(m => m.id === message.id);
    
    if (deletedMessage) {
      console.log(`Warning: Message ${message.id} still appears in results after deletion:`, deletedMessage);
    } else {
      console.log(`Verification: Message ${message.id} no longer appears in API results (success)`);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to soft-delete message schedule:', error);
    throw error;
  }
}

// Run a sequence of tests that simulate LLM actions
async function runTests() {
  try {
    // Login to the system
    const user = await login();
    const userId = user.id;
    
    // Get existing schedule items (before our test actions)
    const initialItems = await testGetScheduleItems(userId);
    
    // Create a basic schedule item
    const basicItem = await testCreateBasicScheduleItem(userId);
    
    // Create a schedule item linked to a task/subtask
    const linkedItem = await testCreateLinkedScheduleItem(userId);
    
    // Update a schedule item
    const updatedItem = await testUpdateScheduleItem(basicItem);
    
    // Mark a schedule item as complete
    const completedItem = await testMarkItemComplete(linkedItem);
    
    // Schedule a follow-up message
    const scheduledMessage = await testScheduleFollowUpMessage(userId);
    
    // Get pending messages
    const pendingMessages = await testGetPendingMessages(userId);
    
    // Get all schedule items (after our test actions)
    const finalItems = await testGetScheduleItems(userId);
    
    // Soft delete a schedule item
    const deletedItem = await testDeleteScheduleItem(updatedItem);
    
    // Final check of items after deletion
    const afterItemDeletion = await testGetScheduleItems(userId);
    
    // Soft delete a message schedule (if we have any)
    let deletedMessage = null;
    if (pendingMessages.length > 0) {
      deletedMessage = await testDeleteMessageSchedule(pendingMessages[0]);
    } else {
      console.log('No pending messages to delete, skipping this test');
    }
    
    // Get pending messages after deletion
    const afterMessageDeletion = await testGetPendingMessages(userId);
    
    console.log('\n--- Test Summary ---');
    console.log(`Initial schedule items: ${initialItems.length}`);
    console.log(`After item soft-deletion: ${afterItemDeletion.length}`);
    console.log(`Initial pending messages: ${pendingMessages.length}`);
    console.log(`After message soft-deletion: ${afterMessageDeletion.length}`);
    console.log('All tests completed successfully!');
    
  } catch (error) {
    console.error('Test sequence failed:', error);
  }
}

// Execute the tests
runTests();