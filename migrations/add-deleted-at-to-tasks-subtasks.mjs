import postgres from 'postgres';

// Create a PostgreSQL connection
const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString);

async function addDeletedAtColumns() {
  try {
    console.log('Adding deletedAt columns to tasks and subtasks tables...');
    
    // Check if deletedAt column already exists in tasks table
    const tasksColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='tasks' AND column_name='deleted_at'
    `;
    
    if (tasksColumns.length === 0) {
      console.log('Adding deleted_at column to tasks table');
      await sql`
        ALTER TABLE tasks
        ADD COLUMN deleted_at TIMESTAMP
      `;
      console.log('Added deleted_at column to tasks table');
    } else {
      console.log('deleted_at column already exists in tasks table');
    }
    
    // Check if deletedAt column already exists in subtasks table
    const subtasksColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='subtasks' AND column_name='deleted_at'
    `;
    
    if (subtasksColumns.length === 0) {
      console.log('Adding deleted_at column to subtasks table');
      await sql`
        ALTER TABLE subtasks
        ADD COLUMN deleted_at TIMESTAMP
      `;
      console.log('Added deleted_at column to subtasks table');
    } else {
      console.log('deleted_at column already exists in subtasks table');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error executing migration:', error);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

addDeletedAtColumns();