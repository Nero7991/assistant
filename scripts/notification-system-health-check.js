/**
 * Integrated Health Check for Kona Notification System
 * 
 * This script performs a quick health check of the notification system:
 * 1. Checks that notifications are correctly saved to the message_schedules table
 * 2. Verifies mid-task check-ins are created for longer tasks
 * 3. Validates that notification titles use task names instead of IDs
 * 
 * Run with: node notification-system-health-check.js
 */

import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { runTest as midTaskTest } from './test-mid-task-notifications.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cookie storage for authentication
let cookies = '';

async function makeRequest(endpoint, method, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies
    },
    credentials: 'include'
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`http://localhost:5000${endpoint}`, options);
  
  // Save cookies for session maintenance
  const setCookies = response.headers.raw()['set-cookie'];
  if (setCookies) {
    cookies = setCookies.map(c => c.split(';')[0]).join('; ');
  }
  
  return response;
}

async function login() {
  const response = await makeRequest('/api/login', 'POST', {
    username: 'orencollaco',
    password: 'password'
  });
  
  if (response.ok) {
    const user = await response.json();
    console.log(`[Health Check] Logged in successfully as ${user.username}`);
    return user;
  } else {
    console.error('[Health Check] Failed to log in:', await response.text());
    process.exit(1);
  }
}

async function checkNotificationTableStructure() {
  console.log('\n[Health Check] Checking notification table structure...');
  
  const response = await makeRequest('/api/schedules/messages/structure', 'GET');
  
  if (!response.ok) {
    console.error('[Health Check] Failed to get table structure:', await response.text());
    return false;
  }
  
  const structure = await response.json();
  
  // Check for important fields
  const requiredFields = ['title', 'content', 'scheduledFor', 'type'];
  const missingFields = requiredFields.filter(field => !structure.includes(field));
  
  if (missingFields.length > 0) {
    console.error(`[Health Check] Missing required fields in message_schedules table: ${missingFields.join(', ')}`);
    return false;
  }
  
  console.log('[Health Check] Notification table structure is valid');
  return true;
}

async function checkNotificationFormatting(userId) {
  console.log('\n[Health Check] Checking notification formatting...');
  
  // Create a test task
  const taskResponse = await makeRequest('/api/tasks', 'POST', {
    userId,
    title: 'Health Check Task',
    description: 'This is a task created by the health check script',
    taskType: 'DAILY',
    status: 'active',
    priority: 'medium'
  });
  
  if (!taskResponse.ok) {
    console.error('[Health Check] Failed to create test task:', await taskResponse.text());
    return false;
  }
  
  const task = await taskResponse.json();
  console.log(`[Health Check] Created test task: ${task.title} with ID ${task.id}`);
  
  // Request a schedule for the task
  const scheduleResponse = await makeRequest(`/api/messages/system/${userId}`, 'POST', {
    type: 'reschedule_request',
    content: `Please schedule my task "${task.title}" for 2 hours from now.`
  });
  
  if (!scheduleResponse.ok) {
    console.error('[Health Check] Failed to request schedule:', await scheduleResponse.text());
    return false;
  }
  
  // Wait for LLM processing
  console.log('[Health Check] Waiting for schedule processing...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Confirm the schedule
  const confirmResponse = await makeRequest('/api/messages', 'POST', {
    userId,
    content: 'The schedule looks good to me, please confirm it.'
  });
  
  if (!confirmResponse.ok) {
    console.error('[Health Check] Failed to confirm schedule:', await confirmResponse.text());
    return false;
  }
  
  // Wait for processing to complete
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Get scheduled notifications
  const notificationsResponse = await makeRequest(`/api/schedules/messages/${userId}`, 'GET');
  
  if (!notificationsResponse.ok) {
    console.error('[Health Check] Failed to get notifications:', await notificationsResponse.text());
    return false;
  }
  
  const notifications = await notificationsResponse.json();
  console.log(`[Health Check] Found ${notifications.length} scheduled notifications`);
  
  // Check for task name usage instead of IDs
  const taskNotifications = notifications.filter(n => 
    (n.title && n.title.includes(task.title)) || 
    (n.content && n.content.includes(task.title))
  );
  
  const hasTaskNameInNotifications = taskNotifications.length > 0;
  console.log(`[Health Check] Notifications using task name: ${hasTaskNameInNotifications ? 'YES' : 'NO'}`);
  
  return hasTaskNameInNotifications;
}

async function runHealthCheck() {
  try {
    console.log('===== Kona Notification System Health Check =====');
    console.log(`Starting health check at ${new Date().toLocaleString()}`);
    
    // Step 1: Login
    const user = await login();
    
    // Step 2: Check notification table structure
    const validStructure = await checkNotificationTableStructure();
    
    // Step 3: Check notification formatting
    const validFormatting = await checkNotificationFormatting(user.id);
    
    // Step 4: Run the mid-task notification test
    console.log('\n[Health Check] Running mid-task notification test...');
    await midTaskTest();
    
    // Report results
    console.log('\n===== Health Check Summary =====');
    console.log(`- Notification table structure: ${validStructure ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`- Notification formatting: ${validFormatting ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`- Mid-task notifications: SEE TEST RESULTS ABOVE`);
    
    console.log('\nHealth check completed at', new Date().toLocaleString());
    
  } catch (error) {
    console.error('Health check error:', error);
  }
}

// Run the health check
runHealthCheck();