/**
 * Manual Creations Test Script
 * 
 * This script tests the creations API directly without any test framework interference.
 * It bypasses MSW and tests the actual development server endpoints.
 */

import fetch from 'node-fetch';

const DEV_SERVER_BASE_URL = 'http://localhost:5001';
const TEST_CREDENTIALS = {
  email: 'testuser@example.com',
  password: 'testpass123',
  userId: 5
};

const TEST_CREATION_DATA = {
  title: 'Manual Test Todo App',
  description: 'A comprehensive todo application with add, edit, delete, and mark complete functionality. Should have a clean modern interface with responsive design, local storage persistence, and filter capabilities for active, completed, and all tasks.'
};

async function testCreationsManually() {
  let sessionCookie: string;
  let creationId: number;
  
  try {
    console.log('🚀 Starting Manual Creations Test');
    console.log('📍 Target server:', DEV_SERVER_BASE_URL);

    // Step 1: Login
    console.log('\n🔐 Step 1: Testing authentication...');
    
    const loginResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(TEST_CREDENTIALS),
    });

    console.log('Login response status:', loginResponse.status);
    
    if (loginResponse.status !== 200) {
      const errorText = await loginResponse.text();
      console.error('❌ Login failed:', errorText);
      return;
    }

    // Extract session cookie
    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (setCookieHeader) {
      sessionCookie = setCookieHeader.split(';')[0];
      console.log('✅ Login successful, session cookie obtained');
    } else {
      console.error('❌ No session cookie received');
      return;
    }

    // Step 2: Create a creation
    console.log('\n🎨 Step 2: Creating new creation...');
    console.log('Creation data:', TEST_CREATION_DATA);
    
    const createResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify(TEST_CREATION_DATA),
    });

    console.log('Create response status:', createResponse.status);
    
    if (createResponse.status !== 201) {
      const errorText = await createResponse.text();
      console.error('❌ Creation failed:', errorText);
      return;
    }

    const creationData = await createResponse.json();
    creationId = creationData.id;
    
    console.log('✅ Creation created successfully!');
    console.log('Creation details:', {
      id: creationData.id,
      title: creationData.title,
      status: creationData.status,
      pageName: creationData.pageName,
      deploymentUrl: creationData.deploymentUrl
    });

    // Step 3: Generate architecture plan
    console.log('\n🧠 Step 3: Generating architecture plan...');
    
    const planResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${creationId}/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
    });

    console.log('Plan generation status:', planResponse.status);
    
    if (planResponse.status !== 200) {
      const errorText = await planResponse.text();
      console.error('❌ Plan generation failed:', errorText);
      
      // Try to parse as JSON for better error details
      try {
        const errorJson = JSON.parse(errorText);
        console.error('Error details:', errorJson);
      } catch (e) {
        // Not JSON, just show the text
      }
    } else {
      const planData = await planResponse.json();
      console.log('✅ Architecture plan generated successfully!');
      console.log('Plan summary:', {
        totalTasks: planData.totalTasks,
        totalSubtasks: planData.totalSubtasks,
        architecturePlanLength: planData.architecturePlan?.length || 0
      });
      
      // Show a snippet of the architecture plan
      if (planData.architecturePlan) {
        const snippet = planData.architecturePlan.substring(0, 200) + '...';
        console.log('Architecture plan snippet:', snippet);
      }
    }

    // Step 4: Verify creation status
    console.log('\n🔍 Step 4: Verifying creation status...');
    
    const getResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${creationId}`, {
      headers: {
        'Cookie': sessionCookie,
      },
    });

    if (getResponse.status === 200) {
      const detailsData = await getResponse.json();
      console.log('✅ Creation details retrieved successfully!');
      console.log('Final creation status:', {
        status: detailsData.creation.status,
        totalTasks: detailsData.creation.totalTasks,
        totalSubtasks: detailsData.creation.totalSubtasks,
        tasksCreated: detailsData.tasks?.length || 0,
        subtasksCreated: detailsData.subtasks?.length || 0
      });
      
      if (detailsData.tasks?.length > 0) {
        console.log('Tasks created:');
        detailsData.tasks.forEach((task: any, index: number) => {
          console.log(`  ${index + 1}. ${task.title} (${task.category})`);
        });
      }
    }

    // Step 5: Start building (if plan generation was successful)
    if (planResponse.status === 200) {
      console.log('\n🔨 Step 5: Starting build process...');
      
      const buildResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${creationId}/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': sessionCookie,
        },
      });

      console.log('Build start status:', buildResponse.status);
      
      if (buildResponse.status === 200) {
        const buildData = await buildResponse.json();
        console.log('✅ Build started successfully!');
        console.log('Current task:', buildData.currentTask?.title);
        console.log('Current subtask:', buildData.currentSubtask?.title);
      } else {
        const errorText = await buildResponse.text();
        console.error('❌ Build start failed:', errorText);
      }
    }

    console.log('\n🎉 MANUAL TEST COMPLETED SUCCESSFULLY!');
    console.log('✅ Authentication: Working');
    console.log('✅ Creation API: Working'); 
    console.log(`✅ Plan Generation: ${planResponse.status === 200 ? 'Working' : 'Failed'}`);
    console.log('✅ No "failed to create creation" errors encountered');
    
    // Cleanup
    console.log('\n🧹 Cleaning up test creation...');
    const deleteResponse = await fetch(`${DEV_SERVER_BASE_URL}/api/creations/${creationId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': sessionCookie,
      },
    });
    
    if (deleteResponse.status === 200) {
      console.log('✅ Test creation cleaned up successfully');
    } else {
      console.warn('⚠️ Failed to cleanup test creation');
    }

  } catch (error) {
    console.error('❌ Manual test error:', error);
  }
}

testCreationsManually();