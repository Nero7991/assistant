import { handleWhatsAppOnboarding } from '../server/services/whatsappOnboarding.js';
import { db } from '../server/db.js';
import { users, contactVerifications } from '../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { storage } from '../server/storage.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Test configuration
const testPhoneNumber = 'whatsapp:+12025551234';
const testEmail = 'test_' + Date.now() + '@example.com';
const testFirstName = 'TestUser';

async function cleanup() {
  console.log('🧹 Cleaning up test data...');
  
  // Delete test user if exists
  await db.delete(users).where(
    eq(users.phoneNumber, testPhoneNumber)
  );
  
  // Clean up verifications
  const tempId = testPhoneNumber.replace(/\D/g, '');
  await db.delete(contactVerifications).where(
    eq(contactVerifications.userId, parseInt(tempId))
  );
}

async function runTest(description, testFn) {
  console.log(`\n📋 Test: ${description}`);
  try {
    await testFn();
    console.log('✅ PASSED');
  } catch (error) {
    console.log('❌ FAILED:', error.message);
    console.error(error);
  }
}

async function runOnboardingTests() {
  console.log('=== WhatsApp Onboarding Tests ===\n');
  
  // Initial cleanup
  await cleanup();
  
  // Test 1: Initial contact
  await runTest('Should initiate onboarding for new phone number', async () => {
    const response = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello');
    
    if (!response || !response.includes("Hello! I'm your ADHD Assistant coach")) {
      throw new Error(`Unexpected response: ${response}`);
    }
    
    console.log('   Response:', response.substring(0, 100) + '...');
  });
  
  // Test 2: Confirm signup
  await runTest('Should proceed to name collection on "yes"', async () => {
    const response = await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
    
    if (response !== "Great! What's your first name?") {
      throw new Error(`Unexpected response: ${response}`);
    }
    
    console.log('   Response:', response);
  });
  
  // Test 3: Provide name
  await runTest('Should accept name and ask for email', async () => {
    const response = await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
    
    if (!response || !response.includes(`Thanks ${testFirstName}!`)) {
      throw new Error(`Unexpected response: ${response}`);
    }
    
    console.log('   Response:', response);
  });
  
  // Test 4: Provide email
  await runTest('Should accept email and send verification code', async () => {
    const response = await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
    
    if (!response || !response.includes("I've sent a 6-digit verification code")) {
      throw new Error(`Unexpected response: ${response}`);
    }
    
    console.log('   Response:', response);
    
    // Check if verification was created
    const tempId = testPhoneNumber.replace(/\D/g, '');
    const verification = await storage.getLatestContactVerification(parseInt(tempId));
    
    if (!verification) {
      throw new Error('No verification record created');
    }
    
    console.log('   Verification code:', verification.code);
    console.log('   Expires at:', verification.expiresAt);
  });
  
  // Test 5: Enter verification code
  await runTest('Should create user with correct verification code', async () => {
    // Get the actual verification code
    const tempId = testPhoneNumber.replace(/\D/g, '');
    const verification = await storage.getLatestContactVerification(parseInt(tempId));
    
    if (!verification) {
      throw new Error('No verification found');
    }
    
    const response = await handleWhatsAppOnboarding(testPhoneNumber, verification.code);
    
    if (!response || !response.includes("Your email is verified")) {
      throw new Error(`Unexpected response: ${response}`);
    }
    
    console.log('   Response:', response);
    
    // Verify user was created
    const newUser = await db.query.users.findFirst({
      where: eq(users.phoneNumber, testPhoneNumber)
    });
    
    if (!newUser) {
      throw new Error('User was not created');
    }
    
    console.log('   User created:', {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      phoneVerified: newUser.isPhoneVerified,
      emailVerified: newUser.isEmailVerified
    });
  });
  
  // Test 6: Try to message after completion
  await runTest('Should indicate user is already set up', async () => {
    const response = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello again');
    
    if (!response || !response.includes("You're already set up!")) {
      throw new Error(`Unexpected response: ${response}`);
    }
    
    console.log('   Response:', response);
  });
  
  // Test 7: Existing user should return null
  await runTest('Should return null for existing user on initial contact', async () => {
    // Start fresh with a new session
    const response = await handleWhatsAppOnboarding(testPhoneNumber, 'New message');
    
    if (response !== null) {
      throw new Error(`Expected null, got: ${response}`);
    }
    
    console.log('   Response: null (as expected for existing user)');
  });
  
  // Final cleanup
  await cleanup();
  
  console.log('\n✨ All tests completed!\n');
}

// Error handler
async function runWithErrorHandling() {
  try {
    await runOnboardingTests();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    await cleanup();
    process.exit(1);
  }
}

// Run the tests
runWithErrorHandling();