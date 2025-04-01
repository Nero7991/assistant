/**
 * Simple test to verify the SQL queries directly using tsx
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./shared/schema";
import { format } from 'date-fns';
import { sql } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });

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
      sql`${schema.messageSchedules.userId} = ${userId}`,
      sql`${schema.messageSchedules.status} = ${'pending'}`,
      sql`${schema.messageSchedules.deletedAt} IS NULL`,
      sql`${schema.messageSchedules.scheduledFor} >= ${today}::timestamp`,
      sql`${schema.messageSchedules.scheduledFor} < ${tomorrow}::timestamp`
    ];
    
    // Combine conditions with AND
    const whereClause = sql.join(conditions, sql` AND `);
    
    console.log('Executing query for today\'s notifications...');
    
    const pendingSchedules = await db
      .select()
      .from(schema.messageSchedules)
      .where(whereClause)
      .orderBy(schema.messageSchedules.scheduledFor);
    
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
        taskId: notification.metadata && typeof notification.metadata === 'object' ? (notification.metadata as any).taskId || null : null
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
