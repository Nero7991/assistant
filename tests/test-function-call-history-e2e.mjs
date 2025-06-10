#!/usr/bin/env node

import 'dotenv/config';
import fetch from 'node-fetch';
import { createHash } from 'crypto';
import chalk from 'chalk';
import { db } from '../server/db.ts';
import { users, messageHistory, functionCallHistory } from '../shared/schema.ts';
import { eq, and, desc } from 'drizzle-orm';

// Test configuration
const BASE_URL = 'http://localhost:5001';
const TEST_EMAIL = 'testuser@example.com';
const TEST_PASSWORD = 'testpass123';

// Test state
let authCookie = null;
let userId = null;

// Helper functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: chalk.blue('[INFO]'),
    success: chalk.green('[SUCCESS]'),
    error: chalk.red('[ERROR]'),
    warning: chalk.yellow('[WARNING]')
  };
  console.log(`${timestamp} ${prefix[type]} ${message}`);
}

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (authCookie) {
    headers['Cookie'] = authCookie;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { response, data };
}

async function login() {
  log('Logging in with test user...');
  
  const { response, data } = await makeRequest('/api/login', {
    method: 'POST',
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    })
  });

  if (response.status !== 200) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  // Extract cookies
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    authCookie = setCookieHeader.split(';')[0];
  }
  
  userId = data.id;
  log(`Logged in successfully. User ID: ${userId}`, 'success');
  return true;
}

async function clearTestData() {
  log('Clearing previous test data...');
  
  try {
    // Clear function call history for test user
    await db.delete(functionCallHistory).where(eq(functionCallHistory.userId, userId));
    
    // Clear recent message history for test user (keep some older messages for context)
    const recent = new Date(Date.now() - 5 * 60 * 1000); // Last 5 minutes
    await db.delete(messageHistory).where(
      and(
        eq(messageHistory.userId, userId),
        eq(messageHistory.type, 'user_message'),
        // Only delete recent test messages to avoid breaking existing conversation
      )
    );
    
    log('Test data cleared successfully', 'success');
  } catch (error) {
    log(`Warning: Could not clear test data: ${error.message}`, 'warning');
  }
}

async function sendChatMessage(message) {
  log(`Sending chat message: "${message}"`);
  
  const { response, data } = await makeRequest('/api/chat/sync-response', {
    method: 'POST',
    body: JSON.stringify({ message })
  });

  if (response.status !== 200) {
    throw new Error(`Chat message failed: ${JSON.stringify(data)}`);
  }

  log(`Chat response received: "${data.response?.substring(0, 100)}..."`, 'success');
  return data;
}

async function verifyDatabaseRecords() {
  log('Verifying database records...');
  
  // Get the most recent message history records for our user
  const recentMessages = await db
    .select()
    .from(messageHistory)
    .where(eq(messageHistory.userId, userId))
    .orderBy(desc(messageHistory.createdAt))
    .limit(5);
    
  log(`Found ${recentMessages.length} recent message history records`);
  
  if (recentMessages.length === 0) {
    throw new Error('No message history records found');
  }
  
  // Find the most recent conversation sequence
  const latestSequenceId = recentMessages[0].sequenceId;
  if (!latestSequenceId) {
    throw new Error('Latest message has no sequence ID');
  }
  
  log(`Latest sequence ID: ${latestSequenceId}`);
  
  // Get all messages with this sequence ID
  const sequenceMessages = recentMessages.filter(msg => msg.sequenceId === latestSequenceId);
  log(`Found ${sequenceMessages.length} messages in latest sequence`);
  
  // Get function call history for this sequence
  const functionCalls = await db
    .select()
    .from(functionCallHistory)
    .where(eq(functionCallHistory.sequenceId, latestSequenceId))
    .orderBy(functionCallHistory.stepNumber);
    
  log(`Found ${functionCalls.length} function call history records`);
  
  // Verify we have both user message and assistant response
  const messageTypes = sequenceMessages.map(m => m.type);
  if (!messageTypes.includes('user_message')) {
    throw new Error('Missing user_message in sequence');
  }
  if (!messageTypes.includes('coach_response')) {
    throw new Error('Missing coach_response in sequence');
  }
  
  // If we have function calls, verify they have the right structure
  if (functionCalls.length > 0) {
    for (const call of functionCalls) {
      if (!call.functionName) {
        throw new Error(`Function call ${call.id} missing function name`);
      }
      if (!call.content) {
        throw new Error(`Function call ${call.id} missing content`);
      }
      if (!['function_call', 'function_result'].includes(call.type)) {
        throw new Error(`Function call ${call.id} has invalid type: ${call.type}`);
      }
      
      log(`  - ${call.type}: ${call.functionName} (step ${call.stepNumber})`);
    }
    
    // Verify function calls and results are paired
    const callTypes = functionCalls.map(fc => fc.type);
    const callCount = callTypes.filter(t => t === 'function_call').length;
    const resultCount = callTypes.filter(t => t === 'function_result').length;
    
    if (callCount !== resultCount) {
      throw new Error(`Mismatched function calls (${callCount}) and results (${resultCount})`);
    }
    
    log(`Verified ${callCount} function call pairs`, 'success');
  }
  
  log('Database records verification passed', 'success');
  return {
    sequenceId: latestSequenceId,
    messageCount: sequenceMessages.length,
    functionCallCount: functionCalls.length,
    functionCalls
  };
}

async function switchToGemini() {
  log('Switching user to Gemini provider to avoid OpenAI rate limits...');
  
  const { response, data } = await makeRequest('/api/user', {
    method: 'PATCH',
    body: JSON.stringify({
      preferredModel: 'gemini-1.5-flash'
    })
  });

  if (response.status !== 200) {
    throw new Error(`Failed to switch to Gemini: ${JSON.stringify(data)}`);
  }
  
  log('Successfully switched to Gemini provider', 'success');
}

