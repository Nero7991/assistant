/**
 * Direct Test for LLM Functions
 * 
 * This script directly tests the LLM functions with our fixed SQL syntax
 * by bypassing the messaging API and calling the database functions directly.
 */

import { llmFunctions } from './server/services/llm-functions.js';
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

async function testLLMFunctions(userId) {
  console.log('🧪 Testing LLM Functions with new SQL syntax...\n');
  
  // Test context for all functions
  const context = { userId, date: new Date() };
  
  try {
    // Test getTodaysNotifications
    console.log('Testing getTodaysNotifications...');
    const notifications = await llmFunctions.getTodaysNotifications(context);
    console.log('Result:', JSON.stringify(notifications, null, 2));
    console.log('✅ getTodaysNotifications test complete\n');
    
    // Test getTaskList
    console.log('Testing getTaskList...');
    const tasks = await llmFunctions.getTaskList(context, { status: 'all' });
    console.log('Result:', JSON.stringify(tasks, null, 2));
    console.log('✅ getTaskList test complete\n');
    
    // Test getUserFacts
    console.log('Testing getUserFacts...');
    const facts = await llmFunctions.getUserFacts(context, {});
    console.log('Result:', JSON.stringify(facts, null, 2));
    console.log('✅ getUserFacts test complete\n');
    
    // Test getTodaysSchedule
    console.log('Testing getTodaysSchedule...');
    const schedule = await llmFunctions.getTodaysSchedule(context);
    console.log('Result:', JSON.stringify(schedule, null, 2));
    console.log('✅ getTodaysSchedule test complete\n');
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

async function runTest() {
  try {
    console.log('🔬 Starting LLM Functions Direct Test');
    
    // Login to get user ID
    const user = await login();
    
    // Test LLM functions
    const success = await testLLMFunctions(user.id);
    
    if (success) {
      console.log('🎉 All LLM function tests completed successfully!');
    } else {
      console.log('❌ Some tests failed. See logs above for details.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
runTest();
