/**
 * End-to-End Tests for Agentic LLM Task Management
 * 
 * These tests send natural language messages to the chat API and verify
 * the final database state via API calls.
 */

import fetch from 'node-fetch';
import { strict as assert } from 'assert';

const BASE_URL = 'http://localhost:5000'; // Assuming server runs on port 5000

// --- Test Configuration ---
const TEST_USERNAME = 'llm_test_user'; // Use the user created in integration tests or another dedicated test user
const TEST_PASSWORD = 'hashed_password'; // Ensure this matches the test user's password
const PROCESSING_DELAY = 45000; // Milliseconds to wait for LLM processing (Increased to 45s)

// --- Helper Functions ---

// Store cookies between requests for authentication
let cookies = '';

async function makeRequest(endpoint, method, body = null, expectJson = true) {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`[Test Runner] Making ${method} request to ${url}`);
  
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
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
      // Simple cookie handling, might need improvement for multiple cookies
      cookies = setCookieHeader.split(';')[0]; 
      console.log(`[Test Runner] Received cookies: ${cookies}`);
    }

    const contentType = response.headers.get('content-type');
    if (expectJson && contentType && contentType.includes('application/json')) {
        const data = await response.json();
        console.log(`[Test Runner] Received JSON response status: ${response.status}`);
        if (!response.ok) {
            console.error("[Test Runner] API Error Response:", data);
            // Rethrow or handle specific API errors if needed
        }
        return data;
    } else {
        const text = await response.text();
        console.log(`[Test Runner] Received non-JSON response status: ${response.status}`);
        if (expectJson) {
            console.warn("[Test Runner] Expected JSON but received text:", text.substring(0, 100) + "...");
            try { return JSON.parse(text); } catch { /* ignore parse error */ }
        }
        return text; // Return text if not expecting JSON or if parsing failed
    }
  } catch (error) {
    console.error(`[Test Runner] Error making request to ${url}:`, error);
    throw error;
  }
}

async function login() {
  console.log(`[Test Runner] Logging in as ${TEST_USERNAME}...`);
  cookies = ''; // Clear previous cookies
  try {
    const response = await makeRequest('/api/login', 'POST', {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    
    assert(response && response.id, 'Login failed: No user ID returned');
    console.log(`[Test Runner] Logged in successfully. User ID: ${response.id}`);
    return response; // Returns user object
  } catch (error) {
    console.error('[Test Runner] Login failed:', error);
    process.exit(1); // Exit if login fails
  }
}

async function sendMessage(messageContent) {
  console.log(`[Test Runner] Sending chat message: "${messageContent}"`);
  try {
    // The chat endpoint might return success:true or the processed messages
    const response = await makeRequest('/api/chat/send', 'POST', {
      message: messageContent,
    });
    console.log("[Test Runner] Send message response:", response);
    return response;
  } catch (error) {
    console.error('[Test Runner] Failed to send chat message:', error);
    throw error;
  }
}

async function waitForProcessing(label = 'LLM') {
  console.log(`[Test Runner] Waiting ${PROCESSING_DELAY / 1000} seconds for ${label} processing...`);
  await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY));
}

// Helper to get tasks via API
async function getTasks(status = 'active') {
    try {
        const tasks = await makeRequest(`/api/tasks?status=${status}`, 'GET');
        return Array.isArray(tasks) ? tasks : [];
    } catch (error) {
        console.error('[Test Runner] Failed to get tasks:', error);
        return [];
    }
}

// Helper to delete a task by ID via API (for cleanup)
async function deleteTask(taskId) {
    console.log(`[Test Runner] Cleaning up task ID: ${taskId}`);
    try {
        await makeRequest(`/api/tasks/${taskId}`, 'DELETE', null, false); // Expect no JSON response usually
    } catch (error) { 
        // Ignore errors during cleanup, but log them
        console.warn(`[Test Runner] Failed to cleanup task ID ${taskId}:`, error.message);
    }
}

// Helper to find and delete task by name (useful for setup/cleanup)
async function cleanupTaskByName(name) {
    console.log(`[Test Runner] Cleaning up tasks named "${name}"...`);
    const tasks = await getTasks('all'); 
    const tasksToDelete = tasks.filter(t => t.title === name);
    if (tasksToDelete.length > 0) {
        for (const task of tasksToDelete) {
            await deleteTask(task.id);
        }
        console.log(`[Test Runner] Cleaned up ${tasksToDelete.length} task(s) named "${name}".`);
    } else {
        console.log(`[Test Runner] No tasks named "${name}" found to cleanup.`);
    }
}

// --- Test Suite --- 

