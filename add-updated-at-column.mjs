import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function addColumn() {
  try {
    // Connect to the database
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set.');
    }
    
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);
    
    console.log('Adding updated_at column to message_schedules table...');
    await db.execute(sql.raw(`
      ALTER TABLE message_schedules 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW() NOT NULL;
    `));
    console.log('Column added successfully');
    
    // Check if the column exists
    const result = await db.execute(sql.raw(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'message_schedules' 
      AND column_name = 'updated_at';
    `));
    
    if (result.rows.length > 0) {
      console.log('Verified that updated_at column exists');
    } else {
      console.error('Column does not appear to exist after creation');
    }
    
    // Close the connection
    await pool.end();
    
  } catch (error) {
    console.error('Error adding column:', error);
  }
}

addColumn().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});