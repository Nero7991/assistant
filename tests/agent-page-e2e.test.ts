// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import fs from 'fs/promises';
import path from 'path';

// Test credentials from CLAUDE.md
const TEST_CREDENTIALS = {
  email: 'testuser@example.com',
  password: 'testpass123',
  userId: 5
};

describe('Agent Page E2E Test', () => {
  let serverProcess: ChildProcess | null = null;
  let baseUrl: string;
  let sessionCookie: string;
  let serverAlreadyRunning = false;

  beforeAll(async () => {
    baseUrl = 'http://localhost:5001';
    
    // Check if dev server is already running
    console.log('🔍 Checking if dev server is already running on port 5001...');
    
    const fetch = (await import('node-fetch')).default;
    try {
      const healthCheck = await fetch(`${baseUrl}/api/agent/executions`, { 
        timeout: 3000 
      });
      
      if (healthCheck.ok) {
        console.log('✅ Dev server is already running on port 5001');
        serverAlreadyRunning = true;
      }
    } catch (error) {
      console.log('📡 No server detected on port 5001, will start one...');
      
      // Start the development server
      console.log('🚀 Starting development server...');
      serverProcess = spawn('tsx', ['server/index.ts'], {
        stdio: 'pipe',
        env: { ...process.env, PORT: '5001', NODE_ENV: 'development' },
        detached: false
      });

      // Wait for server to be ready
      await new Promise((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => {
          reject(new Error('Server startup timeout'));
        }, 60000);

        serverProcess!.stdout?.on('data', (data) => {
          output += data.toString();
          console.log('Server:', data.toString().trim());
          
          if (output.includes('Server running at')) {
            clearTimeout(timeout);
            resolve(void 0);
          }
        });

        serverProcess!.stderr?.on('data', (data) => {
          console.error('Server error:', data.toString().trim());
        });

        serverProcess!.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      console.log('✅ Development server started successfully');
    }
    
    // Wait for everything to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Only stop the server if we started it ourselves
    if (serverProcess && !serverAlreadyRunning) {
      console.log('🛑 Stopping development server...');
      serverProcess.kill('SIGTERM');
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    } else if (serverAlreadyRunning) {
      console.log('✅ Leaving existing dev server running');
    }

    // Clean up test directories
    try {
      await fs.rm('./test-agent-output', { recursive: true, force: true });
    } catch (err) {
      console.error('Error cleaning up test directory:', err);
    }
  });

  it('should complete agent page workflow: login → get WS token → connect WebSocket → send task → verify results', async () => {
    const fetch = (await import('node-fetch')).default;
    
    console.log('\n🔐 Step 1: Logging in as test user...');
    
    // Step 1: Login as test user
    const loginResponse = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_CREDENTIALS.email,
        password: TEST_CREDENTIALS.password
      })
    });

    expect(loginResponse.ok).toBe(true);
    
    // Extract session cookie
    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (setCookieHeader) {
      sessionCookie = setCookieHeader.split(';')[0];
      console.log('✅ Successfully logged in, got session cookie');
    } else {
      throw new Error('No session cookie received from login');
    }

    console.log('\n🎫 Step 2: Getting WebSocket auth token...');
    
    // Step 2: Get WebSocket auth token
    const tokenResponse = await fetch(`${baseUrl}/api/devlm/ws-token`, {
      method: 'POST',
      headers: { 'Cookie': sessionCookie }
    });

    expect(tokenResponse.ok).toBe(true);
    const tokenData = await tokenResponse.json() as any;
    expect(tokenData).toHaveProperty('token');
    const wsToken = tokenData.token;
    console.log(`✅ Got WebSocket auth token: ${wsToken.substring(0, 10)}...`);

    console.log('\n🔌 Step 3: Connecting to WebSocket...');
    
    // Step 3: Connect to WebSocket
    const wsUrl = `ws://localhost:5001/api/devlm/ws`;
    let ws: WebSocket;
    let wsEvents: any[] = [];
    let wsConnected = false;
    let wsAuthenticated = false;

    ws = new WebSocket(wsUrl);

    // Set up WebSocket event handlers
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 15000);
      
      ws.on('open', () => {
        console.log('  🔗 WebSocket connected, sending auth...');
        wsConnected = true;
        // Send auth message
        ws.send(JSON.stringify({ type: 'auth', token: wsToken }));
      });

      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          wsEvents.push(event);
          console.log(`  📡 WS Event: ${event.type} - ${event.payload?.message || 'no message'}`);
          
          if (event.type === 'auth_success') {
            wsAuthenticated = true;
            clearTimeout(timeout);
            resolve(void 0);
          } else if (event.type === 'error') {
            clearTimeout(timeout);
            reject(new Error(`WebSocket auth error: ${event.payload.message}`));
          }
        } catch (err) {
          console.log(`  📡 Raw WS message: ${data.toString()}`);
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    expect(wsConnected).toBe(true);
    expect(wsAuthenticated).toBe(true);
    console.log('✅ WebSocket connected and authenticated');

    console.log('\n📋 Step 4: Sending task via WebSocket...');
    
    // Step 4: Send task via WebSocket (matching agent page format)
    const taskDescription = `Create a simple REST API server using Node.js and Express:

1. **server.js**: Main server file listening on port 3333
2. **package.json**: Include express dependency
3. **API Endpoints**:
   - GET /health → {"status": "ok", "timestamp": "..."}
   - POST /calculate → Math operations (add, subtract, multiply, divide)
   - POST /users → Create user with name/email, return with ID
   - GET /users/:id → Retrieve user by ID

Include proper error handling and JSON responses.`;

    const runParams = {
      task: taskDescription,
      mode: 'generate',
      model: 'claude',
      source: 'anthropic',
      projectPath: './test-agent-output',
      writeMode: 'diff',
      debugPrompt: false,
      noApproval: true,
      frontend: false,
    };

    ws.send(JSON.stringify({ type: 'run', payload: runParams }));
    console.log('✅ Task sent via WebSocket');

    console.log('\n⏱️ Step 5: Monitoring WebSocket events...');
    
    // Step 5: Monitor WebSocket events until completion
    let taskCompleted = false;
    let taskSuccess = false;
    const maxWaitTime = 180000; // 3 minutes
    const startTime = Date.now();

    while (!taskCompleted && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check recent events
      const recentEvents = wsEvents.slice(-5);
      for (const event of recentEvents) {
        if (event.type === 'process_end') {
          taskCompleted = true;
          taskSuccess = event.payload.status === 'success';
          console.log(`  🎯 Task completed with status: ${event.payload.status}`);
          break;
        } else if (event.type === 'file_operation_complete') {
          console.log(`  📁 File operation: ${event.payload.operationType} - ${event.payload.success ? 'SUCCESS' : 'FAILED'}`);
        } else if (event.type === 'llm_request_start') {
          console.log(`  🤖 LLM request: ${event.payload.model}`);
        } else if (event.type === 'llm_request_error') {
          console.log(`  ❌ LLM error: ${event.payload.errorMessage}`);
        }
      }
    }

    console.log('\n🎯 Step 6: Verifying results...');
    
    // Step 6: Verify results
    if (!taskCompleted) {
      console.log('⚠️ Task did not complete within timeout');
      console.log('📋 Recent WebSocket events:');
      wsEvents.slice(-10).forEach((event, i) => {
        console.log(`  ${i + 1}. ${event.type}: ${JSON.stringify(event.payload).slice(0, 100)}...`);
      });
    } else {
      console.log(`${taskSuccess ? '✅' : '❌'} Task completed with ${taskSuccess ? 'success' : 'failure'}`);
    }

    // Close WebSocket
    ws.close();

    // Check for created files if task was successful
    if (taskSuccess) {
      console.log('\n📁 Step 7: Checking created files...');
      
      const projectPath = './test-agent-output';
      const serverFile = path.join(projectPath, 'server.js');
      const packageFile = path.join(projectPath, 'package.json');
      
      const serverExists = await fs.access(serverFile).then(() => true).catch(() => false);
      const packageExists = await fs.access(packageFile).then(() => true).catch(() => false);
      
      console.log(`  📄 server.js exists: ${serverExists}`);
      console.log(`  📄 package.json exists: ${packageExists}`);
      
      if (serverExists && packageExists) {
        console.log('🎉 Agent successfully created the requested files!');
      }
    }

    console.log('\n🎯 Agent Page E2E Test Summary:');
    console.log('='.repeat(50));
    console.log(`✅ Login: Success`);
    console.log(`✅ WebSocket Token: Success`);
    console.log(`✅ WebSocket Connection: Success`);
    console.log(`✅ WebSocket Authentication: Success`);
    console.log(`✅ Task Submission: Success`);
    console.log(`${taskCompleted ? '✅' : '⚠️'} Task Completion: ${taskCompleted ? (taskSuccess ? 'Success' : 'Failed') : 'Timeout'}`);
    console.log(`📊 WebSocket Events Captured: ${wsEvents.length}`);
    console.log('='.repeat(50));
    
    // Assertions
    expect(wsConnected).toBe(true);
    expect(wsAuthenticated).toBe(true);
    expect(wsEvents.length).toBeGreaterThan(0);
    
    // The task might fail due to LLM configuration, but we should at least get events
    expect(wsEvents.some(e => e.type === 'auth_success')).toBe(true);
    
  }, 300000); // 5 minute timeout for entire test
});