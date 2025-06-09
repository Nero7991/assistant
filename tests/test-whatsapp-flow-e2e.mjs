#!/usr/bin/env node

import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const BASE_URL = 'http://localhost:3001';
const TEST_PHONE = '+12025559999'; // Different test phone
const TEST_EMAIL = `e2e_test_${Date.now()}@example.com`;

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Start the development server
function startServer() {
  return new Promise((resolve, reject) => {
    log('\n🚀 Starting development server...', colors.blue);
    
    const server = spawn('npm', ['run', 'dev'], {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe'
    });
    
    let serverReady = false;
    
    server.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Local:') && !serverReady) {
        serverReady = true;
        log('✅ Server is ready!', colors.green);
        setTimeout(() => resolve(server), 2000); // Give it a bit more time
      }
    });
    
    server.stderr.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('ExperimentalWarning')) {
        console.error('Server error:', error);
      }
    });
    
    server.on('error', reject);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (!serverReady) {
        server.kill();
        reject(new Error('Server failed to start within 30 seconds'));
      }
    }, 30000);
  });
}

// Check if server is already running
async function checkServerRunning() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
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
    const response = await fetch(`${BASE_URL}/webhook/whatsapp`, {
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
async function runOnboardingFlow() {
  log('\n=== WhatsApp Onboarding E2E Test ===', colors.blue);
  log(`Test Phone: ${TEST_PHONE}`);
  log(`Test Email: ${TEST_EMAIL}\n`);
  
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
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
    const resp3 = await sendWhatsAppMessage(TEST_PHONE, 'TestUser');
    if (!resp3.message?.includes('Thanks TestUser!')) {
      throw new Error('Unexpected name response');
    }
    await sleep(1000);
    
    // Step 4: Provide email
    log('\n4️⃣  Providing Email', colors.blue);
    const resp4 = await sendWhatsAppMessage(TEST_PHONE, TEST_EMAIL);
    if (!resp4.message?.includes("I've sent a 6-digit verification code")) {
      throw new Error('Unexpected email response');
    }
    await sleep(2000);
    
    // Step 5: Enter verification code
    log('\n5️⃣  Entering Verification Code', colors.blue);
    log('⚠️  Note: Using mock code 123456 (configured in test environment)', colors.yellow);
    const resp5 = await sendWhatsAppMessage(TEST_PHONE, '123456');
    if (!resp5.message?.includes('Your email is verified')) {
      throw new Error('Unexpected verification response');
    }
    await sleep(1000);
    
    // Step 6: Test post-signup
    log('\n6️⃣  Testing Post-Signup Message', colors.blue);
    const resp6 = await sendWhatsAppMessage(TEST_PHONE, 'Hello, I am now signed up!');
    // This should return null/empty as it goes to the main messaging service
    
    log('\n✅ All tests passed!', colors.green);
    
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, colors.red);
    throw error;
  }
}

// Run edge case tests
async function runEdgeCaseTests() {
  log('\n\n=== Edge Case Tests ===', colors.blue);
  
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Test 1: Invalid email
  log('\n🧪 Test: Invalid Email Format', colors.yellow);
  const edgePhone1 = '+13035559999';
  await sendWhatsAppMessage(edgePhone1, 'Start');
  await sleep(500);
  await sendWhatsAppMessage(edgePhone1, 'yes');
  await sleep(500);
  await sendWhatsAppMessage(edgePhone1, 'EdgeUser');
  await sleep(500);
  const invalidEmailResp = await sendWhatsAppMessage(edgePhone1, 'not-an-email');
  if (!invalidEmailResp.message?.includes("doesn't look like a valid email")) {
    log('⚠️  Invalid email not properly rejected', colors.yellow);
  } else {
    log('✅ Invalid email properly rejected', colors.green);
  }
  
  // Test 2: Decline signup
  log('\n🧪 Test: Decline Signup', colors.yellow);
  const edgePhone2 = '+14045559999';
  await sendWhatsAppMessage(edgePhone2, 'Hello');
  await sleep(500);
  const declineResp = await sendWhatsAppMessage(edgePhone2, 'no');
  if (!declineResp.message?.includes('Okay, no problem')) {
    log('⚠️  Decline not properly handled', colors.yellow);
  } else {
    log('✅ Decline properly handled', colors.green);
  }
}

// Main test runner
async function main() {
  let server = null;
  
  try {
    // Check if server is already running
    const serverRunning = await checkServerRunning();
    
    if (!serverRunning) {
      // Start the server
      server = await startServer();
    } else {
      log('ℹ️  Server already running, using existing instance', colors.blue);
    }
    
    // Wait a bit for everything to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Run the tests
    await runOnboardingFlow();
    await runEdgeCaseTests();
    
    log('\n\n✨ All E2E tests completed successfully!', colors.green);
    
  } catch (error) {
    log(`\n💥 Fatal error: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
  } finally {
    // Clean up
    if (server) {
      log('\n🧹 Stopping server...', colors.blue);
      server.kill();
    }
    process.exit(0);
  }
}

// Run the tests
main();