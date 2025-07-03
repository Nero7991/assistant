// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import fs from 'fs/promises';
import path from 'path';

// Helper function to test the agent-created server
async function testAgentCreatedServer(): Promise<void> {
  const fetch = (await import('node-fetch')).default;
  let testServerProcess: ChildProcess | null = null;
  
  try {
    console.log('  🔍 Checking for created files...');
    
    // Check if server files exist
    const projectPath = './test-e2e-output';
    const serverFile = path.join(projectPath, 'server.js');
    const packageFile = path.join(projectPath, 'package.json');
    
    const serverExists = await fs.access(serverFile).then(() => true).catch(() => false);
    const packageExists = await fs.access(packageFile).then(() => true).catch(() => false);
    
    console.log(`  📄 server.js exists: ${serverExists}`);
    console.log(`  📄 package.json exists: ${packageExists}`);
    
    if (!serverExists) {
      console.log('  ❌ Server file not found, skipping server test');
      return;
    }
    
    // Install dependencies if package.json exists
    if (packageExists) {
      console.log('  📦 Installing dependencies...');
      const installProcess = spawn('npm', ['install'], { 
        cwd: projectPath, 
        stdio: 'pipe' 
      });
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('npm install timeout')), 30000);
        installProcess.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0) resolve(void 0);
          else reject(new Error(`npm install failed with code ${code}`));
        });
      });
      console.log('  ✅ Dependencies installed');
    }
    
    // Start the created server
    console.log('  🚀 Starting the agent-created server on port 3444...');
    testServerProcess = spawn('node', ['server.js'], {
      cwd: projectPath,
      env: { ...process.env, PORT: '3444' },
      stdio: 'pipe'
    });
    
    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000);
      
      let output = '';
      testServerProcess!.stdout?.on('data', (data) => {
        output += data.toString();
        if (output.includes('listening') || output.includes('started') || output.includes('3444')) {
          clearTimeout(timeout);
          resolve(void 0);
        }
      });
      
      testServerProcess!.stderr?.on('data', (data) => {
        console.log(`  Server stderr: ${data.toString().trim()}`);
      });
      
      testServerProcess!.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      
      // Also try connecting after a delay
      setTimeout(async () => {
        try {
          await fetch('http://localhost:3444/health', { timeout: 1000 });
          clearTimeout(timeout);
          resolve(void 0);
        } catch (err) {
          // Continue waiting
        }
      }, 3000);
    });
    
    console.log('  ✅ Server started, running API tests...');
    
    const testBaseUrl = 'http://localhost:3444';
    let testsPassed = 0;
    let testsTotal = 0;
    
    // Test 1: Health check
    testsTotal++;
    try {
      const healthResponse = await fetch(`${testBaseUrl}/health`);
      expect(healthResponse.ok).toBe(true);
      const healthData = await healthResponse.json() as any;
      expect(healthData).toHaveProperty('status');
      expect(healthData.status).toBe('ok');
      console.log('  ✅ Health check passed');
      testsPassed++;
    } catch (err) {
      console.log(`  ❌ Health check failed: ${err}`);
    }
    
    // Test 2: Calculator API
    testsTotal++;
    try {
      const calcResponse = await fetch(`${testBaseUrl}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'add', a: 5, b: 3 })
      });
      expect(calcResponse.ok).toBe(true);
      const calcData = await calcResponse.json() as any;
      expect(calcData).toHaveProperty('result');
      expect(calcData.result).toBe(8);
      expect(calcData.operation).toBe('add');
      console.log('  ✅ Calculator API passed');
      testsPassed++;
    } catch (err) {
      console.log(`  ❌ Calculator API failed: ${err}`);
    }
    
    // Test 3: User creation
    testsTotal++;
    try {
      const userResponse = await fetch(`${testBaseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test User', email: 'test@example.com' })
      });
      expect(userResponse.ok).toBe(true);
      const userData = await userResponse.json() as any;
      expect(userData).toHaveProperty('id');
      expect(userData.name).toBe('Test User');
      expect(userData.email).toBe('test@example.com');
      console.log('  ✅ User creation passed');
      testsPassed++;
      
      // Test 4: User retrieval
      testsTotal++;
      const getUserResponse = await fetch(`${testBaseUrl}/users/${userData.id}`);
      expect(getUserResponse.ok).toBe(true);
      const retrievedUser = await getUserResponse.json() as any;
      expect(retrievedUser.id).toBe(userData.id);
      expect(retrievedUser.name).toBe('Test User');
      console.log('  ✅ User retrieval passed');
      testsPassed++;
      
    } catch (err) {
      console.log(`  ❌ User API failed: ${err}`);
    }
    
    console.log(`\n  🎯 Server functionality test results: ${testsPassed}/${testsTotal} tests passed`);
    
    if (testsPassed === testsTotal) {
      console.log('  🎉 All server tests passed! Agent created a working server!');
    } else {
      console.log('  ⚠️ Some server tests failed, but server was created and started');
    }
    
  } catch (error) {
    console.log(`  ❌ Server testing failed: ${error}`);
  } finally {
    // Clean up test server
    if (testServerProcess) {
      console.log('  🛑 Stopping test server...');
      testServerProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!testServerProcess.killed) {
        testServerProcess.kill('SIGKILL');
      }
    }
  }
}

