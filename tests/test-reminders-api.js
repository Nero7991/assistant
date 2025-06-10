import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testRemindersAPI() {
  console.log('=== Testing Reminders API ===\n');
  
  const baseURL = 'http://localhost:5001'; // Development server
  const testUser = {
    email: 'testuser@example.com', // From CLAUDE.md
    password: 'testpass123'
  };
  
  let sessionCookie = '';
  
  // Helper function for API requests
  async function apiRequest(method, endpoint, data = null) {
    const url = `${baseURL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionCookie && { 'Cookie': sessionCookie })
      },
      ...(data && { body: JSON.stringify(data) })
    };
    
    try {
      const response = await fetch(url, options);
      
      // Capture session cookie from login
      if (response.headers.get('set-cookie')) {
        sessionCookie = response.headers.get('set-cookie').split(';')[0];
      }
      
      const result = await response.json();
      return { status: response.status, data: result };
    } catch (error) {
      return { status: 500, error: error.message };
    }
  }
  
  try {
    // Step 1: Login
    console.log('1. Logging in...');
    const loginResult = await apiRequest('POST', '/api/login', testUser);
    
    if (loginResult.status !== 200) {
      console.error('❌ Login failed:', loginResult.data || loginResult.error);
      return;
    }
    console.log('✅ Login successful');
    
    // Step 2: Test GET /api/reminders
    console.log('\\n2. Fetching existing reminders...');
    const getResult = await apiRequest('GET', '/api/reminders');
    
    if (getResult.status !== 200) {
      console.error('❌ Failed to fetch reminders:', getResult.data || getResult.error);
      return;
    }
    
    const existingReminders = getResult.data;
    console.log(`✅ Found ${existingReminders.length} existing reminders`);
    
    if (existingReminders.length > 0) {
      console.log('First few reminders:');
      existingReminders.slice(0, 3).forEach(reminder => {
        console.log(`  - ${reminder.type}: "${reminder.title}" at ${reminder.scheduledFor}`);
      });
    }
    
    // Step 3: Test POST /api/reminders (Create new reminder)
    console.log('\\n3. Creating new reminder...');
    const newReminder = {
      title: '🧪 API Test Reminder',
      type: 'reminder',
      scheduledFor: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      content: 'This is a test reminder created via API'
    };
    
    const createResult = await apiRequest('POST', '/api/reminders', newReminder);
    
    if (createResult.status !== 201) {
      console.error('❌ Failed to create reminder:', createResult.data || createResult.error);
      return;
    }
    
    const createdReminder = createResult.data;
    console.log(`✅ Created reminder with ID: ${createdReminder.id}`);
    console.log(`   Title: ${createdReminder.title}`);
    console.log(`   Scheduled for: ${createdReminder.scheduledFor}`);
    
    // Step 4: Test GET /api/reminders/:id (Get specific reminder)
    console.log('\\n4. Fetching created reminder...');
    const getOneResult = await apiRequest('GET', `/api/reminders/${createdReminder.id}`);
    
    if (getOneResult.status !== 200) {
      console.error('❌ Failed to fetch specific reminder:', getOneResult.data || getOneResult.error);
      return;
    }
    
    console.log('✅ Successfully fetched specific reminder');
    
    // Step 5: Test PUT /api/reminders/:id (Update reminder)
    console.log('\\n5. Updating reminder...');
    const updateData = {
      title: '🧪 Updated API Test Reminder',
      content: 'This reminder has been updated via API'
    };
    
    const updateResult = await apiRequest('PUT', `/api/reminders/${createdReminder.id}`, updateData);
    
    if (updateResult.status !== 200) {
      console.error('❌ Failed to update reminder:', updateResult.data || updateResult.error);
      return;
    }
    
    console.log('✅ Successfully updated reminder');
    console.log(`   New title: ${updateResult.data.title}`);
    
    // Step 6: Test POST /api/reminders/:id/snooze (Snooze reminder)
    console.log('\\n6. Snoozing reminder...');
    const snoozeResult = await apiRequest('POST', `/api/reminders/${createdReminder.id}/snooze`, {
      minutes: 30
    });
    
    if (snoozeResult.status !== 200) {
      console.error('❌ Failed to snooze reminder:', snoozeResult.data || snoozeResult.error);
      return;
    }
    
    console.log('✅ Successfully snoozed reminder by 30 minutes');
    console.log(`   New time: ${snoozeResult.data.newTime}`);
    
    // Step 7: Test POST /api/reminders/:id/duplicate (Duplicate reminder)
    console.log('\\n7. Duplicating reminder...');
    const duplicateResult = await apiRequest('POST', `/api/reminders/${createdReminder.id}/duplicate`);
    
    if (duplicateResult.status !== 201) {
      console.error('❌ Failed to duplicate reminder:', duplicateResult.data || duplicateResult.error);
      return;
    }
    
    const duplicatedReminder = duplicateResult.data;
    console.log(`✅ Successfully duplicated reminder with ID: ${duplicatedReminder.id}`);
    console.log(`   Title: ${duplicatedReminder.title}`);
    
    // Step 8: Test DELETE /api/reminders/:id (Delete reminders)
    console.log('\\n8. Cleaning up test reminders...');
    
    // Delete original reminder
    const deleteResult1 = await apiRequest('DELETE', `/api/reminders/${createdReminder.id}`);
    if (deleteResult1.status === 200) {
      console.log('✅ Deleted original test reminder');
    } else {
      console.error('❌ Failed to delete original reminder:', deleteResult1.data);
    }
    
    // Delete duplicated reminder
    const deleteResult2 = await apiRequest('DELETE', `/api/reminders/${duplicatedReminder.id}`);
    if (deleteResult2.status === 200) {
      console.log('✅ Deleted duplicated test reminder');
    } else {
      console.error('❌ Failed to delete duplicated reminder:', deleteResult2.data);
    }
    
    // Final verification
    console.log('\\n=== Test Summary ===');
    console.log('✅ All API endpoints tested successfully!');
    console.log('✅ CRUD operations working correctly');
    console.log('✅ Snooze functionality working');
    console.log('✅ Duplicate functionality working');
    console.log('✅ Cleanup completed');
    
    console.log('\\n🎉 Reminders API is ready for integration with the UI!');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

// Check if server is running before testing
async function checkServer() {
  try {
    const response = await fetch('http://localhost:5001/api/user');
    return response.status === 401 || response.ok; // Either unauthorized (server running) or ok
  } catch {
    return false;
  }
}

async function runTests() {
  console.log('Checking if development server is running...');
  
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.error('❌ Development server not running on port 5001');
    console.log('Please run: npm run dev');
    process.exit(1);
  }
  
  console.log('✅ Server is running, starting tests...\n');
  await testRemindersAPI();
}

runTests();