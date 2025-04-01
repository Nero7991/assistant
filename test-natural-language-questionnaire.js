/**
 * Comprehensive Natural Language Test Questionnaire
 * 
 * This test simulates a user interacting with the LLM through natural language to:
 * 1. Query notifications and follow-ups for today
 * 2. Modify existing follow-ups and notifications
 * 3. Create new notifications/reminders
 * 4. Get information about tasks and subtasks
 * 5. Check their daily schedule
 * 
 * Each query tests different LLM function capabilities.
 */

import fetch from 'node-fetch';
import { format } from 'date-fns';

// Store cookies between requests for authentication
let cookies = '';

async function makeRequest(endpoint, method, body = null) {
  const url = `http://localhost:5000${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
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

    if (!response.ok) {
      console.error(`Request failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text);
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
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
  console.log('🔑 Logging in...');
  const response = await makeRequest('/api/login', 'POST', {
    username: 'test_user',
    password: '112',
  });
  console.log(`✅ Login successful! User ID: \x1b[33m${response.id}\x1b[0m`);
  return response;
}

async function sendMessage(userId, content) {
  console.log(`📤 Sending message: "${content}"`);
  const result = await makeRequest('/api/messages', 'POST', {
    userId,
    content,
    source: 'web'
  });
  return result;
}

async function getLatestMessage(userId) {
  const messages = await makeRequest('/api/messages', 'GET');
  return messages[0];
}

async function waitForProcessing(delay = 5000) {
  console.log(`⏳ Waiting ${delay/1000} seconds for processing...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function setupTestEnvironment(userId) {
  console.log('🔧 Setting up test environment...');
  
  // First, create a task for testing
  const task = await makeRequest('/api/tasks', 'POST', {
    userId,
    title: 'Project Planning',
    description: 'Plan the quarterly project roadmap',
    taskType: 'daily',
    priority: 3,  // Integer 1-5
    estimatedDuration: "2h",  // Required field
    status: 'active'
  });
  console.log(`📋 Created task: ${task.title} (ID: ${task.id})`);
  
  // Create a subtask
  const subtask = await makeRequest('/api/subtasks', 'POST', {
    userId,
    parentTaskId: task.id,
    title: 'Stakeholder Meeting Prep',
    description: 'Prepare slides for stakeholder meeting',
    estimatedDuration: "1h",  // Required field
    status: 'active'
  });
  console.log(`📝 Created subtask: ${subtask.title} (ID: ${subtask.id})`);
  
  // Create a follow-up notification
  const currentDate = new Date();
  const followUpTime = new Date(currentDate);
  followUpTime.setHours(currentDate.getHours() + 2);
  
  const messageSchedule = await makeRequest('/api/schedule-management/messages', 'POST', {
    userId,
    type: 'follow_up',
    title: 'Project Planning Check-in',
    content: 'How is your project planning coming along?',
    scheduledFor: followUpTime.toISOString(),
    status: 'pending',
    metadata: {
      taskId: task.id
    }
  });
  console.log(`🔔 Created follow-up: "${messageSchedule.title}" at ${format(new Date(messageSchedule.scheduledFor), 'h:mm a')}`);
  
  return { task, subtask, messageSchedule };
}

async function runTestQuery(userId, query, testName) {
  console.log(`\nTest ${testName}\n`);
  console.log(`===== TESTING QUERY =====`);
  console.log(`🔍 "${query}"`);
  console.log('');
  
  await sendMessage(userId, query);
  await waitForProcessing();
  
  const response = await getLatestMessage(userId);
  console.log(`LLM Response:`);
  console.log(`\x1b[36m${response.content}\x1b[0m`);
  console.log('');
  
  return response;
}

async function runTests() {
  console.log('🧪 Starting Natural Language Test Questionnaire');
  
  try {
    // Login to get user ID
    const user = await login();
    
    // Setup test environment
    const testData = await setupTestEnvironment(user.id);
    
    // Define our test queries
    const testQueries = [
      {
        name: '1/7',
        query: "Can you list all the notifications and follow-ups I have scheduled for today?",
        tests: 'getTodaysNotifications function, formatting message schedules'
      },
      {
        name: '2/7',
        query: `Can you move my ${testData.messageSchedule.title} follow-up from ${format(new Date(testData.messageSchedule.scheduledFor), 'h:mm a')} to 5:00 PM today?`,
        tests: 'Reschedule notification, update message_schedules'
      },
      {
        name: '3/7',
        query: `What tasks do I have on my list?`,
        tests: 'getTaskList function, formatting tasks with subtasks'
      },
      {
        name: '4/7',
        query: `What's on my schedule for today?`,
        tests: 'getTodaysSchedule function, formatting daily schedule'
      },
      {
        name: '5/7',
        query: `Can you schedule a reminder for me at 7:30 PM to review project documents?`,
        tests: 'Create new message schedule'
      },
      {
        name: '6/7',
        query: `Tell me more about my ${testData.task.title} task`,
        tests: 'Get specific task details and related subtasks'
      },
      {
        name: '7/7',
        query: `What facts do you know about me?`,
        tests: 'getUserFacts function'
      }
    ];
    
    // Run each test query in sequence
    for (const test of testQueries) {
      await runTestQuery(user.id, test.query, test.name);
    }
    
    console.log('✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the tests
runTests();
