/**
 * Test Schedule Management API
 * 
 * This script tests the new schedule management API endpoints
 * that allow the LLM to directly manage schedule items and message schedules.
 * 
 * Run this script using:
 * node test-schedule-management-api.js
 */

import fetch from 'node-fetch';
import fs from 'fs';

const API_BASE = 'http://localhost:5000';
const COOKIE_JAR = './cookies.txt';

let cookies = '';
if (fs.existsSync(COOKIE_JAR)) {
  cookies = fs.readFileSync(COOKIE_JAR, 'utf8');
}

// Helper function to save cookies from responses
function saveCookies(response) {
  // Using getAll() instead of raw() for node-fetch compatibility
  const setCookies = response.headers.get('set-cookie');
  if (setCookies) {
    cookies = setCookies;
    fs.writeFileSync(COOKIE_JAR, cookies);
  }
}

// Helper function to make API requests
async function makeRequest(endpoint, method, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Only add cookies if they exist
  if (cookies) {
    options.headers['Cookie'] = cookies;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  saveCookies(response);
  
  try {
    return await response.json();
  } catch (e) {
    return { status: response.status };
  }
}

// Login function 
async function login() {
  const credentials = {
    username: 'orencollaco',
    password: 'password123'
  };

  const result = await makeRequest('/api/login', 'POST', credentials);
  console.log('Login result:', result);
  return result.id;
}

// Test getting schedule items
async function testGetScheduleItems(userId) {
  console.log('\n--- Testing GET /api/schedule-management/items ---');
  
  // Get today's date
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Get schedule items
    const scheduleItems = await makeRequest(`/api/schedule-management/items?userId=${userId}&date=${today}`, 'GET');
    console.log(`Retrieved ${scheduleItems.length} schedule items for user ${userId} on ${today}`);
    console.log('Sample items:', scheduleItems.slice(0, 2));
    
    return scheduleItems;
  } catch (error) {
    console.error('Error getting schedule items:', error);
  }
}

// Test creating a schedule item
async function testCreateScheduleItem(userId) {
  console.log('\n--- Testing POST /api/schedule-management/items ---');
  
  // Current time plus 2 hours
  const startTime = new Date();
  startTime.setHours(startTime.getHours() + 2);
  
  // End time is 1 hour after start time
  const endTime = new Date(startTime);
  endTime.setHours(endTime.getHours() + 1);
  
  const newItem = {
    userId,
    title: 'Test schedule item',
    description: 'Created by test script',
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    // No task or subtask ID for this test
  };
  
  try {
    const createdItem = await makeRequest('/api/schedule-management/items', 'POST', newItem);
    console.log('Created schedule item:', createdItem);
    
    return createdItem;
  } catch (error) {
    console.error('Error creating schedule item:', error);
  }
}

// Test updating a schedule item
async function testUpdateScheduleItem(itemId) {
  console.log(`\n--- Testing PUT /api/schedule-management/items/${itemId} ---`);
  
  const updates = {
    title: 'Updated test schedule item',
    description: 'Updated by test script',
    status: 'in_progress'
  };
  
  try {
    const updatedItem = await makeRequest(`/api/schedule-management/items/${itemId}`, 'PUT', updates);
    console.log('Updated schedule item:', updatedItem);
    
    return updatedItem;
  } catch (error) {
    console.error('Error updating schedule item:', error);
  }
}

// Test deleting a schedule item
async function testDeleteScheduleItem(itemId) {
  console.log(`\n--- Testing DELETE /api/schedule-management/items/${itemId} ---`);
  
  try {
    const result = await makeRequest(`/api/schedule-management/items/${itemId}`, 'DELETE');
    console.log('Delete result:', result);
    
    return result;
  } catch (error) {
    console.error('Error deleting schedule item:', error);
  }
}

// Test getting message schedules
async function testGetMessageSchedules(userId) {
  console.log('\n--- Testing GET /api/schedule-management/messages ---');
  
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const messageSchedules = await makeRequest(`/api/schedule-management/messages?userId=${userId}&date=${today}`, 'GET');
    console.log(`Retrieved ${messageSchedules.length} message schedules for user ${userId} on ${today}`);
    console.log('Sample messages:', messageSchedules.slice(0, 2));
    
    return messageSchedules;
  } catch (error) {
    console.error('Error getting message schedules:', error);
  }
}

// Test creating a message schedule
async function testCreateMessageSchedule(userId) {
  console.log('\n--- Testing POST /api/schedule-management/messages ---');
  
  // Schedule for 30 minutes from now
  const scheduledFor = new Date();
  scheduledFor.setMinutes(scheduledFor.getMinutes() + 30);
  
  const newMessage = {
    userId,
    type: 'follow_up',
    tone: 'positive',
    title: 'Test follow-up message',
    scheduledFor: scheduledFor.toISOString()
  };
  
  try {
    const createdMessage = await makeRequest('/api/schedule-management/messages', 'POST', newMessage);
    console.log('Created message schedule:', createdMessage);
    
    return createdMessage;
  } catch (error) {
    console.error('Error creating message schedule:', error);
  }
}

// Run all tests
async function runTests() {
  console.log('Starting schedule management API tests...');
  
  // Login first to get authenticated
  const userId = await login();
  if (!userId) {
    console.error('Login failed, cannot continue tests');
    return;
  }
  
  // Get current schedule items
  const scheduleItems = await testGetScheduleItems(userId);
  
  // Create a new schedule item
  const createdItem = await testCreateScheduleItem(userId);
  if (!createdItem) {
    console.error('Failed to create schedule item, skipping update and delete tests');
  } else {
    // Update the created item
    await testUpdateScheduleItem(createdItem.id);
    
    // Delete the created item
    await testDeleteScheduleItem(createdItem.id);
  }
  
  // Get message schedules
  const messageSchedules = await testGetMessageSchedules(userId);
  
  // Create a message schedule
  await testCreateMessageSchedule(userId);
  
  console.log('\nAll tests completed!');
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});