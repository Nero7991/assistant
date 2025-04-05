/**
 * Test script to verify notification format in schedule confirmations
 * 
 * This is a focused test that just checks the confirmed schedule format.
 */

import fetch from 'node-fetch';

// Store cookies for authentication
let cookieJar = '';

async function makeRequest(endpoint, method, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (cookieJar) {
    options.headers.Cookie = cookieJar;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`http://localhost:5000${endpoint}`, options);
  
  // Save cookies from the response
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    cookieJar = setCookieHeader;
  }
  
  return response;
}

async function login() {
  console.log('Logging in...');
  const response = await makeRequest('/api/login', 'POST', {
    username: 'test_user',
    password: '112',
  });

  if (response.ok) {
    const userData = await response.json();
    console.log(`Logged in as user: ${userData.username} (ID: ${userData.id})`);
    return userData;
  } else {
    console.error('Login failed:', await response.text());
    throw new Error('Login failed');
  }
}

async function getConfirmedScheduleMessage() {
  // Get all messages first
  const response = await makeRequest('/api/messages', 'GET');
  
  if (response.ok) {
    const messages = await response.json();
    const confirmedScheduleMessages = messages.filter(m => 
      m.content.includes('The final schedule is as follows:') && 
      m.content.includes('Notifications:')
    );
    
    // Also look for messages with multiple tasks and notifications
    const multiTaskMessages = confirmedScheduleMessages.filter(m =>
      (m.content.match(/[0-9]{1,2}:[0-9]{2}/g) || []).length > 4 // More than 4 time mentions likely means multiple tasks
    );
    
    console.log(`Found ${confirmedScheduleMessages.length} confirmed schedule messages`);
    console.log(`Found ${multiTaskMessages.length} multi-task schedule messages`);
    
    if (confirmedScheduleMessages.length > 0) {
      // Prefer multi-task messages if available
      const messageToShow = multiTaskMessages.length > 0 ? multiTaskMessages[0] : confirmedScheduleMessages[0];
      
      console.log('\nSelected confirmed schedule message:');
      console.log('------------------------------------');
      console.log(messageToShow.content);
      console.log('------------------------------------');
      
      // Check for notification format
      const hasNotificationsSection = messageToShow.content.includes('Notifications:');
      console.log(`\nNotifications section present: ${hasNotificationsSection ? 'Yes ✓' : 'No ✗'}`);
      
      // Check if "Task ID:" is present in the message (should be replaced with task names)
      const hasTaskIds = messageToShow.content.includes('Task ID:');
      console.log(`Task IDs in message (should not be present): ${hasTaskIds ? 'Yes ✗' : 'No ✓'}`);
      
      return messageToShow;
    } else {
      console.log('No confirmed schedule messages found with notifications.');
      return null;
    }
  } else {
    console.error('Failed to get messages:', await response.text());
    return null;
  }
}

async function runTest() {
  try {
    await login();
    await getConfirmedScheduleMessage();
    console.log('\nTest completed.');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTest();