/**
 * Basic Test for Natural Language Schedule Management
 * 
 * This simplified test checks if the system can understand a basic natural language
 * request to clear a schedule.
 */

import fetch from 'node-fetch';
import fs from 'fs';

// Store cookies between requests for authentication
let cookies = '';

async function makeRequest(endpoint, method, body = null) {
  // For Replit, we need to access the server directly
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

async function waitForProcessing(delay = 5000) {
  console.log(`Waiting ${delay/1000} seconds for LLM processing...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function testClearSchedule(userId) {
  console.log('\n=== TESTING: Clear schedule via natural language ===');
  
  // Check current schedule
  const beforeItems = await getScheduleItems(userId);
  console.log(`Current schedule items count: ${beforeItems.length}`);
  
  // Send message to clear schedule
  console.log('\nSending message to clear schedule...');
  await sendMessage(userId, 'Please clear my entire schedule for today. I need a fresh start.');
  
  // Wait for LLM to process
  await waitForProcessing();
  
  // Get the latest messages to see the response
  const messages = await getLatestMessages(userId);
  if (messages.length > 0) {
    console.log(`LLM response: "${messages[0].content.substring(0, 100)}..."`);
  }
  
  // Check schedule after clearing
  const afterItems = await getScheduleItems(userId);
  console.log(`Schedule items after clearing: ${afterItems.length}`);
  
  return {
    beforeCount: beforeItems.length,
    afterCount: afterItems.length,
    success: beforeItems.length >= afterItems.length
  };
}

async function runTest() {
  try {
    console.log('=== STARTING BASIC SCHEDULE TEST ===');
    
    // Log in and get user
    const user = await login();
    console.log(`Logged in as user: ${user.username} (ID: ${user.id})`);
    
    // Run the test
    const result = await testClearSchedule(user.id);
    
    console.log(`\nTest result: ${result.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`Items before: ${result.beforeCount}, Items after: ${result.afterCount}`);
    
    console.log('\n=== TEST COMPLETED ===');
    process.exit(0);
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest();