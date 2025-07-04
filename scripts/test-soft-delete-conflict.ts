/**
 * Test Script for Soft Delete Page Name Conflict Resolution
 * 
 * This script tests that deleted creations don't cause page name conflicts.
 * It creates a creation, deletes it, then tries to create another with the same page name.
 */

import fetch from 'node-fetch';

const DEV_SERVER_BASE_URL = 'http://localhost:5001';
const TEST_CREDENTIALS = {
  email: 'testuser@example.com',
  password: 'testpass123'
};

async function testSoftDeleteConflict() {
  let sessionCookie: string;
  let firstCreationId: number;
  const timestamp = Date.now();
  const testPageName = `soft-delete-test-${timestamp}`;

  try {
    console.log('🚀 Testing Soft Delete Page Name Conflict Resolution');
    console.log('📍 Target server:', DEV_SERVER_BASE_URL);
    console.log('🏷️ Test page name:', testPageName);

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

    // Step 2: Create first creation
    console.log('\n🎨 Step 2: Creating first creation...');
    
    const firstCreationData = {
      title: 'First Test Creation',
      description: 'This is the first creation that will be deleted to test soft delete behavior.',
      pageName: testPageName
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

    // Step 3: Verify creation appears in list
    console.log('\n📋 Step 3: Verifying creation appears in list...');
    
    const listResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      headers: { 'Cookie': sessionCookie },
    });
    
    if (listResponse.status === 200) {
      const creations = await listResponse.json();
      const foundCreation = creations.find((c: any) => c.id === firstCreationId);
      if (foundCreation) {
        console.log('✅ Creation appears in list:', foundCreation.title);
      } else {
        console.log('❌ Creation not found in list');
      }
    }

    // Step 4: Delete the creation (soft delete)
    console.log('\n🗑️ Step 4: Deleting the creation...');
    
    const deleteResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${firstCreationId}`, {
      method: 'DELETE',
      headers: { 'Cookie': sessionCookie },
    });

    console.log('Delete response status:', deleteResponse.status);
    
    if (deleteResponse.status === 200) {
      console.log('✅ Creation deleted successfully');
    } else {
      const errorText = await deleteResponse.text();
      console.error('❌ Delete failed:', errorText);
      return;
    }

    // Step 5: Verify creation no longer appears in list
    console.log('\n📋 Step 5: Verifying creation no longer appears in list...');
    
    const listAfterDeleteResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      headers: { 'Cookie': sessionCookie },
    });
    
    if (listAfterDeleteResponse.status === 200) {
      const creationsAfterDelete = await listAfterDeleteResponse.json();
      const foundAfterDelete = creationsAfterDelete.find((c: any) => c.id === firstCreationId);
      if (!foundAfterDelete) {
        console.log('✅ Creation no longer appears in list (soft delete working)');
      } else {
        console.log('❌ Creation still appears in list after delete');
      }
    }

    // Step 6: Try to create another creation with the same page name
    console.log('\n🎨 Step 6: Creating new creation with same page name...');
    
    const secondCreationData = {
      title: 'Second Test Creation',
      description: 'This should succeed because the first creation was deleted (soft delete).',
      pageName: testPageName // Same as the deleted one
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

    if (secondResponse.status === 201) {
      const secondCreation = await secondResponse.json();
      console.log('✅ Second creation successful:', {
        id: secondCreation.id,
        title: secondCreation.title,
        pageName: secondCreation.pageName
      });
      
      if (secondCreation.pageName === testPageName) {
        console.log('✅ Page name reuse successful - soft delete working correctly!');
      } else {
        console.log('⚠️ Page name was modified, might indicate issue:', secondCreation.pageName);
      }

      // Clean up second creation
      console.log('\n🧹 Cleaning up second creation...');
      await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${secondCreation.id}`, {
        method: 'DELETE',
        headers: { 'Cookie': sessionCookie },
      });

    } else {
      const errorText = await secondResponse.text();
      console.error('❌ Second creation failed:', errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.log('Error details:', errorJson);
        
        if (errorJson.error?.includes('Page name already exists')) {
          console.log('🔍 This confirms the bug - deleted creation still causing conflict');
        }
      } catch (e) {
        console.log('Could not parse error as JSON');
      }
    }

    console.log('\n🎉 SOFT DELETE CONFLICT TEST COMPLETED!');

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testSoftDeleteConflict();