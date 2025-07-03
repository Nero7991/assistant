import { AgentTestCase, AgentTester } from '../utils/agent-tester';
import path from 'path';

export const calculatorTask: AgentTestCase = {
  name: 'Calculator API Server',
  task: `Create a simple calculator API server using Node.js and Express that:

1. Has a main server file (server.js or index.js)
2. Listens on port 3333
3. Has a GET /health endpoint that returns {"status": "ok"}
4. Has a POST /calculate endpoint that:
   - Accepts JSON with: {operation: "add"|"multiply", a: number, b: number}
   - Returns JSON with: {result: number, operation: string}
   - Supports "add" and "multiply" operations
   - Returns 400 error for invalid operations or missing parameters
5. Includes package.json with express dependency
6. Has basic error handling

Example usage:
- POST /calculate with {"operation": "add", "a": 5, "b": 3} should return {"result": 8, "operation": "add"}
- POST /calculate with {"operation": "multiply", "a": 4, "b": 7} should return {"result": 28, "operation": "multiply"}
- POST /calculate with {"operation": "divide", "a": 5, "b": 3} should return 400 error

Make sure the server can be started with "node server.js" or "node index.js".`,

  timeout: 180000, // 3 minutes
  
  expectedFiles: [
    'server.js',
    'package.json'
  ],

  verificationSteps: [
    // Check if required files exist
    AgentTester.fileExists('./test-output/package.json'),
    AgentTester.fileExists('./test-output/server.js'),
    
    // Check package.json contains express
    AgentTester.contentCheck('./test-output/package.json', '"express"'),
    
    // Check server.js contains the right endpoints
    AgentTester.contentCheck('./test-output/server.js', '/health'),
    AgentTester.contentCheck('./test-output/server.js', '/calculate'),
    AgentTester.contentCheck('./test-output/server.js', '3333'),
    
    // Check server contains basic operations
    AgentTester.contentCheck('./test-output/server.js', /add|addition/i),
    AgentTester.contentCheck('./test-output/server.js', /multiply|multiplication/i),
    
    // Test server startup (this will verify it can start)
    AgentTester.serverStart('./test-output/server.js', 3333, 15000),
    
    // Custom verification steps for API functionality
    {
      type: 'api_test',
      description: 'Health endpoint responds correctly',
      execute: async () => {
        try {
          // Start server in background for testing
          const { spawn } = await import('child_process');
          const server = spawn('node', ['./test-output/server.js'], { 
            detached: true,
            stdio: 'ignore'
          });
          
          // Wait for server to start
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const fetch = (await import('node-fetch')).default;
          const response = await fetch('http://localhost:3333/health');
          const data = await response.json();
          
          // Clean up
          server.kill();
          
          return response.ok && data.status === 'ok';
        } catch {
          return false;
        }
      }
    },
    
    {
      type: 'api_test', 
      description: 'Addition calculation works correctly',
      execute: async () => {
        try {
          const { spawn } = await import('child_process');
          const server = spawn('node', ['./test-output/server.js'], { 
            detached: true,
            stdio: 'ignore'
          });
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const fetch = (await import('node-fetch')).default;
          const response = await fetch('http://localhost:3333/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation: 'add', a: 5, b: 3 })
          });
          
          const data = await response.json() as any;
          
          server.kill();
          
          return response.ok && data.result === 8 && data.operation === 'add';
        } catch {
          return false;
        }
      }
    },
    
    {
      type: 'api_test',
      description: 'Multiplication calculation works correctly', 
      execute: async () => {
        try {
          const { spawn } = await import('child_process');
          const server = spawn('node', ['./test-output/server.js'], { 
            detached: true,
            stdio: 'ignore'
          });
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const fetch = (await import('node-fetch')).default;
          const response = await fetch('http://localhost:3333/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation: 'multiply', a: 4, b: 7 })
          });
          
          const data = await response.json() as any;
          
          server.kill();
          
          return response.ok && data.result === 28 && data.operation === 'multiply';
        } catch {
          return false;
        }
      }
    },
    
    {
      type: 'api_test',
      description: 'Invalid operation returns 400 error',
      execute: async () => {
        try {
          const { spawn } = await import('child_process');
          const server = spawn('node', ['./test-output/server.js'], { 
            detached: true,
            stdio: 'ignore'
          });
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const fetch = (await import('node-fetch')).default;
          const response = await fetch('http://localhost:3333/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operation: 'divide', a: 10, b: 2 })
          });
          
          server.kill();
          
          return response.status === 400;
        } catch {
          return false;
        }
      }
    }
  ]
};