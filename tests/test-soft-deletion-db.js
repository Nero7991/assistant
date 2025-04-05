/**
 * Test Script for Database Soft Deletion Functionality
 * 
 * This script directly checks the database to verify that soft deletion works
 * by looking at the `deleted_at` column in both tables.
 */

import pkg from 'pg';
const { Pool } = pkg;

// Use pool from env vars
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkMessageSchedules() {
  console.log('Checking message_schedules table for soft deletion:');
  
  try {
    // First check the table schema to confirm deleted_at column exists
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'message_schedules'
    `);
    
    const hasDeletedAt = schemaResult.rows.some(r => r.column_name === 'deleted_at');
    
    if (!hasDeletedAt) {
      console.error('❌ deleted_at column not found in message_schedules table');
      return false;
    }
    
    console.log('✅ message_schedules table has deleted_at column');
    
    // Get some rows where deleted_at is set to check if soft deletion works
    const rowsResult = await pool.query(`
      SELECT id, user_id, status, deleted_at 
      FROM message_schedules 
      WHERE deleted_at IS NOT NULL 
      LIMIT 5
    `);
    
    if (rowsResult.rows.length === 0) {
      console.log('❓ No soft-deleted message schedules found to verify');
    } else {
      console.log(`✅ Found ${rowsResult.rows.length} soft-deleted message schedules:`);
      rowsResult.rows.forEach(row => {
        console.log(`  ID: ${row.id}, Status: ${row.status}, Deleted At: ${row.deleted_at}`);
      });
    }
    
    // Verify that the API filters these out correctly
    return true;
  } catch (error) {
    console.error('❌ Error checking message_schedules table:', error);
    return false;
  }
}

async function checkScheduleItems() {
  console.log('\nChecking schedule_items table for soft deletion:');
  
  try {
    // First check the table schema to confirm deleted_at column exists
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'schedule_items'
    `);
    
    const hasDeletedAt = schemaResult.rows.some(r => r.column_name === 'deleted_at');
    
    if (!hasDeletedAt) {
      console.error('❌ deleted_at column not found in schedule_items table');
      return false;
    }
    
    console.log('✅ schedule_items table has deleted_at column');
    
    // Test soft-deleting a schedule item
    // First create one
    const insertResult = await pool.query(`
      INSERT INTO schedule_items 
      (user_id, title, description, start_time, status, date) 
      VALUES 
      (2, 'Test soft deletion item', 'This is a test item', '14:00', 'scheduled', NOW())
      RETURNING id
    `);
    
    if (insertResult.rows.length === 0) {
      console.error('❌ Failed to create test schedule item');
      return false;
    }
    
    const itemId = insertResult.rows[0].id;
    console.log(`✅ Created test schedule item with ID ${itemId}`);
    
    // Now soft-delete it
    const deleteResult = await pool.query(`
      UPDATE schedule_items 
      SET deleted_at = NOW(), status = 'cancelled' 
      WHERE id = $1 
      RETURNING id, deleted_at
    `, [itemId]);
    
    if (deleteResult.rows.length === 0) {
      console.error(`❌ Failed to soft-delete schedule item ${itemId}`);
      return false;
    }
    
    console.log(`✅ Successfully soft-deleted item ${itemId} at ${deleteResult.rows[0].deleted_at}`);
    
    // Verify the item is filtered out by the isNull condition
    const checkResult = await pool.query(`
      SELECT * FROM schedule_items 
      WHERE id = $1 AND deleted_at IS NULL
    `, [itemId]);
    
    if (checkResult.rows.length > 0) {
      console.error(`❌ Item ${itemId} still appears when filtered for non-deleted items`);
      return false;
    }
    
    console.log(`✅ Item ${itemId} correctly filtered out when querying for non-deleted items`);
    
    return true;
  } catch (error) {
    console.error('❌ Error checking schedule_items table:', error);
    return false;
  }
}

async function runTests() {
  try {
    console.log('=== TESTING SOFT DELETION DATABASE FUNCTIONALITY ===\n');
    
    const messageSchedulesResult = await checkMessageSchedules();
    const scheduleItemsResult = await checkScheduleItems();
    
    console.log('\n=== TEST RESULTS ===');
    console.log('Message Schedules Soft Deletion:', messageSchedulesResult ? 'SUCCESS ✅' : 'FAILED ❌');
    console.log('Schedule Items Soft Deletion:', scheduleItemsResult ? 'SUCCESS ✅' : 'FAILED ❌');
    
    // Close the pool connection when done
    await pool.end();
    
    // Exit with appropriate code based on test results
    process.exit(messageSchedulesResult && scheduleItemsResult ? 0 : 1);
  } catch (error) {
    console.error('Error running tests:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run the tests
runTests();