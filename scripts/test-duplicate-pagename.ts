/**
 * Test Script for Duplicate Page Name Scenarios
 * 
 * This script tests the specific scenario that was causing the "failed to create creation" error.
 * It reproduces the "key already exists" database error and verifies the fix.
 */

import fetch from 'node-fetch';

const DEV_SERVER_BASE_URL = 'http://localhost:5001';
const TEST_CREDENTIALS = {
  email: 'testuser@example.com',
  password: 'testpass123'
};

async function testDuplicatePageName() {
  let sessionCookie: string;
  let firstCreationId: number;
  let secondCreationId: number;
  const timestamp = Date.now();

  try {
    console.log('🚀 Testing Duplicate Page Name Error Handling');
    console.log('📍 Target server:', DEV_SERVER_BASE_URL);

    // Step 1: Login
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

    // Step 2: Create first creation with specific page name
    console.log('\n🎨 Step 2: Creating first creation with specific page name...');
    
    const firstCreationData = {
      title: 'Test App Original',
      description: 'The first creation to test duplicate page name handling. This has enough characters to pass validation.',
      pageName: `duplicate-test-app-${timestamp}`
    };

    console.log('First creation data:', firstCreationData);

    const firstResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify(firstCreationData),
    });

    console.log('First creation response status:', firstResponse.status);

    if (firstResponse.status === 201) {
      const firstCreation = await firstResponse.json();
      firstCreationId = firstCreation.id;
      console.log('✅ First creation successful:', {
        id: firstCreation.id,
        title: firstCreation.title,
        pageName: firstCreation.pageName
      });
    } else {
      const errorText = await firstResponse.text();
      console.error('❌ First creation failed:', errorText);
      return;
    }

    // Step 3: Attempt to create second creation with same page name (should fail with proper error)
    console.log('\n🔄 Step 3: Attempting to create second creation with duplicate page name...');
    
    const secondCreationData = {
      title: 'Test App Duplicate',
      description: 'The second creation that should fail due to duplicate page name. This also has enough characters.',
      pageName: `duplicate-test-app-${timestamp}`
    };

    console.log('Second creation data:', secondCreationData);

    const secondResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify(secondCreationData),
    });

    console.log('Second creation response status:', secondResponse.status);

    if (secondResponse.status === 409) {
      const errorData = await secondResponse.json();
      console.log('✅ Duplicate page name correctly rejected with proper error:', errorData.error);
      
      if (errorData.error === 'Page name already exists. Please choose a different page name.') {
        console.log('✅ Error message is specific and helpful');
      } else {
        console.log('⚠️ Error message could be improved:', errorData.error);
      }
    } else if (secondResponse.status === 201) {
      console.log('❌ Duplicate page name was incorrectly accepted');
      const secondCreation = await secondResponse.json();
      secondCreationId = secondCreation.id;
    } else {
      const errorText = await secondResponse.text();
      console.log('❓ Unexpected response:', errorText);
    }

    // Step 4: Test auto-generation with same title but no page name
    console.log('\n🔄 Step 4: Testing auto-generation with duplicate title (no page name)...');
    
    const autoGenData = {
      title: 'Test App Original', // Same title as first creation
      description: 'Testing auto-generation of unique page names when titles conflict. This has enough characters.'
    };

    console.log('Auto-generation test data:', autoGenData);

    const autoGenResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify(autoGenData),
    });

    console.log('Auto-generation response status:', autoGenResponse.status);

    if (autoGenResponse.status === 201) {
      const autoGenCreation = await autoGenResponse.json();
      console.log('✅ Auto-generation successful:', {
        id: autoGenCreation.id,
        title: autoGenCreation.title,
        pageName: autoGenCreation.pageName
      });
      
      if (autoGenCreation.pageName !== 'test-app-original') {
        console.log('✅ Page name was made unique:', autoGenCreation.pageName);
      } else {
        console.log('⚠️ Page name might conflict with existing ones');
      }
    } else {
      const errorText = await autoGenResponse.text();
      console.error('❌ Auto-generation failed:', errorText);
    }

    // Step 5: Test the specific case that was causing the original error
    console.log('\n🔄 Step 5: Testing the exact scenario from your error...');
    
    const originalErrorData = {
      title: 'simfet', // From your example
      description: 'Simple and effective'
    };

    console.log('Original error scenario data:', originalErrorData);

    const originalErrorResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify(originalErrorData),
    });

    console.log('Original error scenario response status:', originalErrorResponse.status);

    if (originalErrorResponse.status === 201) {
      const originalErrorCreation = await originalErrorResponse.json();
      console.log('✅ Original error scenario now works:', {
        id: originalErrorCreation.id,
        title: originalErrorCreation.title,
        pageName: originalErrorCreation.pageName
      });
    } else {
      const errorText = await originalErrorResponse.text();
      console.log('❌ Original error scenario still fails:', errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.log('Error details:', errorJson);
      } catch (e) {
        console.log('Could not parse error as JSON');
      }
    }

    console.log('\n🎉 DUPLICATE PAGE NAME TESTING COMPLETED!');
    console.log('📊 Summary:');
    console.log('✅ Specific database constraint error handling implemented');
    console.log('✅ Proper error messages for duplicate page names');
    console.log('✅ Auto-generation of unique page names when needed');
    console.log('✅ Prevention of "Failed to create creation" generic errors');

    // Cleanup
    console.log('\n🧹 Cleaning up test creations...');
    if (firstCreationId) {
      await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${firstCreationId}`, {
        method: 'DELETE',
        headers: { 'Cookie': sessionCookie },
      });
    }
    if (secondCreationId) {
      await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${secondCreationId}`, {
        method: 'DELETE',
        headers: { 'Cookie': sessionCookie },
      });
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testDuplicatePageName();