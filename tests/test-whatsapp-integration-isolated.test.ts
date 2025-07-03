import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { db } from '../server/db';
import { users, contactVerifications } from '../shared/schema';
import { eq } from 'drizzle-orm';

// Mock all external dependencies before imports
beforeAll(() => {
  // Mock OpenAI
  vi.doMock('openai', () => {
    const OpenAI = vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Test response',
                role: 'assistant'
              }
            }]
          })
        }
      }
    }));
    
    return { default: OpenAI, OpenAI };
  });
  
  // Mock messaging service
  vi.doMock('../server/messaging', () => ({
    sendVerificationMessage: vi.fn().mockResolvedValue(true),
    generateVerificationCode: vi.fn().mockReturnValue('123456'),
    sendWhatsAppMessage: vi.fn().mockResolvedValue(true),
    sendSMS: vi.fn().mockResolvedValue(true)
  }));
  
  // Mock twilio
  vi.doMock('twilio', () => {
    const MessagingResponse = vi.fn().mockImplementation(() => ({
      message: vi.fn().mockReturnThis(),
      toString: vi.fn().mockReturnValue('<Response></Response>')
    }));
    
    const twilioMock = vi.fn(() => ({}));
    twilioMock.twiml = {
      MessagingResponse
    };
    
    return {
      default: twilioMock,
      twiml: {
        MessagingResponse
      }
    };
  });
});

// Import after mocks are set up
import { handleWhatsAppOnboarding } from '../server/services/whatsappOnboarding';
import { storage } from '../server/storage';

