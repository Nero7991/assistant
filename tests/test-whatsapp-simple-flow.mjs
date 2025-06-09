#!/usr/bin/env node

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import pg from 'pg';

// Load environment variables
dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Generate unique test data
const timestamp = Date.now();
const TEST_PHONE = `+1555${Math.floor(Math.random() * 1000000)}`; // Random phone
const TEST_EMAIL = `test_${timestamp}@example.com`;
const TEST_NAME = 'TestUser';

console.log('\n🧪 WhatsApp Onboarding Simple Test');
console.log(`📱 Test Phone: ${TEST_PHONE}`);
console.log(`📧 Test Email: ${TEST_EMAIL}`);
console.log(`👤 Test Name: ${TEST_NAME}\n`);

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Simulate WhatsApp webhook
async function sendMessage(message) {
  console.log(`\n→ Sending: "${message}"`);
  
  const response = await fetch(`${BASE_URL}/api/webhook/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      From: `whatsapp:${TEST_PHONE}`,
      Body: message,
      MessageSid: 'SM' + Math.random().toString(36).substr(2, 32),
      AccountSid: 'ACtest',
      To: 'whatsapp:+14155238886'
    }).toString()
  });
  
  const text = await response.text();
  const messageMatch = text.match(/<Message>(.*?)<\/Message>/);
  if (messageMatch) {
    console.log(`← Bot says: "${messageMatch[1]}"`);
    return messageMatch[1];
  }
  return null;
}

// Get verification code from DB
async function getVerificationCode() {
  const tempId = TEST_PHONE.replace(/\D/g, '');
  console.log(`\n🔍 Looking for verification code (tempId: ${tempId})`);
  
  // Check what's in the database
  const result = await pool.query(
    `SELECT * FROM contact_verifications 
     WHERE type = 'email' 
     ORDER BY created_at DESC 
     LIMIT 5`
  );
  
  console.log(`Found ${result.rows.length} recent email verifications:`);
  result.rows.forEach(v => {
    console.log(`  - User ID: ${v.user_id}, Code: ${v.code}, Created: ${v.created_at}`);
  });
  
  // Try to find our verification
  const ourVerification = result.rows.find(v => v.user_id === parseInt(tempId));
  return { code: ourVerification?.code || null, allResults: result.rows };
}

// Main flow
async function runTest() {
  try {
    // 1. Initial contact
    await sendMessage('Hello');
    
    // 2. Confirm signup
    await sendMessage('yes');
    
    // 3. Provide name
    await sendMessage(TEST_NAME);
    
    // 4. Provide email
    await sendMessage(TEST_EMAIL);
    
    // Wait for DB write
    await new Promise(r => setTimeout(r, 2000));
    
    // 5. Get verification code
    const { code, allResults } = await getVerificationCode();
    if (!code) {
      console.log('\n❌ Could not find verification code!');
      
      // Let's check if the onboarding service is using generateVerificationCode
      console.log('\n💡 Trying the most recent code from DB...');
      const recentCode = allResults[0]?.code;
      if (recentCode) {
        console.log(`   Using code: ${recentCode}`);
        const response = await sendMessage(recentCode);
        
        if (response?.includes('verified')) {
          console.log('\n✅ Recent code worked! Account created!');
          
          // Check if user was created
          const userResult = await pool.query(
            `SELECT * FROM users WHERE phone_number = $1`,
            [`whatsapp:${TEST_PHONE}`]
          );
          
          if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            console.log('\n✅ User verified in database:');
            console.log(`   ID: ${user.id}`);
            console.log(`   Email: ${user.email}`);
            console.log(`   Name: ${user.first_name}`);
          }
        } else {
          console.log('\n❌ Verification failed with recent code');
        }
      } else {
        console.log('\n❌ No verification codes found in database');
      }
    } else {
      console.log(`\n✅ Found code: ${code}`);
      
      // 6. Enter code
      const response = await sendMessage(code);
      
      if (response?.includes('verified')) {
        console.log('\n🎉 Success! Account created!');
        
        // Check if user was created
        const userResult = await pool.query(
          `SELECT * FROM users WHERE phone_number = $1`,
          [`whatsapp:${TEST_PHONE}`]
        );
        
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          console.log('\n✅ User verified in database:');
          console.log(`   ID: ${user.id}`);
          console.log(`   Email: ${user.email}`);
          console.log(`   Name: ${user.first_name}`);
        }
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the test
runTest();