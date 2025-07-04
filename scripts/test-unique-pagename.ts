/**
 * Test Script with Guaranteed Unique Page Names
 * 
 * Uses timestamps to ensure completely unique page names for testing.
 */

import fetch from 'node-fetch';

const DEV_SERVER_BASE_URL = 'http://localhost:5001';
const TEST_CREDENTIALS = {
  email: 'testuser@example.com',
  password: 'testpass123'
};

async function testUniquePageName() {
  let sessionCookie: string;
  const timestamp = Date.now();

  try {
    console.log('🚀 Testing with Guaranteed Unique Page Names');
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

    // Step 2: Create creation with unique page name
    console.log('\n🎨 Step 2: Creating creation with unique page name...');
    
    const uniqueCreationData = {
      title: `Test App ${timestamp}`,
      description: 'This is a test creation with a guaranteed unique page name using timestamp. This description is long enough to pass validation.',
      pageName: `test-app-${timestamp}`
    };

    console.log('Unique creation data:', uniqueCreationData);

    const uniqueResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify(uniqueCreationData),
    });

    console.log('Unique creation response status:', uniqueResponse.status);

    if (uniqueResponse.status === 201) {
      const creation = await uniqueResponse.json();
      console.log('✅ Unique creation successful:', {
        id: creation.id,
        title: creation.title,
        pageName: creation.pageName
      });

      // Now test duplicate
      console.log('\n🔄 Step 3: Testing duplicate page name...');
      
      const duplicateResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': sessionCookie,
        },
        body: JSON.stringify({
          title: `Duplicate Test App ${timestamp}`,
          description: 'This should fail because it uses the same page name as the previous creation.',
          pageName: `test-app-${timestamp}` // Same as above
        }),
      });

      console.log('Duplicate creation response status:', duplicateResponse.status);
      
      if (duplicateResponse.status === 409) {
        const errorData = await duplicateResponse.json();
        console.log('✅ Duplicate correctly rejected:', errorData.error);
      } else {
        const responseText = await duplicateResponse.text();
        console.log('❌ Unexpected duplicate response:', responseText);
      }

      // Clean up
      console.log('\n🧹 Cleaning up...');
      await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${creation.id}`, {
        method: 'DELETE',
        headers: { 'Cookie': sessionCookie },
      });

    } else {
      const errorText = await uniqueResponse.text();
      console.error('❌ Unique creation failed:', errorText);
      
      // Let's also check what existing creations there are
      console.log('\n🔍 Checking existing creations...');
      const listResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
        headers: { 'Cookie': sessionCookie },
      });
      
      if (listResponse.status === 200) {
        const creations = await listResponse.json();
        console.log('Existing creations:', creations.map((c: any) => ({
          id: c.id,
          title: c.title,
          pageName: c.pageName
        })));
      }
    }

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testUniquePageName();