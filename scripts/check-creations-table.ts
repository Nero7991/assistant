/**
 * Check if the creations table exists and has the proper unique constraint
 */

import { db } from '../server/db';

async function checkCreationsTable() {
  try {
    console.log('🔍 Checking creations table...');
    
    // Check if table exists
    const result = await db.execute({
      sql: `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'creations'`,
      args: []
    });
    
    console.log('Table exists result:', result.rows[0]);
    
    // Check table structure
    const structure = await db.execute({
      sql: `SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'creations' 
            ORDER BY ordinal_position`,
      args: []
    });
    
    console.log('Table structure:');
    structure.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
    // Check constraints
    const constraints = await db.execute({
      sql: `SELECT conname, contype, pg_get_constraintdef(oid) as definition
            FROM pg_constraint 
            WHERE conrelid = 'creations'::regclass`,
      args: []
    });
    
    console.log('\nConstraints:');
    constraints.rows.forEach(row => {
      console.log(`  ${row.conname} (${row.contype}): ${row.definition}`);
    });
    
    // Check indexes
    const indexes = await db.execute({
      sql: `SELECT indexname, indexdef
            FROM pg_indexes 
            WHERE tablename = 'creations'`,
      args: []
    });
    
    console.log('\nIndexes:');
    indexes.rows.forEach(row => {
      console.log(`  ${row.indexname}: ${row.indexdef}`);
    });
    
    console.log('\n✅ Table check complete');
    
  } catch (error) {
    console.error('❌ Error checking creations table:', error);
  }
}

checkCreationsTable();