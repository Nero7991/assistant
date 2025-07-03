import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleWhatsAppOnboarding } from '../server/services/whatsappOnboarding';
import { handleWhatsAppWebhook } from '../server/webhook';
import { db } from '../server/db';
import { users, contactVerifications } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { storage } from '../server/storage';
import { Request, Response } from 'express';
import { vi } from 'vitest';

// Mock the messaging service
vi.mock('../server/messaging', () => ({
  sendVerificationMessage: vi.fn().mockResolvedValue(true),
  generateVerificationCode: vi.fn().mockReturnValue('123456'),
  sendWhatsAppMessage: vi.fn().mockResolvedValue(true),
  sendSMS: vi.fn().mockResolvedValue(true)
}));

// Mock twilio
vi.mock('twilio', () => {
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

describe('WhatsApp Integration Tests', () => {
  const testPhoneNumber = 'whatsapp:+15551234';
  const testEmail = `test_${Date.now()}@example.com`;
  const testFirstName = 'TestUser';
  
  // Helper to create mock webhook request
  function createMockWebhookRequest(phoneNumber: string, message: string): Partial<Request> {
    return {
      body: {
        From: phoneNumber,
        Body: message,
        MessageSid: 'SM' + Math.random().toString(36).substr(2, 32),
        AccountSid: 'ACtest',
        To: 'whatsapp:+14155238886'
      },
      session: {}
    };
  }
  
  // Helper to create mock response
  function createMockResponse(): Partial<Response> {
    const res: any = {
      type: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      headersSent: false
    };
    return res;
  }
  
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
  
  describe('Direct Onboarding Service Tests', () => {
    it('should handle complete onboarding flow', async () => {
      // Step 1: Initial contact
      const response1 = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello');
      expect(response1).toContain("Hello! I'm Kona, your kind and encouraging AI personal assistant");
      
      // Step 2: Confirm signup
      const response2 = await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      expect(response2).toBe("Great! What's your first name?");
      
      // Step 3: Provide name
      const response3 = await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      expect(response3).toContain(`Thanks ${testFirstName}!`);
      
      // Step 4: Provide email
      const response4 = await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      expect(response4).toContain("I've sent a 6-digit verification code");
      
      // Step 5: Verify code
      const response5 = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      expect(response5).toContain("Your email is verified");
      
      // Verify user was created
      const newUser = await db.query.users.findFirst({
        where: eq(users.phoneNumber, testPhoneNumber)
      });
      
      expect(newUser).toBeDefined();
      expect(newUser?.email).toBe(testEmail);
      expect(newUser?.firstName).toBe(testFirstName);
      expect(newUser?.isPhoneVerified).toBe(true);
      expect(newUser?.isEmailVerified).toBe(true);
    });
    
    it('should handle invalid email format', async () => {
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      
      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'not-an-email');
      expect(response).toContain("doesn't look like a valid email address");
    });
    
    it('should handle existing email', async () => {
      // Create a user with the test email
      await db.insert(users).values({
        username: 'existinguser',
        password: 'hashedpassword',
        email: testEmail,
        phoneNumber: 'whatsapp:+19876543210',
        firstName: 'Existing',
        isPhoneVerified: true,
        isEmailVerified: true,
        contactPreference: 'whatsapp',
        timeZone: 'UTC',
        allowEmailNotifications: true,
        allowPhoneNotifications: true,
        isActive: true
      });
      
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      
      const response = await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      expect(response).toContain("already associated with an account");
    });
  });
  
  describe('Webhook Integration Tests', () => {
    it('should trigger onboarding for unknown phone number', async () => {
      const req = createMockWebhookRequest(testPhoneNumber, 'Hello');
      const res = createMockResponse();
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      expect(res.type).toHaveBeenCalledWith('text/xml');
      expect(res.send).toHaveBeenCalled();
      
      // Check that response contains onboarding message
      const sendCall = (res.send as any).mock.calls[0][0];
      expect(sendCall).toContain('Response');
    });
    
    it('should process messages from existing users', async () => {
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
      
      const req = createMockWebhookRequest(testPhoneNumber, 'Hello from existing user');
      const res = createMockResponse();
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      // Should acknowledge without sending onboarding message
      expect(res.type).toHaveBeenCalledWith('text/xml');
      expect(res.send).toHaveBeenCalled();
    });
    
    it('should handle status updates', async () => {
      const req = {
        body: {
          MessageSid: 'SMtest123',
          SmsStatus: 'delivered',
          From: 'whatsapp:+14155238886',
          To: testPhoneNumber
        }
      } as Partial<Request>;
      
      const res = createMockResponse();
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('Status update received');
    });
  });
  
  describe('Verification Flow Tests', () => {
    it('should create and verify contact verification', async () => {
      // Go through flow until email verification
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      
      // Check verification record
      const tempId = testPhoneNumber.replace(/\D/g, '');
      const verification = await storage.getLatestContactVerification(parseInt(tempId));
      
      expect(verification).toBeDefined();
      expect(verification?.type).toBe('email');
      expect(verification?.code).toBe('123456');
      expect(verification?.verified).toBe(false);
      
      // Complete verification
      await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      
      // Check verification is marked complete
      const verifications = await storage.getVerifications(parseInt(tempId));
      const emailVerification = verifications.find(v => v.type === 'email');
      
      expect(emailVerification?.verified).toBe(true);
    });
    
    it('should handle expired verification code', async () => {
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      
      // Manually expire the verification
      const tempId = testPhoneNumber.replace(/\D/g, '');
      await db.update(contactVerifications)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(contactVerifications.userId, parseInt(tempId)));
      
      const response = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      expect(response).toContain('verification code has expired');
    });
  });
  
  describe('State Management Tests', () => {
    it('should handle session state correctly', async () => {
      // Start onboarding
      const response1 = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello');
      expect(response1).toBeDefined();
      
      // Decline signup
      const response2 = await handleWhatsAppOnboarding(testPhoneNumber, 'no');
      expect(response2).toContain('Okay, no problem');
      
      // Try to continue - should restart
      const response3 = await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      expect(response3).toContain("Hello! I'm Kona, your kind and encouraging AI personal assistant");
    });
    
    it('should handle completed state', async () => {
      // Complete full onboarding
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      
      // Try to interact after completion
      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'Hello again');
      expect(response).toContain("You're already set up!");
    });
    
    it('should restart from appropriate step on unexpected state', async () => {
      // Start onboarding and provide name
      await handleWhatsAppOnboarding(testPhoneNumber, 'Hello');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      
      // Send unexpected input when email is expected
      const response1 = await handleWhatsAppOnboarding(testPhoneNumber, '');
      expect(response1).toContain("doesn't look like a valid email address");
      
      // Should still be expecting email
      const response2 = await handleWhatsAppOnboarding(testPhoneNumber, 'still not an email');
      expect(response2).toContain("doesn't look like a valid email address");
    });
  });
  
  describe('Edge Cases and Error Handling', () => {
    it('should handle empty name input', async () => {
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      
      const response = await handleWhatsAppOnboarding(testPhoneNumber, '   ');
      expect(response).toContain('Please enter a valid first name');
    });
    
    it('should handle various email formats', async () => {
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      
      // Test various invalid formats
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user@.com',
        'user..name@example.com',
        'user name@example.com'
      ];
      
      for (const invalidEmail of invalidEmails) {
        const response = await handleWhatsAppOnboarding(testPhoneNumber, invalidEmail);
        expect(response).toContain("doesn't look like a valid email address");
      }
      
      // Test valid format
      const response = await handleWhatsAppOnboarding(testPhoneNumber, 'valid.email+tag@example.com');
      expect(response).toContain("I've sent a 6-digit verification code");
    });
    
    it('should handle wrong verification code', async () => {
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      
      // Try wrong code
      const response1 = await handleWhatsAppOnboarding(testPhoneNumber, '999999');
      expect(response1).toContain("code doesn't seem right");
      
      // Try correct code after wrong attempt
      const response2 = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      expect(response2).toContain('Your email is verified');
    });
    
    it('should handle various phone number formats', async () => {
      const phoneFormats = [
        'whatsapp:+15551234567',
        'whatsapp:+1 555 123 4567',
        'whatsapp:+1-555-123-4567',
        'whatsapp:+1(555)123-4567'
      ];
      
      for (const phone of phoneFormats) {
        const response = await handleWhatsAppOnboarding(phone, 'Hello');
        expect(response).toContain("Hello! I'm Kona");
        
        // Clean up session for next iteration
        const cleanupResponse = await handleWhatsAppOnboarding(phone, 'no');
        expect(cleanupResponse).toContain('Okay, no problem');
      }
    });
    
    it('should handle case-insensitive responses', async () => {
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      
      // Test various cases for 'yes'
      const yesVariants = ['YES', 'Yes', 'YeS', ' yes ', '  YES  '];
      
      for (const variant of yesVariants) {
        const response = await handleWhatsAppOnboarding(testPhoneNumber, variant);
        expect(response).toBe("Great! What's your first name?");
        
        // Reset for next test
        await handleWhatsAppOnboarding(testPhoneNumber, 'Stop');
        await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      }
    });
  });
  
  describe('Concurrent Session Tests', () => {
    it('should handle multiple users onboarding simultaneously', async () => {
      const phone1 = 'whatsapp:+15551111';
      const phone2 = 'whatsapp:+15552222';
      const email1 = `user1_${Date.now()}@example.com`;
      const email2 = `user2_${Date.now()}@example.com`;
      
      // Start both onboardings
      const res1_1 = await handleWhatsAppOnboarding(phone1, 'Hello');
      const res2_1 = await handleWhatsAppOnboarding(phone2, 'Hi');
      
      expect(res1_1).toContain("Hello! I'm Kona");
      expect(res2_1).toContain("Hello! I'm Kona");
      
      // Continue both flows
      await handleWhatsAppOnboarding(phone1, 'yes');
      await handleWhatsAppOnboarding(phone2, 'yes');
      
      await handleWhatsAppOnboarding(phone1, 'User1');
      await handleWhatsAppOnboarding(phone2, 'User2');
      
      await handleWhatsAppOnboarding(phone1, email1);
      await handleWhatsAppOnboarding(phone2, email2);
      
      // Complete both
      const final1 = await handleWhatsAppOnboarding(phone1, '123456');
      const final2 = await handleWhatsAppOnboarding(phone2, '123456');
      
      expect(final1).toContain('User1');
      expect(final2).toContain('User2');
      
      // Clean up
      await db.delete(users).where(eq(users.phoneNumber, phone1));
      await db.delete(users).where(eq(users.phoneNumber, phone2));
    });
  });
  
  describe('Database Integration Tests', () => {
    it('should properly set all user fields on successful onboarding', async () => {
      // Complete onboarding
      await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
      await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
      await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
      await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
      await handleWhatsAppOnboarding(testPhoneNumber, '123456');
      
      // Check user record
      const user = await db.query.users.findFirst({
        where: eq(users.phoneNumber, testPhoneNumber)
      });
      
      expect(user).toBeDefined();
      expect(user?.username).toBe(testEmail);
      expect(user?.email).toBe(testEmail);
      expect(user?.firstName).toBe(testFirstName);
      expect(user?.phoneNumber).toBe(testPhoneNumber);
      expect(user?.contactPreference).toBe('whatsapp');
      expect(user?.isPhoneVerified).toBe(true);
      expect(user?.isEmailVerified).toBe(true);
      expect(user?.allowPhoneNotifications).toBe(true);
      expect(user?.allowEmailNotifications).toBe(true);
      expect(user?.isActive).toBe(true);
      expect(user?.timeZone).toBeDefined();
      expect(user?.password).toBeDefined();
      expect(user?.password).not.toBe(''); // Should be hashed
    });
    
    it('should handle database errors gracefully', async () => {
      // Mock a database error
      const originalInsert = db.insert;
      db.insert = vi.fn().mockImplementation(() => {
        throw new Error('Database connection error');
      });
      
      try {
        await handleWhatsAppOnboarding(testPhoneNumber, 'Start');
        await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
        await handleWhatsAppOnboarding(testPhoneNumber, testFirstName);
        await handleWhatsAppOnboarding(testPhoneNumber, testEmail);
        
        const response = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
        expect(response).toContain('error');
      } finally {
        // Restore original function
        db.insert = originalInsert;
      }
    });
  });
});