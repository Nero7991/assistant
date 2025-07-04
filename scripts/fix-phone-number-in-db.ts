#!/usr/bin/env tsx
import { db } from '../server/db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function fixPhoneNumberInDB() {
  console.log('=== Fixing Phone Number for collaco.oren@gmail.com ===\n');
  
  try {
    // Find the user by email
    const user = await db.select().from(users).where(eq(users.email, 'collaco.oren@gmail.com')).limit(1);
    
    if (!user.length) {
      console.log('❌ User not found with email: collaco.oren@gmail.com');
      return;
    }
    
    const userRecord = user[0];
    console.log('✅ User found');
    console.log(`   Current phone number: ${userRecord.phoneNumber}`);
    
    if (userRecord.phoneNumber && userRecord.phoneNumber.startsWith('whatsapp:')) {
      const cleanedPhone = userRecord.phoneNumber.replace('whatsapp:', '');
      console.log(`🔧 Cleaning phone number to: ${cleanedPhone}`);
      
      await db.update(users)
        .set({ phoneNumber: cleanedPhone })
        .where(eq(users.id, userRecord.id));
      
      console.log('✅ Phone number updated successfully!');
      
      // Verify the update
      const updatedUser = await db.select().from(users).where(eq(users.id, userRecord.id)).limit(1);
      console.log(`\n📊 Updated phone number: ${updatedUser[0].phoneNumber}`);
    } else {
      console.log('✅ Phone number is already in correct format');
    }
    
    // Check all WhatsApp users for similar issues
    console.log('\n🔍 Checking other WhatsApp users...');
    const allUsers = await db.select().from(users);
    const usersWithWhatsAppPrefix = allUsers.filter(u => u.phoneNumber && u.phoneNumber.startsWith('whatsapp:'));
    
    if (usersWithWhatsAppPrefix.length > 0) {
      console.log(`\n⚠️ Found ${usersWithWhatsAppPrefix.length} users with 'whatsapp:' prefix:`);
      for (const u of usersWithWhatsAppPrefix) {
        console.log(`   - ${u.email} (ID: ${u.id}): ${u.phoneNumber}`);
      }
    } else {
      console.log('✅ No other users have the whatsapp: prefix issue');
    }
    
  } catch (error) {
    console.error('Error fixing phone number:', error);
  }
}

// Run the fix
fixPhoneNumberInDB().catch(console.error);