/**
 * Simple Test for Task Creation and LLM Interaction
 * 
 * This script creates a task via API and then checks if the LLM can
 * correctly reference and schedule it via natural language.
 */

import fetch from 'node-fetch';

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

async function createTask(userId) {
  try {
    const task = await makeRequest('/api/tasks', 'POST', {
      userId,
      title: "Dev Project",
      description: "Development project for testing",
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

async function waitForProcessing(delay = 3000) {
  console.log(`Waiting ${delay/1000} seconds for LLM processing...`);
  await new Promise(resolve => setTimeout(resolve, delay));
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

async function runTest() {
  try {
    console.log('=== STARTING SIMPLE TASK TEST ===');
    
    // Log in and get user
    const user = await login();
    console.log(`Logged in as user: ${user.username} (ID: ${user.id})`);
    
    // Create test task
    const task = await createTask(user.id);
    
    // Get initial schedule (should be empty)
    const initialSchedule = await getScheduleItems(user.id);
    console.log(`Initial schedule items: ${initialSchedule.length}`);
    
    // Send message to schedule the task
    console.log(`\nScheduling task ${task.id} via natural language...`);
    await sendMessage(user.id, `I want to work on my Dev Project (task ID: ${task.id}) today at 3:00 PM for 2 hours.`);
    
    // Wait for LLM processing
    await waitForProcessing();
    
    // Get updated schedule
    const updatedSchedule = await getScheduleItems(user.id);
    console.log(`Updated schedule items: ${updatedSchedule.length}`);
    
    if (updatedSchedule.length > 0) {
      console.log('Schedule items:');
      updatedSchedule.forEach(item => {
        console.log(`- ${item.title} at ${item.startTime}`);
      });
    }
    
    console.log('\n=== TEST COMPLETED ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
runTest();