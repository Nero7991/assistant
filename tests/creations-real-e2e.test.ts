/**
 * Real E2E Test for Creations Feature
 * 
 * This test bypasses MSW and hits the real development server.
 * It does NOT import from setupTests.ts to avoid MSW interference.
 * 
 * Prerequisites:
 * 1. Development server must be running on port 5001
 * 2. Test user (testuser@example.com) must exist in the database
 * 3. Database must be accessible and properly configured
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

const DEV_SERVER_BASE_URL = 'http://localhost:5001';
const TEST_CREDENTIALS = {
  email: 'testuser@example.com',
  password: 'testpass123',
  userId: 5
};

const TEST_CREATION_DATA = {
  title: 'Test Todo App Real E2E',
  description: 'A comprehensive todo application with add, edit, delete, and mark complete functionality. Should have a clean modern interface with responsive design, local storage persistence, and filter capabilities for active, completed, and all tasks.'
};

describe('Real Creations E2E Test (No Mocks)', () => {
  let authCookie: string;
  let createdCreationId: number;

  beforeAll(async () => {
    console.log('🚀 Starting Real E2E Test (No MSW) for Creations Feature');
    console.log('📍 Target server:', DEV_SERVER_BASE_URL);
    
    // Test server connectivity
    try {
      const healthCheck = await request(DEV_SERVER_BASE_URL).get('/').timeout(5000);
      console.log('✅ Server is responsive, status:', healthCheck.status);
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
    console.log('🏁 Real E2E Test completed');
  });

  it('should login with test user credentials', async () => {
    console.log('🔐 Testing authentication...');
    
    const loginResponse = await request(DEV_SERVER_BASE_URL)
      .post('/api/login')
      .send(TEST_CREDENTIALS)
      .timeout(10000);

    console.log('Login response status:', loginResponse.status);
    console.log('Login response headers:', loginResponse.headers);
    
    if (loginResponse.status !== 200) {
      console.error('Login failed. Response body:', loginResponse.body);
      console.error('Make sure test user exists and credentials are correct');
      
      // Try to understand what endpoints are available
      const rootResponse = await request(DEV_SERVER_BASE_URL).get('/').timeout(5000);
      console.log('Root response status:', rootResponse.status);
      console.log('Root response body (first 200 chars):', 
        rootResponse.text?.substring(0, 200) || 'No text content');
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

  it('should create a new creation without "failed to create creation" error', async () => {
    console.log('🎨 Creating new creation...');
    console.log('Creation data:', TEST_CREATION_DATA);
    
    const createResponse = await request(DEV_SERVER_BASE_URL)
      .post('/api/creations')
      .send(TEST_CREATION_DATA)
      .set('Cookie', authCookie)
      .timeout(10000);

    console.log('Create response status:', createResponse.status);
    console.log('Create response body:', createResponse.body);
    console.log('Create response headers:', createResponse.headers);

    if (createResponse.status !== 201) {
      console.error('❌ Creation failed');
      console.error('Response body:', createResponse.body);
      console.error('Response text:', createResponse.text);
      
      // Try to understand validation errors
      if (createResponse.body?.error && createResponse.body?.details) {
        console.error('Validation errors:', createResponse.body.details);
      }
      
      // Check if it's the authentication issue
      if (createResponse.status === 401) {
        console.error('🔓 Authentication issue - checking auth cookie');
        console.error('Auth cookie:', authCookie?.substring(0, 50) + '...');
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

  it('should generate architecture plan successfully', async () => {
    if (!createdCreationId) {
      throw new Error('No creation ID available for plan generation');
    }

    console.log(`🧠 Generating architecture plan for creation ${createdCreationId}...`);
    
    const planResponse = await request(DEV_SERVER_BASE_URL)
      .post(`/api/creations/${createdCreationId}/plan`)
      .set('Cookie', authCookie)
      .timeout(60000); // Extended timeout for LLM generation

    console.log('Plan generation status:', planResponse.status);
    console.log('Plan response body keys:', Object.keys(planResponse.body || {}));

    if (planResponse.status !== 200) {
      console.error('❌ Plan generation failed');
      console.error('Response body:', planResponse.body);
      console.error('Response text:', planResponse.text);
      
      // Check if it's an LLM router issue
      if (planResponse.body?.error?.includes('llm-router')) {
        console.error('⚠️ LLM router not found - this indicates a missing dependency');
      }
      
      // Check if it's an authentication issue
      if (planResponse.status === 401) {
        console.error('🔓 Authentication issue during plan generation');
      }
      
      // Check if it's a database issue  
      if (planResponse.body?.error?.includes('database') || planResponse.body?.error?.includes('db')) {
        console.error('💾 Database issue during plan generation');
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

  it('should complete the entire workflow successfully', async () => {
    if (!createdCreationId) {
      throw new Error('No creation ID available for workflow completion');
    }

    console.log(`🔄 Testing complete workflow for creation ${createdCreationId}...`);
    
    // Verify creation is approved after planning
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
    
    // Start building process
    console.log(`🔨 Starting build process for creation ${createdCreationId}...`);
    
    const buildResponse = await request(DEV_SERVER_BASE_URL)
      .post(`/api/creations/${createdCreationId}/build`)
      .set('Cookie', authCookie)
      .timeout(10000);

    expect(buildResponse.status).toBe(200);
    expect(buildResponse.body.message).toBe('Building started successfully');
    expect(buildResponse.body.currentTask).toBeDefined();
    expect(buildResponse.body.currentTask.title).toBeDefined();
    
    console.log(`✅ Build started with task: ${buildResponse.body.currentTask.title}`);
    
    // Verify creation is in building status
    const buildingResponse = await request(DEV_SERVER_BASE_URL)
      .get(`/api/creations/${createdCreationId}`)
      .set('Cookie', authCookie)
      .timeout(5000);

    expect(buildingResponse.status).toBe(200);
    expect(buildingResponse.body.creation.status).toBe('building');
    expect(buildingResponse.body.creation.currentTaskId).toBeDefined();
    
    console.log('✅ Creation is in building status');
    console.log(`🎯 Current task ID: ${buildingResponse.body.creation.currentTaskId}`);
    
    console.log('\n🎉 COMPLETE WORKFLOW SUCCESSFUL!');
    console.log('✅ All creation operations working correctly');
    console.log('✅ No "failed to create creation" errors encountered');
    console.log('✅ LLM integration functioning properly');
    console.log('✅ Database operations successful');
    console.log('✅ Authentication and authorization working');
  });

  it('should list all user creations correctly', async () => {
    console.log('📋 Testing creation listing...');
    
    const listResponse = await request(DEV_SERVER_BASE_URL)
      .get('/api/creations')
      .set('Cookie', authCookie)
      .timeout(5000);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    
    // Should contain our test creation
    const testCreation = listResponse.body.find((c: any) => c.id === createdCreationId);
    expect(testCreation).toBeDefined();
    expect(testCreation.title).toBe(TEST_CREATION_DATA.title);
    
    console.log(`✅ Found test creation in list with ${listResponse.body.length} total creations`);
  });

  it('should validate input data correctly', async () => {
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
    
    // Test valid creation
    const validResponse = await request(DEV_SERVER_BASE_URL)
      .post('/api/creations')
      .send({
        title: 'Valid Test App',
        description: 'This is a valid description that is long enough to pass validation and contains proper detail about the application.'
      })
      .set('Cookie', authCookie)
      .timeout(5000);
    
    expect(validResponse.status).toBe(201);
    console.log('✅ Correctly accepted valid creation data');
    
    // Cleanup the valid creation
    if (validResponse.body.id) {
      await request(DEV_SERVER_BASE_URL)
        .delete(`/api/creations/${validResponse.body.id}`)
        .set('Cookie', authCookie)
        .timeout(5000);
    }
  });
});