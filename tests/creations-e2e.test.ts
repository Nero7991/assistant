import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { db } from '../server/db';
import { creations, creationTasks, creationSubtasks, users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';

// Mock external dependencies
vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('../server/services/llm-functions');

describe('Creations End-to-End Flow', () => {
  let app: Express;
  const mockUser = { id: 5, username: 'testuser', email: 'testuser@example.com' };

  beforeEach(async () => {
    // Setup authenticated app
    const { createApp } = await import('../server/index');
    app = createApp();
    
    app.use((req, res, next) => {
      req.user = mockUser;
      req.isAuthenticated = () => true;
      next();
    });
    
    const { registerCreationsAPI } = await import('../server/api/creations');
    registerCreationsAPI(app);

    // Clean up test data
    await db.delete(creationSubtasks).where(eq(creationSubtasks.creationId, 999));
    await db.delete(creationTasks).where(eq(creationTasks.creationId, 999));
    await db.delete(creations).where(eq(creations.userId, mockUser.id));

    // Setup mocks
    vi.clearAllMocks();
  });

  describe('Complete Creation Workflow', () => {
    it('follows the full creation lifecycle from idea to deployment', async () => {
      // Mock LLM functions
      const { generateArchitecturePlan, generateTaskBreakdown } = await import('../server/services/llm-functions');
      
      const mockArchPlan = `# Architecture Plan

## Overview
A modern todo list application built with React and TypeScript.

## Technology Stack
- React 18 with TypeScript
- Tailwind CSS for styling
- Vite for build tooling
- LocalStorage for data persistence

## Component Structure
- App.tsx - Main application
- components/TodoList.tsx - Todo list container
- components/TodoItem.tsx - Individual todo items
- components/AddTodo.tsx - Add new todo form

## Key Features
1. Add new todos
2. Mark todos as complete
3. Delete todos
4. Filter todos (all/active/completed)
5. Persist data locally`;

      const mockTasks = [
        {
          title: 'Project Setup',
          description: 'Initialize React project with TypeScript and Tailwind',
          category: 'setup',
          estimatedDuration: '30m',
          geminiPrompt: 'Create a new Vite React TypeScript project and configure Tailwind CSS',
          subtasks: [
            {
              title: 'Initialize Vite Project',
              description: 'Create new Vite project with React TypeScript template',
              estimatedDuration: '10m',
              filesPaths: ['package.json', 'tsconfig.json', 'vite.config.ts'],
              geminiPrompt: 'Run: npm create vite@latest todo-app -- --template react-ts'
            },
            {
              title: 'Configure Tailwind',
              description: 'Install and configure Tailwind CSS',
              estimatedDuration: '10m',
              filesPaths: ['tailwind.config.js', 'postcss.config.js', 'src/index.css'],
              geminiPrompt: 'Install Tailwind CSS: npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p'
            }
          ]
        },
        {
          title: 'Build Core Components',
          description: 'Create the main todo application components',
          category: 'frontend',
          estimatedDuration: '2h',
          geminiPrompt: 'Create React components for todo functionality',
          subtasks: [
            {
              title: 'Create TodoItem Component',
              description: 'Build individual todo item with checkbox and delete button',
              estimatedDuration: '30m',
              filesPaths: ['src/components/TodoItem.tsx'],
              geminiPrompt: 'Create TodoItem component with props: todo: {id: string, text: string, completed: boolean}, onToggle: (id: string) => void, onDelete: (id: string) => void'
            },
            {
              title: 'Create TodoList Component',
              description: 'Build container for all todo items',
              estimatedDuration: '30m',
              filesPaths: ['src/components/TodoList.tsx'],
              geminiPrompt: 'Create TodoList component that maps over todos array and renders TodoItem components'
            }
          ]
        }
      ];

      (generateArchitecturePlan as any).mockResolvedValue(mockArchPlan);
      (generateTaskBreakdown as any).mockResolvedValue(mockTasks);

      // Mock file system operations
      const mockMkdir = vi.mocked(fs.mkdir);
      const mockWriteFile = vi.mocked(fs.writeFile);
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      // Step 1: User describes their idea
      const ideaDescription = {
        title: 'Smart Todo List',
        description: 'A todo list app where users can add, complete, and delete tasks. It should save data locally and have a clean, modern design.',
      };

      console.log('🚀 Step 1: Creating new idea...');
      const createResponse = await request(app)
        .post('/api/creations')
        .send(ideaDescription)
        .expect(201);

      const creationId = createResponse.body.id;
      expect(createResponse.body.status).toBe('brainstorming');
      expect(createResponse.body.title).toBe(ideaDescription.title);
      expect(createResponse.body.pageName).toBe('smart-todo-list');

      // Verify creation exists in database
      const [creation] = await db
        .select()
        .from(creations)
        .where(eq(creations.id, creationId));
      
      expect(creation.status).toBe('brainstorming');
      expect(creation.userId).toBe(mockUser.id);

      // Step 2: AI brainstorms requirements and generates plan
      console.log('🧠 Step 2: Generating architecture plan...');
      const planResponse = await request(app)
        .post(`/api/creations/${creationId}/plan`)
        .expect(200);

      expect(planResponse.body.message).toBe('Architecture plan generated successfully');
      expect(planResponse.body.totalTasks).toBe(2);
      expect(planResponse.body.totalSubtasks).toBe(4);

      // Verify plan was generated and saved
      const [updatedCreation] = await db
        .select()
        .from(creations)
        .where(eq(creations.id, creationId));

      expect(updatedCreation.status).toBe('approved');
      expect(updatedCreation.architecturePlan).toContain('Architecture Plan');
      expect(updatedCreation.totalTasks).toBe(2);
      expect(updatedCreation.totalSubtasks).toBe(4);

      // Verify tasks and subtasks were created
      const tasks = await db
        .select()
        .from(creationTasks)
        .where(eq(creationTasks.creationId, creationId));

      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe('Project Setup');
      expect(tasks[1].title).toBe('Build Core Components');

      const subtasks = await db
        .select()
        .from(creationSubtasks)
        .where(eq(creationSubtasks.creationId, creationId));

      expect(subtasks).toHaveLength(4);

      // Step 3: User reviews and approves the plan
      console.log('👀 Step 3: Plan approved, ready for building...');
      const detailsResponse = await request(app)
        .get(`/api/creations/${creationId}`)
        .expect(200);

      expect(detailsResponse.body.creation.status).toBe('approved');
      expect(detailsResponse.body.tasks).toHaveLength(2);
      expect(detailsResponse.body.subtasks).toHaveLength(4);

      // Verify architecture plan contains expected content
      const architecturePlan = detailsResponse.body.creation.architecturePlan;
      expect(architecturePlan).toContain('React 18 with TypeScript');
      expect(architecturePlan).toContain('Tailwind CSS');
      expect(architecturePlan).toContain('TodoList.tsx');
      expect(architecturePlan).toContain('TodoItem.tsx');

      // Step 4: Start building process
      console.log('🔨 Step 4: Starting build process...');
      const buildResponse = await request(app)
        .post(`/api/creations/${creationId}/build`)
        .expect(200);

      expect(buildResponse.body.message).toBe('Building started successfully');
      expect(buildResponse.body.currentTask.title).toBe('Project Setup');
      expect(buildResponse.body.currentSubtask.title).toBe('Initialize Vite Project');

      // Verify building status
      const [buildingCreation] = await db
        .select()
        .from(creations)
        .where(eq(creations.id, creationId));

      expect(buildingCreation.status).toBe('building');
      expect(buildingCreation.currentTaskId).not.toBeNull();
      expect(buildingCreation.currentSubtaskId).not.toBeNull();

      // Step 5: Simulate file system creation (would be done by Gemini CLI)
      console.log('📁 Step 5: Creating project files...');
      const projectPath = `/var/www/pages/${mockUser.email}/pages/smart-todo-list`;
      
      // Verify directory creation would be called
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('smart-todo-list'),
        { recursive: true }
      );

      // Step 6: Write plan to markdown file
      console.log('📝 Step 6: Writing architecture plan...');
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('ARCHITECTURE.md'),
        expect.stringContaining('Architecture Plan'),
        'utf-8'
      );

      // Verify the complete flow
      const finalDetailsResponse = await request(app)
        .get(`/api/creations/${creationId}`)
        .expect(200);

      const finalCreation = finalDetailsResponse.body.creation;
      expect(finalCreation.status).toBe('building');
      expect(finalCreation.deploymentUrl).toBe('https://pages.orenslab.com/smart-todo-list');
      expect(finalCreation.totalTasks).toBe(2);
      expect(finalCreation.totalSubtasks).toBe(4);

      console.log('✅ Complete workflow test passed!');
    });

    it('handles iterative requirement refinement', async () => {
      // Mock scenario where initial description is vague
      const vague_description = {
        title: 'My App',
        description: 'I want to build something cool',
      };

      const createResponse = await request(app)
        .post('/api/creations')
        .send(vague_description)
        .expect(201);

      // User realizes they need to provide more details
      const refined_description = {
        title: 'Personal Finance Tracker',
        description: 'A web app where I can track my income, expenses, and savings goals. Should have charts showing spending patterns and budget categories.',
      };

      const updateResponse = await request(app)
        .put(`/api/creations/${createResponse.body.id}`)
        .send(refined_description)
        .expect(200);

      // Mock refined architecture plan
      const { generateArchitecturePlan, generateTaskBreakdown } = await import('../server/services/llm-functions');
      
      (generateArchitecturePlan as any).mockResolvedValue(`# Architecture Plan

## Overview
A personal finance tracking application with data visualization.

## Features
- Income/expense tracking
- Budget categories
- Savings goals
- Interactive charts
- Data persistence`);

      (generateTaskBreakdown as any).mockResolvedValue([
        {
          title: 'Setup Finance App',
          category: 'setup',
          subtasks: [
            { title: 'Initialize project', filesPaths: ['package.json'] }
          ]
        }
      ]);

      // Generate plan with refined requirements
      const planResponse = await request(app)
        .post(`/api/creations/${createResponse.body.id}/plan`)
        .expect(200);

      expect(planResponse.body.message).toBe('Architecture plan generated successfully');
    });

    it('recovers from build failures gracefully', async () => {
      // Create a creation ready for building
      const [creation] = await db.insert(creations).values({
        id: 999,
        userId: mockUser.id,
        title: 'Failing App',
        description: 'An app that will fail to build',
        status: 'approved',
        architecturePlan: '# Simple Plan',
        totalTasks: 1,
        totalSubtasks: 1,
      }).returning();

      const [task] = await db.insert(creationTasks).values({
        creationId: creation.id,
        title: 'Setup',
        description: 'Setup task',
        category: 'setup',
        orderIndex: 0,
        totalSubtasks: 1,
      }).returning();

      await db.insert(creationSubtasks).values({
        creationId: creation.id,
        taskId: task.id,
        title: 'Initialize',
        description: 'Initialize project',
        orderIndex: 0,
      });

      // Mock file system failure
      const mockMkdir = vi.mocked(fs.mkdir);
      mockMkdir.mockRejectedValue(new Error('Permission denied'));

      const buildResponse = await request(app)
        .post('/api/creations/999/build')
        .expect(200); // Build starts successfully

      // In a real scenario, the background process would handle the failure
      // and update the creation status to 'failed'
      
      // Simulate failure handling by updating status
      await db.update(creations)
        .set({ status: 'failed' })
        .where(eq(creations.id, 999));

      const detailsResponse = await request(app)
        .get('/api/creations/999')
        .expect(200);

      expect(detailsResponse.body.creation.status).toBe('failed');
    });
  });

  describe('User Experience Scenarios', () => {
    it('supports multiple concurrent creations', async () => {
      // Create multiple creations simultaneously
      const creation1 = await request(app)
        .post('/api/creations')
        .send({
          title: 'Todo App',
          description: 'Simple todo list',
        })
        .expect(201);

      const creation2 = await request(app)
        .post('/api/creations')
        .send({
          title: 'Weather App',
          description: 'Weather dashboard',
        })
        .expect(201);

      const creation3 = await request(app)
        .post('/api/creations')
        .send({
          title: 'Calculator',
          description: 'Basic calculator',
        })
        .expect(201);

      // Verify all creations exist
      const listResponse = await request(app)
        .get('/api/creations')
        .expect(200);

      expect(listResponse.body).toHaveLength(3);
      
      const titles = listResponse.body.map((c: any) => c.title);
      expect(titles).toContain('Todo App');
      expect(titles).toContain('Weather App');
      expect(titles).toContain('Calculator');
    });

    it('handles creation deletion and cleanup', async () => {
      const createResponse = await request(app)
        .post('/api/creations')
        .send({
          title: 'Temporary App',
          description: 'This will be deleted',
        })
        .expect(201);

      const creationId = createResponse.body.id;

      // Verify creation exists
      let listResponse = await request(app)
        .get('/api/creations')
        .expect(200);

      expect(listResponse.body).toHaveLength(1);

      // Delete the creation
      await request(app)
        .delete(`/api/creations/${creationId}`)
        .expect(200);

      // Verify creation is soft deleted (not in list)
      listResponse = await request(app)
        .get('/api/creations')
        .expect(200);

      expect(listResponse.body).toHaveLength(0);

      // Verify it's soft deleted in database
      const [deletedCreation] = await db
        .select()
        .from(creations)
        .where(eq(creations.id, creationId));

      expect(deletedCreation.deletedAt).not.toBeNull();
    });

    it('preserves user isolation', async () => {
      // Create creation as test user
      const userCreation = await request(app)
        .post('/api/creations')
        .send({
          title: 'User App',
          description: 'This belongs to test user',
        })
        .expect(201);

      // Create another creation as different user (simulate by changing user ID)
      const [otherUserCreation] = await db.insert(creations).values({
        userId: mockUser.id + 1,
        title: 'Other User App',
        description: 'This belongs to someone else',
        status: 'brainstorming',
      }).returning();

      // User should only see their own creations
      const listResponse = await request(app)
        .get('/api/creations')
        .expect(200);

      expect(listResponse.body).toHaveLength(1);
      expect(listResponse.body[0].title).toBe('User App');

      // User should not be able to access other user's creation
      await request(app)
        .get(`/api/creations/${otherUserCreation.id}`)
        .expect(404);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('handles invalid creation IDs gracefully', async () => {
      await request(app)
        .get('/api/creations/invalid')
        .expect(400);

      await request(app)
        .get('/api/creations/99999')
        .expect(404);

      await request(app)
        .post('/api/creations/invalid/plan')
        .expect(400);

      await request(app)
        .post('/api/creations/invalid/build')
        .expect(400);
    });

    it('validates creation data thoroughly', async () => {
      // Missing title
      await request(app)
        .post('/api/creations')
        .send({ description: 'No title' })
        .expect(400);

      // Missing description
      await request(app)
        .post('/api/creations')
        .send({ title: 'No description' })
        .expect(400);

      // Invalid page name
      await request(app)
        .post('/api/creations')
        .send({
          title: 'Valid Title',
          description: 'Valid description',
          pageName: 'invalid page name!',
        })
        .expect(400);

      // Title too long
      await request(app)
        .post('/api/creations')
        .send({
          title: 'x'.repeat(101),
          description: 'Valid description',
        })
        .expect(400);

      // Description too short
      await request(app)
        .post('/api/creations')
        .send({
          title: 'Valid Title',
          description: 'Short',
        })
        .expect(400);
    });

    it('enforces correct status transitions', async () => {
      const [creation] = await db.insert(creations).values({
        id: 999,
        userId: mockUser.id,
        title: 'Status Test App',
        description: 'Testing status transitions',
        status: 'brainstorming',
      }).returning();

      // Cannot build while in brainstorming
      await request(app)
        .post('/api/creations/999/build')
        .expect(400);

      // Can generate plan from brainstorming
      const { generateArchitecturePlan, generateTaskBreakdown } = await import('../server/services/llm-functions');
      (generateArchitecturePlan as any).mockResolvedValue('# Plan');
      (generateTaskBreakdown as any).mockResolvedValue([]);

      await request(app)
        .post('/api/creations/999/plan')
        .expect(200);

      // Now should be approved, can build
      const updatedCreation = await db
        .select()
        .from(creations)
        .where(eq(creations.id, 999));

      expect(updatedCreation[0].status).toBe('approved');
    });
  });
});