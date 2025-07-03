import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleWhatsAppWebhook } from '../server/webhook';
import { Request, Response } from 'express';
import { db } from '../server/db';
import { users, messageSchedules } from '../shared/schema';
import { eq } from 'drizzle-orm';
import twilio from 'twilio';

// Mock dependencies
vi.mock('../server/messaging', () => ({
  sendVerificationMessage: vi.fn().mockResolvedValue(true),
  generateVerificationCode: vi.fn().mockReturnValue('123456'),
  sendWhatsAppMessage: vi.fn().mockResolvedValue(true),
  sendSMS: vi.fn().mockResolvedValue(true)
}));

vi.mock('../server/services/messaging', () => ({
  messagingService: {
    handleUserResponse: vi.fn().mockResolvedValue(true)
  },
  MessagingService: vi.fn()
}));

// Mock twilio with proper structure
vi.mock('twilio', () => {
  const MessagingResponse = vi.fn().mockImplementation(() => ({
    message: vi.fn().mockReturnThis(),
    toString: vi.fn().mockReturnValue('<Response><Message>Test response</Message></Response>')
  }));
  
  const twilioMock = vi.fn(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({ sid: 'SM123' })
    }
  }));
  
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

describe('WhatsApp Twilio Integration Tests', () => {
  const testPhoneNumber = 'whatsapp:+15559876543';
  const testEmail = `twiliotest_${Date.now()}@example.com`;
  
  // Helper to create mock request
  function createMockRequest(body: any, headers: any = {}): Partial<Request> {
    return {
      body,
      headers,
      session: {},
      query: {},
      params: {}
    };
  }
  
  // Helper to create mock response
  function createMockResponse(): Partial<Response> {
    const res: any = {
      type: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn()
    };
    return res;
  }
  
  beforeEach(async () => {
    // Clean up test data
    await db.delete(users).where(eq(users.phoneNumber, testPhoneNumber));
    await db.delete(users).where(eq(users.email, testEmail));
    vi.clearAllMocks();
  });
  
  afterEach(async () => {
    // Clean up test data
    await db.delete(users).where(eq(users.phoneNumber, testPhoneNumber));
    await db.delete(users).where(eq(users.email, testEmail));
  });
  
  describe('Webhook Request Validation', () => {
    it('should handle valid Twilio webhook signature', async () => {
      const req = createMockRequest({
        From: testPhoneNumber,
        Body: 'Hello',
        MessageSid: 'SM123',
        AccountSid: 'AC123',
        To: 'whatsapp:+14155238886'
      }, {
        'x-twilio-signature': 'valid-signature'
      });
      
      const res = createMockResponse();
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      expect(res.type).toHaveBeenCalledWith('text/xml');
      expect(res.send).toHaveBeenCalled();
    });
    
    it('should handle missing required fields', async () => {
      const req = createMockRequest({
        MessageSid: 'SM123'
        // Missing From and Body
      });
      
      const res = createMockResponse();
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Invalid request: Missing required fields or not a status update.');
    });
    
    it('should handle status updates correctly', async () => {
      const statusUpdates = ['queued', 'sent', 'delivered', 'failed', 'undelivered'];
      
      for (const status of statusUpdates) {
        const req = createMockRequest({
          MessageSid: 'SM123',
          SmsStatus: status,
          From: 'whatsapp:+14155238886',
          To: testPhoneNumber
        });
        
        const res = createMockResponse();
        
        await handleWhatsAppWebhook(req as Request, res as Response);
        
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('Status update received');
      }
    });
  });
  
  describe('Message Processing', () => {
    it('should process messages asynchronously for existing users', async () => {
      // Create an existing user
      await db.insert(users).values({
        username: testEmail,
        password: 'hashedpassword',
        email: testEmail,
        phoneNumber: testPhoneNumber,
        firstName: 'TestUser',
        isPhoneVerified: true,
        isEmailVerified: true,
        contactPreference: 'whatsapp',
        timeZone: 'UTC',
        allowEmailNotifications: true,
        allowPhoneNotifications: true,
        isActive: true
      });
      
      const req = createMockRequest({
        From: testPhoneNumber,
        Body: 'Test message',
        MessageSid: 'SM123',
        AccountSid: 'AC123',
        To: 'whatsapp:+14155238886'
      });
      
      const res = createMockResponse();
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      // Should acknowledge immediately
      expect(res.type).toHaveBeenCalledWith('text/xml');
      expect(res.send).toHaveBeenCalled();
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that message service was called
      const { messagingService } = await import('../server/services/messaging');
      expect(messagingService.handleUserResponse).toHaveBeenCalled();
    });
    
    it('should handle errors during message processing gracefully', async () => {
      const req = createMockRequest({
        From: testPhoneNumber,
        Body: 'Test message',
        MessageSid: 'SM123',
        AccountSid: 'AC123',
        To: 'whatsapp:+14155238886'
      });
      
      const res = createMockResponse();
      
      // Mock an error
      const originalHandleWhatsAppOnboarding = vi.fn().mockRejectedValue(new Error('Processing error'));
      vi.doMock('../server/services/whatsappOnboarding', () => ({
        handleWhatsAppOnboarding: originalHandleWhatsAppOnboarding
      }));
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      // Should still send a response
      expect(res.type).toHaveBeenCalledWith('text/xml');
    });
  });
  
  describe('Phone Number Handling', () => {
    it('should handle various WhatsApp phone number formats', async () => {
      const phoneVariants = [
        { stored: 'whatsapp:+15551234567', incoming: 'whatsapp:+15551234567' },
        { stored: '+15551234567', incoming: 'whatsapp:+15551234567' },
        { stored: '15551234567', incoming: 'whatsapp:+15551234567' },
        { stored: '5551234567', incoming: 'whatsapp:+15551234567' }
      ];
      
      for (const variant of phoneVariants) {
        // Create user with stored format
        const testUser = await db.insert(users).values({
          username: `user_${variant.stored}`,
          password: 'hashedpassword',
          email: `${variant.stored.replace(/\D/g, '')}@example.com`,
          phoneNumber: variant.stored,
          firstName: 'TestUser',
          isPhoneVerified: true,
          isEmailVerified: true,
          contactPreference: 'whatsapp',
          timeZone: 'UTC',
          allowEmailNotifications: true,
          allowPhoneNotifications: true,
          isActive: true
        }).returning();
        
        const req = createMockRequest({
          From: variant.incoming,
          Body: 'Test message',
          MessageSid: 'SM123',
          AccountSid: 'AC123',
          To: 'whatsapp:+14155238886'
        });
        
        const res = createMockResponse();
        
        await handleWhatsAppWebhook(req as Request, res as Response);
        
        // Should recognize the user and not trigger onboarding
        expect(res.type).toHaveBeenCalledWith('text/xml');
        
        // Clean up
        await db.delete(users).where(eq(users.id, testUser[0].id));
      }
    });
  });
  
  describe('Response Formatting', () => {
    it('should format TwiML responses correctly', async () => {
      const req = createMockRequest({
        From: testPhoneNumber,
        Body: 'Hello',
        MessageSid: 'SM123',
        AccountSid: 'AC123',
        To: 'whatsapp:+14155238886'
      });
      
      const res = createMockResponse();
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      expect(res.type).toHaveBeenCalledWith('text/xml');
      const sendCall = (res.send as any).mock.calls[0][0];
      expect(sendCall).toContain('<Response>');
      expect(sendCall).toContain('</Response>');
    });
    
    it('should handle empty responses correctly', async () => {
      // Create existing user to avoid onboarding
      await db.insert(users).values({
        username: testEmail,
        password: 'hashedpassword',
        email: testEmail,
        phoneNumber: testPhoneNumber,
        firstName: 'TestUser',
        isPhoneVerified: true,
        isEmailVerified: true,
        contactPreference: 'whatsapp',
        timeZone: 'UTC',
        allowEmailNotifications: true,
        allowPhoneNotifications: true,
        isActive: true
      });
      
      const req = createMockRequest({
        From: testPhoneNumber,
        Body: 'Regular message',
        MessageSid: 'SM123',
        AccountSid: 'AC123',
        To: 'whatsapp:+14155238886'
      });
      
      const res = createMockResponse();
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      // Should send empty TwiML acknowledgment
      expect(res.type).toHaveBeenCalledWith('text/xml');
      const sendCall = (res.send as any).mock.calls[0][0];
      expect(sendCall).toMatch(/<Response[^>]*\/?>(<\/Response>)?/);
    });
  });
  
  describe('Error Recovery', () => {
    it('should handle webhook processing errors without crashing', async () => {
      const req = createMockRequest({
        From: testPhoneNumber,
        Body: null, // This might cause issues
        MessageSid: 'SM123',
        AccountSid: 'AC123',
        To: 'whatsapp:+14155238886'
      });
      
      const res = createMockResponse();
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      // Should handle gracefully
      expect(res.status).toHaveBeenCalled();
    });
    
    it('should not send duplicate responses', async () => {
      const req = createMockRequest({
        From: testPhoneNumber,
        Body: 'Test',
        MessageSid: 'SM123',
        AccountSid: 'AC123',
        To: 'whatsapp:+14155238886'
      });
      
      const res = createMockResponse();
      
      // Mock the onboarding handler to throw an error after headers are sent
      const originalHandleWhatsAppOnboarding = vi.fn().mockImplementation(() => {
        // Simulate headers being sent during processing
        (res as any).headersSent = true;
        throw new Error('Error after headers sent');
      });
      
      vi.doMock('../server/services/whatsappOnboarding', () => ({
        handleWhatsAppOnboarding: originalHandleWhatsAppOnboarding
      }));
      
      await handleWhatsAppWebhook(req as Request, res as Response);
      
      // Should not try to send again after error since headers were already sent
      expect(res.status).not.toHaveBeenCalled();
    });
  });
  
  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent webhook requests', async () => {
      const phones = [
        'whatsapp:+15551111111',
        'whatsapp:+15552222222',
        'whatsapp:+15553333333'
      ];
      
      const requests = phones.map(phone => 
        createMockRequest({
          From: phone,
          Body: 'Concurrent test',
          MessageSid: `SM${Math.random()}`,
          AccountSid: 'AC123',
          To: 'whatsapp:+14155238886'
        })
      );
      
      const responses = requests.map(() => createMockResponse());
      
      // Process all requests concurrently
      await Promise.all(
        requests.map((req, idx) => 
          handleWhatsAppWebhook(req as Request, responses[idx] as Response)
        )
      );
      
      // All should have been processed
      responses.forEach(res => {
        expect(res.type).toHaveBeenCalledWith('text/xml');
        expect(res.send).toHaveBeenCalled();
      });
    });
  });
});