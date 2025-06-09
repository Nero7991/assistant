import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

async function resetTestUserPassword() {
  console.log('Resetting test user password...');
  
  try {
    const username = 'testuser';
    const newPassword = 'testpass123';
    
    // Hash password using scrypt (EXACT same format as auth.ts)
    const salt = randomBytes(16).toString("hex");
    const derivedKey = await scryptAsync(newPassword, salt, 64) as Buffer;
    const hashedPassword = `${derivedKey.toString("hex")}.${salt}`; // Use dot separator like auth.ts
    
    console.log('Generated hash for password:', hashedPassword.substring(0, 50) + '...');
    
    // Update the user's password
    const result = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.username, username))
      .returning();
    
    if (result.length > 0) {
      console.log('\n✅ Password reset successfully!');
      console.log('Username:', username);
      console.log('Password:', newPassword);
      console.log('User ID:', result[0].id);
    } else {
      console.log('❌ User not found');
    }
  } catch (error) {
    console.error('Error resetting password:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

resetTestUserPassword();