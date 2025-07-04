import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Default handlers for common API endpoints
export const handlers = [
  // Authentication endpoints
  http.get('/api/user', () => {
    return HttpResponse.json(null, { status: 401 });
  }),

  // Registration flow endpoints
  http.post('/api/register', () => {
    return HttpResponse.json({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      isEmailVerified: false,
      isPhoneVerified: false,
      contactPreference: 'whatsapp',
    }, { status: 201 });
  }),

  // Verification endpoints
  http.post('/api/verify-contact', () => {
    return HttpResponse.json({ message: 'Verification successful' });
  }),

  http.post('/api/initiate-verification', () => {
    return HttpResponse.json({
      message: 'Verification code sent',
      tempUserId: Date.now(),
    });
  }),

  // Known User Facts endpoints
  http.get('/api/known-facts', () => {
    return HttpResponse.json([]);
  }),

  http.post('/api/known-facts', () => {
    return HttpResponse.json({
      id: 1,
      userId: 1,
      factType: 'user-provided',
      category: 'preference',
      content: 'Test fact',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  // Tasks endpoints
  http.get('/api/tasks', () => {
    return HttpResponse.json([]);
  }),

  http.post('/api/tasks', () => {
    return HttpResponse.json({
      id: 1,
      userId: 1,
      title: 'Test task',
      taskType: 'daily',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  // Username availability check
  http.get('/api/check-username/:username', () => {
    return HttpResponse.json({ message: 'Username available' });
  }),

  // DevLM endpoints
  http.get('/api/devlm/sessions', () => {
    return HttpResponse.json([
      {
        id: 1,
        sessionName: 'Test Session 1',
        taskDescription: 'Test task 1',
        mode: 'generate',
        model: 'claude',
        source: 'anthropic'
      }
    ]);
  }),

  http.post('/api/devlm/ws-token', () => {
    return HttpResponse.json({ token: 'test-token-123' });
  }),

  // Creations endpoints (default empty responses)
  http.get('/api/creations', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/creations/:id', () => {
    return HttpResponse.json({ 
      creation: null,
      tasks: [],
      subtasks: []
    }, { status: 404 });
  }),

  http.post('/api/creations', () => {
    return HttpResponse.json({
      id: 1,
      title: 'Test Creation',
      description: 'Test description',
      status: 'brainstorming',
      pageName: 'test-creation',
      deploymentUrl: 'https://pages.orenslab.com/test-creation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  http.post('/api/creations/:id/plan', () => {
    return HttpResponse.json({ 
      message: 'Architecture plan generated successfully',
      architecturePlan: '# Test Plan',
      totalTasks: 1,
      totalSubtasks: 1
    });
  }),

  http.post('/api/creations/:id/build', () => {
    return HttpResponse.json({ 
      message: 'Building started successfully',
      currentTask: { id: 1, title: 'Test Task' },
      currentSubtask: { id: 1, title: 'Test Subtask' }
    });
  }),

  http.put('/api/creations/:id', () => {
    return HttpResponse.json({ message: 'Creation updated successfully' });
  }),

  http.delete('/api/creations/:id', () => {
    return HttpResponse.json({ message: 'Creation deleted successfully' });
  }),
];

export const server = setupServer(...handlers);