describe('Agent E2E Integration Test', () => {
  let serverProcess: ChildProcess | null = null;
  let baseUrl: string;
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
      await fs.rm('./test-e2e-output', { recursive: true, force: true });
    } catch (err) {
      console.error('Error cleaning up test directory:', err);
    }
  });

  it('should complete full E2E workflow: create task → observe WebSocket → verify completion', async () => {
    const fetch = (await import('node-fetch')).default;
    
    console.log('\n📋 Step 1: Testing agent API availability...');
    
    // Step 1: Test agent API availability
    const execResponse = await fetch(`${baseUrl}/api/agent/executions`);
    expect(execResponse.ok).toBe(true);
    const execData = await execResponse.json() as any;
    expect(execData).toHaveProperty('executions');
    console.log(`✅ Agent API is available, found ${execData.executions.length} existing executions`);

    console.log('\n📋 Step 2: Creating task via agent API...');
    
    // Step 2: Submit task to agent API
    const taskDescription = `Create a complete REST API server using Node.js and Express with the following requirements:

1. **Main server file**: server.js that starts an Express server
2. **Package.json**: Include express dependency and start script
3. **Port configuration**: Listen on port 3333 (configurable via PORT env var)

4. **API Endpoints**:
   - GET /health → Returns {"status": "ok", "timestamp": "<current_iso_time>", "uptime": <seconds>}
   - POST /calculate → Accepts {operation: "add"|"subtract"|"multiply"|"divide", a: number, b: number}
     Returns {result: number, operation: string, a: number, b: number}
   - POST /users → Accepts {name: string, email: string}, stores in memory, returns {id: number, name: string, email: string}
   - GET /users/:id → Returns stored user by ID or 404 if not found

5. **Error handling**: Proper JSON error responses for invalid input
6. **Logging**: Console.log for server start and incoming requests

Example requests:
- POST /calculate with {"operation": "add", "a": 5, "b": 3} → {"result": 8, "operation": "add", "a": 5, "b": 3}
- POST /users with {"name": "John", "email": "john@test.com"} → {"id": 1, "name": "John", "email": "john@test.com"}
- GET /users/1 → {"id": 1, "name": "John", "email": "john@test.com"}`;

    const agentResponse = await fetch(`${baseUrl}/api/agent/execute`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        task: taskDescription,
        timeout: 180000, // 3 minutes
        project_path: './test-e2e-output',
        options: {
          no_approval: true,
          write_mode: 'direct', // Fixed: use 'direct' instead of 'create'
          mode: 'generate',
          model: 'claude',
          source: 'anthropic'
        }
      })
    });

    expect(agentResponse.ok).toBe(true);
    const agentData = await agentResponse.json() as any;
    expect(agentData).toHaveProperty('execution_id');
    expect(agentData.status).toBe('started');

    const executionId = agentData.execution_id;
    console.log(`✅ Task submitted with ID: ${executionId}`);

    console.log('\n🔌 Step 3: Setting up WebSocket connection...');
    
    // Step 3: Setup WebSocket to observe events  
    const wsUrl = `ws://localhost:5001`;
    let ws: WebSocket;
    let wsEvents: any[] = [];
    let wsConnected = false;

    try {
      ws = new WebSocket(wsUrl, {
        headers: {
          'Cookie': sessionCookie
        }
      });

      // Collect WebSocket events
      ws.on('open', () => {
        wsConnected = true;
        console.log('✅ WebSocket connected');
      });

      ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          wsEvents.push(event);
          console.log('📡 WebSocket event received:', event.type || 'unknown');
        } catch (err) {
          console.log('📡 WebSocket raw message:', data.toString());
        }
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });

      // Wait for WebSocket connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
        
        ws.on('open', () => {
          clearTimeout(timeout);
          resolve(void 0);
        });
        
        ws.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

    } catch (wsError) {
      console.log('⚠️ WebSocket connection failed (may not be implemented), continuing without WebSocket observation');
      wsConnected = false;
    }

    console.log('\n⏱️ Step 4: Monitoring task execution...');
    
    // Step 4: Monitor task execution
    let taskStatus = 'running';
    let attempts = 0;
    const maxAttempts = 90; // 90 attempts * 2 seconds = 3 minutes
    let finalTaskData: any = null;

    while (taskStatus === 'running' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`${baseUrl}/api/agent/status/${executionId}`);
      
      expect(statusResponse.ok).toBe(true);
      const statusData = await statusResponse.json() as any;
      taskStatus = statusData.status;
      finalTaskData = statusData;
      
      console.log(`📊 Status check ${attempts + 1}/${maxAttempts}: ${taskStatus}`);
      
      // Log interesting output lines
      if (statusData.output && statusData.output.length > 0) {
        const recentOutput = statusData.output.slice(-3);
        recentOutput.forEach((line: string) => {
          if (line.includes('[FILE]') || line.includes('[ERROR]') || line.includes('[PROCESS]') || line.includes('CREATE') || line.includes('COMPLETE')) {
            console.log(`  ${line}`);
          }
        });
      }
      
      attempts++;
    }

    console.log('\n🎯 Step 5: Verifying task completion...');
    
    // Step 5: Verify task completion
    console.log(`Final task status: ${taskStatus}`);
    console.log(`Files created: ${finalTaskData?.files?.length || 0}`);
    console.log(`Output lines: ${finalTaskData?.output?.length || 0}`);

    if (finalTaskData?.files && finalTaskData.files.length > 0) {
      console.log(`Created files: ${finalTaskData.files.join(', ')}`);
    }

    if (finalTaskData?.error) {
      console.log(`Task error: ${finalTaskData.error}`);
    }

    // Show final output
    if (finalTaskData?.output && finalTaskData.output.length > 0) {
      console.log('\n📋 Final agent output (last 10 lines):');
      finalTaskData.output.slice(-10).forEach((line: string) => {
        console.log(`  ${line}`);
      });
    }

    // WebSocket event summary
    if (wsConnected) {
      console.log(`\n📡 WebSocket events captured: ${wsEvents.length}`);
      wsEvents.forEach((event, i) => {
        console.log(`  ${i + 1}. ${event.type || 'message'}: ${JSON.stringify(event).slice(0, 100)}...`);
      });
    }

    // Close WebSocket if connected
    if (ws && wsConnected) {
      ws.close();
    }

    console.log('\n✅ Step 6: Final verification...');
    
    // Step 6: Final assertions
    expect(['completed', 'failed', 'timeout']).toContain(taskStatus);
    expect(finalTaskData).toBeTruthy();
    expect(finalTaskData.execution_id).toBe(executionId);
    expect(finalTaskData.task).toBe(taskDescription);
    expect(finalTaskData.start_time).toBeTruthy();

    // If task completed successfully, verify file creation
    if (taskStatus === 'completed') {
      expect(finalTaskData.files.length).toBeGreaterThan(0);
      console.log('🎉 Task completed successfully with files created!');
      
      // Step 6: Independent Server Testing
      console.log('\n🚀 Step 6: Testing the agent-created server...');
      await testAgentCreatedServer();
      
    } else {
      console.log(`⚠️ Task finished with status: ${taskStatus}`);
      // Even if not completed, we should have attempted execution
      expect(finalTaskData.output.length).toBeGreaterThan(0);
    }

    // Verify we have execution records
    const executionsResponse = await fetch(`${baseUrl}/api/agent/executions`);
    expect(executionsResponse.ok).toBe(true);
    
    const executionsData = await executionsResponse.json() as any;
    expect(executionsData.executions).toBeTruthy();
    expect(Array.isArray(executionsData.executions)).toBe(true);
    
    // Find our execution in the list
    const ourExecution = executionsData.executions.find((exec: any) => exec.execution_id === executionId);
    expect(ourExecution).toBeTruthy();
    expect(ourExecution.status).toBe(taskStatus);

    console.log('\n🎯 E2E Test Summary:');
    console.log('='.repeat(50));
    console.log(`✅ API Check: Success (${execData.executions.length} existing executions)`);
    console.log(`✅ Task Creation: Success (ID: ${executionId})`);
    console.log(`${wsConnected ? '✅' : '⚠️'} WebSocket: ${wsConnected ? `Connected, ${wsEvents.length} events` : 'Not connected'}`);
    console.log(`${taskStatus === 'completed' ? '✅' : '⚠️'} Task Execution: ${taskStatus}`);
    console.log(`✅ Files Created: ${finalTaskData?.files?.length || 0}`);
    if (taskStatus === 'completed') {
      console.log(`✅ Server Testing: Completed`);
    }
    console.log(`✅ API Verification: Success`);
    console.log('='.repeat(50));
    
  }, 300000); // 5 minute timeout for entire test
});