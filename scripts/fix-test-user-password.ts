import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../server/auth'; // Import the exact function

async function fixTestUserPassword() {
  console.log('Fixing test user password with exact auth.ts function...');
  
  try {
    const username = 'testuser';
    const newPassword = 'testpass123';
    
    // Use the EXACT hashPassword function from auth.ts
    const hashedPassword = await hashPassword(newPassword);
    
    console.log('Generated hash using auth.ts function:', hashedPassword.substring(0, 50) + '...');
    
    // Update the user's password
    const result = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.username, username))
      .returning();
    
    if (result.length > 0) {
      console.log('\n✅ Password fixed successfully using auth.ts hashPassword function!');
      console.log('Username:', username);
      console.log('Password:', newPassword);
      console.log('User ID:', result[0].id);
    } else {
      console.log('❌ User not found');
    }
  } catch (error) {
    console.error('Error fixing password:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

fixTestUserPassword();