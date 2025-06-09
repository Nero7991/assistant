#!/usr/bin/env node

import { db } from '../server/db.js';
import { users } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function createTestUser() {
  const username = 'test';
  const password = 'test123';
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
    
    if (existing.length > 0) {
      console.log('Test user already exists');
      process.exit(0);
    }
    
    // Create test user
    const [user] = await db.insert(users).values({
      username,
      password: hashedPassword,
      email: 'test@example.com',
      isEmailVerified: true,
      contactPreference: 'email'
    }).returning();
    
    console.log('Test user created:', user.id);
    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
}

createTestUser();