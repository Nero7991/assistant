/**
 * Migration script to add 'title' column to message_schedules table
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { exit } from 'process';

// Create PostgreSQL client
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

// Run the migration
async function addTitleColumn() {
  console.log('Starting migration: Adding title column to message_schedules table...');
  
  try {
    // Add the title column
    await client.unsafe(`
      ALTER TABLE message_schedules 
      ADD COLUMN IF NOT EXISTS title TEXT DEFAULT NULL;
    `);
    
    console.log('Successfully added title column to message_schedules table');
  } catch (error) {
    console.error('Error adding title column to message_schedules table:', error);
    exit(1);
  } finally {
    await client.end();
  }
}

// Execute the migration
addTitleColumn().then(() => {
  console.log('Migration completed successfully');
  exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  exit(1);
});