describe('WhatsApp Onboarding Integration Tests (Isolated)', () => {
  const testPhoneNumber = 'whatsapp:+15557654321';
  const testEmail = `isolated_test_${Date.now()}@example.com`;
  const testFirstName = 'IsolatedTest';
  
  beforeEach(async () => {
    // Clean up any existing test data
    await db.delete(users).where(eq(users.phoneNumber, testPhoneNumber));
    await db.delete(users).where(eq(users.email, testEmail));
    
    const tempId = testPhoneNumber.replace(/\D/g, '');
    await db.delete(contactVerifications).where(
      eq(contactVerifications.userId, parseInt(tempId))
    );
  });
  
  afterEach(async () => {
    // Clean up test data
    await db.delete(users).where(eq(users.phoneNumber, testPhoneNumber));
    await db.delete(users).where(eq(users.email, testEmail));
  });
  
  describe('Complete Onboarding Flow', () => {
    it('should successfully complete the full onboarding process', async () => {
      // Step 1: Initial message
      const response1 = await handleWhatsAppOnboarding(testPhoneNumber, 'Hi there');
      expect(response1).toContain("Hello! I'm Kona");
      expect(response1).toContain("Would you like to sign up?");
      
      // Step 2: Confirm signup
      const response2 = await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      expect(response2).toBe("Great! What's your first name?");
      
      // Step 3: Provide name
      const response3 = await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      expect(response3).toContain(`Thanks ${testFirstName}!`);
      expect(response3).toContain("What's your email address?");
      
      // Step 4: Provide email
      const response4 = await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      expect(response4).toContain("I've sent a 6-digit verification code");
      expect(response4).toContain(testEmail);
      
      // Step 5: Verify code
      const response5 = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      expect(response5).toContain(`Thanks ${testFirstName}!`);
      expect(response5).toContain("Your email is verified");
      expect(response5).toContain("your account is set up");
      
      // Verify user was created correctly
      const newUser = await db.query.users.findFirst({
        where: eq(users.phoneNumber, testPhoneNumber)
      });
      
      expect(newUser).toBeDefined();
      expect(newUser?.email).toBe(testEmail);
      expect(newUser?.firstName).toBe(testFirstName);
      expect(newUser?.username).toBe(testEmail);
      expect(newUser?.phoneNumber).toBe(testPhoneNumber);
      expect(newUser?.contactPreference).toBe('whatsapp');
      expect(newUser?.isPhoneVerified).toBe(true);
      expect(newUser?.isEmailVerified).toBe(true);
      expect(newUser?.allowPhoneNotifications).toBe(true);
      expect(newUser?.allowEmailNotifications).toBe(true);
      expect(newUser?.isActive).toBe(true);
      expect(newUser?.timeZone).toBeDefined();
      expect(newUser?.password).toBeDefined();
      expect(newUser?.password).not.toBe('');
    });
    
    it('should handle rejecting signup', async () => {
      const response1 = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello');
      expect(response1).toContain("Would you like to sign up?");
      
      const response2 = await handleWhatsAppOnboarding(testPhoneNumber, 'no');
      expect(response2).toContain("Okay, no problem");
      expect(response2).toContain("Let me know if you change your mind");
      
      // Verify no user was created
      const user = await db.query.users.findFirst({
        where: eq(users.phoneNumber, testPhoneNumber)
      });
      expect(user).toBeUndefined();
    });
  });
  
  describe('Existing User Handling', () => {
    it('should not trigger onboarding for existing users', async () => {
      // Create an existing user
      await db.insert(users).values({
        username: testEmail,
        password: 'hashedpassword',
        email: testEmail,
        phoneNumber: testPhoneNumber,
        firstName: testFirstName,
        isPhoneVerified: true,
        isEmailVerified: true,
        contactPreference: 'whatsapp',
        timeZone: 'UTC',
        allowEmailNotifications: true,
        allowPhoneNotifications: true,
        isActive: true
      });
      
      // Try to trigger onboarding
      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello');
      expect(response).toBeNull();
    });
  });
  
  describe('Verification Code Handling', () => {
    it('should handle incorrect verification codes', async () => {
      // Go through flow until code verification
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      
      // Try wrong code multiple times
      const wrongResponse1 = await handleWhatsAppOnboarding(testPhoneNumber, '000000');
      expect(wrongResponse1).toContain("code doesn't seem right");
      expect(wrongResponse1).toContain("Please double-check");
      
      const wrongResponse2 = await handleWhatsAppOnboarding(testPhoneNumber, 'abc123');
      expect(wrongResponse2).toContain("code doesn't seem right");
      
      // Now try correct code
      const correctResponse = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      expect(correctResponse).toContain("Your email is verified");
    });
    
    it('should store verification in database', async () => {
      // Go through flow until email verification
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      
      // Check verification record exists
      const tempId = testPhoneNumber.replace(/\D/g, '');
      const verification = await storage.getLatestContactVerification(parseInt(tempId));
      
      expect(verification).toBeDefined();
      expect(verification?.type).toBe('email');
      expect(verification?.code).toBe('123456');
      expect(verification?.verified).toBe(false);
      
      // Complete verification
      await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      
      // Check verification is marked as verified
      const verifications = await storage.getVerifications(parseInt(tempId));
      const emailVerification = verifications.find(v => v.type === 'email');
      
      expect(emailVerification?.verified).toBe(true);
    });
  });
  
  describe('Error Scenarios', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error for user creation
      const originalInsert = db.insert;
      let callCount = 0;
      
      db.insert = vi.fn().mockImplementation((table) => {
        if (table === users && callCount++ === 0) {
          throw new Error('Database connection error');
        }
        return originalInsert.call(db, table);
      });
      
      try {
        // Go through full flow
        await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
        await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
        await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
        await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
        
        const response = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
        expect(response).toContain('error');
        expect(response).toContain('Please try signing up again later');
        
        // Verify no user was created
        const user = await db.query.users.findFirst({
          where: eq(users.phoneNumber, testPhoneNumber)
        });
        expect(user).toBeUndefined();
      } finally {
        // Restore original function
        db.insert = originalInsert;
      }
    });
    
    it('should handle verification email send failure', async () => {
      // Mock email send failure
      const { sendVerificationMessage } = await import('../server/messaging');
      (sendVerificationMessage as any).mockRejectedValueOnce(new Error('Email service error'));
      
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      
      const response = await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      expect(response).toContain("wasn't able to send the verification email");
      expect(response).toContain("Please try providing your email again");
    });
  });
  
  describe('State Persistence', () => {
    it('should maintain state across multiple messages', async () => {
      // Start onboarding
      const response1 = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello');
      expect(response1).toContain("Would you like to sign up?");
      
      // Simulate delay between messages
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Continue with signup
      const response2 = await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      expect(response2).toBe("Great! What's your first name?");
      
      // Another delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Provide name
      const response3 = await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      expect(response3).toContain(`Thanks ${testFirstName}!`);
    });
  });
});