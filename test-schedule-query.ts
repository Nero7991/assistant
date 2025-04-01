/**
 * Test for the schedule query with our improved SQL syntax
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./shared/schema";
import { format } from 'date-fns';
import { sql, and, eq } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });

async function testScheduleQuery() {
  try {
    console.log('Testing schedule query with improved SQL syntax...');
    
    const userId = 6; // test_user
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Format date as string in a way that PostgreSQL can handle
    const todayStr = format(today, 'yyyy-MM-dd');
    
    console.log(`Checking schedule for date: ${todayStr}`);
    
    // Get the daily schedule for today
    const [dailySchedule] = await db
      .select()
      .from(schema.dailySchedules)
      .where(
        and(
          eq(schema.dailySchedules.userId, userId),
          sql`date_trunc('day', ${schema.dailySchedules.date}::timestamp) = date_trunc('day', ${format(today, 'yyyy-MM-dd')}::timestamp)`
        )
      )
      .limit(1);
    
    if (!dailySchedule) {
      console.log('No daily schedule found for today');
      
      // If no daily schedule exists, check for individual schedule items
      const scheduleItemsResult = await db
        .select({
          id: schema.scheduleItems.id,
          title: schema.scheduleItems.title,
          description: schema.scheduleItems.description,
          startTime: schema.scheduleItems.startTime,
          endTime: schema.scheduleItems.endTime,
          status: schema.scheduleItems.status,
          taskId: schema.scheduleItems.taskId
        })
        .from(schema.scheduleItems)
        .where(
          and(
            eq(schema.scheduleItems.userId, userId),
            sql`${schema.scheduleItems.deletedAt} IS NULL`,
            sql`date_trunc('day', ${schema.scheduleItems.date}::timestamp) = date_trunc('day', ${format(today, 'yyyy-MM-dd')}::timestamp)`
          )
        )
        .orderBy(schema.scheduleItems.startTime);
      
      console.log(`Found ${scheduleItemsResult.length} individual schedule items`);
      
      // Format the schedule items
      const formattedItems = scheduleItemsResult.map(item => {
        return {
          id: item.id,
          title: item.title,
          description: item.description,
          time: item.startTime ? format(new Date(item.startTime), 'h:mm a') : null,
          endTime: item.endTime ? format(new Date(item.endTime), 'h:mm a') : null,
          status: item.status,
          taskId: item.taskId
        };
      });
      
      console.log('Formatted schedule items:');
      console.log(JSON.stringify(formattedItems, null, 2));
      
    } else {
      console.log(`Found daily schedule with ID ${dailySchedule.id}`);
      
      // Get the schedule items for this daily schedule
      const scheduleItemsResult = await db
        .select()
        .from(schema.scheduleItems)
        .where(
          and(
            eq(schema.scheduleItems.scheduleId, dailySchedule.id),
            sql`${schema.scheduleItems.deletedAt} IS NULL`
          )
        )
        .orderBy(schema.scheduleItems.startTime);
      
      console.log(`Found ${scheduleItemsResult.length} schedule items for this daily schedule`);
      
      // Format the schedule items
      const formattedItems = scheduleItemsResult.map(item => {
        return {
          id: item.id,
          title: item.title,
          description: item.description,
          time: item.startTime ? format(new Date(item.startTime), 'h:mm a') : null,
          endTime: item.endTime ? format(new Date(item.endTime), 'h:mm a') : null,
          status: item.status,
          scheduleId: item.scheduleId,
          taskId: item.taskId
        };
      });
      
      console.log('Formatted schedule items:');
      console.log(JSON.stringify(formattedItems, null, 2));
    }
    
    return true;
  } catch (error) {
    console.error('Test failed:', error);
    return false;
  }
}

// Run the test
testScheduleQuery().then(success => {
  console.log(`Test ${success ? 'succeeded' : 'failed'}`);
  process.exit(success ? 0 : 1);
});
