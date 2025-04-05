/**
 * Test script for the getAllSubtasks method
 * 
 * This script tests the functionality of the getAllSubtasks method
 * by retrieving and displaying all subtasks for a user.
 * 
 * To run: node test-subtasks.js
 */

// Import the required modules
const fetch = require('node-fetch');

// URL of your API
const API_URL = 'http://localhost:5000';

// Test credentials (replace with actual user credentials)
const TEST_USER = {
  username: 'orencollaco',
  password: '112'
};

// Function to make API requests
async function makeRequest(endpoint, method, body = null) {
  const options = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${endpoint}`, options);
  return response;
}

// Login function
async function login() {
  const response = await makeRequest('/api/login', 'POST', TEST_USER);
  if (response.status !== 200) {
    throw new Error(`Login failed with status ${response.status}`);
  }
  const user = await response.json();
  console.log(`Logged in as ${user.username} (ID: ${user.id})`);
  return user;
}

// Function to test the getAllSubtasks API endpoint
async function testGetAllSubtasks(userId) {
  try {
    console.log(`\n===== TESTING GET ALL SUBTASKS =====`);
    console.log(`Fetching all subtasks for user ID: ${userId}`);
    
    const response = await makeRequest(`/api/users/${userId}/subtasks/all`, 'GET');
    
    if (response.status !== 200) {
      console.error(`Failed to fetch subtasks: ${response.status} ${response.statusText}`);
      return;
    }
    
    const subtasks = await response.json();
    console.log(`Successfully retrieved ${subtasks.length} subtasks:`);
    
    // Group subtasks by parent task ID for easier viewing
    const subtasksByTaskId = {};
    subtasks.forEach(subtask => {
      if (!subtasksByTaskId[subtask.parentTaskId]) {
        subtasksByTaskId[subtask.parentTaskId] = [];
      }
      subtasksByTaskId[subtask.parentTaskId].push(subtask);
    });
    
    // Print grouped subtasks
    console.log('\nSubtasks grouped by parent task ID:');
    for (const [taskId, taskSubtasks] of Object.entries(subtasksByTaskId)) {
      console.log(`\nParent Task ID: ${taskId}`);
      console.log(`Number of subtasks: ${taskSubtasks.length}`);
      
      taskSubtasks.forEach((subtask, index) => {
        console.log(`  ${index + 1}. ID: ${subtask.id}`);
        console.log(`     Title: ${subtask.title}`);
        console.log(`     Status: ${subtask.status}`);
        console.log(`     Estimated Duration: ${subtask.estimatedDuration || 'Not specified'}`);
        if (subtask.deadline) {
          console.log(`     Deadline: ${new Date(subtask.deadline).toLocaleString()}`);
        }
      });
    }
    
    console.log('\n===== TEST COMPLETED =====');
  } catch (error) {
    console.error('Error testing getAllSubtasks:', error);
  }
}

// Main function to run the tests
async function runTests() {
  try {
    // Login to get user ID
    const user = await login();
    
    // Test getAllSubtasks method
    await testGetAllSubtasks(user.id);
    
    console.log('\nAll tests completed successfully.');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the tests
runTests();