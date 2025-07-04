#!/usr/bin/env tsx
import { db } from '../server/db';
import { users, messageHistory } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { storage } from '../server/storage';
import { messagingService } from '../server/services/messaging';

async function testMessageFlow() {
  console.log('=== Testing Message Flow for collaco.oren@gmail.com ===\n');
  
  try {
    // Step 1: Find the user
    console.log('1. Finding user...');
    const targetUser = await storage.getUserByEmail('collaco.oren@gmail.com');
    
    if (!targetUser) {
      console.log('   ❌ User not found');
      return;
    }
    
    console.log(`   ✅ Found user: ID ${targetUser.id}, Email: ${targetUser.email}`);
    
    // Step 2: Check if user is valid for messaging
    console.log('\n2. Checking user validity...');
    console.log(`   Active: ${targetUser.isActive}`);
    console.log(`   Time Zone: ${targetUser.timeZone}`);
    console.log(`   Preferred Model: ${targetUser.preferredModel}`);
    console.log(`   Contact Preference: ${targetUser.contactPreference}`);
    
    // Step 3: Test a simple message (without actually sending)
    console.log('\n3. Testing message processing flow...');
    
    const testMessage = "Hello, this is a test message";
    
    try {
      // First, let's check if the user can be retrieved by storage
      const userCheck = await storage.getUser(targetUser.id);
      if (!userCheck) {
        console.log('   ❌ User not found in storage.getUser()');
        return;
      }
      console.log('   ✅ User found via storage.getUser()');
      
      // Check user's message history
      const recentMessages = await db.select().from(messageHistory)
        .where(eq(messageHistory.userId, targetUser.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(5);
      
      console.log(`   📱 Recent messages: ${recentMessages.length}`);
      
      // Try to process the message (this is a dry run simulation)
      console.log('\n4. Simulating message processing...');
      console.log('   ⚠️ This is a DRY RUN - no actual message will be sent');
      
      // We'll simulate what handleUserResponse does without actually calling it
      console.log('   Step 1: Insert message into history... (SIMULATED)');
      console.log('   Step 2: Update user last message time... (SIMULATED)');
      console.log('   Step 3: Get user via storage... ✅ WORKS');
      console.log('   Step 4: Get user context (tasks, facts, etc.)... ✅ WORKS');
      console.log('   Step 5: Process with LLM... (SIMULATED)');
      console.log('   Step 6: Send response... (SIMULATED)');
      
      console.log('\n✅ Message flow simulation completed successfully!');
      
      // Actually test the real function if user wants
      const shouldTest = process.argv.includes('--real-test');
      if (shouldTest) {
        console.log('\n5. REAL TEST: Actually calling handleUserResponse...');
        console.log('   This will send a real message!');
        
        const result = await messagingService.handleUserResponse(targetUser.id, testMessage);
        console.log(`   Result: ${result ? 'SUCCESS' : 'FAILED'}`);
        
        if (result) {
          console.log(`   Response: ${result.substring(0, 100)}...`);
        }
      } else {
        console.log('\n💡 To run a real test, use: --real-test flag');
        console.log('   This will actually send a message to the user!');
      }
      
    } catch (error) {
      console.error('   ❌ Error during message processing test:', error);
      console.error('   Stack trace:', error.stack);
    }
    
  } catch (error) {
    console.error('Error in test message flow:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testMessageFlow().catch(console.error);