/**
 * Messaging API Test Script
 * This script tests various scenarios for the ADHD coaching application's messaging functionality.
 * 
 * To run this script: node test-messaging-api.js
 */

const fetch = require('node-fetch');
const BASE_URL = 'http://localhost:5000';
let sessionCookie = '';

// Test user credentials
const TEST_USER = {
  username: 'testuser',
  password: 'password123',
  id: 4 // This should match your test user's ID
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

// Test scenarios
const testScenarios = [
  {
    name: 'Morning greeting',
    message: 'Good morning! What\'s on my schedule today?',
    description: 'User asking about their daily schedule in the morning'
  },
  {
    name: 'Completing a task',
    message: 'I just finished the project report!',
    description: 'User reporting they completed a task'
  },
  {
    name: 'Rescheduling a task',
    message: 'Can you move my project report to tomorrow at 3pm?',
    description: 'User wanting to reschedule an existing task'
  },
  {
    name: 'Adding a new task',
    message: 'I need to add a new task: Call dentist tomorrow at 10am',
    description: 'User wanting to add a new task to their schedule'
  },
  {
    name: 'Feeling overwhelmed',
    message: 'I\'m feeling really overwhelmed with all my tasks today...',
    description: 'User expressing negative emotions and overwhelm'
  },
  {
    name: 'Expressing success',
    message: 'I\'m proud of myself for getting through my to-do list today!',
    description: 'User expressing positive emotions about their progress'
  },
  {
    name: 'Seeking advice',
    message: 'Do you have any tips for focusing while working on my project report?',
    description: 'User seeking specific ADHD-related advice'
  },
  {
    name: 'Skipping a task',
    message: 'I don\'t think I can handle the project report today, can we skip it?',
    description: 'User wanting to skip a scheduled task'
  },
  {
    name: 'Mixed message with multiple intents',
    message: 'I finished my morning routine tasks but I\'m feeling anxious about the presentation. Can you move it to Friday and add "prepare notes" as a new task for tomorrow?',
    description: 'User expressing completion, emotion, and requesting multiple schedule changes'
  }
];

// Test scheduling a message
async function testScheduleMessage() {
  console.log('\n🔔 Testing message scheduling...');
  const result = await makeRequest('/api/test/schedule-message', 'POST');
  console.log(`✅ Message scheduled for: ${result.scheduledFor}`);
  return result;
}

// Test simulated WhatsApp messages
async function testSimulatedMessages() {
  for (const scenario of testScenarios) {
    console.log(`\n🧪 SCENARIO: ${scenario.name}`);
    console.log(`📝 ${scenario.description}`);
    console.log(`📤 Message: "${scenario.message}"`);
    
    try {
      const result = await makeRequest('/api/test/simulate-whatsapp', 'POST', {
        userId: TEST_USER.id,
        message: scenario.message
      });
      
      console.log('📥 Response:', result);
      console.log('✅ Test completed successfully');
      
      // Give the API a moment to process between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting messaging API tests...');
  
  try {
    // Login to get a session
    await login();
    
    // Update user settings to ensure WhatsApp is enabled
    console.log('\n⚙️ Updating user settings...');
    const userUpdate = await makeRequest('/api/user', 'PATCH', {
      contactPreference: 'whatsapp',
      allowPhoneNotifications: true,
      isPhoneVerified: true,
      timeZone: 'America/New_York',
      preferredMessageTime: '09:00'
    });
    console.log('✅ User settings updated!');
    
    // Schedule a test message
    await testScheduleMessage();
    
    // Run through all test scenarios
    await testSimulatedMessages();
    
    console.log('\n🎉 All tests completed!');
  } catch (error) {
    console.error('💥 Test suite failed:', error);
  }
}

// Run the tests
runTests();