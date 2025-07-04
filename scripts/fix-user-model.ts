#!/usr/bin/env tsx
import { db } from '../server/db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function fixUserModel() {
  console.log('=== Fixing User Model for collaco.oren@gmail.com ===\n');
  
  try {
    // Find the user by email
    const user = await db.select().from(users).where(eq(users.email, 'collaco.oren@gmail.com')).limit(1);
    
    if (!user.length) {
      console.log('❌ User not found with email: collaco.oren@gmail.com');
      return;
    }
    
    const userRecord = user[0];
    console.log('✅ User found');
    console.log(`   Current preferred model: ${userRecord.preferredModel}`);
    
    if (userRecord.preferredModel === 'o1-mini') {
      console.log('\n⚠️ The model "o1-mini" might be causing issues');
      console.log('🔧 Updating to Gemini Flash 2.5: gemini-2.5-flash');
      
      await db.update(users)
        .set({ preferredModel: 'gemini-2.5-flash' })
        .where(eq(users.id, userRecord.id));
      
      console.log('✅ Model updated successfully!');
      
      // Verify the update
      const updatedUser = await db.select().from(users).where(eq(users.id, userRecord.id)).limit(1);
      console.log(`\n📊 Updated preferred model: ${updatedUser[0].preferredModel}`);
    } else {
      console.log('✅ Model is already set to a standard model');
    }
    
  } catch (error) {
    console.error('Error fixing user model:', error);
  }
}

// Run the fix
fixUserModel().catch(console.error);