async function runTests() {
    console.log("\n===== STARTING E2E Agentic Task Tests (CREATE ONLY - Test 2) =====\n");
    await login();

    // --- CREATE TASK Tests --- 
    console.log("\n--- Testing Task Creation ---");
    const newTaskTitle = "E2E Test: Schedule meeting with marketing";

    /* // Temporarily disable Test 1
    console.log("\nTest 1: Create task (minimal info - expects clarification or default)");
    await cleanupTaskByName(newTaskTitle); // Ensure clean state
    await sendMessage(`Add task: ${newTaskTitle}`);
    await waitForProcessing('Create Task 1');
    let createdTasks = await getTasks('active');
    let task1 = createdTasks.find(t => t.title === newTaskTitle);
    // TODO: Add assertions here based on expected outcome (was it created with default?)
    console.log(`[Result 1] Task found: ${task1 ? JSON.stringify(task1) : 'null'}`);
    if (task1) await deleteTask(task1.id); // Cleanup
    */

    // Test Case 2 (More specific info - using direct phrasing)
    console.log("\nTest 2: Create task (direct phrasing)");
    await cleanupTaskByName(newTaskTitle); // Ensure clean state
    // Use a more structured input to minimize NLU ambiguity
    await sendMessage(`Create Task - Title: ${newTaskTitle}, Type: one-time`); 
    await waitForProcessing('Create Task 2');
    let createdTasks2 = await getTasks('active'); // Use distinct variable name
    let task2 = createdTasks2.find(t => t.title === newTaskTitle);
    assert(task2, `Test 2 Failed: Task '${newTaskTitle}' not found after sending direct message.`);
    assert.equal(task2.taskType, 'one-time', `Test 2 Failed: Task type is not 'one-time'`);
    console.log("[Result 2] Task created successfully with correct type using direct phrasing."); // Updated log
    if (task2) await deleteTask(task2.id); // Cleanup
    
    // Add more create_task variations here...

    /* // Temporarily disable Update tests
    console.log("\n--- Testing Task Update ---");
    const updateTaskTitle = "E2E Task to Update";
    
    // Test Case (Update title)
    console.log("\nTest Update 1: Change task title");
    await cleanupTaskByName(updateTaskTitle); // Clean potential leftovers
    await cleanupTaskByName("Updated Title via E2E");
    // Create the initial task directly via API for a known state
    const initialTask = await makeRequest('/api/tasks', 'POST', { title: updateTaskTitle, taskType: 'one-time', userId: (await login()).id }); 
    assert(initialTask && initialTask.id, "Failed to create initial task for update test");
    
    await sendMessage(`Update the task '${updateTaskTitle}' title to 'Updated Title via E2E'`);
    await waitForProcessing('Update Task 1');
    const updatedTasks = await getTasks('active');
    const finalTask = updatedTasks.find(t => t.title === "Updated Title via E2E");
    assert(finalTask, `Test Update 1 Failed: Task with updated title not found.`);
    assert.equal(finalTask.id, initialTask.id, `Test Update 1 Failed: Task ID changed during update.`);
    console.log("[Result Update 1] Task title updated successfully.");
    if (finalTask) await deleteTask(finalTask.id); // Cleanup
    // Add more update tests...
    */
    
    /* // Temporarily disable Delete tests
    console.log("\n--- Testing Task Deletion ---");
    const deleteTaskTitle = "E2E Task to Delete";
    
    // Test Case (Delete task)
    console.log("\nTest Delete 1: Delete a task");
    await cleanupTaskByName(deleteTaskTitle); // Ensure no leftovers before test
    // Create task via API
    const taskToDelete = await makeRequest('/api/tasks', 'POST', { title: deleteTaskTitle, taskType: 'one-time', userId: (await login()).id });
    assert(taskToDelete && taskToDelete.id, "Failed to create task for delete test");
    
    await sendMessage(`Delete the task '${deleteTaskTitle}'`);
    await waitForProcessing('Delete Task 1');
    const remainingTasks = await getTasks('active');
    const deletedTaskCheck = remainingTasks.find(t => t.id === taskToDelete.id);
    assert(!deletedTaskCheck, `Test Delete 1 Failed: Task ID ${taskToDelete.id} still found after deletion attempt.`);
    console.log("[Result Delete 1] Task deleted successfully.");
    // Add more delete tests...
    */

    console.log("\n===== E2E Agentic Task Tests (CREATE ONLY - Test 2) COMPLETED =====\n");
}

// Run the tests
runTests().catch(error => {
    console.error("\n===== E2E TEST SUITE FAILED =====");
    console.error(error);
    process.exit(1);
}); 