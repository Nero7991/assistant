import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleWhatsAppOnboarding } from '../server/services/whatsappOnboarding';
import { storage } from '../server/storage';
import * as messaging from '../server/messaging';
import { db } from '../server/db';

// Mock dependencies
vi.mock('../server/db');
vi.mock('../server/storage');
vi.mock('../server/messaging');
vi.mock('../server/auth', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password')
}));

describe('WhatsApp Onboarding TempId Fix', () => {
  const testPhoneNumber = 'whatsapp:+12025551234';
  const cleanedPhoneNumber = '12025551234';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock database queries
    (db.query as any) = {
      users: {
        findFirst: vi.fn().mockResolvedValue(null) // No existing user
      }
    };
    
    (db.insert as any) = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }])
      })
    });
  });

  it('should use tempId as string for verification creation', async () => {
    const mockCreateVerification = vi.fn().mockResolvedValue(undefined);
    (storage.createContactVerification as any) = mockCreateVerification;
    
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);
    (messaging.sendVerificationMessage as any) = mockSendMessage;
    (messaging.generateVerificationCode as any) = vi.fn().mockReturnValue('123456');
    
    // Start onboarding
    await handleWhatsAppOnboarding(testPhoneNumber, 'hello');
    
    // Confirm signup
    await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
    
    // Provide name
    await handleWhatsAppOnboarding(testPhoneNumber, 'John');
    
    // Provide email
    const response = await handleWhatsAppOnboarding(testPhoneNumber, 'john@example.com');
    
    // Verify createContactVerification was called with tempId as string
    expect(mockCreateVerification).toHaveBeenCalledWith({
      tempId: cleanedPhoneNumber, // Should be string, not parseInt
      type: 'email',
      code: '123456',
      expiresAt: expect.any(Date)
    });
    
    expect(response).toContain("I've sent a 6-digit verification code");
  });

  it('should use tempId as string for verification retrieval', async () => {
    const mockVerification = {
      type: 'email',
      code: '123456',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      verified: false
    };
    
    const mockGetLatestVerification = vi.fn().mockResolvedValue(mockVerification);
    (storage.getLatestContactVerification as any) = mockGetLatestVerification;
    
    const mockMarkVerified = vi.fn().mockResolvedValue(undefined);
    (storage.markContactVerified as any) = mockMarkVerified;
    
    const mockCreateVerification = vi.fn().mockResolvedValue(undefined);
    (storage.createContactVerification as any) = mockCreateVerification;
    
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);
    (messaging.sendVerificationMessage as any) = mockSendMessage;
    (messaging.generateVerificationCode as any) = vi.fn().mockReturnValue('123456');
    
    // Go through onboarding to verification step
    await handleWhatsAppOnboarding(testPhoneNumber, 'hello');
    await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
    await handleWhatsAppOnboarding(testPhoneNumber, 'John');
    await handleWhatsAppOnboarding(testPhoneNumber, 'john@example.com');
    
    // Enter verification code
    await handleWhatsAppOnboarding(testPhoneNumber, '123456');
    
    // Verify getLatestContactVerification was called with tempId as string
    expect(mockGetLatestVerification).toHaveBeenCalledWith(cleanedPhoneNumber);
    
    // Verify markContactVerified was called with tempId as string
    expect(mockMarkVerified).toHaveBeenCalledWith(cleanedPhoneNumber, 'email');
  });

  it('should handle large phone numbers without integer overflow', async () => {
    const largePhoneNumber = 'whatsapp:+919876543210'; // Large number that could overflow
    const cleanedLargeNumber = '919876543210';
    
    const mockCreateVerification = vi.fn().mockResolvedValue(undefined);
    (storage.createContactVerification as any) = mockCreateVerification;
    
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);
    (messaging.sendVerificationMessage as any) = mockSendMessage;
    (messaging.generateVerificationCode as any) = vi.fn().mockReturnValue('123456');
    
    // Start onboarding with large phone number
    await handleWhatsAppOnboarding(largePhoneNumber, 'hello');
    await handleWhatsAppOnboarding(largePhoneNumber, 'yes');
    await handleWhatsAppOnboarding(largePhoneNumber, 'John');
    await handleWhatsAppOnboarding(largePhoneNumber, 'john@example.com');
    
    // Verify tempId is passed as string, not parsed as integer
    expect(mockCreateVerification).toHaveBeenCalledWith({
      tempId: cleanedLargeNumber,
      type: 'email',
      code: '123456',
      expiresAt: expect.any(Date)
    });
    
    // Ensure no parseInt was used (tempId should be exact string)
    const callArgs = mockCreateVerification.mock.calls[0][0];
    expect(typeof callArgs.tempId).toBe('string');
    expect(callArgs.tempId).toBe(cleanedLargeNumber);
  });

  it('should complete registration successfully with tempId verification', async () => {
    const mockVerification = {
      type: 'email',
      code: '123456',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      verified: false
    };
    
    const mockGetLatestVerification = vi.fn().mockResolvedValue(mockVerification);
    (storage.getLatestContactVerification as any) = mockGetLatestVerification;
    
    const mockMarkVerified = vi.fn().mockResolvedValue(undefined);
    (storage.markContactVerified as any) = mockMarkVerified;
    
    const mockCreateVerification = vi.fn().mockResolvedValue(undefined);
    (storage.createContactVerification as any) = mockCreateVerification;
    
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);
    (messaging.sendVerificationMessage as any) = mockSendMessage;
    (messaging.generateVerificationCode as any) = vi.fn().mockReturnValue('123456');
    
    // Complete full onboarding flow
    await handleWhatsAppOnboarding(testPhoneNumber, 'hello');
    await handleWhatsAppOnboarding(testPhoneNumber, 'yes');
    await handleWhatsAppOnboarding(testPhoneNumber, 'John');
    await handleWhatsAppOnboarding(testPhoneNumber, 'john@example.com');
    
    // Enter correct verification code
    const finalResponse = await handleWhatsAppOnboarding(testPhoneNumber, '123456');
    
    // Verify user was created
    expect(db.insert).toHaveBeenCalled();
    expect(finalResponse).toContain('Your email is verified, and your account is set up');
    
    // Verify no errors occurred during the process
    expect(finalResponse).not.toContain('error');
    expect(finalResponse).not.toContain('Sorry');
  });
});