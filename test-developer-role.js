/**
 * Quick test to validate the o1-mini model developer role fix
 */
import fetch from 'node-fetch';

async function login() {
  try {
    // Login to get authenticated
    const loginResponse = await fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test',
        password: 'test'
      }),
      credentials: 'include'
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }

    const cookies = loginResponse.headers.get('set-cookie');
    console.log('Login successful. Cookie:', cookies);
    return cookies;
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  }
}

async function testDeveloperRole() {
  try {
    console.log('🧪 Testing o1-mini model with developer role...');
    
    // First test the direct developer role implementation
    console.log('\n1️⃣ Testing basic developer role implementation');
    const devRoleResponse = await fetch('http://localhost:5000/api/messages/test-developer-role', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        userId: 2,
        modelToTest: 'o1-mini'
      })
    });

    if (!devRoleResponse.ok) {
      throw new Error(`Developer role test failed: ${devRoleResponse.status} ${devRoleResponse.statusText}`);
    }
    
    const devRoleResult = await devRoleResponse.json();
    console.log('✅ Developer role test succeeded!');
    console.log('AI Response:', devRoleResult.response);
    
    // Then test the reschedule endpoint that uses the developer role
    console.log('\n2️⃣ Testing reschedule endpoint with developer role');
    const rescheduleResponse = await fetch('http://localhost:5000/api/messages/simulate-reschedule', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        userId: 2
      })
    });

    if (!rescheduleResponse.ok) {
      throw new Error(`Reschedule test failed: ${rescheduleResponse.status} ${rescheduleResponse.statusText}`);
    }
    
    const rescheduleResult = await rescheduleResponse.json();
    console.log('✅ Reschedule test succeeded!');
    console.log('Message length:', rescheduleResult.message.length);
    console.log('Schedule updates:', rescheduleResult.scheduleUpdates.length);
    
    // Wait a bit for server logs to print out
    console.log('\n⏳ Waiting for server logs...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n🎉 All tests completed successfully! The developer role implementation is working correctly.');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testDeveloperRole();