import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq, or } from 'drizzle-orm';

async function checkTestUser() {
  console.log('Checking test user details...\n');
  
  try {
    // Check for users with testuser username or email
    const testUsers = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      isActive: users.isActive,
      isEmailVerified: users.isEmailVerified
    }).from(users)
      .where(or(
        eq(users.username, 'testuser'),
        eq(users.email, 'testuser@example.com')
      ));
    
    console.log(`Found ${testUsers.length} matching users:`);
    testUsers.forEach(user => {
      console.log(`\nUser ID: ${user.id}`);
      console.log(`Username: ${user.username}`);
      console.log(`Email: ${user.email}`);
      console.log(`Active: ${user.isActive}`);
      console.log(`Email Verified: ${user.isEmailVerified}`);
    });

    if (testUsers.length === 0) {
      console.log('\nNo test user found!');
    }
  } catch (error) {
    console.error('Error checking test user:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

checkTestUser();