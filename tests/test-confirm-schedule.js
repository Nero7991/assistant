/**
 * Test for Schedule Confirmation
 * 
 * This script tests schedule creation, proposal, and confirmation
 * to verify that the LLM can generate schedule proposals and 
 * then properly apply them when confirmed by the user.
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
      title: "Important Meeting",
      description: "Critical client meeting",
      status: "not_started",
      estimatedDuration: "1 hour",
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
    const response = await makeRequest('/api/messages', 'POST', {
      userId,
      content,
      source: 'web'
    });
    return response;
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
}

async function getMessages(userId, limit = 5) {
  try {
    const messages = await makeRequest('/api/messages', 'GET');
    return messages.slice(0, limit);
  } catch (error) {
    console.error('Failed to get messages:', error);
    return [];
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
    console.log('=== STARTING SCHEDULE CONFIRMATION TEST ===');
    
    // Log in and get user
    const user = await login();
    console.log(`Logged in as user: ${user.username} (ID: ${user.id})`);
    
    // Create test task
    const task = await createTask(user.id);
    
    // Get initial schedule (should be empty)
    const initialSchedule = await getScheduleItems(user.id);
    console.log(`Initial schedule items: ${initialSchedule.length}`);
    
    // Step 1: Request a schedule with our task
    console.log(`\nStep 1: Requesting schedule with task ${task.id}...`);
    await sendMessage(user.id, `I need to schedule my Important Meeting (task ID: ${task.id}) today at 2:00 PM.`);
    
    await waitForProcessing();
    
    // Get the latest messages to see if we got a proposal
    let messages = await getMessages(user.id);
    let lastMessage = messages[0]?.content || '';
    console.log(`\nLast message (truncated): "${lastMessage.substring(0, 100)}..."`);
    
    const hasProposal = lastMessage.includes('PROPOSED_SCHEDULE_AWAITING_CONFIRMATION');
    console.log(`Has schedule proposal: ${hasProposal}`);
    
    if (!hasProposal) {
      console.log('No schedule proposal detected. Test cannot continue.');
      return;
    }
    
    // Step 2: Confirm the schedule
    console.log(`\nStep 2: Confirming the schedule proposal...`);
    await sendMessage(user.id, `That schedule looks perfect. Please confirm it.`);
    
    await waitForProcessing();
    
    // Check if schedule was applied
    const finalSchedule = await getScheduleItems(user.id);
    console.log(`\nFinal schedule items: ${finalSchedule.length}`);
    
    if (finalSchedule.length > 0) {
      console.log('Schedule items:');
      finalSchedule.forEach(item => {
        console.log(`- ${item.title} at ${item.startTime}`);
      });
      
      console.log(`\nTest result: SUCCESS ✅`);
    } else {
      console.log(`\nTest result: FAILED ❌ - No schedule items were created after confirmation`);
    }
    
    console.log('\n=== TEST COMPLETED ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
runTest();