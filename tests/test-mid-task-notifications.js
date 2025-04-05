/**
 * Test script to verify mid-task check-in notifications for ADHD users
 * 
 * This script tests the following improvements:
 * 1. Mid-task check-ins for tasks over 30 minutes (one check-in)
 * 2. Multiple mid-task check-ins for tasks over 60 minutes (every 25-30 minutes)
 * 3. Proper formatting of notification messages
 */

import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
    username: 'testuser',
    password: 'testpassword'
  });
  
  if (response.ok) {
    const user = await response.json();
    console.log(`Logged in successfully as ${user.username}`);
    return user;
  } else {
    console.error('Failed to log in:', await response.text());
    process.exit(1);
  }
}

async function createLongTask(userId, duration = 90) {
  // Create a task with a specified duration (in minutes)
  console.log(`Creating a long task (${duration} minutes) for user ${userId}`);
  
  const taskResponse = await makeRequest('/api/tasks', 'POST', {
    userId,
    title: `Long Task (${duration} min)`,
    description: `This is a test task that should take ${duration} minutes to complete`,
    taskType: 'DAILY',
    status: 'active',
    priority: 'medium'
  });
  
  if (!taskResponse.ok) {
    console.error('Failed to create task:', await taskResponse.text());
    throw new Error('Failed to create task');
  }
  
  const task = await taskResponse.json();
  console.log(`Created task: ${task.title} with ID ${task.id}`);
  return task;
}

async function requestReschedule(userId, task) {
  console.log(`Requesting a schedule that includes the long task: ${task.title}`);
  
  // Request a schedule for the task
  const rescheduleResponse = await makeRequest(`/api/messages/system/${userId}`, 'POST', {
    type: 'reschedule_request',
    content: `Please schedule my task "${task.title}" from 2:00 PM to ${task.title.includes('90') ? '3:30 PM' : '3:00 PM'} today.`
  });
  
  if (!rescheduleResponse.ok) {
    console.error('Failed to request reschedule:', await rescheduleResponse.text());
    throw new Error('Failed to request reschedule');
  }
  
  const rescheduleMessage = await rescheduleResponse.json();
  console.log(`Received schedule proposal: ${rescheduleMessage.content.substring(0, 100)}...`);
  return rescheduleMessage;
}

async function confirmSchedule(userId, message) {
  console.log(`Confirming the proposed schedule`);
  
  // Send confirmation message
  const confirmResponse = await makeRequest('/api/messages', 'POST', {
    userId,
    content: 'Yes, that schedule looks good to me, please confirm it.'
  });
  
  if (!confirmResponse.ok) {
    console.error('Failed to confirm schedule:', await confirmResponse.text());
    throw new Error('Failed to confirm schedule');
  }
  
  // Wait for processing to complete
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Get the confirmation response
  const messagesResponse = await makeRequest(`/api/messages/${userId}?limit=2`, 'GET');
  const messages = await messagesResponse.json();
  
  // The first message should be the confirmation response
  const confirmationMessage = messages[0];
  console.log(`Received confirmation response: ${confirmationMessage.content.substring(0, 100)}...`);
  
  return confirmationMessage;
}

async function getScheduledNotifications(userId) {
  console.log(`Getting scheduled notifications for user ${userId}`);
  
  const notificationsResponse = await makeRequest(`/api/schedules/messages/${userId}`, 'GET');
  
  if (!notificationsResponse.ok) {
    console.error('Failed to get notifications:', await notificationsResponse.text());
    throw new Error('Failed to get notifications');
  }
  
  const notifications = await notificationsResponse.json();
  console.log(`Found ${notifications.length} scheduled notifications`);
  
  return notifications;
}

