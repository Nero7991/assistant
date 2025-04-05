/**
 * Quick API Test for LLM Functions
 * 
 * This script tests a single query to ensure the fixed LLM functions work
 */

import fetch from 'node-fetch';

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

async function waitForProcessing(delay = 2000) {
  console.log(`⏳ Waiting ${delay/1000} seconds for processing...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function runTest() {
  console.log('🧪 Testing LLM Function');
  
  try {
    // Login to get user ID
    const user = await login();
    
    // Send a query that should trigger getTodaysSchedule function
    console.log(`\n🔍 Testing query: "What's on my schedule for today?"`);
    await sendMessage(user.id, "What's on my schedule for today?");
    
    await waitForProcessing();
    
    // Get the response
    const response = await getLatestMessage(user.id);
    console.log(`\n📝 Response received. First 100 characters:`);
    console.log(response.content.substring(0, 100) + "...");
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
runTest();
