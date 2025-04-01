/**
 * Direct API Test for LLM Functions
 * 
 * This script tests the natural language function calling capabilities
 * by sending specific queries that should trigger the LLM functions we've fixed.
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
  console.log(`✅ Login successful! User ID: ${response.id}`);
  return response;
}

async function sendMessage(userId, content) {
  console.log(`📤 Sending message: "${content}"`);
  return await makeRequest('/api/messages', 'POST', {
    userId,
    content,
    source: 'web'
  });
}

async function getLatestMessage(userId) {
  const messages = await makeRequest('/api/messages', 'GET');
  return messages[0];
}

async function waitForProcessing(delay = 5000) {
  console.log(`⏳ Waiting ${delay/1000} seconds for processing...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function testQuery(userId, query, description) {
  console.log(`\n▶️ Testing: ${description}`);
  console.log(`🔍 Query: "${query}"`);
  
  await sendMessage(userId, query);
  await waitForProcessing();
  
  const response = await getLatestMessage(userId);
  console.log(`📝 Response: ${response.content.substring(0, 150)}...`);
  
  return response;
}

async function runTest() {
  console.log('🧪 Starting LLM Function API Test');
  
  try {
    // Login to get user ID
    const user = await login();
    
    // Run test queries that should trigger our fixed LLM functions
    await testQuery(user.id, "What tasks do I have on my list?", "getTaskList function");
    await testQuery(user.id, "What's on my schedule for today?", "getTodaysSchedule function");
    await testQuery(user.id, "What notifications do I have for today?", "getTodaysNotifications function");
    await testQuery(user.id, "What do you know about me?", "getUserFacts function");
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
runTest();
