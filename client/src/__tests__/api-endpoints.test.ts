import { describe, it, expect, beforeAll } from 'vitest';

const API_URL = 'http://localhost:5000';

describe('API Endpoints', () => {
  describe('Authentication', () => {
    it('handles registration flow', async () => {
      // Test username availability
      const checkResponse = await fetch(`${API_URL}/api/check-username/testuser${Date.now()}`);
      expect(checkResponse.status).toBe(200);
      
      // Test email verification
      const verifyResponse = await fetch(`${API_URL}/api/initiate-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          email: `test${Date.now()}@example.com`
        })
      });
      expect(verifyResponse.status).toBe(200);
      const { tempUserId } = await verifyResponse.json();
      expect(tempUserId).toBeDefined();

      // Test registration with verified contacts
      const registerResponse = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `testuser${Date.now()}`,
          password: 'password123',
          email: `test${Date.now()}@example.com`,
          contactPreference: 'email'
        }),
        credentials: 'include'
      });
      expect(registerResponse.status).toBe(201);
      const user = await registerResponse.json();
      expect(user.username).toBeDefined();
      expect(user.id).toBeDefined();
    });

    it('handles login and session management', async () => {
      // Create test user
      const username = `testuser${Date.now()}`;
      const registerResponse = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: 'password123',
          email: `test${Date.now()}@example.com`,
          contactPreference: 'email'
        }),
        credentials: 'include'
      });
      expect(registerResponse.status).toBe(201);

      // Test login
      const loginResponse = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: 'password123'
        }),
        credentials: 'include'
      });
      expect(loginResponse.status).toBe(200);
      const loggedInUser = await loginResponse.json();
      expect(loggedInUser.username).toBe(username);

      // Test session persistence
      const userResponse = await fetch(`${API_URL}/api/user`, {
        credentials: 'include'
      });
      expect(userResponse.status).toBe(200);
      const userData = await userResponse.json();
      expect(userData.username).toBe(username);

      // Test logout
      const logoutResponse = await fetch(`${API_URL}/api/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      expect(logoutResponse.status).toBe(200);

      // Verify session ended
      const afterLogoutResponse = await fetch(`${API_URL}/api/user`, {
        credentials: 'include'
      });
      expect(afterLogoutResponse.status).toBe(401);
    });
  });

  describe('User Facts API', () => {
    let authCookie: string;
    
    beforeAll(async () => {
      // Login to get auth cookie
      const username = `testuser${Date.now()}`;
      await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: 'password123',
          email: `test${Date.now()}@example.com`,
          contactPreference: 'email'
        }),
        credentials: 'include'
      });

      const loginResponse = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: 'password123'
        }),
        credentials: 'include'
      });
      
      const setCookie = loginResponse.headers.get('set-cookie');
      if (setCookie) {
        authCookie = setCookie.split(';')[0];
      }
    });

    it('handles CRUD operations for user facts', async () => {
      // Create fact
      const createResponse = await fetch(`${API_URL}/api/known-facts`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': authCookie
        },
        body: JSON.stringify({
          factType: 'user-provided',
          category: 'preference',
          content: 'Prefers working in quiet environments',
          confidence: 100
        }),
        credentials: 'include'
      });
      expect(createResponse.status).toBe(201);
      const fact = await createResponse.json();
      expect(fact.content).toBe('Prefers working in quiet environments');

      // Get facts
      const getResponse = await fetch(`${API_URL}/api/known-facts`, {
        headers: { 'Cookie': authCookie },
        credentials: 'include'
      });
      expect(getResponse.status).toBe(200);
      const facts = await getResponse.json();
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toBe('Prefers working in quiet environments');

      // Update fact
      const updateResponse = await fetch(`${API_URL}/api/known-facts/${fact.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': authCookie
        },
        body: JSON.stringify({
          content: 'Updated preference'
        }),
        credentials: 'include'
      });
      expect(updateResponse.status).toBe(200);
      const updatedFact = await updateResponse.json();
      expect(updatedFact.content).toBe('Updated preference');

      // Delete fact
      const deleteResponse = await fetch(`${API_URL}/api/known-facts/${fact.id}`, {
        method: 'DELETE',
        headers: { 'Cookie': authCookie },
        credentials: 'include'
      });
      expect(deleteResponse.status).toBe(204);
    });
  });

  describe('Tasks API', () => {
    let authCookie: string;
    
    beforeAll(async () => {
      // Login to get auth cookie
      const username = `testuser${Date.now()}`;
      await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: 'password123',
          email: `test${Date.now()}@example.com`,
          contactPreference: 'email'
        }),
        credentials: 'include'
      });

      const loginResponse = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: 'password123'
        }),
        credentials: 'include'
      });
      
      const setCookie = loginResponse.headers.get('set-cookie');
      if (setCookie) {
        authCookie = setCookie.split(';')[0];
      }
    });

    it('handles task management operations', async () => {
      // Create task
      const createResponse = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': authCookie
        },
        body: JSON.stringify({
          title: 'Test task',
          description: 'Task description',
          taskType: 'daily',
          priority: 3,
          estimatedDuration: '2h'
        }),
        credentials: 'include'
      });
      expect(createResponse.status).toBe(201);
      const task = await createResponse.json();
      expect(task.title).toBe('Test task');

      // Get tasks
      const getResponse = await fetch(`${API_URL}/api/tasks`, {
        headers: { 'Cookie': authCookie },
        credentials: 'include'
      });
      expect(getResponse.status).toBe(200);
      const tasks = await getResponse.json();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Test task');

      // Update task
      const updateResponse = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': authCookie
        },
        body: JSON.stringify({
          priority: 5
        }),
        credentials: 'include'
      });
      expect(updateResponse.status).toBe(200);
      const updatedTask = await updateResponse.json();
      expect(updatedTask.priority).toBe(5);

      // Complete task
      const completeResponse = await fetch(`${API_URL}/api/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Cookie': authCookie },
        credentials: 'include'
      });
      expect(completeResponse.status).toBe(200);
      const completedTask = await completeResponse.json();
      expect(completedTask.status).toBe('completed');
      expect(completedTask.completedAt).toBeTruthy();

      // Delete task
      const deleteResponse = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: 'DELETE',
        headers: { 'Cookie': authCookie },
        credentials: 'include'
      });
      expect(deleteResponse.status).toBe(204);
    });

    it('filters tasks by type', async () => {
      // Create tasks of different types
      const createDaily = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': authCookie
        },
        body: JSON.stringify({
          title: 'Daily task',
          taskType: 'daily',
          estimatedDuration: '2h'
        }),
        credentials: 'include'
      });
      expect(createDaily.status).toBe(201);

      const createProject = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': authCookie
        },
        body: JSON.stringify({
          title: 'Project task',
          taskType: 'personal_project',
          estimatedDuration: '2d'
        }),
        credentials: 'include'
      });
      expect(createProject.status).toBe(201);

      // Test filtering
      const dailyResponse = await fetch(`${API_URL}/api/tasks?type=daily`, {
        headers: { 'Cookie': authCookie },
        credentials: 'include'
      });
      const dailyTasks = await dailyResponse.json();
      expect(dailyTasks.every(t => t.taskType === 'daily')).toBe(true);

      const projectResponse = await fetch(`${API_URL}/api/tasks?type=personal_project`, {
        headers: { 'Cookie': authCookie },
        credentials: 'include'
      });
      const projectTasks = await projectResponse.json();
      expect(projectTasks.every(t => t.taskType === 'personal_project')).toBe(true);
    });
  });
});
