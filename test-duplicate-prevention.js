/**
 * Test script for verifying fix for duplicate follow-up prevention
 * This script tests the fix for the issue where multiple follow-up messages
 * were being scheduled for the same user, causing message spam.
 * 
 * To run this script: node test-duplicate-prevention.js
 */

import fetch from 'node-fetch';
// Use localhost for testing within Replit
const BASE_URL = 'http://localhost:5000';
let sessionCookie = '';

// Test user credentials
const TEST_USER = {
  username: 'testuser',
  password: 'password123'
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

// Test the duplicate prevention feature
async function testDuplicatePrevention() {
  console.log('\n🧪 Testing duplicate follow-up prevention...');
  const result = await makeRequest('/api/test/duplicate-followups', 'POST');
  console.log('📊 Test results:', JSON.stringify(result, null, 2));
  
  // After clearing previous messages, we should only have exactly 1 message scheduled
  // by the test endpoint (the first one, and the other two attempts should be prevented)
  if (result.pendingMessages.length === 1) {
    console.log('✅ SUCCESS: Only one follow-up was scheduled despite multiple attempts!');
  } else {
    console.log('❌ FAIL: Multiple follow-ups were scheduled, fix not working properly.');
    console.log(`   Expected: 1, Actual: ${result.pendingMessages.length}`);
  }
  
  return result;
}

// Clear pending messages before testing
async function clearPendingFollowUps() {
  console.log('\n🧹 Clearing pending follow-up messages...');
  try {
    const result = await makeRequest('/api/test/clear-pending-messages', 'POST');
    console.log(`✅ Cleared ${result.messagesDeleted} pending messages`);
    return result;
  } catch (error) {
    console.error('❌ Failed to clear pending messages:', error);
    throw error;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting duplicate follow-up prevention test...');
  
  try {
    // Login to get a session
    await login();
    
    // Clear any existing pending messages first
    await clearPendingFollowUps();
    
    // Test the duplicate prevention logic
    await testDuplicatePrevention();
    
    // Clean up after testing
    await clearPendingFollowUps();
    
    console.log('\n🎉 All tests completed!');
  } catch (error) {
    console.error('💥 Test suite failed:', error);
  }
}

// Run the tests
runTests();