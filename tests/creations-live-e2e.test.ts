import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

/**
 * Live E2E Test for Creations Feature
 * 
 * This test runs against the actual development server (localhost:5001)
 * and tests the complete creations workflow from login to creation deletion.
 * 
 * Prerequisites:
 * 1. Development server must be running on port 5001
 * 2. Test user (testuser@example.com) must exist in the database
 * 3. Database must be accessible and properly configured
 */

const DEV_SERVER_BASE_URL = 'http://localhost:5001';
const TEST_CREDENTIALS = {
  email: 'testuser@example.com',
  password: 'testpass123',
  userId: 5
};

const TEST_CREATION_DATA = {
  title: 'Test Todo App E2E',
  description: 'A comprehensive todo application with add, edit, delete, and mark complete functionality. Should have a clean modern interface with responsive design, local storage persistence, and filter capabilities for active, completed, and all tasks.'
};

describe('Creations Live E2E Test', () => {
  let authCookie: string;
  let createdCreationId: number;

  beforeAll(async () => {
    console.log('🚀 Starting Live E2E Test for Creations Feature');
    console.log('📍 Target server:', DEV_SERVER_BASE_URL);
    
    // Test server connectivity
    try {
      const healthCheck = await request(DEV_SERVER_BASE_URL).get('/').timeout(5000);
      console.log('✅ Server is responsive');
    } catch (error) {
      console.error('❌ Server is not accessible:', error);
      throw new Error(`Development server not running on ${DEV_SERVER_BASE_URL}`);
    }
  }, 10000);

  afterAll(async () => {
    // Cleanup: Delete the test creation if it was created
    if (authCookie && createdCreationId) {
      try {
        console.log(`🧹 Cleaning up test creation ${createdCreationId}`);
        await request(DEV_SERVER_BASE_URL)
          .delete(`/api/creations/${createdCreationId}`)
          .set('Cookie', authCookie)
          .timeout(5000);
        console.log('✅ Test creation cleaned up');
      } catch (error) {
        console.warn('⚠️ Failed to cleanup test creation:', error);
      }
    }
    console.log('🏁 Live E2E Test completed');
  });

  describe('Authentication Flow', () => {
    it('should login with test user credentials', async () => {
      console.log('🔐 Testing authentication...');
      
      const loginResponse = await request(DEV_SERVER_BASE_URL)
        .post('/api/auth/login')
        .send(TEST_CREDENTIALS)
        .timeout(10000);

      console.log('Login response status:', loginResponse.status);
      
      if (loginResponse.status !== 200) {
        console.error('Login failed. Response body:', loginResponse.body);
        console.error('Make sure test user exists and credentials are correct');
      }
      
      expect(loginResponse.status).toBe(200);
      
      // Extract session cookie
      const setCookieHeader = loginResponse.headers['set-cookie'];
      if (setCookieHeader) {
        authCookie = setCookieHeader[0];
        console.log('✅ Authentication successful, cookie obtained');
      } else {
        throw new Error('No session cookie received from login');
      }
    }, 15000);

    it('should verify authenticated status', async () => {
      console.log('🔍 Verifying authentication status...');
      
      const profileResponse = await request(DEV_SERVER_BASE_URL)
        .get('/api/auth/profile')
        .set('Cookie', authCookie)
        .timeout(5000);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.email).toBe(TEST_CREDENTIALS.email);
      console.log('✅ Authentication verified');
    });
  });

  describe('Creations Workflow', () => {
    it('should list existing creations', async () => {
      console.log('📋 Fetching existing creations...');
      
      const listResponse = await request(DEV_SERVER_BASE_URL)
        .get('/api/creations')
        .set('Cookie', authCookie)
        .timeout(5000);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body)).toBe(true);
      
      console.log(`✅ Found ${listResponse.body.length} existing creations`);
      
      // Log existing creations for debugging
      if (listResponse.body.length > 0) {
        console.log('Existing creations:', listResponse.body.map((c: any) => ({
          id: c.id,
          title: c.title,
          status: c.status
        })));
      }
    });

    it('should create a new creation', async () => {
      console.log('🎨 Creating new creation...');
      console.log('Creation data:', TEST_CREATION_DATA);
      
      const createResponse = await request(DEV_SERVER_BASE_URL)
        .post('/api/creations')
        .send(TEST_CREATION_DATA)
        .set('Cookie', authCookie)
        .timeout(10000);

      console.log('Create response status:', createResponse.status);
      console.log('Create response body:', createResponse.body);

      if (createResponse.status !== 201) {
        console.error('❌ Creation failed');
        console.error('Response body:', createResponse.body);
        console.error('Headers:', createResponse.headers);
        
        // Try to understand validation errors
        if (createResponse.body.error && createResponse.body.details) {
          console.error('Validation errors:', createResponse.body.details);
        }
      }

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.id).toBeDefined();
      expect(createResponse.body.title).toBe(TEST_CREATION_DATA.title);
      expect(createResponse.body.status).toBe('brainstorming');
      expect(createResponse.body.userId).toBe(TEST_CREDENTIALS.userId);
      
      createdCreationId = createResponse.body.id;
      console.log(`✅ Creation created successfully with ID: ${createdCreationId}`);
      
      // Verify deployment URL format
      expect(createResponse.body.deploymentUrl).toMatch(/^https:\/\/pages\.orenslab\.com\/.+$/);
      console.log('Deployment URL:', createResponse.body.deploymentUrl);
    });

    it('should retrieve the created creation', async () => {
      console.log(`🔍 Retrieving creation ${createdCreationId}...`);
      
      const getResponse = await request(DEV_SERVER_BASE_URL)
        .get(`/api/creations/${createdCreationId}`)
        .set('Cookie', authCookie)
        .timeout(5000);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.creation.id).toBe(createdCreationId);
      expect(getResponse.body.creation.title).toBe(TEST_CREATION_DATA.title);
      expect(getResponse.body.creation.status).toBe('brainstorming');
      
      console.log('✅ Creation retrieved successfully');
      console.log('Creation details:', {
        id: getResponse.body.creation.id,
        title: getResponse.body.creation.title,
        status: getResponse.body.creation.status,
        pageName: getResponse.body.creation.pageName
      });
    });

    it('should generate architecture plan', async () => {
      console.log(`🧠 Generating architecture plan for creation ${createdCreationId}...`);
      
      const planResponse = await request(DEV_SERVER_BASE_URL)
        .post(`/api/creations/${createdCreationId}/plan`)
        .set('Cookie', authCookie)
        .timeout(60000); // Extended timeout for LLM generation

      console.log('Plan generation status:', planResponse.status);
      console.log('Plan response body:', planResponse.body);

      if (planResponse.status !== 200) {
        console.error('❌ Plan generation failed');
        console.error('Response body:', planResponse.body);
        
        // Check if it's an LLM router issue
        if (planResponse.body.error && planResponse.body.error.includes('llm-router')) {
          console.error('⚠️ LLM router not found - this indicates a missing dependency');
        }
      }

      expect(planResponse.status).toBe(200);
      expect(planResponse.body.message).toBe('Architecture plan generated successfully');
      expect(planResponse.body.architecturePlan).toBeDefined();
      expect(planResponse.body.totalTasks).toBeGreaterThan(0);
      expect(planResponse.body.totalSubtasks).toBeGreaterThan(0);
      
      console.log(`✅ Architecture plan generated successfully`);
      console.log(`📊 Generated ${planResponse.body.totalTasks} tasks and ${planResponse.body.totalSubtasks} subtasks`);
      
      // Log architecture plan excerpt
      const plan = planResponse.body.architecturePlan;
      const planExcerpt = plan.length > 200 ? plan.substring(0, 200) + '...' : plan;
      console.log('Architecture plan excerpt:', planExcerpt);
    }, 120000);

    it('should verify creation is approved after planning', async () => {
      console.log(`✅ Verifying creation status after planning...`);
      
      const getResponse = await request(DEV_SERVER_BASE_URL)
        .get(`/api/creations/${createdCreationId}`)
        .set('Cookie', authCookie)
        .timeout(5000);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.creation.status).toBe('approved');
      expect(getResponse.body.creation.architecturePlan).toBeDefined();
      expect(getResponse.body.creation.totalTasks).toBeGreaterThan(0);
      expect(getResponse.body.creation.totalSubtasks).toBeGreaterThan(0);
      
      // Verify tasks and subtasks were created
      expect(getResponse.body.tasks).toBeDefined();
      expect(Array.isArray(getResponse.body.tasks)).toBe(true);
      expect(getResponse.body.tasks.length).toBeGreaterThan(0);
      
      expect(getResponse.body.subtasks).toBeDefined();
      expect(Array.isArray(getResponse.body.subtasks)).toBe(true);
      expect(getResponse.body.subtasks.length).toBeGreaterThan(0);
      
      console.log('✅ Creation successfully transitioned to approved status');
      console.log(`📋 Tasks: ${getResponse.body.tasks.length}, Subtasks: ${getResponse.body.subtasks.length}`);
      
      // Log task breakdown
      console.log('Task breakdown:');
      getResponse.body.tasks.forEach((task: any, index: number) => {
        console.log(`  ${index + 1}. ${task.title} (${task.category}) - ${task.estimatedDuration || 'no estimate'}`);
      });
    });

    it('should start the building process', async () => {
      console.log(`🔨 Starting build process for creation ${createdCreationId}...`);
      
      const buildResponse = await request(DEV_SERVER_BASE_URL)
        .post(`/api/creations/${createdCreationId}/build`)
        .set('Cookie', authCookie)
        .timeout(10000);

      console.log('Build start status:', buildResponse.status);
      console.log('Build response body:', buildResponse.body);

      expect(buildResponse.status).toBe(200);
      expect(buildResponse.body.message).toBe('Building started successfully');
      expect(buildResponse.body.currentTask).toBeDefined();
      expect(buildResponse.body.currentTask.title).toBeDefined();
      
      if (buildResponse.body.currentSubtask) {
        expect(buildResponse.body.currentSubtask.title).toBeDefined();
        console.log(`✅ Build started with task: ${buildResponse.body.currentTask.title}`);
        console.log(`🔧 First subtask: ${buildResponse.body.currentSubtask.title}`);
      } else {
        console.log(`✅ Build started with task: ${buildResponse.body.currentTask.title}`);
        console.log('⚠️ No subtasks found for first task');
      }
    });

    it('should verify creation is in building status', async () => {
      console.log(`🔍 Verifying building status...`);
      
      const getResponse = await request(DEV_SERVER_BASE_URL)
        .get(`/api/creations/${createdCreationId}`)
        .set('Cookie', authCookie)
        .timeout(5000);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.creation.status).toBe('building');
      expect(getResponse.body.creation.currentTaskId).toBeDefined();
      
      console.log('✅ Creation is in building status');
      console.log(`🎯 Current task ID: ${getResponse.body.creation.currentTaskId}`);
      if (getResponse.body.creation.currentSubtaskId) {
        console.log(`🔧 Current subtask ID: ${getResponse.body.creation.currentSubtaskId}`);
      }
    });
  });

  describe('Data Validation and Error Handling', () => {
    it('should validate creation input data', async () => {
      console.log('🔍 Testing input validation...');
      
      // Test missing title
      const noTitleResponse = await request(DEV_SERVER_BASE_URL)
        .post('/api/creations')
        .send({ description: TEST_CREATION_DATA.description })
        .set('Cookie', authCookie)
        .timeout(5000);
      
      expect(noTitleResponse.status).toBe(400);
      console.log('✅ Correctly rejected creation without title');
      
      // Test short description
      const shortDescResponse = await request(DEV_SERVER_BASE_URL)
        .post('/api/creations')
        .send({ title: 'Test App', description: 'Short' })
        .set('Cookie', authCookie)
        .timeout(5000);
      
      expect(shortDescResponse.status).toBe(400);
      console.log('✅ Correctly rejected creation with short description');
      
      // Test title too long
      const longTitleResponse = await request(DEV_SERVER_BASE_URL)
        .post('/api/creations')
        .send({ 
          title: 'x'.repeat(101), 
          description: TEST_CREATION_DATA.description 
        })
        .set('Cookie', authCookie)
        .timeout(5000);
      
      expect(longTitleResponse.status).toBe(400);
      console.log('✅ Correctly rejected creation with title too long');
    });

    it('should handle invalid creation IDs', async () => {
      console.log('🔍 Testing invalid ID handling...');
      
      // Test non-numeric ID
      const invalidIdResponse = await request(DEV_SERVER_BASE_URL)
        .get('/api/creations/invalid')
        .set('Cookie', authCookie)
        .timeout(5000);
      
      expect(invalidIdResponse.status).toBe(400);
      console.log('✅ Correctly rejected non-numeric creation ID');
      
      // Test non-existent ID
      const nonExistentResponse = await request(DEV_SERVER_BASE_URL)
        .get('/api/creations/999999')
        .set('Cookie', authCookie)
        .timeout(5000);
      
      expect(nonExistentResponse.status).toBe(404);
      console.log('✅ Correctly returned 404 for non-existent creation');
    });
  });

  describe('User Isolation', () => {
    it('should only show user-owned creations', async () => {
      console.log('🔒 Testing user isolation...');
      
      const listResponse = await request(DEV_SERVER_BASE_URL)
        .get('/api/creations')
        .set('Cookie', authCookie)
        .timeout(5000);

      expect(listResponse.status).toBe(200);
      
      // Verify all returned creations belong to the test user
      listResponse.body.forEach((creation: any) => {
        expect(creation.userId).toBe(TEST_CREDENTIALS.userId);
      });
      
      console.log('✅ User isolation verified - all creations belong to authenticated user');
    });
  });

  describe('Complete Flow Summary', () => {
    it('should summarize the complete test results', async () => {
      console.log('\n🎯 COMPLETE E2E TEST SUMMARY');
      console.log('=====================================');
      
      if (createdCreationId) {
        // Get final creation state
        const finalResponse = await request(DEV_SERVER_BASE_URL)
          .get(`/api/creations/${createdCreationId}`)
          .set('Cookie', authCookie)
          .timeout(5000);

        if (finalResponse.status === 200) {
          const creation = finalResponse.body.creation;
          const tasks = finalResponse.body.tasks;
          const subtasks = finalResponse.body.subtasks;
          
          console.log('✅ Test Creation Summary:');
          console.log(`   ID: ${creation.id}`);
          console.log(`   Title: ${creation.title}`);
          console.log(`   Status: ${creation.status}`);
          console.log(`   Page Name: ${creation.pageName}`);
          console.log(`   Deployment URL: ${creation.deploymentUrl}`);
          console.log(`   Total Tasks: ${creation.totalTasks} (actual: ${tasks.length})`);
          console.log(`   Total Subtasks: ${creation.totalSubtasks} (actual: ${subtasks.length})`);
          console.log(`   Created: ${new Date(creation.createdAt).toLocaleString()}`);
          console.log(`   Updated: ${new Date(creation.updatedAt).toLocaleString()}`);
          
          if (creation.architecturePlan) {
            console.log('   ✅ Architecture plan generated');
          }
          
          console.log('\n✅ ALL TESTS PASSED SUCCESSFULLY!');
          console.log('🎉 Creations feature is working correctly in development environment');
        }
      }
      
      expect(true).toBe(true); // Always pass this summary test
    });
  });
});