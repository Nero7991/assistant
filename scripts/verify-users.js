/**
 * Script to verify users in the database
 */
import { db } from './server/db.js';
import { users } from './shared/schema.js';

async function verifyUsers() {
  try {
    const usersList = await db.select().from(users);
    console.log(`Found ${usersList.length} users in the database:`);
    
    usersList.forEach(user => {
      console.log(`ID: ${user.id}, Username: ${user.username}, Password: ${user.password?.substring(0, 10)}...`);
    });
  } catch (error) {
    console.error('Error fetching users:', error);
  } finally {
    process.exit(0);
  }
}

console.log('Starting user verification...');
verifyUsers();