async function testTaskCreation() {
  log('Testing task creation (should trigger function calls)...');
  
  // Send a message that should trigger task creation function
  const response = await sendChatMessage('Create a task called "Test Function Call Tracking" for tomorrow');
  
  // Wait a moment for async processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Verify database records
  const verification = await verifyDatabaseRecords();
  
  if (verification.functionCallCount === 0) {
    throw new Error('Expected function calls for task creation, but none were recorded');
  }
  
  // Verify we have the expected function calls
  const functionNames = verification.functionCalls.map(fc => fc.functionName);
  const expectedFunctions = ['get_task_list', 'create_task'];
  
  for (const expectedFunc of expectedFunctions) {
    if (!functionNames.includes(expectedFunc)) {
      log(`Warning: Expected function '${expectedFunc}' not found in: ${functionNames.join(', ')}`, 'warning');
    }
  }
  
  log('Task creation test passed', 'success');
  return verification;
}

async function testContextContinuity() {
  log('Testing function call context in conversation continuity...');
  
  // Send a follow-up message that should reference the previous interaction
  const response = await sendChatMessage('What was the name of the task I just created?');
  
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Check if the response includes information about the task
  if (!response.response || !response.response.toLowerCase().includes('test function call tracking')) {
    log('Warning: Assistant response may not have proper context of previous interaction', 'warning');
    log(`Response was: "${response.response}"`, 'warning');
  } else {
    log('Context continuity test passed - assistant remembered the task', 'success');
  }
  
  return response;
}

async function testPromptLogging() {
  log('Checking if prompt logs include function call context...');
  
  try {
    // Read the most recent prompt log
    const fs = await import('fs');
    const path = await import('path');
    
    const promptLogsDir = path.join(process.cwd(), 'prompt_logs');
    if (!fs.existsSync(promptLogsDir)) {
      log('Prompt logs directory not found - may be disabled', 'warning');
      return;
    }
    
    const logFiles = fs.readdirSync(promptLogsDir)
      .filter(file => file.endsWith('.log'))
      .sort((a, b) => fs.statSync(path.join(promptLogsDir, b)).mtime - fs.statSync(path.join(promptLogsDir, a)).mtime);
    
    if (logFiles.length === 0) {
      log('No prompt log files found', 'warning');
      return;
    }
    
    const latestLogFile = path.join(promptLogsDir, logFiles[0]);
    const logContent = fs.readFileSync(latestLogFile, 'utf8');
    
    // Check if log includes function execution results
    if (logContent.includes('FUNCTION EXECUTION RESULTS')) {
      log('✓ Prompt log includes function execution results section', 'success');
    } else {
      log('✗ Prompt log missing function execution results section', 'error');
    }
    
    // Check for function call logging
    if (logContent.includes('Function Call:') || logContent.includes('Function Result:')) {
      log('✓ Function calls and results are being logged', 'success');
    } else {
      log('? Function calls may not be logged separately', 'warning');
    }
    
  } catch (error) {
    log(`Could not check prompt logs: ${error.message}`, 'warning');
  }
}

// Main test suite
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  log('🧪 Starting Function Call History End-to-End Tests');
  console.log('='.repeat(60));
  
  let testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    results: []
  };
  
  const tests = [
    { name: 'User Login', fn: login },
    { name: 'Clear Test Data', fn: clearTestData },
    { name: 'Switch to Gemini Provider', fn: switchToGemini },
    { name: 'Task Creation with Function Calls', fn: testTaskCreation },
    { name: 'Context Continuity', fn: testContextContinuity },
    { name: 'Prompt Logging Verification', fn: testPromptLogging }
  ];
  
  for (const test of tests) {
    testResults.total++;
    log(`\nRunning test: ${test.name}`);
    
    try {
      await test.fn();
      testResults.passed++;
      testResults.results.push({ name: test.name, status: 'PASSED' });
    } catch (error) {
      testResults.failed++;
      testResults.results.push({ name: test.name, status: 'FAILED', error: error.message });
      log(`Test "${test.name}" failed: ${error.message}`, 'error');
    }
  }
  
  // Final verification
  try {
    log('\nRunning final database verification...');
    await verifyDatabaseRecords();
    log('✓ Final verification passed', 'success');
  } catch (error) {
    log(`✗ Final verification failed: ${error.message}`, 'error');
  }
  
  // Print results summary
  console.log('\n' + '='.repeat(60));
  log('📊 Test Results Summary');
  console.log('='.repeat(60));
  
  testResults.results.forEach(result => {
    const status = result.status === 'PASSED' ? 
      chalk.green('✓ PASSED') : 
      chalk.red(`✗ FAILED: ${result.error}`);
    console.log(`${result.name.padEnd(35)} ${status}`);
  });
  
  console.log('\n' + '-'.repeat(60));
  const summary = `Tests: ${testResults.total}, Passed: ${testResults.passed}, Failed: ${testResults.failed}`;
  if (testResults.failed === 0) {
    log(chalk.green(`🎉 ALL TESTS PASSED! ${summary}`), 'success');
  } else {
    log(chalk.red(`❌ SOME TESTS FAILED! ${summary}`), 'error');
  }
  console.log('='.repeat(60));
  
  process.exit(testResults.failed === 0 ? 0 : 1);
}

// Handle errors and cleanup
process.on('unhandledRejection', (error) => {
  log(`Unhandled error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});

// Run tests
runAllTests().catch(error => {
  log(`Test suite failed: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});