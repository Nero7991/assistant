#!/usr/bin/env tsx
import { db } from '../server/db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function fixWhatsAppUser() {
  console.log('=== Fixing WhatsApp User: collaco.oren@gmail.com ===\n');
  
  try {
    // Find the user by email
    const user = await db.select().from(users).where(eq(users.email, 'collaco.oren@gmail.com')).limit(1);
    
    if (!user.length) {
      console.log('❌ User not found with email: collaco.oren@gmail.com');
      return;
    }
    
    const userRecord = user[0];
    console.log('✅ User found, checking configuration...');
    console.log(`   Current ID: ${userRecord.id}`);
    console.log(`   Current Phone: ${userRecord.phoneNumber}`);
    console.log(`   Current Active: ${userRecord.isActive}`);
    console.log(`   Current Phone Verified: ${userRecord.isPhoneVerified}`);
    console.log(`   Current Contact Preference: ${userRecord.contactPreference}`);
    
    // Check what needs to be fixed
    const updates: any = {};
    
    // Critical fixes for messaging service
    if (userRecord.isActive === null || userRecord.isActive === false) {
      updates.isActive = true;
      console.log('🔧 Setting user to active (was: ' + userRecord.isActive + ')');
    }
    
    if (!userRecord.isPhoneVerified && userRecord.phoneNumber) {
      updates.isPhoneVerified = true;
      console.log('🔧 Setting phone as verified');
    }
    
    if (!userRecord.allowPhoneNotifications && userRecord.phoneNumber) {
      updates.allowPhoneNotifications = true;
      console.log('🔧 Enabling phone notifications');
    }
    
    if (!userRecord.timeZone) {
      updates.timeZone = 'America/New_York';
      console.log('🔧 Setting default timezone to America/New_York');
    }
    
    if (!userRecord.preferredModel) {
      updates.preferredModel = 'gemini-2.5-flash';
      console.log('🔧 Setting default preferred model to gemini-2.5-flash');
    }
    
    if (!userRecord.wakeTime) {
      updates.wakeTime = '08:00';
      console.log('🔧 Setting default wake time to 08:00');
    }
    
    if (!userRecord.routineStartTime) {
      updates.routineStartTime = '09:30';
      console.log('🔧 Setting default routine start time to 09:30');
    }
    
    if (!userRecord.sleepTime) {
      updates.sleepTime = '23:00';
      console.log('🔧 Setting default sleep time to 23:00');
    }
    
    // Ensure contact preference is set to whatsapp if they have a phone number
    if (userRecord.phoneNumber && userRecord.contactPreference !== 'whatsapp') {
      updates.contactPreference = 'whatsapp';
      console.log('🔧 Setting contact preference to whatsapp');
    }
    
    // Ensure email notifications are enabled (for fallback)
    if (!userRecord.allowEmailNotifications) {
      updates.allowEmailNotifications = true;
      console.log('🔧 Enabling email notifications as fallback');
    }
    
    // Ensure email is verified
    if (!userRecord.isEmailVerified) {
      updates.isEmailVerified = true;
      console.log('🔧 Setting email as verified');
    }
    
    // Set first name if missing (helpful for personalization)
    if (!userRecord.firstName) {
      updates.firstName = 'Friend';
      console.log('🔧 Setting default first name to "Friend"');
    }
    
    // Apply updates if needed
    if (Object.keys(updates).length > 0) {
      console.log('\n🔄 Applying updates...');
      await db.update(users).set(updates).where(eq(users.id, userRecord.id));
      console.log('✅ User configuration updated successfully!');
      
      // Show what was updated
      console.log('\n📋 Updated fields:');
      Object.entries(updates).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
    } else {
      console.log('✅ No updates needed - user configuration looks good!');
    }
    
    // Show final user state
    const updatedUser = await db.select().from(users).where(eq(users.id, userRecord.id)).limit(1);
    const finalUser = updatedUser[0];
    
    console.log('\n📊 Final User Configuration:');
    console.log(`   Active: ${finalUser.isActive}`);
    console.log(`   Phone Verified: ${finalUser.isPhoneVerified}`);
    console.log(`   Email Verified: ${finalUser.isEmailVerified}`);
    console.log(`   Allow Phone Notifications: ${finalUser.allowPhoneNotifications}`);
    console.log(`   Allow Email Notifications: ${finalUser.allowEmailNotifications}`);
    console.log(`   Contact Preference: ${finalUser.contactPreference}`);
    console.log(`   Time Zone: ${finalUser.timeZone}`);
    console.log(`   Preferred Model: ${finalUser.preferredModel}`);
    console.log(`   Wake Time: ${finalUser.wakeTime}`);
    console.log(`   Routine Start Time: ${finalUser.routineStartTime}`);
    console.log(`   Sleep Time: ${finalUser.sleepTime}`);
    
  } catch (error) {
    console.error('Error fixing WhatsApp user:', error);
  }
}

// Run the fix function
fixWhatsAppUser().catch(console.error);