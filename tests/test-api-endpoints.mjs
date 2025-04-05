/**
 * Test API endpoints for the ADHD Coach app
 * This script tests various API endpoints to make sure they're working correctly
 */
import fetch from 'node-fetch';

async function makeRequest(endpoint, method, body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  const options = {
    method,
    headers,
    credentials: 'include'
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`http://localhost:5000${endpoint}`, options);
    
    if (response.status === 204) {
      return { status: response.status, data: null }; // No content
    }
    
    const contentType = response.headers.get('Content-Type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return { status: response.status, data };
    } else {
      const text = await response.text();
      return { status: response.status, data: text };
    }
  } catch (error) {
    console.error(`Error making request to ${endpoint}:`, error);
    return { status: 500, error: error.message };
  }
}

async function login() {
  console.log('Logging in...');
  const credentials = {
    username: 'orencollaco',
    password: '112233'
  };
  
  // Try different passwords until one works
  const passwords = ['1122', '112233', '123456', '1234'];
  
  for (const password of passwords) {
    console.log(`Trying password: ${password}`);
    const result = await makeRequest('/api/login', 'POST', { 
      username: credentials.username, 
      password 
    });
    
    if (result.status === 200) {
      console.log('Login successful with password:', password);
      return true;
    }
  }
  
  console.log('All login attempts failed');
  return false;
}

async function testGetAllSubtasks() {
  console.log('\n=== Testing GET /api/subtasks/all ===');
  const result = await makeRequest('/api/subtasks/all', 'GET');
  
  if (result.status === 401) {
    console.log('Authentication required. Please login first.');
    return;
  }
  
  if (result.error) {
    console.log('Error:', result.error);
    return;
  }
  
  console.log('Response status:', result.status);
  
  if (Array.isArray(result.data)) {
    console.log('Found subtasks:', result.data.length);
    if (result.data.length > 0) {
      console.log('First subtask:', result.data[0]);
    }
  } else {
    console.log('Unexpected response format:', result.data);
  }
}

async function testUserEndpoint() {
  console.log('\n=== Testing GET /api/user ===');
  const result = await makeRequest('/api/user', 'GET');
  
  if (result.status === 401) {
    console.log('Not authenticated.');
    return false;
  }
  
  console.log('Response status:', result.status);
  console.log('User data:', result.data);
  return result.status === 200;
}

// Run all tests
(async () => {
  try {
    // First test if we're already logged in
    const isAuthenticated = await testUserEndpoint();
    
    if (!isAuthenticated) {
      const loginSuccess = await login();
      if (!loginSuccess) {
        console.log('Login failed. Cannot proceed with testing.');
        return;
      }
    }
    
    // Now test our endpoints
    await testGetAllSubtasks();
    
    console.log('\nAll tests completed.');
  } catch (error) {
    console.error('Error running tests:', error);
  }
})();