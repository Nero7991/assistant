import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentTester } from './utils/agent-tester';
import { calculatorTask } from './fixtures/calculator-task';
import fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';

describe('Agent Observer Tests', () => {
  let serverProcess: ChildProcess;
  let agentTester: AgentTester;

  beforeAll(async () => {
    // Start the development server
    console.log('🚀 Starting development server...');
    serverProcess = spawn('npm', ['run', 'dev'], {
      stdio: 'pipe',
      env: { ...process.env, PORT: '5001' },
      detached: false
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 30000);

      serverProcess.stdout?.on('data', (data) => {
        output += data.toString();
        console.log('Server output:', data.toString().trim());
        
        if (output.includes('Server running at')) {
          clearTimeout(timeout);
          resolve(void 0);
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        console.error('Server error:', data.toString().trim());
      });

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log('✅ Development server is ready');
    
    // Initialize agent tester
    agentTester = new AgentTester('http://localhost:5001', './test-output');
    
    // Wait a bit more for everything to be fully ready
    await new Promise(resolve => setTimeout(resolve, 5000));
  });

  afterAll(async () => {
    // Clean up
    if (serverProcess) {
      console.log('🛑 Stopping development server...');
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }

    // Clean up test directory
    try {
      await fs.rm('./test-output', { recursive: true, force: true });
    } catch (err) {
      console.error('Error cleaning up test directory:', err);
    }
  });

  it('should successfully execute calculator API task', async () => {
    console.log('\n🎯 Starting Calculator API Test');
    console.log('=' .repeat(50));
    
    const result = await agentTester.executeTest(calculatorTask);
    
    console.log('\n📊 Test Results:');
    console.log('=' .repeat(30));
    console.log(`Overall Success: ${result.success ? '✅' : '❌'}`);
    console.log(`Execution ID: ${result.executionId}`);
    console.log(`Status: ${result.status}`);
    
    if (result.files.length > 0) {
      console.log(`Files Created: ${result.files.join(', ')}`);
    }
    
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    
    console.log('\n🔍 Verification Results:');
    result.verificationResults.forEach(step => {
      console.log(`  ${step.success ? '✅' : '❌'} ${step.step}`);
      if (step.error) {
        console.log(`    Error: ${step.error}`);
      }
    });
    
    console.log('\n📋 Agent Output (last 20 lines):');
    console.log('-'.repeat(40));
    result.output.slice(-20).forEach(line => {
      console.log(`  ${line}`);
    });
    
    // Assertions
    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.verificationResults.length).toBeGreaterThan(0);
    
    // Check that most verification steps passed
    const passedSteps = result.verificationResults.filter(r => r.success).length;
    const totalSteps = result.verificationResults.length;
    const passRate = passedSteps / totalSteps;
    
    console.log(`\n📈 Pass Rate: ${passedSteps}/${totalSteps} (${Math.round(passRate * 100)}%)`);
    
    // We expect at least 80% of verification steps to pass
    expect(passRate).toBeGreaterThanOrEqual(0.8);
    
  }, 300000); // 5 minute timeout for the entire test

  it('should handle agent API endpoints correctly', async () => {
    console.log('\n🔧 Testing Agent API Endpoints');
    
    // Test the executions endpoint
    const fetch = (await import('node-fetch')).default;
    
    const executionsResponse = await fetch('http://localhost:5001/api/agent/executions');
    expect(executionsResponse.ok).toBe(true);
    
    const executionsData = await executionsResponse.json() as any;
    expect(executionsData).toHaveProperty('executions');
    expect(Array.isArray(executionsData.executions)).toBe(true);
    
    console.log(`✅ Found ${executionsData.executions.length} previous executions`);
    
    // Test submitting a simple task
    const simpleTaskResponse = await fetch('http://localhost:5001/api/agent/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'Create a simple hello.txt file with the content "Hello, World!"',
        timeout: 30000,
        project_path: './test-output-simple'
      })
    });
    
    expect(simpleTaskResponse.ok).toBe(true);
    const simpleTaskData = await simpleTaskResponse.json() as any;
    expect(simpleTaskData).toHaveProperty('execution_id');
    expect(simpleTaskData.status).toBe('started');
    
    console.log(`✅ Simple task submitted with ID: ${simpleTaskData.execution_id}`);
    
    // Check status endpoint
    const statusResponse = await fetch(`http://localhost:5001/api/agent/status/${simpleTaskData.execution_id}`);
    expect(statusResponse.ok).toBe(true);
    
    const statusData = await statusResponse.json() as any;
    expect(statusData).toHaveProperty('execution_id');
    expect(statusData).toHaveProperty('status');
    expect(statusData).toHaveProperty('task');
    
    console.log(`✅ Status check successful: ${statusData.status}`);
    
  }, 60000); // 1 minute timeout
});