#!/usr/bin/env tsx
import { db } from '../server/db';
import { users, tasks, knownUserFacts, messageHistory } from '@shared/schema';
import { eq, desc, count } from 'drizzle-orm';

async function debugUserRecord() {
  console.log('=== Debugging User: collaco.oren@gmail.com ===\n');
  
  try {
    // Find the user by email
    const user = await db.select().from(users).where(eq(users.email, 'collaco.oren@gmail.com')).limit(1);
    
    if (!user.length) {
      console.log('❌ User not found with email: collaco.oren@gmail.com');
      return;
    }
    
    const userRecord = user[0];
    console.log('✅ User found:');
    console.log(`   ID: ${userRecord.id}`);
    console.log(`   Username: ${userRecord.username}`);
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   Phone: ${userRecord.phoneNumber}`);
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
    console.log(`   First Name: ${userRecord.firstName}`);
    
    // Check tasks
    const userTasks = await db.select().from(tasks).where(eq(tasks.userId, userRecord.id));
    console.log(`\n📋 Tasks: ${userTasks.length} tasks found`);
    
    // Check known user facts
    const userFacts = await db.select().from(knownUserFacts).where(eq(knownUserFacts.userId, userRecord.id));
    console.log(`📝 Known Facts: ${userFacts.length} facts found`);
    
    // Check message history
    const messageCount = await db.select({ count: count() }).from(messageHistory).where(eq(messageHistory.userId, userRecord.id));
    console.log(`💬 Message History: ${messageCount[0].count} messages found`);
    
    // Get recent messages
    const recentMessages = await db.select().from(messageHistory)
      .where(eq(messageHistory.userId, userRecord.id))
      .orderBy(desc(messageHistory.createdAt))
      .limit(5);
    
    if (recentMessages.length > 0) {
      console.log('\n📱 Recent Messages:');
      for (const msg of recentMessages) {
        console.log(`   ${msg.createdAt}: ${msg.sender} - ${msg.content.substring(0, 50)}...`);
      }
    }
    
    // Get a working web user for comparison
    console.log('\n=== Comparing with Working Web User ===');
    const webUsers = await db.select().from(users).where(eq(users.phoneNumber, null)).limit(1);
    
    if (webUsers.length > 0) {
      const webUser = webUsers[0];
      console.log(`\n✅ Web User (${webUser.email}) for comparison:`);
      console.log(`   ID: ${webUser.id}`);
      console.log(`   Contact Preference: ${webUser.contactPreference}`);
      console.log(`   Phone Verified: ${webUser.isPhoneVerified}`);
      console.log(`   Email Verified: ${webUser.isEmailVerified}`);
      console.log(`   Allow Email Notifications: ${webUser.allowEmailNotifications}`);
      console.log(`   Allow Phone Notifications: ${webUser.allowPhoneNotifications}`);
      console.log(`   Active: ${webUser.isActive}`);
      console.log(`   Time Zone: ${webUser.timeZone}`);
      console.log(`   Preferred Model: ${webUser.preferredModel}`);
      console.log(`   First Name: ${webUser.firstName}`);
      
      // Compare key fields
      console.log('\n🔍 Key Differences:');
      if (userRecord.contactPreference !== webUser.contactPreference) {
        console.log(`   Contact Preference: WhatsApp(${userRecord.contactPreference}) vs Web(${webUser.contactPreference})`);
      }
      if (userRecord.isPhoneVerified !== webUser.isPhoneVerified) {
        console.log(`   Phone Verified: WhatsApp(${userRecord.isPhoneVerified}) vs Web(${webUser.isPhoneVerified})`);
      }
      if (userRecord.isEmailVerified !== webUser.isEmailVerified) {
        console.log(`   Email Verified: WhatsApp(${userRecord.isEmailVerified}) vs Web(${webUser.isEmailVerified})`);
      }
      if (userRecord.allowEmailNotifications !== webUser.allowEmailNotifications) {
        console.log(`   Allow Email: WhatsApp(${userRecord.allowEmailNotifications}) vs Web(${webUser.allowEmailNotifications})`);
      }
      if (userRecord.allowPhoneNotifications !== webUser.allowPhoneNotifications) {
        console.log(`   Allow Phone: WhatsApp(${userRecord.allowPhoneNotifications}) vs Web(${webUser.allowPhoneNotifications})`);
      }
      if (userRecord.isActive !== webUser.isActive) {
        console.log(`   Active: WhatsApp(${userRecord.isActive}) vs Web(${webUser.isActive})`);
      }
      if (userRecord.timeZone !== webUser.timeZone) {
        console.log(`   Time Zone: WhatsApp(${userRecord.timeZone}) vs Web(${webUser.timeZone})`);
      }
      if (userRecord.preferredModel !== webUser.preferredModel) {
        console.log(`   Preferred Model: WhatsApp(${userRecord.preferredModel}) vs Web(${webUser.preferredModel})`);
      }
      if (userRecord.firstName !== webUser.firstName) {
        console.log(`   First Name: WhatsApp(${userRecord.firstName}) vs Web(${webUser.firstName})`);
      }
    }
    
    // Check for potential issues
    console.log('\n🚨 Potential Issues:');
    const issues = [];
    
    if (!userRecord.isActive) {
      issues.push('User is not active');
    }
    if (!userRecord.isPhoneVerified) {
      issues.push('Phone not verified');
    }
    if (!userRecord.allowPhoneNotifications) {
      issues.push('Phone notifications disabled');
    }
    if (!userRecord.timeZone) {
      issues.push('No timezone set');
    }
    if (!userRecord.firstName) {
      issues.push('No first name set');
    }
    if (!userRecord.preferredModel) {
      issues.push('No preferred model set');
    }
    
    if (issues.length === 0) {
      console.log('   ✅ No obvious issues found');
    } else {
      issues.forEach(issue => console.log(`   ❌ ${issue}`));
    }
    
  } catch (error) {
    console.error('Error debugging user record:', error);
  }
}

// Run the debug function
debugUserRecord().catch(console.error);