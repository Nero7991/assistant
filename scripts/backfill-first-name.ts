import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;

async function backfillFirstName() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log('Starting backfill for first_name...');
  try {
    const sql = 'UPDATE users SET first_name = username WHERE first_name IS NULL;';
    console.log(`Executing: ${sql}`);
    // Use db.execute for raw SQL with node-postgres adapter
    await db.execute(sql);
    console.log('Backfill completed successfully.');
  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

backfillFirstName(); 