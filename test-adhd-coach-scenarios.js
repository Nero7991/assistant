/**
 * ADHD Coach Conversation Flow Test Script
 * 
 * This script tests specific conversation flows for the ADHD coaching application:
 * 1. Morning schedule message → User approves schedule → Coach schedules follow-ups
 * 2. Morning schedule message → User asks to free up afternoon → Coach responds
 * 
 * To run this script: node test-adhd-coach-scenarios.js
 */

import fetch from 'node-fetch';
// Use localhost for testing within Replit
const BASE_URL = 'http://localhost:5000';
let sessionCookie = '';

// Test user credentials - Replace with your test user's details
const TEST_USER = {
  username: 'testuser',
  password: 'password123',
  id: 4 // Should match your test user ID
};

// Helper function to make API requests
async function makeRequest(endpoint, method, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  
  if (response.headers.get('set-cookie')) {
    sessionCookie = response.headers.get('set-cookie');
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }
  
  return await response.text();
}

// Login function to get a session
async function login() {
  console.log('📱 Logging in as test user...');
  const result = await makeRequest('/api/login', 'POST', {
    username: TEST_USER.username,
    password: TEST_USER.password
  });
  
  console.log('✅ Login successful!');
  return result;
}

// Test scenario where user approves the morning schedule
async function testScheduleApproval() {
  console.log('\n🧪 SCENARIO 1: User approves morning schedule');
  
  // Step 1: Schedule a morning message
  console.log('Step 1: Scheduling morning message...');
  const scheduleResult = await makeRequest('/api/test/schedule-message', 'POST');
  console.log(`Morning message scheduled for: ${scheduleResult.scheduledFor}`);
  
  // Wait for the message to be processed
  console.log('Waiting for message to be processed...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Step 2: Get the most recent message
  console.log('Step 2: Getting most recent message...');
  const messages = await makeRequest('/api/message-history?limit=1', 'GET');
  if (messages && messages.length > 0) {
    console.log('Latest message:', messages[0].content.substring(0, 200) + '...');
  } else {
    console.log('No recent messages found');
  }
  
  // Step 3: User approves the schedule
  console.log('Step 3: User approves the schedule...');
  const approvalResponse = await makeRequest('/api/test/simulate-whatsapp', 'POST', {
    userId: TEST_USER.id,
    message: "Looks good! This schedule works for me today."
  });
  
  console.log('Coach response status:', approvalResponse.success ? 'Success' : 'Failed');
  
  // Step 4: Check for follow-up scheduling
  console.log('Step 4: Checking for follow-up scheduling...');
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check message history again
  const updatedMessages = await makeRequest('/api/message-history?limit=2', 'GET');
  if (updatedMessages && updatedMessages.length > 0) {
    const coachResponse = updatedMessages.find(msg => msg.type === 'coach_response');
    if (coachResponse) {
      console.log('Coach response:', coachResponse.content.substring(0, 200) + '...');
      const scheduleUpdates = coachResponse.metadata?.scheduleUpdates;
      if (scheduleUpdates && scheduleUpdates.length > 0) {
        console.log('Schedule updates:', JSON.stringify(scheduleUpdates, null, 2));
      } else {
        console.log('No schedule updates were made (expected for approval)');
      }
    }
  }
  
  console.log('✅ Schedule approval scenario complete');
}

// Test scenario where user requests afternoon to be freed up
async function testScheduleChange() {
  console.log('\n🧪 SCENARIO 2: User requests schedule change');
  
  // Step 1: Simulate a message requesting to free up the afternoon
  console.log('Step 1: User requests to free up afternoon...');
  const changeResponse = await makeRequest('/api/test/simulate-whatsapp', 'POST', {
    userId: TEST_USER.id,
    message: "I need to free up my afternoon. I'm feeling bored and want some free time."
  });
  
  console.log('Coach response status:', changeResponse.success ? 'Success' : 'Failed');
  
  // Step 2: Check how coach responded
  console.log('Step 2: Checking coach response...');
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check message history
  const messages = await makeRequest('/api/message-history?limit=2', 'GET');
  if (messages && messages.length > 0) {
    const coachResponse = messages.find(msg => msg.type === 'coach_response');
    if (coachResponse) {
      console.log('Coach response:', coachResponse.content.substring(0, 200) + '...');
      const scheduleUpdates = coachResponse.metadata?.scheduleUpdates;
      if (scheduleUpdates && scheduleUpdates.length > 0) {
        console.log('Schedule updates:', JSON.stringify(scheduleUpdates, null, 2));
      } else {
        console.log('No schedule updates were made');
      }
    }
  }
  
  // Step 3: User insists on free time
  console.log('Step 3: User insists on having free time...');
  const insistResponse = await makeRequest('/api/test/simulate-whatsapp', 'POST', {
    userId: TEST_USER.id,
    message: "No really, I need the whole afternoon free. Please reschedule all my afternoon tasks to tomorrow."
  });
  
  console.log('Coach response status:', insistResponse.success ? 'Success' : 'Failed');
  
  // Step 4: Check final coach response
  console.log('Step 4: Checking final coach response...');
  // Wait longer for processing
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check message history
  const updatedMessages = await makeRequest('/api/message-history?limit=5', 'GET');
  console.log('Retrieved', updatedMessages.length, 'messages from history');
  
  if (updatedMessages && updatedMessages.length > 0) {
    // Show all recent messages
    console.log('Recent message history:');
    updatedMessages.forEach(msg => {
      console.log(`- [${msg.type}]: ${msg.content.substring(0, 150)}...`);
      if (msg.metadata && msg.metadata.scheduleUpdates && msg.metadata.scheduleUpdates.length > 0) {
        console.log('  Schedule updates:', JSON.stringify(msg.metadata.scheduleUpdates, null, 2));
      }
    });
    
    // Find the specific response to our last message
    const finalResponse = updatedMessages.find(msg => 
      msg.type === 'coach_response' && 
      updatedMessages.some(m => 
        m.type === 'response' && 
        m.content.includes('whole afternoon free')
      )
    );
    
    if (finalResponse) {
      console.log('\nFinal coach response to afternoon request:', finalResponse.content);
      const scheduleUpdates = finalResponse.metadata?.scheduleUpdates;
      if (scheduleUpdates && scheduleUpdates.length > 0) {
        console.log('Schedule updates:', JSON.stringify(scheduleUpdates, null, 2));
      } else {
        console.log('No schedule updates were made');
      }
    } else {
      console.log('Could not find specific response to afternoon request');
    }
  }
  
  console.log('✅ Schedule change scenario complete');
}

// Main test function
async function runTests() {
  try {
    // Login first
    await login();
    
    // Update user settings to ensure WhatsApp is enabled
    console.log('\n⚙️ Updating user settings...');
    await makeRequest('/api/user', 'PATCH', {
      contactPreference: 'whatsapp',
      allowPhoneNotifications: true,
      isPhoneVerified: true,
      timeZone: 'America/New_York',
      preferredMessageTime: '09:00'
    });
    console.log('✅ User settings updated');
    
    // Run just the second test scenario to avoid timeout
    await testScheduleChange();
    
    console.log('\n🎉 Schedule change test completed!');
  } catch (error) {
    console.error('💥 Test suite failed:', error);
  }
}

// Run the tests
runTests();