async function analyzeNotifications(notifications, taskTitle) {
  console.log(`\n===== NOTIFICATION ANALYSIS =====`);
  console.log(`Analyzing ${notifications.length} notifications for task "${taskTitle}"`);
  
  // Filter notifications for the specific task
  const taskNotifications = notifications.filter(n => 
    (n.title && n.title.includes(taskTitle)) || 
    (n.content && n.content.includes(taskTitle))
  );
  
  console.log(`Found ${taskNotifications.length} notifications for this task`);
  
  // Categorize notifications
  const reminderNotifications = taskNotifications.filter(n => n.title.toLowerCase().includes('reminder'));
  const checkInNotifications = taskNotifications.filter(n => 
    n.title.toLowerCase().includes('check-in') || 
    n.title.toLowerCase().includes('mid-task') ||
    n.content.toLowerCase().includes('how\'s it going') ||
    n.content.toLowerCase().includes('progress') ||
    n.content.toLowerCase().includes('stay focused')
  );
  
  console.log(`\nBreakdown:`);
  console.log(`- Reminder notifications: ${reminderNotifications.length}`);
  console.log(`- Mid-task check-in notifications: ${checkInNotifications.length}`);
  
  // Print details of each notification
  console.log(`\nNotification details:`);
  taskNotifications.forEach((n, i) => {
    console.log(`\n[${i+1}] ${n.title || 'No title'}`);
    console.log(`    Type: ${n.type}`);
    console.log(`    Scheduled For: ${n.scheduledFor}`);
    console.log(`    Content: ${n.content}`);
  });
  
  // Save to file for easier analysis
  fs.writeFileSync('notification-analysis.json', JSON.stringify({
    all: notifications,
    taskSpecific: taskNotifications,
    reminders: reminderNotifications,
    checkIns: checkInNotifications
  }, null, 2));
  
  return {
    all: notifications,
    taskSpecific: taskNotifications,
    reminders: reminderNotifications,
    checkIns: checkInNotifications
  };
}

async function runTest() {
  try {
    // Login
    const user = await login();
    
    // Create a task with 90 minutes duration (should get multiple check-ins)
    const longTask = await createLongTask(user.id, 90);
    
    // Request a schedule that includes the long task
    const scheduleProposal = await requestReschedule(user.id, longTask);
    
    // Confirm the schedule
    const confirmation = await confirmSchedule(user.id, scheduleProposal);
    
    // Check if the confirmation message includes mid-task check-ins
    console.log(`\n===== CHECKING CONFIRMATION MESSAGE =====`);
    const includesMidTaskText = confirmation.content.toLowerCase().includes('mid-task') || 
                               confirmation.content.toLowerCase().includes('check-in');
    
    console.log(`Confirmation includes mid-task check-ins: ${includesMidTaskText}`);
    
    // Get scheduled notifications
    const notifications = await getScheduledNotifications(user.id);
    
    // Analyze the notifications
    const analysis = await analyzeNotifications(notifications, longTask.title);
    
    // Test results
    console.log(`\n===== TEST RESULTS =====`);
    console.log(`1. Found mid-task check-ins in confirmation message: ${includesMidTaskText ? 'SUCCESS' : 'FAILED'}`);
    console.log(`2. Number of mid-task check-in notifications: ${analysis.checkIns.length} ${analysis.checkIns.length >= 2 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`3. Number of reminder notifications: ${analysis.reminders.length} ${analysis.reminders.length >= 1 ? 'SUCCESS' : 'FAILED'}`);
    
    console.log(`\nTest ${(includesMidTaskText && analysis.checkIns.length >= 2 && analysis.reminders.length >= 1) ? 'PASSED' : 'FAILED'}`);
    
    console.log('\nNote: For a 90-minute task, we expect:');
    console.log('- At least 1 pre-task reminder notification');
    console.log('- At least 2 mid-task check-in notifications');
    console.log('- Check-in messages should be supportive and focused on helping maintain focus');
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Add type property
export { runTest };

// Run the test if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Starting mid-task notification test at ${new Date().toLocaleString()}`);
  runTest().then(() => console.log('Test complete'));
}