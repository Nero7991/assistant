import { describe, it, expect, beforeEach } from 'vitest';

const API_URL = 'http://localhost:5000';

// Cookie management helper
let authCookie: string | undefined;

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers,
    ...(authCookie ? { 'Cookie': authCookie } : {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    authCookie = setCookie.split(';')[0];
  }

  return response;
}

describe('API Integration Tests', () => {
  describe('Authentication', () => {
    it('handles complete authentication flow', async () => {
      const username = `testuser${Date.now()}`;
      const email = `test${Date.now()}@example.com`;

      // Check username availability
      const checkResponse = await fetchWithAuth(`${API_URL}/api/check-username/${username}`);
      expect(checkResponse.status).toBe(200);

      // Register new user
      const registerResponse = await fetchWithAuth(`${API_URL}/api/register`, {
        method: 'POST',
        body: JSON.stringify({
          username,
          password: 'testpass123',
          email,
          contactPreference: 'email'
        })
      });
      expect(registerResponse.status).toBe(201);
      const user = await registerResponse.json();
      expect(user.username).toBe(username);

      // Logout
      const logoutResponse = await fetchWithAuth(`${API_URL}/api/logout`, {
        method: 'POST'
      });
      expect(logoutResponse.status).toBe(200);

      // Try accessing protected route - should fail
      const protectedResponse = await fetchWithAuth(`${API_URL}/api/user`);
      expect(protectedResponse.status).toBe(401);

      // Login again
      const loginResponse = await fetchWithAuth(`${API_URL}/api/login`, {
        method: 'POST',
        body: JSON.stringify({
          username,
          password: 'testpass123'
        })
      });
      expect(loginResponse.status).toBe(200);
      const loggedInUser = await loginResponse.json();
      expect(loggedInUser.username).toBe(username);
    });
  });

  describe('User Facts', () => {
    beforeEach(async () => {
      // Reset auth cookie before each test
      authCookie = undefined;

      // Create and login test user
      const username = `testuser${Date.now()}`;
      const email = `test${Date.now()}@example.com`;

      const registerResponse = await fetchWithAuth(`${API_URL}/api/register`, {
        method: 'POST',
        body: JSON.stringify({
          username,
          password: 'testpass123',
          email,
          contactPreference: 'email'
        })
      });
      expect(registerResponse.status).toBe(201);
    });

    it('handles CRUD operations for facts', async () => {
      // Create fact with valid schema values
      const createResponse = await fetchWithAuth(`${API_URL}/api/known-facts`, {
        method: 'POST',
        body: JSON.stringify({
          factType: 'user-provided', // Must match enum value
          category: 'preference', // Must match enum value
          content: 'Prefers working in quiet environments',
          confidence: 100 // Optional, between 0-100
        })
      });

      // Log response for debugging
      console.log('Create fact response:', await createResponse.clone().text());

      expect(createResponse.status).toBe(201);
      const fact = await createResponse.json();
      expect(fact.content).toBe('Prefers working in quiet environments');

      // Get facts
      const getResponse = await fetchWithAuth(`${API_URL}/api/known-facts`);
      expect(getResponse.status).toBe(200);
      const facts = await getResponse.json();
      expect(facts.length).toBeGreaterThan(0);
      expect(facts[0].content).toBe('Prefers working in quiet environments');

      // Update fact
      const updateResponse = await fetchWithAuth(`${API_URL}/api/known-facts/${fact.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          content: 'Updated preference'
        })
      });
      expect(updateResponse.status).toBe(200);
      const updatedFact = await updateResponse.json();
      expect(updatedFact.content).toBe('Updated preference');

      // Delete fact
      const deleteResponse = await fetchWithAuth(`${API_URL}/api/known-facts/${fact.id}`, {
        method: 'DELETE'
      });
      expect(deleteResponse.status).toBe(204);
    });
  });

  describe('Tasks', () => {
    beforeEach(async () => {
      // Reset auth cookie before each test
      authCookie = undefined;

      // Create and login test user
      const username = `testuser${Date.now()}`;
      const email = `test${Date.now()}@example.com`;

      const registerResponse = await fetchWithAuth(`${API_URL}/api/register`, {
        method: 'POST',
        body: JSON.stringify({
          username,
          password: 'testpass123',
          email,
          contactPreference: 'email'
        })
      });
      expect(registerResponse.status).toBe(201);
    });

    it('handles task lifecycle', async () => {
      // Create task
      const createResponse = await fetchWithAuth(`${API_URL}/api/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Integration Test Task',
          description: 'Testing task operations',
          taskType: 'daily',
          priority: 3,
          estimatedDuration: '2h'
        })
      });
      expect(createResponse.status).toBe(201);
      const task = await createResponse.json();
      expect(task.title).toBe('Integration Test Task');

      // Get tasks
      const getResponse = await fetchWithAuth(`${API_URL}/api/tasks`);
      expect(getResponse.status).toBe(200);
      const tasks = await getResponse.json();
      expect(tasks.length).toBeGreaterThan(0);

      // Update task
      const updateResponse = await fetchWithAuth(`${API_URL}/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          priority: 5
        })
      });
      expect(updateResponse.status).toBe(200);
      const updatedTask = await updateResponse.json();
      expect(updatedTask.priority).toBe(5);

      // Complete task
      const completeResponse = await fetchWithAuth(`${API_URL}/api/tasks/${task.id}/complete`, {
        method: 'POST'
      });
      expect(completeResponse.status).toBe(200);
      const completedTask = await completeResponse.json();
      expect(completedTask.status).toBe('completed');
      expect(completedTask.completedAt).toBeTruthy();

      // Delete task
      const deleteResponse = await fetchWithAuth(`${API_URL}/api/tasks/${task.id}`, {
        method: 'DELETE'
      });
      expect(deleteResponse.status).toBe(204);
    });

    it('supports task filtering', async () => {
      // Create daily task
      const createDaily = await fetchWithAuth(`${API_URL}/api/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Daily Task',
          taskType: 'daily',
          estimatedDuration: '1h'
        })
      });
      expect(createDaily.status).toBe(201);

      // Create project task
      const createProject = await fetchWithAuth(`${API_URL}/api/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Project Task',
          taskType: 'personal_project',
          estimatedDuration: '1d'
        })
      });
      expect(createProject.status).toBe(201);

      // Test daily tasks filter
      const dailyResponse = await fetchWithAuth(`${API_URL}/api/tasks?type=daily`);
      const dailyTasks = await dailyResponse.json();
      expect(dailyTasks.every((t: any) => t.taskType === 'daily')).toBe(true);

      // Test project tasks filter 
      const projectResponse = await fetchWithAuth(`${API_URL}/api/tasks?type=personal_project`);
      const projectTasks = await projectResponse.json();
      expect(projectTasks.every((t: any) => t.taskType === 'personal_project')).toBe(true);
    });
  });
});