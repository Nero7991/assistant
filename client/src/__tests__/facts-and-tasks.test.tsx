import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import { renderWithProviders } from './test-utils';

// Mock data
const mockKnownFact = {
  id: 1,
  userId: 1,
  factType: 'user-provided',
  category: 'preference',
  content: 'Prefers working in quiet environments',
  confidence: 100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockTask = {
  id: 1,
  userId: 1,
  title: 'Complete project documentation',
  description: 'Write comprehensive docs for the new feature',
  taskType: 'daily',
  status: 'active',
  priority: 3,
  estimatedDuration: '2h',
  deadline: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: null,
  metadata: null,
};

describe('Known User Facts API', () => {
  it('handles authentication requirement', async () => {
    server.use(
      http.get('/api/known-facts', () => {
        return HttpResponse.json(null, { status: 401 });
      })
    );

    const response = await fetch('/api/known-facts');
    expect(response.status).toBe(401);
  });

  it('creates and retrieves user facts', async () => {
    server.use(
      http.post('/api/known-facts', () => {
        return HttpResponse.json(mockKnownFact, { status: 201 });
      }),
      http.get('/api/known-facts', () => {
        return HttpResponse.json([mockKnownFact]);
      })
    );

    // Test creation
    const createResponse = await fetch('/api/known-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        factType: 'user-provided',
        category: 'preference',
        content: 'Prefers working in quiet environments',
      }),
    });
    expect(createResponse.status).toBe(201);
    const createdFact = await createResponse.json();
    expect(createdFact).toMatchObject({
      factType: 'user-provided',
      category: 'preference',
      content: 'Prefers working in quiet environments',
    });

    // Test retrieval
    const getResponse = await fetch('/api/known-facts');
    expect(getResponse.status).toBe(200);
    const facts = await getResponse.json();
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject(mockKnownFact);
  });

  it('updates and deletes user facts', async () => {
    server.use(
      http.patch('/api/known-facts/1', () => {
        return HttpResponse.json({
          ...mockKnownFact,
          content: 'Updated content',
        });
      }),
      http.delete('/api/known-facts/1', () => {
        return new HttpResponse(null, { status: 204 });
      })
    );

    // Test update
    const updateResponse = await fetch('/api/known-facts/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Updated content' }),
    });
    expect(updateResponse.status).toBe(200);
    const updatedFact = await updateResponse.json();
    expect(updatedFact.content).toBe('Updated content');

    // Test deletion
    const deleteResponse = await fetch('/api/known-facts/1', {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(204);
  });
});

describe('Tasks API', () => {
  it('handles authentication requirement', async () => {
    server.use(
      http.get('/api/tasks', () => {
        return HttpResponse.json(null, { status: 401 });
      })
    );

    const response = await fetch('/api/tasks');
    expect(response.status).toBe(401);
  });

  it('creates and retrieves tasks', async () => {
    server.use(
      http.post('/api/tasks', () => {
        return HttpResponse.json(mockTask, { status: 201 });
      }),
      http.get('/api/tasks', () => {
        return HttpResponse.json([mockTask]);
      })
    );

    // Test creation
    const createResponse = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Complete project documentation',
        description: 'Write comprehensive docs for the new feature',
        taskType: 'daily',
        priority: 3,
        estimatedDuration: '2h',
      }),
    });
    expect(createResponse.status).toBe(201);
    const createdTask = await createResponse.json();
    expect(createdTask).toMatchObject({
      title: 'Complete project documentation',
      taskType: 'daily',
    });

    // Test retrieval
    const getResponse = await fetch('/api/tasks');
    expect(getResponse.status).toBe(200);
    const tasks = await getResponse.json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject(mockTask);
  });

  it('updates task status and handles completion', async () => {
    const completedTask = {
      ...mockTask,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };

    server.use(
      http.patch('/api/tasks/1', () => {
        return HttpResponse.json({
          ...mockTask,
          priority: 5,
        });
      }),
      http.post('/api/tasks/1/complete', () => {
        return HttpResponse.json(completedTask);
      })
    );

    // Test update
    const updateResponse = await fetch('/api/tasks/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 5 }),
    });
    expect(updateResponse.status).toBe(200);
    const updatedTask = await updateResponse.json();
    expect(updatedTask.priority).toBe(5);

    // Test completion
    const completeResponse = await fetch('/api/tasks/1/complete', {
      method: 'POST',
    });
    expect(completeResponse.status).toBe(200);
    const completedTaskResponse = await completeResponse.json();
    expect(completedTaskResponse.status).toBe('completed');
    expect(completedTaskResponse.completedAt).toBeTruthy();
  });

  it('filters tasks by type', async () => {
    const dailyTask = { ...mockTask, taskType: 'daily' };
    const projectTask = { ...mockTask, id: 2, taskType: 'personal_project' };

    server.use(
      http.get('/api/tasks', ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        
        if (type === 'daily') {
          return HttpResponse.json([dailyTask]);
        } else if (type === 'personal_project') {
          return HttpResponse.json([projectTask]);
        }
        return HttpResponse.json([dailyTask, projectTask]);
      })
    );

    // Test all tasks
    const allResponse = await fetch('/api/tasks');
    const allTasks = await allResponse.json();
    expect(allTasks).toHaveLength(2);

    // Test daily tasks filter
    const dailyResponse = await fetch('/api/tasks?type=daily');
    const dailyTasks = await dailyResponse.json();
    expect(dailyTasks).toHaveLength(1);
    expect(dailyTasks[0].taskType).toBe('daily');

    // Test project tasks filter
    const projectResponse = await fetch('/api/tasks?type=personal_project');
    const projectTasks = await projectResponse.json();
    expect(projectTasks).toHaveLength(1);
    expect(projectTasks[0].taskType).toBe('personal_project');
  });
});
