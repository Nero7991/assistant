/**
 * Simple test to verify the SQL queries directly
 * This bypasses the LLM and messaging system to focus on the database queries
 */

import { db } from './server/db.js';
import { format } from 'date-fns';
import { sql } from 'drizzle-orm';
import { messageSchedules } from './shared/schema.js';

async function testNotificationQuery() {
  try {
    console.log('Testing direct database queries...');
    
    const userId = 6; // test_user
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Build conditions for the query
    const conditions = [
      sql`${messageSchedules.userId} = ${userId}`,
      sql`${messageSchedules.status} = ${'pending'}`,
      sql`${messageSchedules.deletedAt} IS NULL`,
      sql`${messageSchedules.scheduledFor} >= ${today}::timestamp`,
      sql`${messageSchedules.scheduledFor} < ${tomorrow}::timestamp`
    ];
    
    // Combine conditions with AND
    const whereClause = sql.join(conditions, sql` AND `);
    
    console.log('Executing query for today\'s notifications...');
    
    const pendingSchedules = await db
      .select()
      .from(messageSchedules)
      .where(whereClause)
      .orderBy(messageSchedules.scheduledFor);
    
    console.log(`Found ${pendingSchedules.length} notifications for today`);
    
    // Format the results to be more readable
    const formattedNotifications = pendingSchedules.map(notification => {
      let scheduledTime;
      
      try {
        scheduledTime = notification.scheduledFor ? 
          format(new Date(notification.scheduledFor), 'h:mm a') : 
          'No time set';
      } catch (error) {
        scheduledTime = 'Invalid date';
        console.error('Error formatting date:', error);
      }
      
      return {
        id: notification.id,
        type: notification.type,
        title: notification.title || (notification.type === 'morning_message' ? 'Daily Morning Schedule' : 'Follow-up Check-in'),
        scheduledTime,
        taskId: notification.metadata && typeof notification.metadata === 'object' ? (notification.metadata.taskId || null) : null
      };
    });
    
    console.log('Formatted notifications:');
    console.log(JSON.stringify(formattedNotifications, null, 2));
    
    return true;
  } catch (error) {
    console.error('Test failed:', error);
    return false;
  }
}

// Run the test
testNotificationQuery().then(success => {
  console.log(`Test ${success ? 'succeeded' : 'failed'}`);
  process.exit(success ? 0 : 1);
});
