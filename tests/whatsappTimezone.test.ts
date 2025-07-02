import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock environment variables
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');

// Mock all database dependencies
vi.mock('../server/db', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn()
      }
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn()
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn()
        }))
      }))
    }))
  }
}));

vi.mock('../server/messaging', () => ({
  sendVerificationMessage: vi.fn(),
  generateVerificationCode: () => '123456',
  processIncomingMessage: vi.fn()
}));

vi.mock('../server/storage', () => ({
  storage: {
    createContactVerification: vi.fn(),
    getLatestContactVerification: vi.fn(() => Promise.resolve({
      code: '123456',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    })),
    markContactVerified: vi.fn()
  }
}));

vi.mock('../server/auth', () => ({
  hashPassword: vi.fn((password) => Promise.resolve(`hashed_${password}`))
}));

vi.mock('../shared/schema', () => ({
  users: {
    wakeTime: { default: '08:00:00' },
    routineStartTime: { default: '09:30:00' },
    sleepTime: { default: '23:00:00' },
    preferredModel: { default: 'gpt-4o' },
    isActive: { default: true }
  }
}));

// Import after mocking
import { handleWhatsAppOnboarding } from '../server/services/whatsappOnboarding';
import { db } from '../server/db';

describe('WhatsApp Timezone Onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up fresh mock implementations
    (db.query.users.findFirst as any).mockResolvedValue(null);
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1, email: 'test@example.com' }])
      })
    });
    (db.update as any).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }])
        })
      })
    });
  });

  describe('Single Timezone Countries', () => {
    it('should ask for timezone confirmation for UK numbers', async () => {
      const ukNumber = 'whatsapp:+447123456789';
      
      // Start onboarding
      let response = await handleWhatsAppOnboarding(ukNumber, 'Hi');
      expect(response).toContain("Would you like to sign up?");
      
      // Confirm signup
      response = await handleWhatsAppOnboarding(ukNumber, 'yes');
      expect(response).toContain("What's your first name?");
      
      // Provide name
      response = await handleWhatsAppOnboarding(ukNumber, 'John');
      expect(response).toContain("What's your email address?");
      
      // Provide email
      response = await handleWhatsAppOnboarding(ukNumber, 'john@example.com');
      expect(response).toContain("verification code");
      
      // Enter verification code
      response = await handleWhatsAppOnboarding(ukNumber, '123456');
      expect(response).toContain("United Kingdom");
      expect(response).toContain("British Time (London)");
      expect(response).toContain("(Yes/No)");
    });

    it('should create user with confirmed timezone', async () => {
      const ukNumber = 'whatsapp:+447123456789';
      
      // Go through onboarding until timezone confirmation
      await handleWhatsAppOnboarding(ukNumber, 'Hi');
      await handleWhatsAppOnboarding(ukNumber, 'yes');
      await handleWhatsAppOnboarding(ukNumber, 'John');
      await handleWhatsAppOnboarding(ukNumber, 'john@example.com');
      await handleWhatsAppOnboarding(ukNumber, '123456');
      
      // Confirm timezone
      const response = await handleWhatsAppOnboarding(ukNumber, 'yes');
      expect(response).toContain("Welcome John!");
      expect(response).toContain("British Time (London)");
      
      // Verify user was created with correct timezone
      expect(db.insert).toHaveBeenCalledWith(users);
      const insertCall = db.insert.mock.calls[0];
      const valuesCall = db.insert().values.mock.calls[0][0];
      expect(valuesCall.timeZone).toBe('Europe/London');
    });

    it('should ask for manual timezone input when user rejects suggestion', async () => {
      const ukNumber = 'whatsapp:+447123456789';
      
      // Go through onboarding until timezone confirmation
      await handleWhatsAppOnboarding(ukNumber, 'Hi');
      await handleWhatsAppOnboarding(ukNumber, 'yes');
      await handleWhatsAppOnboarding(ukNumber, 'John');
      await handleWhatsAppOnboarding(ukNumber, 'john@example.com');
      await handleWhatsAppOnboarding(ukNumber, '123456');
      
      // Reject timezone
      const response = await handleWhatsAppOnboarding(ukNumber, 'no');
      expect(response).toContain("What timezone are you in?");
      expect(response).toContain("New York");
      expect(response).toContain("Pacific Time");
    });
  });

  describe('Multi-Timezone Countries', () => {
    it('should show timezone selection for US numbers', async () => {
      const usNumber = 'whatsapp:+12125551234';
      
      // Go through onboarding until timezone selection
      await handleWhatsAppOnboarding(usNumber, 'Hi');
      await handleWhatsAppOnboarding(usNumber, 'yes');
      await handleWhatsAppOnboarding(usNumber, 'Jane');
      await handleWhatsAppOnboarding(usNumber, 'jane@example.com');
      
      const response = await handleWhatsAppOnboarding(usNumber, '123456');
      expect(response).toContain("United States/Canada");
      expect(response).toContain("multiple timezones");
      expect(response).toContain("1. Eastern Time (New York)");
      expect(response).toContain("2. Central Time (Chicago)");
      expect(response).toContain("3. Mountain Time (Denver)");
      expect(response).toContain("4. Pacific Time (Los Angeles)");
    });

    it('should accept numbered timezone selection', async () => {
      const usNumber = 'whatsapp:+12125551234';
      
      // Go through onboarding until timezone selection
      await handleWhatsAppOnboarding(usNumber, 'Hi');
      await handleWhatsAppOnboarding(usNumber, 'yes');
      await handleWhatsAppOnboarding(usNumber, 'Jane');
      await handleWhatsAppOnboarding(usNumber, 'jane@example.com');
      await handleWhatsAppOnboarding(usNumber, '123456');
      
      // Select Pacific Time (option 4)
      const response = await handleWhatsAppOnboarding(usNumber, '4');
      expect(response).toContain("Welcome Jane!");
      expect(response).toContain("Pacific Time (Los Angeles)");
      
      // Verify user was created with correct timezone
      const valuesCall = db.insert().values.mock.calls[0][0];
      expect(valuesCall.timeZone).toBe('America/Los_Angeles');
    });

    it('should validate timezone selection range', async () => {
      const usNumber = 'whatsapp:+12125551234';
      
      // Go through onboarding until timezone selection
      await handleWhatsAppOnboarding(usNumber, 'Hi');
      await handleWhatsAppOnboarding(usNumber, 'yes');
      await handleWhatsAppOnboarding(usNumber, 'Jane');
      await handleWhatsAppOnboarding(usNumber, 'jane@example.com');
      await handleWhatsAppOnboarding(usNumber, '123456');
      
      // Try invalid selection
      const response = await handleWhatsAppOnboarding(usNumber, '99');
      expect(response).toContain("Please select a number between 1 and");
    });
  });

  describe('Unknown Country Codes', () => {
    it('should ask for timezone directly for unknown country codes', async () => {
      const unknownNumber = 'whatsapp:+9999999999';
      
      // Go through onboarding
      await handleWhatsAppOnboarding(unknownNumber, 'Hi');
      await handleWhatsAppOnboarding(unknownNumber, 'yes');
      await handleWhatsAppOnboarding(unknownNumber, 'Test');
      await handleWhatsAppOnboarding(unknownNumber, 'test@example.com');
      
      const response = await handleWhatsAppOnboarding(unknownNumber, '123456');
      expect(response).toContain("couldn't detect your timezone");
      expect(response).toContain("What timezone are you in?");
    });
  });

  describe('Custom Timezone Input', () => {
    it('should handle custom timezone text input', async () => {
      const ukNumber = 'whatsapp:+447123456789';
      
      // Go through onboarding and reject suggested timezone
      await handleWhatsAppOnboarding(ukNumber, 'Hi');
      await handleWhatsAppOnboarding(ukNumber, 'yes');
      await handleWhatsAppOnboarding(ukNumber, 'John');
      await handleWhatsAppOnboarding(ukNumber, 'john@example.com');
      await handleWhatsAppOnboarding(ukNumber, '123456');
      await handleWhatsAppOnboarding(ukNumber, 'no');
      
      // Provide custom timezone
      const response = await handleWhatsAppOnboarding(ukNumber, 'Eastern Time');
      expect(response).toContain("Welcome John!");
      expect(response).toContain("I'll update your timezone to Eastern Time");
      
      // Verify user was created with UTC (default) and system message will be sent
      const valuesCall = db.insert().values.mock.calls[0][0];
      expect(valuesCall.timeZone).toBe('UTC');
      
      // Wait for async system message
      await new Promise(resolve => setTimeout(resolve, 1100));
      const { processIncomingMessage } = require('../server/messaging');
      expect(processIncomingMessage).toHaveBeenCalledWith(
        'whatsapp',
        ukNumber,
        expect.stringContaining('System: The user just told me their timezone is "Eastern Time"')
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle timezone confirmation with various yes/no formats', async () => {
      const ukNumber = 'whatsapp:+447123456789';
      
      // Test 'y' response
      await handleWhatsAppOnboarding(ukNumber, 'Hi');
      await handleWhatsAppOnboarding(ukNumber, 'yes');
      await handleWhatsAppOnboarding(ukNumber, 'John');
      await handleWhatsAppOnboarding(ukNumber, 'john@example.com');
      await handleWhatsAppOnboarding(ukNumber, '123456');
      
      const response = await handleWhatsAppOnboarding(ukNumber, 'Y');
      expect(response).toContain("Welcome John!");
    });

    it('should handle special 4-digit country codes', async () => {
      const jamaicaNumber = 'whatsapp:+18765551234';
      
      // Go through onboarding
      await handleWhatsAppOnboarding(jamaicaNumber, 'Hi');
      await handleWhatsAppOnboarding(jamaicaNumber, 'yes');
      await handleWhatsAppOnboarding(jamaicaNumber, 'Bob');
      await handleWhatsAppOnboarding(jamaicaNumber, 'bob@example.com');
      
      const response = await handleWhatsAppOnboarding(jamaicaNumber, '123456');
      expect(response).toContain("Jamaica");
      expect(response).toContain("Jamaica Time");
    });
  });
});