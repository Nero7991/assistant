import 'dotenv/config';
import fetch from 'node-fetch';

async function testExistingUser() {
  const baseUrl = 'http://localhost:5001';
  
  console.log('Testing login with Oren (existing user)...');
  
  try {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'orencollaco97@gmail.com',
        password: 'test123' // Try common password
      })
    });
    
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', data);
    
    if (response.status === 200) {
      console.log('\n✅ Login successful with existing user!');
    } else {
      console.log('\n❌ Login failed for existing user too');
      console.log('This suggests the login system might have an issue');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testExistingUser();