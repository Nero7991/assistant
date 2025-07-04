#!/usr/bin/env tsx
import { db } from '../server/db';
import { users } from '@shared/schema';
import { eq, like } from 'drizzle-orm';

async function fixWhatsAppPhoneNumbers() {
  console.log('=== Fixing All WhatsApp Phone Numbers ===\n');
  
  try {
    // Find all users with phone numbers that have the whatsapp: prefix
    const usersWithPrefix = await db.select().from(users).where(like(users.phoneNumber, 'whatsapp:%'));
    
    console.log(`Found ${usersWithPrefix.length} users with 'whatsapp:' prefix in phone numbers:\n`);
    
    for (const user of usersWithPrefix) {
      console.log(`User: ${user.email} (ID: ${user.id})`);
      console.log(`   Current phone: ${user.phoneNumber}`);
      
      if (user.phoneNumber && user.phoneNumber.startsWith('whatsapp:')) {
        const cleanedPhone = user.phoneNumber.replace('whatsapp:', '');
        console.log(`   🔧 Cleaning to: ${cleanedPhone}`);
        
        await db.update(users)
          .set({ phoneNumber: cleanedPhone })
          .where(eq(users.id, user.id));
        
        console.log(`   ✅ Updated successfully!\n`);
      }
    }
    
    // Verify all are fixed
    const remainingWithPrefix = await db.select().from(users).where(like(users.phoneNumber, 'whatsapp:%'));
    
    if (remainingWithPrefix.length === 0) {
      console.log('✅ All phone numbers have been cleaned!');
    } else {
      console.log(`⚠️ ${remainingWithPrefix.length} users still have the prefix`);
    }
    
  } catch (error) {
    console.error('Error fixing phone numbers:', error);
  }
}

// Run the fix
fixWhatsAppPhoneNumbers().catch(console.error);