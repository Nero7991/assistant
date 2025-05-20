/**
 * People Management API
 * 
 * This module provides API endpoints for managing people in the user's contacts.
 */

import type { Express, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { people, peopleVerifications, insertPersonSchema, personVerificationSchema } from "@shared/schema";
import { generateVerificationCode, sendVerificationMessage } from "../messaging";
import { z } from "zod";
import { randomBytes, randomUUID } from "crypto";
import logger from "../logger";

// Validate user has access to the specified person
async function validatePersonAccess(userId: number, personId: number): Promise<boolean> {
  const [person] = await db.select().from(people).where(
    and(
      eq(people.id, personId),
      eq(people.userId, userId),
      isNull(people.deletedAt)
    )
  );
  return !!person;
}

export function registerPeopleManagementAPI(app: Express) {
  // Get all people for the authenticated user
  app.get('/api/people', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const userId = req.user!.id;
      
      const peopleList = await db.select().from(people).where(
        and(
          eq(people.userId, userId),
          isNull(people.deletedAt)
        )
      );
      
      res.json(peopleList);
    } catch (error) {
      logger.error({ error }, '[API] Error fetching people');
      res.status(500).json({ message: 'Failed to fetch people' });
    }
  });

  // Get a specific person by ID
  app.get('/api/people/:id', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const userId = req.user!.id;
      const personId = parseInt(req.params.id);
      
      if (isNaN(personId)) {
        return res.status(400).json({ message: 'Invalid person ID' });
      }
      
      const [person] = await db.select().from(people).where(
        and(
          eq(people.id, personId),
          eq(people.userId, userId),
          isNull(people.deletedAt)
        )
      );
      
      if (!person) {
        return res.status(404).json({ message: 'Person not found' });
      }
      
      res.json(person);
    } catch (error) {
      logger.error({ error }, '[API] Error fetching person');
      res.status(500).json({ message: 'Failed to fetch person' });
    }
  });

  // Create a new person
  app.post('/api/people', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const userId = req.user!.id;
      
      // Validate input
      const personData = insertPersonSchema.parse(req.body);
      
      // Insert person with pending verification status
      // Create proper object for drizzle insert, converting Date to expected format
      const insertData = {
        ...personData,
        userId,
        // Convert Date objects to proper string format if needed
        birthday: personData.birthday instanceof Date 
          ? personData.birthday.toISOString().split('T')[0] 
          : personData.birthday,
        // isEmailVerified and isPhoneVerified have default values in the schema
        // createdAt and updatedAt have defaultNow() in the schema
      };
      
      const [newPerson] = await db.insert(people).values(insertData).returning();
      
      res.status(201).json(newPerson);
      
      // Initiate verification processes if contact details provided
      if (newPerson.email) {
        await initiateEmailVerification(newPerson.id, newPerson.email);
      }
      
      if (newPerson.phoneNumber) {
        await initiatePhoneVerification(newPerson.id, newPerson.phoneNumber, newPerson.contactPreference || 'sms');
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input', errors: error.errors });
      }
      
      logger.error({ error }, '[API] Error creating person');
      res.status(500).json({ message: 'Failed to create person' });
    }
  });

  // Update an existing person
  app.put('/api/people/:id', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const userId = req.user!.id;
      const personId = parseInt(req.params.id);
      
      if (isNaN(personId)) {
        return res.status(400).json({ message: 'Invalid person ID' });
      }
      
      // Check if person exists and belongs to user
      if (!await validatePersonAccess(userId, personId)) {
        return res.status(404).json({ message: 'Person not found' });
      }
      
      // Validate input
      const personData = insertPersonSchema.parse(req.body);
      
      // Fetch existing person to check if email or phone changed
      const [existingPerson] = await db.select().from(people).where(eq(people.id, personId));
      
      // Create update object with properly formatted data
      let updateObj = {
        ...personData,
        // Convert Date objects to proper string format if needed
        birthday: personData.birthday instanceof Date 
          ? personData.birthday.toISOString().split('T')[0] 
          : personData.birthday,
      };
      
      let needsEmailVerification = false;
      let needsPhoneVerification = false;
      
      // If email changed, mark as unverified
      if (existingPerson.email !== personData.email) {
        needsEmailVerification = true;
      }
      
      // If phone changed, mark as unverified
      if (existingPerson.phoneNumber !== personData.phoneNumber) {
        needsPhoneVerification = true;
      }
      
      // Update the person
      let [updatedPerson] = await db.update(people)
        .set(updateObj)
        .where(eq(people.id, personId))
        .returning();
        
      // If needed, update verification status in a separate query
      if (needsEmailVerification) {
        await db.update(people)
          .set({ isEmailVerified: false })
          .where(eq(people.id, personId));
        updatedPerson.isEmailVerified = false;
      }
      
      if (needsPhoneVerification) {
        await db.update(people)
          .set({ isPhoneVerified: false })
          .where(eq(people.id, personId));
        updatedPerson.isPhoneVerified = false;
      }
      
      res.json(updatedPerson);
      
      // Initiate new verifications if needed
      if (personData.email && existingPerson.email !== personData.email) {
        await initiateEmailVerification(personId, personData.email);
      }
      
      if (personData.phoneNumber && existingPerson.phoneNumber !== personData.phoneNumber) {
        await initiatePhoneVerification(personId, personData.phoneNumber, personData.contactPreference || 'sms');
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input', errors: error.errors });
      }
      
      logger.error({ error }, '[API] Error updating person');
      res.status(500).json({ message: 'Failed to update person' });
    }
  });

  // Delete a person (soft delete)
  app.delete('/api/people/:id', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const userId = req.user!.id;
      const personId = parseInt(req.params.id);
      
      if (isNaN(personId)) {
        return res.status(400).json({ message: 'Invalid person ID' });
      }
      
      // Check if person exists and belongs to user
      if (!await validatePersonAccess(userId, personId)) {
        return res.status(404).json({ message: 'Person not found' });
      }
      
      // Soft delete the person
      await db.update(people)
        .set({ deletedAt: new Date() })
        .where(eq(people.id, personId));
      
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, '[API] Error deleting person');
      res.status(500).json({ message: 'Failed to delete person' });
    }
  });

  // Initiate email verification for a person
  app.post('/api/people/:id/verify-email', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const userId = req.user!.id;
      const personId = parseInt(req.params.id);
      
      if (isNaN(personId)) {
        return res.status(400).json({ message: 'Invalid person ID' });
      }
      
      // Check if person exists and belongs to user
      const [person] = await db.select().from(people).where(
        and(
          eq(people.id, personId),
          eq(people.userId, userId),
          isNull(people.deletedAt)
        )
      );
      
      if (!person) {
        return res.status(404).json({ message: 'Person not found' });
      }
      
      if (!person.email) {
        return res.status(400).json({ message: 'Person has no email address' });
      }
      
      // Initiate email verification
      await initiateEmailVerification(personId, person.email);
      
      res.json({ message: 'Verification email sent' });
    } catch (error) {
      logger.error({ error }, '[API] Error initiating email verification');
      res.status(500).json({ message: 'Failed to initiate email verification' });
    }
  });

  // Initiate phone verification for a person
  app.post('/api/people/:id/verify-phone', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const userId = req.user!.id;
      const personId = parseInt(req.params.id);
      
      if (isNaN(personId)) {
        return res.status(400).json({ message: 'Invalid person ID' });
      }
      
      // Check if person exists and belongs to user
      const [person] = await db.select().from(people).where(
        and(
          eq(people.id, personId),
          eq(people.userId, userId),
          isNull(people.deletedAt)
        )
      );
      
      if (!person) {
        return res.status(404).json({ message: 'Person not found' });
      }
      
      if (!person.phoneNumber) {
        return res.status(400).json({ message: 'Person has no phone number' });
      }
      
      // Initiate phone verification
      await initiatePhoneVerification(personId, person.phoneNumber, person.contactPreference || 'sms');
      
      res.json({ message: 'Verification message sent' });
    } catch (error) {
      logger.error({ error }, '[API] Error initiating phone verification');
      res.status(500).json({ message: 'Failed to initiate phone verification' });
    }
  });

  // Verify email with code
  app.post('/api/people/:id/confirm-email', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const userId = req.user!.id;
      const personId = parseInt(req.params.id);
      
      if (isNaN(personId)) {
        return res.status(400).json({ message: 'Invalid person ID' });
      }
      
      // Check if person exists and belongs to user
      if (!await validatePersonAccess(userId, personId)) {
        return res.status(404).json({ message: 'Person not found' });
      }
      
      // Validate input
      const { code } = personVerificationSchema.parse(req.body);
      
      // Check if verification code is valid
      const [verificationRecord] = await db.select().from(peopleVerifications).where(
        and(
          eq(peopleVerifications.personId, personId),
          eq(peopleVerifications.type, 'email'),
          eq(peopleVerifications.code, code),
          eq(peopleVerifications.verified, false)
        )
      );
      
      if (!verificationRecord) {
        return res.status(400).json({ message: 'Invalid verification code' });
      }
      
      // Check if code is expired
      if (new Date() > verificationRecord.expiresAt) {
        return res.status(400).json({ message: 'Verification code expired' });
      }
      
      // Mark verification as completed
      await db.update(peopleVerifications)
        .set({ verified: true })
        .where(eq(peopleVerifications.id, verificationRecord.id));
      
      // Update person's email verification status
      await db.update(people)
        .set({ isEmailVerified: true, updatedAt: new Date() })
        .where(eq(people.id, personId));
      
      res.json({ message: 'Email verification successful' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input', errors: error.errors });
      }
      
      logger.error({ error }, '[API] Error confirming email verification');
      res.status(500).json({ message: 'Failed to confirm email verification' });
    }
  });

  // Verify phone with code
  app.post('/api/people/:id/confirm-phone', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const userId = req.user!.id;
      const personId = parseInt(req.params.id);
      
      if (isNaN(personId)) {
        return res.status(400).json({ message: 'Invalid person ID' });
      }
      
      // Check if person exists and belongs to user
      if (!await validatePersonAccess(userId, personId)) {
        return res.status(404).json({ message: 'Person not found' });
      }
      
      // Validate input
      const { code } = personVerificationSchema.parse(req.body);
      
      // Check if verification code is valid
      const [verificationRecord] = await db.select().from(peopleVerifications).where(
        and(
          eq(peopleVerifications.personId, personId),
          eq(peopleVerifications.type, 'phone'),
          eq(peopleVerifications.code, code),
          eq(peopleVerifications.verified, false)
        )
      );
      
      if (!verificationRecord) {
        return res.status(400).json({ message: 'Invalid verification code' });
      }
      
      // Check if code is expired
      if (new Date() > verificationRecord.expiresAt) {
        return res.status(400).json({ message: 'Verification code expired' });
      }
      
      // Mark verification as completed
      await db.update(peopleVerifications)
        .set({ verified: true })
        .where(eq(peopleVerifications.id, verificationRecord.id));
      
      // Update person's phone verification status
      await db.update(people)
        .set({ isPhoneVerified: true, updatedAt: new Date() })
        .where(eq(people.id, personId));
      
      res.json({ message: 'Phone verification successful' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid input', errors: error.errors });
      }
      
      logger.error({ error }, '[API] Error confirming phone verification');
      res.status(500).json({ message: 'Failed to confirm phone verification' });
    }
  });
}

