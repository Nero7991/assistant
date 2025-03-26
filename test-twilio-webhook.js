/**
 * Twilio Webhook Test Script
 * 
 * This script directly tests the Twilio webhook endpoint by simulating
 * incoming WhatsApp messages in the format that Twilio would send them.
 * 
 * To run this script: node test-twilio-webhook.js
 */

const fetch = require('node-fetch');
const BASE_URL = 'http://localhost:5000';

// Test scenarios matching specific user phone numbers
const testScenarios = [
  {
    name: 'Morning check-in',
    phoneNumber: '+15551234567', // Should match your test user's phone number
    message: 'Good morning! What do I need to focus on today?',
    description: 'User asking about their daily priorities'
  },
  {
    name: 'Task completion',
    phoneNumber: '+15551234567',
    message: 'Just finished my project report! 🎉',
    description: 'User reporting task completion with emoji'
  },
  {
    name: 'Schedule adjustment',
    phoneNumber: '+15551234567',
    message: 'I need to move my dentist appointment to 4pm please',
    description: 'User requesting schedule change'
  },
  {
    name: 'New urgent task',
    phoneNumber: '+15551234567',
    message: 'Need to add a critical task: Submit tax documents by tomorrow!',
    description: 'User adding an urgent task'
  },
  {
    name: 'Requesting advice',
    phoneNumber: '+15551234567',
    message: 'I\'m having trouble getting started today. Any advice?',
    description: 'User seeking help with executive dysfunction'
  },
  {
    name: 'Medication reminder check',
    phoneNumber: '+15551234567',
    message: 'Did I take my Adderall this morning?',
    description: 'User checking about medication (related to known user fact)'
  },
  {
    name: 'Day progress',
    phoneNumber: '+15551234567',
    message: 'So far today I\'ve completed 3 tasks but I\'m stuck on the report',
    description: 'User providing progress update with mixed sentiment'
  },
  {
    name: 'Multi-action request',
    phoneNumber: '+15551234567',
    message: 'Mark project report as done, cancel my 2pm call, and remind me to pick up groceries at 6',
    description: 'User requesting multiple actions at once'
  }
];

/**
 * Simulate a Twilio webhook POST request
 * 
 * This creates a request that mimics Twilio's webhook format.
 * In a real Twilio webhook, the request body would be form-encoded,
 * but our webhook handler should handle both JSON and form-encoded data.
 */
async function simulateTwilioWebhook(scenario) {
  // Format phone numbers as Twilio would
  const from = `whatsapp:${scenario.phoneNumber}`;
  const to = `whatsapp:+18557270654`; // Should match your Twilio phone number
  
  // Create form data in the format Twilio sends
  const formData = new URLSearchParams();
  formData.append('Body', scenario.message);
  formData.append('From', from);
  formData.append('To', to);
  formData.append('SmsMessageSid', `SM${Math.random().toString(36).substring(2, 15)}`);
  formData.append('NumMedia', '0');
  formData.append('ProfileName', 'Test User');
  formData.append('WaId', scenario.phoneNumber.replace('+', ''));
  
  console.log(`\n🧪 SCENARIO: ${scenario.name}`);
  console.log(`📝 ${scenario.description}`);
  console.log(`📤 Message from ${from}: "${scenario.message}"`);
  
  try {
    const response = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });
    
    const text = await response.text();
    console.log(`📥 Webhook response status: ${response.status}`);
    console.log(`📥 Response body: ${text}`);
    console.log('✅ Webhook test completed successfully');
  } catch (error) {
    console.error('❌ Webhook test failed:', error);
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting Twilio webhook tests...');
  
  for (const scenario of testScenarios) {
    try {
      await simulateTwilioWebhook(scenario);
      // Give the server a moment to process between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`💥 Test failed for scenario "${scenario.name}":`, error);
    }
  }
  
  console.log('\n🎉 All webhook tests completed!');
}

// Run the tests
runTests();