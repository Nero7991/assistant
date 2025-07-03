import { config } from 'dotenv';
import path from 'path';
import { vi } from 'vitest';

// Load environment variables from .env file
config({ path: path.resolve(__dirname, '../.env') });

// Set test-specific environment variables if needed
process.env.NODE_ENV = 'test';

// Ensure required environment variables are set
const requiredEnvVars = [
  'DATABASE_URL',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'TWILIO_WHATSAPP_NUMBER'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('Some tests may fail. Please check your .env file.');
}

// Mock OpenAI to prevent browser environment error in tests
vi.mock('openai', () => {
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