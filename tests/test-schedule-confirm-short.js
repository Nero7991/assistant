/**
 * Simplified test to confirm schedule behavior
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
    return await response.text();
  }
}

async function login() {
  const response = await makeRequest('/api/login', 'POST', {
    username: 'test_user',
    password: '112',
  });
  console.log(`Logged in as: ${response.username} (ID: ${response.id})`);
  return response;
}

async function runTest() {
  console.log('=== Simplified Schedule Confirmation Test ===');
  
  try {
    const user = await login();
    
    // Send a confirmation message for the already proposed schedule
    console.log('Sending confirmation message...');
    await makeRequest('/api/messages', 'POST', {
      userId: user.id,
      content: 'The schedule looks good to me! I confirm the schedule.',
      source: 'web'
    });
    
    console.log('Waiting for LLM to process confirmation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check if any schedule items were created
    const today = new Date().toISOString().split('T')[0];
    const items = await makeRequest(`/api/schedule-management/items?userId=${user.id}&date=${today}`, 'GET');
    
    console.log(`Schedule items after confirmation: ${items.length}`);
    if (items.length > 0) {
      console.log('Schedule items:');
      console.log(JSON.stringify(items, null, 2));
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
  
  console.log('=== Test completed ===');
}

runTest();
