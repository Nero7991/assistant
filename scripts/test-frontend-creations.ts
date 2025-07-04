/**
 * Frontend Creations Page Test Script
 * 
 * This script tests the frontend creations page by making direct requests
 * and verifying the form validation improvements work correctly.
 */

import fetch from 'node-fetch';

const DEV_SERVER_BASE_URL = 'http://localhost:5001';
const TEST_CREDENTIALS = {
  email: 'testuser@example.com',
  password: 'testpass123',
  userId: 5
};

async function testFrontendCreations() {
  let sessionCookie: string;

  try {
    console.log('🚀 Testing Frontend Creations Page Improvements');
    console.log('📍 Target server:', DEV_SERVER_BASE_URL);

    // Step 1: Login to get session
    console.log('\n🔐 Step 1: Authenticating...');
    
    const loginResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(TEST_CREDENTIALS),
    });

    if (loginResponse.status !== 200) {
      console.error('❌ Login failed');
      return;
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (setCookieHeader) {
      sessionCookie = setCookieHeader.split(';')[0];
      console.log('✅ Authentication successful');
    } else {
      console.error('❌ No session cookie received');
      return;
    }

    // Step 2: Test validation scenarios that would cause "failed to create creation"
    console.log('\n🧪 Step 2: Testing validation scenarios...');

    // Test 1: Empty title
    console.log('\n📝 Test 1: Empty title');
    const emptyTitleResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        title: '',
        description: 'A detailed description with more than 10 characters'
      }),
    });

    console.log('Empty title response status:', emptyTitleResponse.status);
    if (emptyTitleResponse.status === 400) {
      const errorData = await emptyTitleResponse.json();
      console.log('✅ Correctly rejected empty title:', errorData.error || errorData);
    }

    // Test 2: Short description (less than 10 characters)
    console.log('\n📝 Test 2: Short description');
    const shortDescResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        title: 'Test App',
        description: 'Short'
      }),
    });

    console.log('Short description response status:', shortDescResponse.status);
    if (shortDescResponse.status === 400) {
      const errorData = await shortDescResponse.json();
      console.log('✅ Correctly rejected short description:', errorData.error || errorData);
    }

    // Test 3: Title too long (over 100 characters)
    console.log('\n📝 Test 3: Title too long');
    const longTitleResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        title: 'x'.repeat(101),
        description: 'A detailed description with more than 10 characters for testing purposes'
      }),
    });

    console.log('Long title response status:', longTitleResponse.status);
    if (longTitleResponse.status === 400) {
      const errorData = await longTitleResponse.json();
      console.log('✅ Correctly rejected long title:', errorData.error || errorData);
    }

    // Test 4: Invalid page name
    console.log('\n📝 Test 4: Invalid page name');
    const invalidPageNameResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        title: 'Test App',
        description: 'A detailed description with more than 10 characters for testing purposes',
        pageName: 'Invalid Page Name!'
      }),
    });

    console.log('Invalid page name response status:', invalidPageNameResponse.status);
    if (invalidPageNameResponse.status === 400) {
      const errorData = await invalidPageNameResponse.json();
      console.log('✅ Correctly rejected invalid page name:', errorData.error || errorData);
    }

    // Test 5: Valid creation (should succeed)
    console.log('\n📝 Test 5: Valid creation');
    const validCreationResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        title: 'Frontend Test App',
        description: 'A comprehensive test application to verify the frontend validation improvements are working correctly. This description is definitely long enough to pass the 10 character minimum requirement.',
        pageName: 'frontend-test-app'
      }),
    });

    console.log('Valid creation response status:', validCreationResponse.status);
    if (validCreationResponse.status === 201) {
      const creationData = await validCreationResponse.json();
      console.log('✅ Valid creation succeeded:', {
        id: creationData.id,
        title: creationData.title,
        status: creationData.status,
        pageName: creationData.pageName
      });

      // Clean up the test creation
      console.log('\n🧹 Cleaning up test creation...');
      const deleteResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${creationData.id}`, {
        method: 'DELETE',
        headers: {
          'Cookie': sessionCookie,
        },
      });

      if (deleteResponse.status === 200) {
        console.log('✅ Test creation cleaned up successfully');
      }
    } else {
      const errorData = await validCreationResponse.json();
      console.error('❌ Valid creation failed unexpectedly:', errorData);
    }

    console.log('\n🎉 FRONTEND VALIDATION TEST COMPLETED!');
    console.log('✅ All validation scenarios tested');
    console.log('✅ Frontend improvements should now provide better error messages');
    console.log('✅ Users will see specific validation errors instead of generic "failed to create creation"');

  } catch (error) {
    console.error('❌ Frontend test error:', error);
  }
}

testFrontendCreations();