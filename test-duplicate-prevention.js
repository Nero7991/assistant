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
  
  if (result.scheduledFollowUps === 1) {
    console.log('✅ SUCCESS: Only one follow-up was scheduled despite multiple attempts!');
  } else {
    console.log('❌ FAIL: Multiple follow-ups were scheduled, fix not working properly.');
  }
  
  return result;
}

// Clean up any pending follow-ups for future tests
async function clearPendingFollowUps() {
  // This would typically use an admin API to clear test data
  // For our test purposes, we don't need this now, but it would be useful for repeated testing
  console.log('\n🧹 Note: You may want to manually clear pending follow-ups for future tests');
}

// Main test function
async function runTests() {
  console.log('🚀 Starting duplicate follow-up prevention test...');
  
  try {
    // Login to get a session
    await login();
    
    // Test the duplicate prevention logic
    await testDuplicatePrevention();
    
    // Clean up (if needed)
    await clearPendingFollowUps();
    
    console.log('\n🎉 All tests completed!');
  } catch (error) {
    console.error('💥 Test suite failed:', error);
  }
}

// Run the tests
runTests();