/**
 * Test for Schedule Confirmation Flow
 * 
 * This test demonstrates the complete schedule confirmation flow:
 * 1. User requests a schedule update
 * 2. LLM proposes a schedule (with PROPOSED_SCHEDULE_AWAITING_CONFIRMATION marker)
 * 3. User explicitly confirms the schedule with a confirmation message
 * 4. LLM responds with final schedule (with "The final schedule is as follows:" marker)
 * 5. System processes the schedule and creates items in the database
 */

import fetch from 'node-fetch';
import fs from 'fs';

// Store cookies between requests for authentication
let cookies = '';

async function makeRequest(endpoint, method, body = null) {
  // For Replit, we need to access the server directly
  const url = `http://localhost:5000${endpoint}`;
  
  console.log(`Making ${method} request to ${url}`);
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Only add cookie header if we have cookies
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

    // Handle responses that might not be JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return data;
    } else {
      const text = await response.text();
      try {
        // Try to parse it as JSON anyway in case the content-type is wrong
        return JSON.parse(text);
      } catch (e) {
        // If it's not JSON, just return the text
        return text;
      }
    }
  } catch (error) {
    console.error(`Error making request to ${url}:`, error);
    throw error;
  }
}

async function login() {
  console.log('Logging in...');
  try {
    // Try to log in with test_user credentials
    const response = await makeRequest('/api/login', 'POST', {
      username: 'test_user',
      password: '112',
    });
    
    if (!response || !response.id) {
      console.error('Login failed with test_user credentials');
      throw new Error('Login failed');
    }
    
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

async function sendMessage(userId, content) {
  try {
    return await makeRequest('/api/messages', 'POST', {
      userId,
      content,
      source: 'web'
    });
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
}

async function getLatestMessages(userId, limit = 2) {
  try {
    const messages = await makeRequest('/api/messages', 'GET');
    return messages.slice(0, limit);
  } catch (error) {
    console.error('Failed to get messages:', error);
    throw error;
  }
}

async function waitForProcessing(delay = 5000) {
  console.log(`Waiting ${delay/1000} seconds for LLM processing...`);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function getScheduleItems(userId) {
  const today = new Date().toISOString().split('T')[0];
  try {
    return await makeRequest(`/api/schedule-management/items?userId=${userId}&date=${today}`, 'GET');
  } catch (error) {
    console.error('Failed to get schedule items:', error);
    throw error;
  }
}

async function runTest() {
  console.log('=== STARTING SCHEDULE CONFIRMATION TEST ===');
  
  try {
    // Step 1: Login
    const user = await login();
    console.log(`Logged in as user: ${user.username} (ID: ${user.id})`);
    
    // Step 2: Get initial schedule items
    const initialItems = await getScheduleItems(user.id);
    console.log(`\nInitial schedule items: ${initialItems.length}`);
    
    // Step 3: Request a schedule update
    console.log("\nSending schedule request message...");
    await sendMessage(user.id, "I want to study for 2 hours starting at 10:00 AM today");
    
    // Step 4: Wait for LLM to process and respond with a proposal
    await waitForProcessing();
    
    // Step 5: Check the LLM's response
    const messages1 = await getLatestMessages(user.id);
    console.log("\nLLM proposed schedule:");
    console.log(messages1[0].content);
    
    // Check if the proposal marker is present
    const hasProposalMarker = messages1[0].content.includes("PROPOSED_SCHEDULE_AWAITING_CONFIRMATION");
    console.log(`Schedule proposal marker present: ${hasProposalMarker ? 'Yes ✓' : 'No ✗'}`);
    
    // Step 6: Send confirmation message
    console.log("\nSending confirmation message...");
    await sendMessage(user.id, "The schedule looks good to me!");
    
    // Step 7: Wait for LLM to process confirmation and finalize schedule
    await waitForProcessing();
    
    // Step 8: Check the LLM's final schedule response
    const messages2 = await getLatestMessages(user.id);
    console.log("\nLLM final schedule response:");
    console.log(messages2[0].content);
    
    // Check if the confirmation marker is present
    const hasConfirmationMarker = messages2[0].content.includes("The final schedule is as follows");
    console.log(`Final schedule marker present: ${hasConfirmationMarker ? 'Yes ✓' : 'No ✗'}`);
    
    // Step 9: Verify schedule items were created
    await waitForProcessing(2000);
    const finalItems = await getScheduleItems(user.id);
    console.log(`\nFinal schedule items: ${finalItems.length}`);
    
    if (finalItems.length > initialItems.length) {
      console.log('\n✅ TEST PASSED: Schedule items were created after confirmation');
      console.log('\nCreated items:');
      console.log(JSON.stringify(finalItems, null, 2));
    } else {
      console.log('\n❌ TEST FAILED: No new schedule items were created');
    }
    
  } catch (error) {
    console.error('Error during test:', error);
  }
  
  console.log('\n=== TEST COMPLETED ===');
}

runTest();
