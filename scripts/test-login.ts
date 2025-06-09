import 'dotenv/config';
import fetch from 'node-fetch';

async function testLogin() {
  const baseUrl = 'http://localhost:5001';
  
  console.log('Testing login with testuser@example.com...');
  
  try {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'testuser@example.com',
        password: 'testpass123'
      })
    });
    
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', data);
    
    if (response.status === 200) {
      console.log('\n✅ Login successful!');
      console.log('User ID:', data.user?.id);
      console.log('Username:', data.user?.username);
    } else {
      console.log('\n❌ Login failed');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testLogin();