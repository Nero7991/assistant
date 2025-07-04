import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { db } from '../server/db';
import { creations, users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';

/**
 * Comprehensive Error Handling Tests for Creations API
 * 
 * Tests all scenarios that could cause "failed to create creation" errors
 * and ensures proper error messages are returned to the frontend.
 */

describe('Creations Error Handling', () => {
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
    await db.delete(creations).where(eq(creations.userId, mockUser.id));
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(creations).where(eq(creations.userId, mockUser.id));
  });

  describe('Validation Error Scenarios', () => {
    it('should return specific error for missing title', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          description: 'A valid description with more than 10 characters'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some((d: any) => d.field === 'title')).toBe(true);
    });

    it('should return specific error for missing description', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'Valid Title'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some((d: any) => d.field === 'description')).toBe(true);
    });

    it('should return specific error for description too short', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'Valid Title',
          description: 'Short'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some((d: any) => d.field === 'description')).toBe(true);
    });

    it('should return specific error for title too long', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'x'.repeat(101),
          description: 'A valid description with more than 10 characters'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some((d: any) => d.field === 'title')).toBe(true);
    });

    it('should return specific error for invalid page name characters', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'Valid Title',
          description: 'A valid description with more than 10 characters',
          pageName: 'Invalid Page Name!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some((d: any) => d.field === 'pageName')).toBe(true);
    });

    it('should return specific error for page name too short', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'Valid Title',
          description: 'A valid description with more than 10 characters',
          pageName: 'ab'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.some((d: any) => d.field === 'pageName')).toBe(true);
    });
  });

  describe('Database Constraint Error Scenarios', () => {
    it('should return specific error for duplicate page name', async () => {
      // First, create a creation with a specific page name
      const firstResponse = await request(app)
        .post('/api/creations')
        .send({
          title: 'First App',
          description: 'A valid description with more than 10 characters',
          pageName: 'duplicate-test'
        });

      expect(firstResponse.status).toBe(201);

      // Then try to create another with the same page name
      const duplicateResponse = await request(app)
        .post('/api/creations')
        .send({
          title: 'Second App',
          description: 'Another valid description with more than 10 characters',
          pageName: 'duplicate-test'
        });

      expect(duplicateResponse.status).toBe(409);
      expect(duplicateResponse.body.error).toBe('Page name already exists. Please choose a different page name.');
    });

    it('should auto-generate unique page names when title conflicts exist', async () => {
      // Create first creation with a specific title (no pageName provided)
      const firstResponse = await request(app)
        .post('/api/creations')
        .send({
          title: 'Test App',
          description: 'A valid description with more than 10 characters'
        });

      expect(firstResponse.status).toBe(201);
      expect(firstResponse.body.pageName).toBe('test-app');

      // Create second creation with same title - should auto-generate unique name
      const secondResponse = await request(app)
        .post('/api/creations')
        .send({
          title: 'Test App',
          description: 'Another valid description with more than 10 characters'
        });

      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.pageName).toBe('test-app-1');

      // Create third creation with same title
      const thirdResponse = await request(app)
        .post('/api/creations')
        .send({
          title: 'Test App',
          description: 'Yet another valid description with more than 10 characters'
        });

      expect(thirdResponse.status).toBe(201);
      expect(thirdResponse.body.pageName).toBe('test-app-2');
    });

    it('should handle special characters in title for page name generation', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'My Awesome App! @#$%^&*()',
          description: 'A valid description with more than 10 characters'
        });

      expect(response.status).toBe(201);
      expect(response.body.pageName).toBe('my-awesome-app');
    });

    it('should handle very long titles for page name generation', async () => {
      const longTitle = 'This is a very long title that exceeds the maximum length for page names and should be truncated appropriately';
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: longTitle,
          description: 'A valid description with more than 10 characters'
        });

      expect(response.status).toBe(201);
      expect(response.body.pageName.length).toBeLessThanOrEqual(50);
      expect(response.body.pageName).toBe('this-is-a-very-long-title-that-exceeds-the-maxim');
    });
  });

  describe('Authentication Error Scenarios', () => {
    it('should return 401 for unauthenticated requests', async () => {
      // Create app without authentication middleware
      const { createApp } = await import('../server/index');
      const unauthenticatedApp = createApp();
      const { registerCreationsAPI } = await import('../server/api/creations');
      registerCreationsAPI(unauthenticatedApp);

      const response = await request(unauthenticatedApp)
        .post('/api/creations')
        .send({
          title: 'Valid Title',
          description: 'A valid description with more than 10 characters'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('Edge Cases and Race Conditions', () => {
    it('should handle concurrent requests with same auto-generated page name', async () => {
      const requests = Array(5).fill(null).map(() => 
        request(app)
          .post('/api/creations')
          .send({
            title: 'Concurrent Test',
            description: 'A valid description with more than 10 characters'
          })
      );

      const responses = await Promise.all(requests);

      // All should succeed with unique page names
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.pageName).toBeDefined();
      });

      // All page names should be unique
      const pageNames = responses.map(r => r.body.pageName);
      const uniquePageNames = new Set(pageNames);
      expect(uniquePageNames.size).toBe(pageNames.length);
    });

    it('should handle empty strings and whitespace properly', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: '   ',
          description: '   A valid description   ',
          pageName: '   '
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle null and undefined values properly', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: null,
          description: undefined
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('Success Scenarios', () => {
    it('should successfully create creation with valid data', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'Valid App',
          description: 'A valid description with more than 10 characters',
          pageName: 'valid-app'
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.title).toBe('Valid App');
      expect(response.body.description).toBe('A valid description with more than 10 characters');
      expect(response.body.pageName).toBe('valid-app');
      expect(response.body.status).toBe('brainstorming');
      expect(response.body.deploymentUrl).toBe('https://pages.orenslab.com/valid-app');
    });

    it('should successfully create creation without page name (auto-generated)', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'Auto Generated',
          description: 'A valid description with more than 10 characters'
        });

      expect(response.status).toBe(201);
      expect(response.body.pageName).toBe('auto-generated');
      expect(response.body.deploymentUrl).toBe('https://pages.orenslab.com/auto-generated');
    });

    it('should handle minimum valid input', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'A',
          description: '1234567890' // Exactly 10 characters
        });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe('A');
      expect(response.body.description).toBe('1234567890');
    });

    it('should handle maximum valid input', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'x'.repeat(100), // Exactly 100 characters
          description: 'x'.repeat(2000), // Exactly 2000 characters
          pageName: 'x'.repeat(50) // Exactly 50 characters
        });

      expect(response.status).toBe(201);
      expect(response.body.title.length).toBe(100);
      expect(response.body.description.length).toBe(2000);
      expect(response.body.pageName.length).toBe(50);
    });
  });

  describe('Error Message Format Consistency', () => {
    it('should return consistent error format for all validation errors', async () => {
      const response = await request(app)
        .post('/api/creations')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
      expect(Array.isArray(response.body.details)).toBe(true);
      
      response.body.details.forEach((detail: any) => {
        expect(detail).toHaveProperty('field');
        expect(detail).toHaveProperty('message');
        expect(typeof detail.field).toBe('string');
        expect(typeof detail.message).toBe('string');
      });
    });

    it('should return consistent error format for database constraint violations', async () => {
      // Create first creation
      await request(app)
        .post('/api/creations')
        .send({
          title: 'First App',
          description: 'A valid description with more than 10 characters',
          pageName: 'test-constraint'
        });

      // Try duplicate
      const response = await request(app)
        .post('/api/creations')
        .send({
          title: 'Second App',
          description: 'Another valid description',
          pageName: 'test-constraint'
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
      expect(response.body.error).toBe('Page name already exists. Please choose a different page name.');
    });
  });
});