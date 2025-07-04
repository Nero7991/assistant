#!/usr/bin/env tsx
import { db } from '../server/db';
import { users, tasks, knownUserFacts, messageHistory } from '@shared/schema';
import { eq, desc, count, and, isNotNull } from 'drizzle-orm';
import { storage } from '../server/storage';

async function diagnoseWhatsAppUser() {
  console.log('=== COMPREHENSIVE WhatsApp User Diagnosis ===\n');
  console.log('Target User: collaco.oren@gmail.com\n');
  
  try {
    // Step 1: Find the user
    console.log('🔍 Step 1: Finding user...');
    const user = await db.select().from(users).where(eq(users.email, 'collaco.oren@gmail.com')).limit(1);
    
    if (!user.length) {
      console.log('❌ CRITICAL: User not found with email: collaco.oren@gmail.com');
      return;
    }
    
    const userRecord = user[0];
    console.log('✅ User found');
    console.log(`   ID: ${userRecord.id}`);
    console.log(`   Email: ${userRecord.email}`);
    console.log(`   Phone: ${userRecord.phoneNumber}`);
    
    // Step 2: Check critical fields
    console.log('\n🔍 Step 2: Checking critical fields...');
    const criticalIssues = [];
    
    // isActive check
    if (userRecord.isActive === null || userRecord.isActive === false) {
      criticalIssues.push('User is not active');
      console.log('❌ CRITICAL: User is not active (' + userRecord.isActive + ')');
    } else {
      console.log('✅ User is active');
    }
    
    // timeZone check
    if (!userRecord.timeZone) {
      criticalIssues.push('No timezone set');
      console.log('❌ CRITICAL: No timezone set');
    } else {
      console.log('✅ Timezone set: ' + userRecord.timeZone);
    }
    
    // preferredModel check
    if (!userRecord.preferredModel) {
      criticalIssues.push('No preferred model set');
      console.log('❌ CRITICAL: No preferred model set');
    } else {
      console.log('✅ Preferred model set: ' + userRecord.preferredModel);
    }
    
    // Phone verification for WhatsApp users
    if (userRecord.phoneNumber && !userRecord.isPhoneVerified) {
      criticalIssues.push('Phone number not verified');
      console.log('❌ CRITICAL: Phone number not verified');
    } else if (userRecord.phoneNumber) {
      console.log('✅ Phone number verified');
    }
    
    // Step 3: Check messaging service compatibility
    console.log('\n🔍 Step 3: Testing storage service compatibility...');
    try {
      const storageUser = await storage.getUser(userRecord.id);
      if (storageUser) {
        console.log('✅ User retrievable via storage.getUser()');
      } else {
        criticalIssues.push('User not retrievable via storage service');
        console.log('❌ CRITICAL: User not retrievable via storage.getUser()');
      }
    } catch (error) {
      criticalIssues.push('Storage service error: ' + error.message);
      console.log('❌ CRITICAL: Storage service error: ' + error.message);
    }
    
    // Step 4: Check WhatsApp-specific settings
    console.log('\n🔍 Step 4: Checking WhatsApp-specific settings...');
    
    if (userRecord.contactPreference !== 'whatsapp') {
      console.log('⚠️ Contact preference is not "whatsapp": ' + userRecord.contactPreference);
    } else {
      console.log('✅ Contact preference set to whatsapp');
    }
    
    if (!userRecord.allowPhoneNotifications) {
      console.log('⚠️ Phone notifications disabled');
    } else {
      console.log('✅ Phone notifications enabled');
    }
    
    // Step 5: Check context data
    console.log('\n🔍 Step 5: Checking user context data...');
    
    const userTasks = await db.select().from(tasks).where(eq(tasks.userId, userRecord.id));
    console.log(`📋 Tasks: ${userTasks.length}`);
    
    const userFacts = await db.select().from(knownUserFacts).where(eq(knownUserFacts.userId, userRecord.id));
    console.log(`📝 Known Facts: ${userFacts.length}`);
    
    const messageCount = await db.select({ count: count() }).from(messageHistory).where(eq(messageHistory.userId, userRecord.id));
    console.log(`💬 Message History: ${messageCount[0].count}`);
    
    const recentMessages = await db.select().from(messageHistory)
      .where(eq(messageHistory.userId, userRecord.id))
      .orderBy(desc(messageHistory.createdAt))
      .limit(3);
    
    if (recentMessages.length > 0) {
      console.log('📱 Recent messages:');
      recentMessages.forEach((msg, i) => {
        console.log(`   ${i + 1}. ${msg.createdAt}: ${msg.sender} - ${msg.content.substring(0, 50)}...`);
      });
    }
    
    // Step 6: Final diagnosis
    console.log('\n=== FINAL DIAGNOSIS ===');
    
    if (criticalIssues.length === 0) {
      console.log('✅ No critical issues found!');
      console.log('   User should be able to receive WhatsApp messages.');
      console.log('   If still not working, check server logs and webhook configuration.');
    } else {
      console.log('❌ CRITICAL ISSUES FOUND:');
      criticalIssues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`);
      });
      console.log('\n🔧 RECOMMENDATION: Run fix-whatsapp-user.ts to resolve these issues');
    }
    
    // Step 7: Provide actionable next steps
    console.log('\n=== NEXT STEPS ===');
    if (criticalIssues.length > 0) {
      console.log('1. Run: npx tsx scripts/fix-whatsapp-user.ts');
      console.log('2. Restart the server');
      console.log('3. Test sending a WhatsApp message to the user');
      console.log('4. Check server logs for detailed webhook processing');
    } else {
      console.log('1. Check server logs for webhook processing errors');
      console.log('2. Verify Twilio webhook configuration');
      console.log('3. Test the phone number lookup with: npx tsx scripts/test-phone-lookup.ts');
      console.log('4. Consider testing with: npx tsx scripts/test-message-flow.ts --real-test');
    }
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR during diagnosis:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the diagnosis
diagnoseWhatsAppUser().catch(console.error);