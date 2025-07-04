#!/usr/bin/env tsx
import { db } from '../server/db';
import { messageHistory } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

async function checkMessageErrors() {
  console.log('=== Checking Message History for collaco.oren@gmail.com (ID: 34) ===\n');
  
  try {
    const messages = await db.select().from(messageHistory)
      .where(eq(messageHistory.userId, 34))
      .orderBy(desc(messageHistory.createdAt))
      .limit(10);
    
    console.log(`Found ${messages.length} recent messages:\n`);
    
    messages.forEach((msg, i) => {
      console.log(`${i+1}. ${msg.createdAt}`);
      console.log(`   Type: ${msg.type}`);
      console.log(`   Status: ${msg.status}`);
      console.log(`   Sender: ${msg.sender || 'system'}`);
      console.log(`   Content: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
      if (msg.error) {
        console.log(`   ❌ ERROR: ${msg.error}`);
      }
      console.log('');
    });
    
    // Look for error patterns
    const errorMessages = messages.filter(m => m.status === 'error' || m.error || m.content.includes('error'));
    if (errorMessages.length > 0) {
      console.log(`\n❌ Found ${errorMessages.length} messages with errors`);
    }
    
    // Check for system messages
    const systemMessages = messages.filter(m => m.type === 'system_message' || m.sender === 'system');
    console.log(`\n📊 Message breakdown:`);
    console.log(`   User messages: ${messages.filter(m => m.type === 'user_message').length}`);
    console.log(`   System messages: ${systemMessages.length}`);
    console.log(`   Error messages: ${errorMessages.length}`);
    
  } catch (error) {
    console.error('Error checking message history:', error);
  }
}

checkMessageErrors().catch(console.error);