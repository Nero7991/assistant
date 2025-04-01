/**
 * Simple test for the notification handling functionality
 * 
 * This script tests if the schedule parser correctly separates schedule activity items
 * from notification items, storing notifications in message_schedules table.
 */

import { parseScheduleFromLLMResponse, createDailyScheduleFromParsed } from './server/services/schedule-parser-new';
import { db } from './server/db';
import { users, tasks } from './shared/schema';
import { eq } from 'drizzle-orm';

async function testNotificationSeparation() {
  try {
    console.log('===== Testing Notification Separation =====');
    
    // 1. Create a sample LLM response with both schedule items and notifications
    const sampleLLMResponse = `Here's my response to your request.

The final schedule is as follows:
- 09:00 AM: Morning planning session
- 10:30 AM: Work on project report
- 12:00 PM: Lunch break
- 13:30 PM: Team meeting
- 15:00 PM: Reminder - Check progress on project report - Make sure you're on track
- 16:30 PM: Mid-task check-in - Are you making good progress on the report?
- 18:00 PM: End of day review

Notifications:
- 10:15 AM: Reminder - Prepare for your project work - Gather your notes and resources
- 13:15 PM: Follow-up - Team meeting preparation - Review the agenda
- 17:30 PM: Check-in - Daily progress reflection - How was your productivity today?`;

    // 2. Parse the response
    const parsedSchedule = parseScheduleFromLLMResponse(sampleLLMResponse);
    
    if (!parsedSchedule) {
      console.error('Failed to parse schedule');
      process.exit(1);
    }
    
    console.log(`Parsed ${parsedSchedule.scheduleItems.length} schedule items`);
    console.log(`Parsed ${parsedSchedule.notificationItems.length} notification items`);
    
    console.log('\nSchedule items:');
    parsedSchedule.scheduleItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.startTime} - ${item.title}`);
    });
    
    console.log('\nNotification items:');
    parsedSchedule.notificationItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.scheduledFor} - ${item.type} - ${item.title} - ${item.content}`);
    });
    
    // 3. Find a test user to use
    const [testUser] = await db.select().from(users).limit(1);
    
    if (!testUser) {
      console.error('No test user found in database');
      process.exit(1);
    }
    
    console.log(`\nUsing test user: ${testUser.username} (ID: ${testUser.id})`);
    
    // 4. Get user's tasks
    const userTasks = await db.select().from(tasks).where(eq(tasks.userId, testUser.id));
    
    console.log(`Found ${userTasks.length} tasks for testing`);
    
    // 5. Create a daily schedule with the parsed data
    try {
      const scheduleId = await createDailyScheduleFromParsed(
        testUser.id,
        parsedSchedule,
        userTasks
      );
      
      console.log(`\nCreated new schedule with ID: ${scheduleId}`);
      console.log('Test completed successfully!');
    } catch (error) {
      console.error('Error creating daily schedule:', error.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testNotificationSeparation();