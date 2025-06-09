import { handleWhatsAppOnboarding } from '../server/services/whatsappOnboarding.js';
import { db } from '../server/db.js';
import { users, contactVerifications } from '../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { storage } from '../server/storage.js';
import { sendVerificationMessage } from '../server/messaging.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Mock the messaging service to avoid sending actual emails/SMS
jest.mock('../server/messaging.js', () => ({
  sendVerificationMessage: jest.fn().mockResolvedValue(true),
  generateVerificationCode: jest.fn().mockReturnValue('123456')
}));

describe('WhatsApp Onboarding Flow', () => {
  const testPhoneNumber = 'whatsapp:+1234567890';
  const testEmail = 'testuser@example.com';
  const testFirstName = 'TestUser';
  
  // Clean up test data before each test
  beforeEach(async () => {
    // Delete any existing test users
    await db.delete(users).where(
      eq(users.phoneNumber, testPhoneNumber)
    );
    await db.delete(users).where(
      eq(users.email, testEmail)
    );
    
    // Clear any existing verifications for the test phone
    const tempId = testPhoneNumber.replace(/\D/g, '');
    await db.delete(contactVerifications).where(
      eq(contactVerifications.userId, parseInt(tempId))
    );
  });

  afterEach(async () => {
    // Clean up after tests
    await db.delete(users).where(
      eq(users.phoneNumber, testPhoneNumber)
    );
    await db.delete(users).where(
      eq(users.email, testEmail)
    );
  });

  describe('Initial Contact', () => {
    test('should initiate onboarding for new phone number', async () => {
      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello');
      
      expect(response).toContain("Hello! I'm your ADHD Assistant coach");
      expect(response).toContain("Would you like to sign up? (yes/no)");
    });

    test('should return null for existing user', async () => {
      // Create an existing user
      await db.insert(users).values({
        username: 'existinguser',
        password: 'hashedpassword',
        email: 'existing@example.com',
        phoneNumber: testPhoneNumber,
        firstName: 'Existing',
        isPhoneVerified: true,
        isEmailVerified: true,
        contactPreference: 'whatsapp',
        timeZone: 'UTC',
        allowEmailNotifications: true,
        allowPhoneNotifications: true,
        isActive: true
      });

      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello');
      expect(response).toBeNull();
    });
  });

  describe('Confirmation Step', () => {
    test('should proceed to name collection on "yes"', async () => {
      // Initiate onboarding
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      
      // Confirm signup
      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      
      expect(response).toBe("Great! What's your first name?");
    });

    test('should cancel onboarding on "no"', async () => {
      // Initiate onboarding
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      
      // Decline signup
      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'no');
      
      expect(response).toContain("Okay, no problem");
    });
  });

  describe('Name Collection', () => {
    test('should accept valid first name and ask for email', async () => {
      // Go through initial steps
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      
      // Provide name
      const response = await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      
      expect(response).toContain(`Thanks ${testFirstName}!`);
      expect(response).toContain("What's your email address?");
    });

    test('should reject empty name', async () => {
      // Go through initial steps
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      
      // Provide empty name
      const response = await handleWhatsAppOnboarding(testPhoneNumber, '   ');
      
      expect(response).toBe("Please enter a valid first name.");
    });
  });

  describe('Email Collection and Verification', () => {
    test('should accept valid email and send verification code', async () => {
      // Go through initial steps
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      
      // Provide email
      const response = await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      
      expect(response).toContain("I've sent a 6-digit verification code");
      expect(response).toContain(testEmail);
      expect(sendVerificationMessage).toHaveBeenCalledWith('email', testEmail, '123456');
    });

    test('should reject invalid email format', async () => {
      // Go through initial steps
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      
      // Provide invalid email
      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'not-an-email');
      
      expect(response).toContain("doesn't look like a valid email address");
    });

    test('should reject email already in use', async () => {
      // Create user with the test email
      await db.insert(users).values({
        username: 'existinguser',
        password: 'hashedpassword',
        email: testEmail,
        phoneNumber: 'whatsapp:+19876543210',
        firstName: 'Existing',
        isPhoneVerified: true,
        isEmailVerified: true,
        contactPreference: 'email',
        timeZone: 'UTC',
        allowEmailNotifications: true,
        allowPhoneNotifications: true,
        isActive: true
      });

      // Go through initial steps
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      
      // Provide existing email
      const response = await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      
      expect(response).toContain("already associated with an account");
    });
  });

  describe('Code Verification', () => {
    beforeEach(async () => {
      // Set up state through the flow
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
    });

    test('should create user account on correct code', async () => {
      const response = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      
      expect(response).toContain(`Thanks ${testFirstName}!`);
      expect(response).toContain("Your email is verified");
      expect(response).toContain("account is set up");
      
      // Verify user was created
      const newUser = await db.query.users.findFirst({
        where: eq(users.phoneNumber, testPhoneNumber)
      });
      
      expect(newUser).toBeDefined();
      expect(newUser.email).toBe(testEmail);
      expect(newUser.firstName).toBe(testFirstName);
      expect(newUser.isPhoneVerified).toBe(true);
      expect(newUser.isEmailVerified).toBe(true);
      expect(newUser.contactPreference).toBe('whatsapp');
    });

    test('should reject incorrect code', async () => {
      const response = await handleWhatsAppOnboarding(testPhoneNumber, '999999');
      
      expect(response).toContain("doesn't seem right");
      
      // Verify user was NOT created
      const newUser = await db.query.users.findFirst({
        where: eq(users.phoneNumber, testPhoneNumber)
      });
      
      expect(newUser).toBeUndefined();
    });

    test('should handle expired code', async () => {
      // Get the verification and manually expire it
      const tempId = testPhoneNumber.replace(/\D/g, '');
      await db.update(contactVerifications)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(contactVerifications.userId, parseInt(tempId)));
      
      const response = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      
      expect(response).toContain("verification code has expired");
    });
  });

  describe('Edge Cases', () => {
    test('should handle completed onboarding state', async () => {
      // Complete the full flow
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      
      // Try to interact after completion
      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello again');
      
      expect(response).toContain("You're already set up!");
    });

    test('should reset state on unexpected error', async () => {
      // Start onboarding
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      
      // Simulate getting into a bad state by manually clearing session
      // (This tests the default case in the switch statement)
      const response = await handleWhatsAppOnboarding(testPhoneNumber, '');
      
      // Should offer to start over
      expect(response).toContain("something went wrong");
      expect(response).toContain("Would you like to sign up?");
    });
  });

  describe('Database Integration', () => {
    test('should properly store verification records', async () => {
      // Go through flow until email verification
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      
      // Check verification record was created
      const tempId = testPhoneNumber.replace(/\D/g, '');
      const verification = await storage.getLatestContactVerification(parseInt(tempId));
      
      expect(verification).toBeDefined();
      expect(verification.type).toBe('email');
      expect(verification.code).toBe('123456');
      expect(verification.verified).toBe(false);
    });

    test('should mark verification as complete', async () => {
      // Complete full flow
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      
      // Check verification was marked complete
      const tempId = testPhoneNumber.replace(/\D/g, '');
      const verifications = await storage.getVerifications(parseInt(tempId));
      const emailVerification = verifications.find(v => v.type === 'email');
      
      expect(emailVerification).toBeDefined();
      expect(emailVerification.verified).toBe(true);
    });
  });
});

// Run the tests
if (process.argv[1] === new URL(import.meta.url).pathname) {
  console.log('Running WhatsApp onboarding tests...');
  // The tests will be run by the test runner
}