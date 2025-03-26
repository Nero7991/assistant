/**
 * This is a test script for simulating WhatsApp conversations.
 * To use it, first make sure you're logged in to the application.
 * Run this script with Node.js: node test-whatsapp.js
 */

const fetch = require('node-fetch');
const readline = require('readline');
// Use localhost when testing locally, or the Replit URL when in Replit
const BASE_URL = process.env.REPL_SLUG 
  ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` 
  : 'http://localhost:5000';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configure these values for your test
const config = {
  phoneNumber: '+15551234567', // Replace with your test user's phone number
  twilioNumber: '+18557270654', // Replace with your Twilio phone number
  userId: 2 // Replace with your test user's ID
};

// Simulate a WhatsApp message
async function simulateWhatsAppMessage(message) {
  const formData = new URLSearchParams();
  formData.append('Body', message);
  formData.append('From', `whatsapp:${config.phoneNumber}`);
  formData.append('To', `whatsapp:${config.twilioNumber}`);
  formData.append('SmsMessageSid', `SM${Math.random().toString(36).substring(2, 15)}`);
  formData.append('NumMedia', '0');
  formData.append('ProfileName', 'Test User');
  formData.append('WaId', config.phoneNumber.replace('+', ''));
  
  try {
    const response = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });
    
    console.log(`\n📤 You sent: "${message}"`);
    console.log(`📥 Webhook response status: ${response.status}`);
    
    // Get message history to see what the application replied with
    await fetchLatestMessages();
    
    return true;
  } catch (error) {
    console.error('Error sending message:', error);
    return false;
  }
}

// Get the most recent messages from the history
async function fetchLatestMessages() {
  try {
    // First login to ensure we have a session
    await login();
    
    // Then fetch the latest message history
    const response = await fetch(`${BASE_URL}/api/message-history?limit=3`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      }
    });
    
    if (response.ok) {
      const messages = await response.json();
      
      if (messages && messages.length > 0) {
        console.log('\n📱 Latest message history:');
        messages.forEach(msg => {
          const sender = msg.type === 'response' ? 'You' : 'Coach';
          const timestamp = new Date(msg.createdAt).toLocaleTimeString();
          console.log(`[${timestamp}] ${sender}: ${msg.content}`);
        });
      } else {
        console.log('No message history found.');
      }
    } else {
      console.log('Could not fetch message history:', response.statusText);
    }
  } catch (error) {
    console.error('Error fetching message history:', error);
  }
}

// Login function to get a session
let sessionCookie = '';
async function login() {
  try {
    const response = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'testuser', // Replace with your test username
        password: 'password123' // Replace with your test password
      })
    });
    
    if (response.headers.get('set-cookie')) {
      sessionCookie = response.headers.get('set-cookie');
    }
    
    return response.ok;
  } catch (error) {
    console.error('Login error:', error);
    return false;
  }
}

// Trigger a test message from the system
async function triggerSystemMessage() {
  try {
    const response = await fetch(`${BASE_URL}/api/test/schedule-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({ userId: config.userId })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`\n🔔 System message scheduled for: ${result.scheduledFor}`);
      console.log('Check your WhatsApp for the message or wait for it to be processed.');
    } else {
      console.log('Could not schedule system message:', response.statusText);
    }
  } catch (error) {
    console.error('Error scheduling system message:', error);
  }
}

// Interactive mode
function startInteractiveMode() {
  console.log('\n🤖 WhatsApp Conversation Simulator 🤖');
  console.log('Type your messages below to simulate WhatsApp conversation.');
  console.log('Special commands:');
  console.log('  /exit - Exit the simulator');
  console.log('  /system - Trigger a system message');
  console.log('  /history - Show recent message history');
  
  askForInput();
}

function askForInput() {
  rl.question('\n💬 Enter your message: ', async (input) => {
    if (input.toLowerCase() === '/exit') {
      console.log('Exiting simulator. Goodbye!');
      rl.close();
      return;
    }
    
    if (input.toLowerCase() === '/system') {
      await triggerSystemMessage();
      askForInput();
      return;
    }
    
    if (input.toLowerCase() === '/history') {
      await fetchLatestMessages();
      askForInput();
      return;
    }
    
    // Send the message to the WhatsApp webhook
    await simulateWhatsAppMessage(input);
    
    // Ask for the next input
    askForInput();
  });
}

// Start the conversation simulator
async function main() {
  // First login to ensure we have a session
  const loggedIn = await login();
  
  if (loggedIn) {
    console.log('✅ Login successful!');
    startInteractiveMode();
  } else {
    console.error('❌ Could not log in. Please check your credentials.');
    rl.close();
  }
}

// Run the main function
main();