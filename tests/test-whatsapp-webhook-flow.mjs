import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TEST_PHONE = '+12025551234'; // Test phone number

// Helper to simulate WhatsApp webhook
async function sendWhatsAppMessage(phoneNumber, message) {
  const webhookPayload = {
    From: `whatsapp:${phoneNumber}`,
    Body: message,
    MessageSid: 'SM' + Math.random().toString(36).substr(2, 32),
    AccountSid: process.env.TWILIO_ACCOUNT_SID || 'ACtest',
    To: process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886'
  };
  
  console.log(`📱 Sending WhatsApp message: "${message}"`);
  
  const response = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(webhookPayload).toString()
  });
  
  const responseText = await response.text();
  console.log(`📨 Response (${response.status}):`, responseText);
  
  return { status: response.status, body: responseText };
}

// Helper to check if user exists
async function checkUserExists(phoneNumber) {
  // This would need an API endpoint to check, for now we'll simulate
  console.log(`🔍 Checking if user exists with phone: ${phoneNumber}`);
  // In real implementation, you'd query the database
  return false;
}

// Helper to wait
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runWhatsAppOnboardingFlow() {
  console.log('=== WhatsApp Webhook Onboarding Flow Test ===\n');
  
  const testEmail = `test_${Date.now()}@example.com`;
  const testName = 'TestUser';
  
  try {
    // Step 1: Initial contact from unknown number
    console.log('\n1️⃣ Initial Contact');
    const resp1 = await sendWhatsAppMessage(TEST_PHONE, 'Hello');
    await sleep(1000);
    
    // Step 2: Confirm signup
    console.log('\n2️⃣ Confirming Signup');
    const resp2 = await sendWhatsAppMessage(TEST_PHONE, 'yes');
    await sleep(1000);
    
    // Step 3: Provide name
    console.log('\n3️⃣ Providing Name');
    const resp3 = await sendWhatsAppMessage(TEST_PHONE, testName);
    await sleep(1000);
    
    // Step 4: Provide email
    console.log('\n4️⃣ Providing Email');
    const resp4 = await sendWhatsAppMessage(TEST_PHONE, testEmail);
    await sleep(2000); // Give time for email to send
    
    // Step 5: Enter verification code (simulated)
    console.log('\n5️⃣ Entering Verification Code');
    console.log('⚠️  Note: In real flow, check email for actual code');
    // In real test, you'd need to fetch the code from email or database
    const resp5 = await sendWhatsAppMessage(TEST_PHONE, '123456');
    await sleep(1000);
    
    // Step 6: Test post-signup message
    console.log('\n6️⃣ Testing Post-Signup');
    const resp6 = await sendWhatsAppMessage(TEST_PHONE, 'Hello again');
    
    console.log('\n✅ Onboarding flow test completed!');
    
  } catch (error) {
    console.error('\n❌ Error during test:', error);
    process.exit(1);
  }
}

// Additional test cases
async function runEdgeCaseTests() {
  console.log('\n\n=== Edge Case Tests ===\n');
  
  // Test: Invalid email format
  console.log('\n🧪 Test: Invalid Email Format');
  await sendWhatsAppMessage(TEST_PHONE, 'Start over');
  await sleep(500);
  await sendWhatsAppMessage(TEST_PHONE, 'yes');
  await sleep(500);
  await sendWhatsAppMessage(TEST_PHONE, 'EdgeTest');
  await sleep(500);
  await sendWhatsAppMessage(TEST_PHONE, 'not-an-email');
  await sleep(1000);
  
  // Test: Decline signup
  console.log('\n🧪 Test: Decline Signup');
  const declinePhone = '+13035551234';
  await sendWhatsAppMessage(declinePhone, 'Hello');
  await sleep(500);
  await sendWhatsAppMessage(declinePhone, 'no');
  await sleep(1000);
}

// Status webhook test
async function testStatusWebhook() {
  console.log('\n\n=== Status Webhook Test ===\n');
  
  const statusPayload = {
    MessageSid: 'SM' + Math.random().toString(36).substr(2, 32),
    SmsStatus: 'delivered',
    From: process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886',
    To: 'whatsapp:+12025551234'
  };
  
  console.log('📊 Sending status update webhook');
  
  const response = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(statusPayload).toString()
  });
  
  console.log(`Response (${response.status}):`, await response.text());
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting WhatsApp Integration Tests\n');
  console.log(`Server URL: ${BASE_URL}`);
  console.log(`Test Phone: ${TEST_PHONE}\n`);
  
  // Check if server is running by trying the webhook endpoint
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'test=1'
    });
    // Any response means server is running
    console.log('✅ Server is running');
  } catch (error) {
    console.error('❌ Cannot connect to server. Please start the server first.');
    console.log('Run: npm run dev');
    process.exit(1);
  }
  
  // Run tests
  await runWhatsAppOnboardingFlow();
  await runEdgeCaseTests();
  await testStatusWebhook();
  
  console.log('\n\n✨ All tests completed!\n');
}

// Run tests
runAllTests().catch(console.error);