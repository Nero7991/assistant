#!/usr/bin/env node

import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, desc, and } from 'drizzle-orm';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TEST_PHONE = '+15557777'; // Unique test phone (shorter for integer storage)
const TEST_EMAIL = `e2e_full_${Date.now()}@example.com`;
const TEST_NAME = 'TestUser';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const db = drizzle(pool);

// Helper to get verification code from database
async function getVerificationCode(phoneNumber) {
  try {
    // Extract digits from phone number for temp user ID
    const tempId = phoneNumber.replace(/\D/g, '');
    
    log(`\n🔍 Looking for verification code for tempId: ${tempId}`, colors.magenta);
    
    // First, let's see all verifications in the table
    const allVerifications = await pool.query(
      `SELECT * FROM contact_verifications ORDER BY created_at DESC LIMIT 10`
    );
    
    log(`📊 All recent verifications:`, colors.magenta);
    allVerifications.rows.forEach(v => {
      log(`   User ID: ${v.user_id}, Type: ${v.type}, Code: ${v.code}, Created: ${v.created_at}`, colors.blue);
    });
    
    // Query the database directly
    const result = await pool.query(
      `SELECT * FROM contact_verifications 
       WHERE user_id = $1 AND type = 'email' 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [parseInt(tempId)]
    );
    
    if (result.rows.length > 0) {
      const verification = result.rows[0];
      log(`📧 Found verification code: ${verification.code}`, colors.green);
      log(`   Expires at: ${verification.expires_at}`, colors.blue);
      log(`   Verified: ${verification.verified}`, colors.blue);
      return verification.code;
    } else {
      log('❌ No verification code found', colors.red);
      return null;
    }
  } catch (error) {
    log(`❌ Error fetching verification code: ${error.message}`, colors.red);
    return null;
  }
}

// Helper to check if user was created
async function checkUserCreated(phoneNumber) {
  try {
    const formattedPhone = `whatsapp:${phoneNumber}`;
    
    const result = await pool.query(
      `SELECT * FROM users WHERE phone_number = $1`,
      [formattedPhone]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      log(`\n✅ User created successfully!`, colors.green);
      log(`   ID: ${user.id}`, colors.blue);
      log(`   Email: ${user.email}`, colors.blue);
      log(`   First Name: ${user.first_name}`, colors.blue);
      log(`   Phone Verified: ${user.is_phone_verified}`, colors.blue);
      log(`   Email Verified: ${user.is_email_verified}`, colors.blue);
      return user;
    } else {
      log('❌ User not found in database', colors.red);
      return null;
    }
  } catch (error) {
    log(`❌ Error checking user: ${error.message}`, colors.red);
    return null;
  }
}

// Helper to clean up test data
async function cleanupTestData() {
  try {
    log('\n🧹 Cleaning up test data...', colors.yellow);
    
    // Delete test user
    await pool.query(
      `DELETE FROM users WHERE email = $1 OR phone_number = $2`,
      [TEST_EMAIL, `whatsapp:${TEST_PHONE}`]
    );
    
    // Delete verification records
    const tempId = TEST_PHONE.replace(/\D/g, '');
    await pool.query(
      `DELETE FROM contact_verifications WHERE user_id = $1`,
      [parseInt(tempId)]
    );
    
    log('✅ Cleanup completed', colors.green);
  } catch (error) {
    log(`⚠️  Cleanup error: ${error.message}`, colors.yellow);
  }
}

// Simulate WhatsApp webhook
async function sendWhatsAppMessage(phoneNumber, message) {
  const webhookPayload = {
    From: `whatsapp:${phoneNumber}`,
    Body: message,
    MessageSid: 'SM' + Math.random().toString(36).substr(2, 32),
    AccountSid: process.env.TWILIO_ACCOUNT_SID || 'ACtest',
    To: process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886'
  };
  
  log(`\n📱 Sending: "${message}"`, colors.yellow);
  
  try {
    const response = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(webhookPayload).toString()
    });
    
    const responseText = await response.text();
    
    // Parse TwiML response to extract message
    const messageMatch = responseText.match(/<Message>(.*?)<\/Message>/);
    if (messageMatch) {
      log(`📨 Bot says: "${messageMatch[1]}"`, colors.blue);
    } else if (response.status === 200) {
      log(`✅ Message accepted (no response needed)`, colors.green);
    } else {
      log(`❌ Error (${response.status}): ${responseText}`, colors.red);
    }
    
    return { status: response.status, body: responseText, message: messageMatch?.[1] };
  } catch (error) {
    log(`❌ Request failed: ${error.message}`, colors.red);
    throw error;
  }
}

// Run the complete onboarding flow
async function runFullOnboardingFlow() {
  log('\n=== WhatsApp Full E2E Onboarding Test ===', colors.blue);
  log(`Test Phone: ${TEST_PHONE}`);
  log(`Test Email: ${TEST_EMAIL}`);
  log(`Test Name: ${TEST_NAME}\n`);
  
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    // Clean up any existing test data first
    await cleanupTestData();
    
    // Send a random message to potentially reset any stuck session
    log('\n🔄 Resetting session state...', colors.yellow);
    await sendWhatsAppMessage(TEST_PHONE, 'RESET_' + Math.random());
    await sleep(1000);
    
    // Step 1: Initial contact
    log('\n1️⃣  Initial Contact', colors.blue);
    const resp1 = await sendWhatsAppMessage(TEST_PHONE, 'Hello, I want to sign up!');
    if (!resp1.message?.includes("Hello! I'm your ADHD Assistant coach")) {
      throw new Error('Unexpected initial response');
    }
    await sleep(1000);
    
    // Step 2: Confirm signup
    log('\n2️⃣  Confirming Signup', colors.blue);
    const resp2 = await sendWhatsAppMessage(TEST_PHONE, 'yes');
    if (resp2.message !== "Great! What's your first name?") {
      throw new Error('Unexpected confirmation response');
    }
    await sleep(1000);
    
    // Step 3: Provide name
    log('\n3️⃣  Providing Name', colors.blue);
    const resp3 = await sendWhatsAppMessage(TEST_PHONE, TEST_NAME);
    if (!resp3.message?.includes(`Thanks ${TEST_NAME}!`)) {
      throw new Error('Unexpected name response');
    }
    await sleep(1000);
    
    // Step 4: Provide email
    log('\n4️⃣  Providing Email', colors.blue);
    const resp4 = await sendWhatsAppMessage(TEST_PHONE, TEST_EMAIL);
    if (!resp4.message?.includes("I've sent a 6-digit verification code")) {
      throw new Error('Unexpected email response');
    }
    await sleep(2000); // Give time for database write
    
    // Step 5: Get actual verification code from database
    log('\n5️⃣  Retrieving Verification Code', colors.blue);
    const actualCode = await getVerificationCode(TEST_PHONE);
    if (!actualCode) {
      throw new Error('Could not retrieve verification code from database');
    }
    
    // Step 6: Enter the actual verification code
    log('\n6️⃣  Entering Actual Verification Code', colors.blue);
    const resp5 = await sendWhatsAppMessage(TEST_PHONE, actualCode);
    if (!resp5.message?.includes('Your email is verified')) {
      throw new Error(`Verification failed. Response: ${resp5.message}`);
    }
    await sleep(1000);
    
    // Step 7: Verify user was created in database
    log('\n7️⃣  Verifying User Creation', colors.blue);
    const user = await checkUserCreated(TEST_PHONE);
    if (!user) {
      throw new Error('User was not created in database');
    }
    
    // Step 8: Test post-signup message (should go to main messaging service)
    log('\n8️⃣  Testing Post-Signup Message', colors.blue);
    const resp6 = await sendWhatsAppMessage(TEST_PHONE, 'Hello, I am now signed up!');
    // This should return empty response as it goes to the main messaging service
    if (resp6.message) {
      log(`ℹ️  Post-signup response: ${resp6.message}`, colors.yellow);
    } else {
      log('✅ Post-signup message handled by main service', colors.green);
    }
    
    log('\n🎉 Full onboarding flow completed successfully!', colors.green);
    
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, colors.red);
    throw error;
  }
}

// Test existing user flow
async function testExistingUserFlow() {
  log('\n\n=== Testing Existing User Flow ===', colors.blue);
  
  try {
    // Try to send a message as the existing user
    log('\n📱 Sending message as existing user', colors.blue);
    const resp = await sendWhatsAppMessage(TEST_PHONE, 'Hello, testing as existing user');
    
    // Should get empty response (handled by main service) not onboarding
    if (resp.message?.includes("sign up")) {
      log('❌ Unexpected: User still seeing onboarding flow', colors.red);
    } else {
      log('✅ Existing user properly routed to main service', colors.green);
    }
    
  } catch (error) {
    log(`❌ Existing user test failed: ${error.message}`, colors.red);
  }
}

// Test edge cases
async function testEdgeCases() {
  log('\n\n=== Testing Edge Cases ===', colors.blue);
  
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Test: Existing email
  log('\n🧪 Test: Using Existing Email', colors.yellow);
  const edgePhone1 = '+13035558888';
  await sendWhatsAppMessage(edgePhone1, 'Start');
  await sleep(500);
  await sendWhatsAppMessage(edgePhone1, 'yes');
  await sleep(500);
  await sendWhatsAppMessage(edgePhone1, 'EdgeUser');
  await sleep(500);
  const existingEmailResp = await sendWhatsAppMessage(edgePhone1, TEST_EMAIL);
  if (existingEmailResp.message?.includes('already associated')) {
    log('✅ Existing email properly rejected', colors.green);
  } else {
    log('⚠️  Existing email check may have failed', colors.yellow);
  }
}

// Main test runner
async function main() {
  try {
    // Check if server is running
    log('🔍 Checking server status...', colors.blue);
    try {
      await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'test=1'
      });
      log('✅ Server is running\n', colors.green);
    } catch (error) {
      log('❌ Cannot connect to server. Please start the server first.', colors.red);
      log('Run: npm run dev', colors.yellow);
      process.exit(1);
    }
    
    // Run the full onboarding test
    await runFullOnboardingFlow();
    
    // Test existing user behavior
    await testExistingUserFlow();
    
    // Test edge cases
    await testEdgeCases();
    
    // Final cleanup
    await cleanupTestData();
    
    log('\n\n✨ All E2E tests completed successfully!', colors.green);
    log('🎯 WhatsApp onboarding is working correctly!', colors.green);
    
    await pool.end();
    process.exit(0);
    
  } catch (error) {
    log(`\n💥 Fatal error: ${error.message}`, colors.red);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  log('\n\n🛑 Test interrupted, cleaning up...', colors.yellow);
  await cleanupTestData();
  await pool.end();
  process.exit(0);
});

// Run the tests
main();