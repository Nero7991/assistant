#!/usr/bin/env tsx
import { db } from '../server/db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { messagingService } from '../server/services/messaging';

async function testWhatsAppSend() {
  console.log('=== Testing WhatsApp Send Functionality ===\n');
  
  try {
    // Find the user
    const user = await db.select().from(users).where(eq(users.email, 'collaco.oren@gmail.com')).limit(1);
    
    if (!user.length) {
      console.log('❌ User not found');
      return;
    }
    
    const userRecord = user[0];
    console.log('✅ User found');
    console.log(`   ID: ${userRecord.id}`);
    console.log(`   Phone: ${userRecord.phoneNumber}`);
    
    // Test sending a message directly
    console.log('\n📱 Testing direct WhatsApp send...');
    
    const testMessage = "🧪 Test message from debugging script. If you receive this, WhatsApp sending is working!";
    
    if (userRecord.phoneNumber) {
      const result = await messagingService.sendWhatsAppMessage(userRecord.phoneNumber, testMessage);
      
      if (result) {
        console.log('✅ WhatsApp message sent successfully!');
      } else {
        console.log('❌ Failed to send WhatsApp message');
      }
    } else {
      console.log('❌ User has no phone number');
    }
    
    // Also test the full flow
    console.log('\n🔄 Testing full message flow...');
    const responseTest = await messagingService.handleUserResponse(userRecord.id, "Test message - please respond");
    
    if (responseTest) {
      console.log('✅ Full message flow completed');
      console.log(`   Response: ${responseTest.substring(0, 100)}...`);
    } else {
      console.log('❌ Full message flow failed');
    }
    
  } catch (error) {
    console.error('Error in test:', error);
  }
}

// Run the test
testWhatsAppSend().catch(console.error);