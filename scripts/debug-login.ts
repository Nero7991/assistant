import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function debugLogin() {
  console.log('Debugging login issue...\n');
  
  try {
    // Check what's actually in the database for testuser
    const testUser = await db.select().from(users).where(eq(users.email, 'testuser@example.com')).limit(1);
    
    if (testUser.length === 0) {
      console.log('❌ No user found with email testuser@example.com');
      return;
    }
    
    const user = testUser[0];
    console.log('Found user in database:');
    console.log('- ID:', user.id);
    console.log('- Username:', user.username);
    console.log('- Email:', user.email);
    console.log('- Active:', user.isActive);
    console.log('- Email Verified:', user.isEmailVerified);
    console.log('- Password hash format:', user.password.includes('.') ? 'Dot separated (correct)' : 'Colon separated (wrong)');
    console.log('- Password hash length:', user.password.length);
    console.log('- Password hash preview:', user.password.substring(0, 20) + '...');
    
    // Check for other users to see if login system works
    console.log('\nChecking other users in database:');
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      isActive: users.isActive
    }).from(users).limit(5);
    
    allUsers.forEach(user => {
      console.log(`- ID: ${user.id}, Username: ${user.username}, Email: ${user.email}, Active: ${user.isActive}`);
    });
    
  } catch (error) {
    console.error('Error debugging login:', error);
  }
  
  process.exit(0);
}

debugLogin();