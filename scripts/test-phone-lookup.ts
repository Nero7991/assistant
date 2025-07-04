#!/usr/bin/env tsx
import { db } from '../server/db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Copy the fixed findUserByPhoneNumber function for testing
async function findUserByPhoneNumber(phoneNumber: string): Promise<number | null> {
  try {
    console.log(`[DEBUG] Looking up phone number: ${phoneNumber}`);
    
    // Normalize phone number format
    // Remove any non-digit characters to ensure consistent matching
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    console.log(`[DEBUG] Normalized phone: ${normalizedPhone}`);
    
    // Check both formats - with and without country code
    const possibleFormats = [
      normalizedPhone,                   // Full format with country code
      normalizedPhone.replace(/^1/, '')  // US number without the leading 1
    ];
    console.log(`[DEBUG] Possible formats: ${possibleFormats.join(', ')}`);
    
    // Get all phone-verified users (we need to do manual filtering because of phone number normalization)
    const matchedUsers = await db
      .select()
      .from(users)
      .where(
        eq(users.isPhoneVerified, true)
      );
      
    console.log(`[DEBUG] Found ${matchedUsers.length} phone-verified users in database`);
    
    // Manual filter since we need to normalize the stored numbers for comparison too
    const user = matchedUsers.find(user => {
      if (!user.phoneNumber) return false;
      const userPhone = user.phoneNumber.replace(/\D/g, '');
      console.log(`[DEBUG] Checking user ${user.id} (${user.email}) with phone: ${user.phoneNumber} -> normalized: ${userPhone}`);
      
      // Check for exact match first
      const exactMatch = possibleFormats.some(format => userPhone === format);
      if (exactMatch) {
        console.log(`[DEBUG] Found exact match for user ${user.id}`);
        return true;
      }
      
      // Check for partial match (includes)
      const partialMatch = possibleFormats.some(format => userPhone.includes(format) || format.includes(userPhone));
      if (partialMatch) {
        console.log(`[DEBUG] Found partial match for user ${user.id}`);
        return true;
      }
      
      console.log(`[DEBUG] No match for user ${user.id}`);
      return false;
    });
    
    if (user) {
      console.log(`[DEBUG] Successfully found user ${user.id} (${user.email}) with matching phone number: ${phoneNumber}`);
      return user.id;
    }
    
    console.log(`[DEBUG] No user found with phone number: ${phoneNumber}`);
    return null;
  } catch (error) {
    console.error(`[ERROR] Error finding user by phone number:`, error);
    return null;
  }
}

async function testPhoneLookup() {
  console.log('=== Testing Phone Number Lookup ===\n');
  
  // Test various phone number formats
  const testNumbers = [
    '+919764263963',
    '919764263963',
    '9764263963',
    'whatsapp:+919764263963',
    '+91 9764263963',
    '+91-976-426-3963'
  ];
  
  for (const testNumber of testNumbers) {
    console.log(`\n--- Testing: ${testNumber} ---`);
    const result = await findUserByPhoneNumber(testNumber);
    console.log(`Result: ${result ? `User ID ${result}` : 'No user found'}`);
  }
  
  console.log('\n=== Test Complete ===');
}

// Run the test
testPhoneLookup().catch(console.error);