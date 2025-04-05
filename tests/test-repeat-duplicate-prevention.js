/**
 * Repeated test for duplicate follow-up prevention
 * This script runs the duplicate prevention test multiple times
 * to verify the fix consistently works under repeated testing.
 * 
 * To run this script: node test-repeat-duplicate-prevention.js [number_of_runs]
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

// Get number of test runs from command line, default to 5
const NUM_RUNS = process.argv[2] ? parseInt(process.argv[2]) : 5;

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

// Clear pending messages before testing
async function clearPendingFollowUps() {
  console.log('🧹 Clearing pending follow-up messages...');
  try {
    const result = await makeRequest('/api/test/clear-pending-messages', 'POST');
    console.log(`✅ Cleared ${result.messagesDeleted} pending messages`);
    return result;
  } catch (error) {
    console.error('❌ Failed to clear pending messages:', error);
    throw error;
  }
}

// Test the duplicate prevention feature
async function testDuplicatePrevention(runNumber) {
  console.log(`\n🧪 Testing duplicate follow-up prevention (Run ${runNumber + 1}/${NUM_RUNS})...`);
  const result = await makeRequest('/api/test/duplicate-followups', 'POST');
  
  // Check if the test passed (only one message scheduled)
  const passed = result.pendingMessages.length === 1;
  
  if (passed) {
    console.log('✅ SUCCESS: Only one follow-up was scheduled despite multiple attempts!');
  } else {
    console.error('❌ FAIL: Multiple follow-ups were scheduled, fix not working properly.');
    console.error(`   Expected: 1, Actual: ${result.pendingMessages.length}`);
    // Print additional debug info
    console.error(`   Pending messages:`, JSON.stringify(result.pendingMessages, null, 2));
  }
  
  return {
    passed,
    pendingCount: result.pendingMessages.length,
    runNumber: runNumber + 1,
    details: result
  };
}

// Main test function
async function runTests() {
  console.log(`🚀 Starting duplicate follow-up prevention test (${NUM_RUNS} runs)...`);
  
  // Track test results
  const results = [];
  let passCount = 0;
  
  try {
    // Login to get a session
    await login();
    
    // Run the test multiple times
    for (let i = 0; i < NUM_RUNS; i++) {
      // Clear any existing pending messages first
      await clearPendingFollowUps();
      
      // Run the test
      const result = await testDuplicatePrevention(i);
      results.push(result);
      
      if (result.passed) {
        passCount++;
      }
      
      // Small delay between test runs
      if (i < NUM_RUNS - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Print summary
    console.log('\n=============================================');
    console.log(`📊 TEST SUMMARY (${passCount}/${NUM_RUNS} passed):`);
    console.log('=============================================');
    
    results.forEach(result => {
      console.log(`Run ${result.runNumber}: ${result.passed ? '✅ PASSED' : '❌ FAILED'} - ${result.pendingCount} message(s) scheduled`);
    });
    
    if (passCount === NUM_RUNS) {
      console.log('\n🎉 ALL TESTS PASSED! Duplicate prevention is working correctly.');
    } else {
      console.log(`\n⚠️ SOME TESTS FAILED: ${NUM_RUNS - passCount}/${NUM_RUNS} failures.`);
    }
    
    // Final cleanup
    await clearPendingFollowUps();
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
  }
}

// Run the tests
runTests();