/**
 * Debug test to examine the schedule item dates causing issues
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./shared/schema";
import { sql, and, eq } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });

async function debugScheduleItems() {
  try {
    console.log('Debugging schedule items...');
    
    const userId = 6; // test_user
    
    // Get all schedule items for this user
    const allItems = await db
      .select()
      .from(schema.scheduleItems);
    
    console.log(`Total schedule items in database: ${allItems.length}`);
    
    // Show the raw item data
    console.log('Raw schedule item data:');
    console.log(JSON.stringify(allItems, null, 2));
    
    // Get all daily schedules
    const dailySchedules = await db
      .select()
      .from(schema.dailySchedules);
    
    console.log(`\nTotal daily schedules: ${dailySchedules.length}`);
    console.log('Raw daily schedule data:');
    console.log(JSON.stringify(dailySchedules, null, 2));
    
    return true;
  } catch (error) {
    console.error('Debug failed:', error);
    return false;
  }
}

// Run the debug
debugScheduleItems().then(success => {
  console.log(`Debug ${success ? 'completed' : 'failed'}`);
  process.exit(success ? 0 : 1);
});
