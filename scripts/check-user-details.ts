#!/usr/bin/env tsx
import { db } from '../server/db';
import { users, tasks, knownUserFacts, messageHistory } from '@shared/schema';
import { eq, desc, count } from 'drizzle-orm';

async function checkUserDetails(email: string) {
  console.log(`=== Checking User Details for ${email} ===\n`);
  
  try {
    // Find the user by email
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user.length) {
      console.log(`❌ User not found with email: ${email}`);
      return;
    }
    
    const userRecord = user[0];
    console.log('✅ User found:');
    console.log(`   ID: ${userRecord.id}`);
    console.log(`   Username: ${userRecord.username}`);
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   Phone: ${userRecord.phoneNumber}`);
    console.log(`   First Name: ${userRecord.firstName}`);
    console.log(`   Contact Preference: ${userRecord.contactPreference}`);
    console.log(`   Phone Verified: ${userRecord.isPhoneVerified}`);
    console.log(`   Email Verified: ${userRecord.isEmailVerified}`);
    console.log(`   Allow Email Notifications: ${userRecord.allowEmailNotifications}`);
    console.log(`   Allow Phone Notifications: ${userRecord.allowPhoneNotifications}`);
    console.log(`   Active: ${userRecord.isActive}`);
    console.log(`   Deactivated At: ${userRecord.deactivatedAt}`);
    console.log(`   Time Zone: ${userRecord.timeZone}`);
    console.log(`   Preferred Model: ${userRecord.preferredModel}`);
    console.log(`   Wake Time: ${userRecord.wakeTime}`);
    console.log(`   Routine Start Time: ${userRecord.routineStartTime}`);
    console.log(`   Sleep Time: ${userRecord.sleepTime}`);
    console.log(`   Last User Message: ${userRecord.last_user_initiated_message_at}`);
    
    // Check for potential issues
    console.log('\n🔍 Checking for issues:');
    const issues = [];
    
    if (!userRecord.isActive) {
      issues.push('User is not active');
    }
    if (!userRecord.timeZone) {
      issues.push('No timezone set');
    }
    if (!userRecord.preferredModel) {
      issues.push('No preferred model set');
    }
    if (userRecord.phoneNumber && userRecord.phoneNumber.includes('whatsapp:')) {
      issues.push('Phone number contains whatsapp: prefix');
    }
    if (userRecord.contactPreference === 'whatsapp' && !userRecord.isPhoneVerified) {
      issues.push('WhatsApp user but phone not verified');
    }
    if (userRecord.contactPreference === 'whatsapp' && !userRecord.allowPhoneNotifications) {
      issues.push('WhatsApp user but phone notifications disabled');
    }
    
    if (issues.length === 0) {
      console.log('   ✅ No issues found');
    } else {
      console.log('   ❌ Issues found:');
      issues.forEach(issue => console.log(`      - ${issue}`));
    }
    
    // Check message history
    const messageCount = await db.select({ count: count() }).from(messageHistory).where(eq(messageHistory.userId, userRecord.id));
    console.log(`\n📊 Stats:`);
    console.log(`   Message History: ${messageCount[0].count} messages`);
    
    // Get recent messages
    const recentMessages = await db.select().from(messageHistory)
      .where(eq(messageHistory.userId, userRecord.id))
      .orderBy(desc(messageHistory.createdAt))
      .limit(5);
    
    if (recentMessages.length > 0) {
      console.log('\n📱 Recent Messages:');
      for (const msg of recentMessages) {
        const date = new Date(msg.createdAt).toLocaleString();
        console.log(`   ${date}: [${msg.type}] ${msg.content.substring(0, 50)}...`);
        if (msg.status === 'error' || msg.error) {
          console.log(`      ❌ Error: ${msg.error || 'Message has error status'}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error checking user details:', error);
  }
}

// Run the check for the specified email
const email = process.argv[2] || 'collacoursula@gmail.com';
checkUserDetails(email).catch(console.error);