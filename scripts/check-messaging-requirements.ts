#!/usr/bin/env tsx
import { db } from '../server/db';
import { users, tasks, knownUserFacts, messageHistory, messagingPreferences } from '@shared/schema';
import { eq, desc, count, and, isNotNull } from 'drizzle-orm';
import { storage } from '../server/storage';

async function checkMessagingRequirements() {
  console.log('=== Checking Messaging Service Requirements ===\n');
  
  try {
    // Test the storage service getUser function
    console.log('1. Testing storage.getUser() function...');
    const user = await storage.getUser(1); // Test with a known user ID
    console.log(`   ✅ Storage service working: ${user ? 'YES' : 'NO'}`);
    
    // Check specific user
    console.log('\n2. Checking collaco.oren@gmail.com user...');
    const targetUser = await storage.getUserByEmail('collaco.oren@gmail.com');
    
    if (!targetUser) {
      console.log('   ❌ User not found in storage service');
      return;
    }
    
    console.log(`   ✅ User found: ID ${targetUser.id}`);
    
    // Check all required fields for messaging service
    console.log('\n3. Checking required fields for messaging service...');
    
    const requiredFields = [
      { field: 'id', value: targetUser.id, required: true },
      { field: 'email', value: targetUser.email, required: true },
      { field: 'isActive', value: targetUser.isActive, required: true },
      { field: 'timeZone', value: targetUser.timeZone, required: true },
      { field: 'preferredModel', value: targetUser.preferredModel, required: true },
      { field: 'firstName', value: targetUser.firstName, required: false },
      { field: 'phoneNumber', value: targetUser.phoneNumber, required: false },
      { field: 'contactPreference', value: targetUser.contactPreference, required: true },
      { field: 'isPhoneVerified', value: targetUser.isPhoneVerified, required: false },
      { field: 'isEmailVerified', value: targetUser.isEmailVerified, required: false },
      { field: 'allowPhoneNotifications', value: targetUser.allowPhoneNotifications, required: false },
      { field: 'allowEmailNotifications', value: targetUser.allowEmailNotifications, required: false },
      { field: 'wakeTime', value: targetUser.wakeTime, required: false },
      { field: 'routineStartTime', value: targetUser.routineStartTime, required: false },
      { field: 'sleepTime', value: targetUser.sleepTime, required: false },
    ];
    
    let hasIssues = false;
    
    for (const check of requiredFields) {
      const status = check.value !== null && check.value !== undefined ? '✅' : '❌';
      const requirement = check.required ? 'REQUIRED' : 'Optional';
      console.log(`   ${status} ${check.field}: ${check.value} (${requirement})`);
      
      if (check.required && (check.value === null || check.value === undefined)) {
        hasIssues = true;
      }
    }
    
    // Check user's tasks
    console.log('\n4. Checking user context data...');
    const userTasks = await db.select().from(tasks).where(eq(tasks.userId, targetUser.id));
    console.log(`   📋 Tasks: ${userTasks.length}`);
    
    const userFacts = await db.select().from(knownUserFacts).where(eq(knownUserFacts.userId, targetUser.id));
    console.log(`   📝 Known Facts: ${userFacts.length}`);
    
    const messageCount = await db.select({ count: count() }).from(messageHistory).where(eq(messageHistory.userId, targetUser.id));
    console.log(`   💬 Message History: ${messageCount[0].count}`);
    
    // Check messaging preferences
    const msgPrefs = await db.select().from(messagingPreferences).where(eq(messagingPreferences.userId, targetUser.id));
    console.log(`   ⚙️ Messaging Preferences: ${msgPrefs.length > 0 ? 'Set' : 'Not set'}`);
    
    // Test if user can be processed by messaging service
    console.log('\n5. Testing messaging service compatibility...');
    
    if (hasIssues) {
      console.log('   ❌ User has required field issues - may fail in messaging service');
    } else {
      console.log('   ✅ User has all required fields');
    }
    
    // Check if user is active and verified appropriately
    if (!targetUser.isActive) {
      console.log('   ❌ User is not active');
      hasIssues = true;
    }
    
    if (targetUser.contactPreference === 'whatsapp' && !targetUser.isPhoneVerified) {
      console.log('   ⚠️ WhatsApp user but phone not verified');
    }
    
    if (targetUser.contactPreference === 'whatsapp' && !targetUser.allowPhoneNotifications) {
      console.log('   ⚠️ WhatsApp user but phone notifications disabled');
    }
    
    if (!targetUser.timeZone) {
      console.log('   ❌ No timezone set - may cause issues with scheduling');
      hasIssues = true;
    }
    
    if (!targetUser.preferredModel) {
      console.log('   ❌ No preferred model set - may cause LLM issues');
      hasIssues = true;
    }
    
    // Final assessment
    console.log('\n=== FINAL ASSESSMENT ===');
    if (hasIssues) {
      console.log('❌ User has configuration issues that may prevent messaging service from working');
      console.log('   Run fix-whatsapp-user.ts to resolve these issues');
    } else {
      console.log('✅ User configuration looks good for messaging service');
    }
    
    // Check if there are any other WhatsApp users with similar issues
    console.log('\n6. Checking other WhatsApp users for similar issues...');
    const allWhatsAppUsers = await db.select().from(users).where(
      and(
        eq(users.contactPreference, 'whatsapp'),
        isNotNull(users.phoneNumber)
      )
    );
    
    console.log(`   Found ${allWhatsAppUsers.length} WhatsApp users total`);
    
    let problematicUsers = 0;
    for (const whatsappUser of allWhatsAppUsers) {
      const issues = [];
      if (!whatsappUser.isActive) issues.push('inactive');
      if (!whatsappUser.isPhoneVerified) issues.push('phone not verified');
      if (!whatsappUser.allowPhoneNotifications) issues.push('phone notifications disabled');
      if (!whatsappUser.timeZone) issues.push('no timezone');
      if (!whatsappUser.preferredModel) issues.push('no preferred model');
      
      if (issues.length > 0) {
        problematicUsers++;
        console.log(`   ⚠️ ${whatsappUser.email}: ${issues.join(', ')}`);
      }
    }
    
    if (problematicUsers === 0) {
      console.log('   ✅ All WhatsApp users have good configuration');
    } else {
      console.log(`   ❌ ${problematicUsers} WhatsApp users have configuration issues`);
    }
    
  } catch (error) {
    console.error('Error checking messaging requirements:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the check
checkMessagingRequirements().catch(console.error);