// Helper function to initiate email verification
async function initiateEmailVerification(personId: number, email: string) {
  try {
    // Generate 6-digit code
    const code = generateVerificationCode();
    
    // Store verification code
    await db.insert(peopleVerifications).values({
      personId,
      type: 'email',
      code,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      createdAt: new Date(),
      verified: false
    });
    
    // Send verification email
    await sendVerificationMessage(
      'email',
      email,
      code
    );
    
    return { success: true };
  } catch (error) {
    logger.error({ error, personId }, 'Failed to initiate email verification');
    throw error;
  }
}

// Helper function to initiate phone verification
async function initiatePhoneVerification(personId: number, phoneNumber: string, method: string = 'sms') {
  try {
    // Generate 6-digit code
    const code = generateVerificationCode();
    
    // Store verification code
    await db.insert(peopleVerifications).values({
      personId,
      type: 'phone',
      code,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      createdAt: new Date(),
      verified: false
    });
    
    // Send verification message based on method
    if (method === 'whatsapp') {
      await sendVerificationMessage('whatsapp', phoneNumber, code);
    } else {
      await sendVerificationMessage('imessage', phoneNumber, code);
    }
    
    return { success: true };
  } catch (error) {
    logger.error({ error, personId }, 'Failed to initiate phone verification');
    throw error;
  }
}