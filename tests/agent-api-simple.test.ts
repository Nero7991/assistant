import { describe, it, expect } from 'vitest';

describe('Agent API Simple Test', () => {
  
  it('should test agent API endpoints when server is running', async () => {
    const fetch = (await import('node-fetch')).default;
    const baseUrl = 'http://localhost:5001';
    
    try {
      // Test the executions endpoint
      console.log('🔧 Testing Agent API Endpoints');
      
      const executionsResponse = await fetch(`${baseUrl}/api/agent/executions`);
      expect(executionsResponse.ok).toBe(true);
      
      const executionsData = await executionsResponse.json() as any;
      expect(executionsData).toHaveProperty('executions');
      expect(Array.isArray(executionsData.executions)).toBe(true);
      
      console.log(`✅ Found ${executionsData.executions.length} previous executions`);
      
      // Test submitting a simple task
      const simpleTaskResponse = await fetch(`${baseUrl}/api/agent/execute`, {
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
      const statusResponse = await fetch(`${baseUrl}/api/agent/status/${simpleTaskData.execution_id}`);
      expect(statusResponse.ok).toBe(true);
      
      const statusData = await statusResponse.json() as any;
      expect(statusData).toHaveProperty('execution_id');
      expect(statusData).toHaveProperty('status');
      expect(statusData).toHaveProperty('task');
      
      console.log(`✅ Status check successful: ${statusData.status}`);
      
      // Wait a bit and check status again
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusResponse2 = await fetch(`${baseUrl}/api/agent/status/${simpleTaskData.execution_id}`);
      expect(statusResponse2.ok).toBe(true);
      
      const statusData2 = await statusResponse2.json() as any;
      console.log(`✅ Updated status: ${statusData2.status}`);
      console.log(`📄 Output lines: ${statusData2.output?.length || 0}`);
      
      if (statusData2.output && statusData2.output.length > 0) {
        console.log('📋 Recent output:');
        statusData2.output.slice(-5).forEach((line: string) => {
          console.log(`  ${line}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      throw error;
    }
  }, 60000); // 1 minute timeout

  it('should test calculator task submission', async () => {
    const fetch = (await import('node-fetch')).default;
    const baseUrl = 'http://localhost:5001';
    
    const calculatorTask = `Create a simple calculator API server using Node.js and Express that:

1. Has a main server file (server.js)
2. Listens on port 3333
3. Has a GET /health endpoint that returns {"status": "ok"}
4. Has a POST /calculate endpoint that:
   - Accepts JSON with: {operation: "add"|"multiply", a: number, b: number}
   - Returns JSON with: {result: number, operation: string}
   - Supports "add" and "multiply" operations
5. Includes package.json with express dependency

Example: POST /calculate with {"operation": "add", "a": 5, "b": 3} should return {"result": 8, "operation": "add"}`;

    try {
      console.log('🧮 Testing Calculator Task Submission');
      
      const response = await fetch(`${baseUrl}/api/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: calculatorTask,
          timeout: 120000, // 2 minutes
          project_path: './test-output-calc',
          options: {
            no_approval: true,
            write_mode: 'create',
            mode: 'generate',
            model: 'claude',
            source: 'anthropic'
          }
        })
      });
      
      expect(response.ok).toBe(true);
      const data = await response.json() as any;
      expect(data).toHaveProperty('execution_id');
      expect(data.status).toBe('started');
      
      console.log(`✅ Calculator task submitted with ID: ${data.execution_id}`);
      
      // Monitor progress for 60 seconds
      let status = 'running';
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds
      
      while (status === 'running' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await fetch(`${baseUrl}/api/agent/status/${data.execution_id}`);
        const statusData = await statusResponse.json() as any;
        status = statusData.status;
        
        console.log(`📊 Status update ${attempts + 1}: ${status}`);
        
        if (statusData.output && statusData.output.length > 0) {
          const recentOutput = statusData.output.slice(-3);
          recentOutput.forEach((line: string) => {
            if (line.includes('[FILE]') || line.includes('[ERROR]') || line.includes('[PROCESS]')) {
              console.log(`  ${line}`);
            }
          });
        }
        
        attempts++;
      }
      
      // Get final status
      const finalResponse = await fetch(`${baseUrl}/api/agent/status/${data.execution_id}`);
      const finalData = await finalResponse.json() as any;
      
      console.log(`🎯 Final status: ${finalData.status}`);
      console.log(`📁 Files created: ${finalData.files?.join(', ') || 'none'}`);
      
      if (finalData.error) {
        console.log(`❌ Error: ${finalData.error}`);
      }
      
      // The test passes if we got a valid response and the agent at least attempted the task
      expect(['completed', 'failed', 'timeout']).toContain(finalData.status);
      
    } catch (error) {
      console.error('❌ Calculator task test failed:', error);
      throw error;
    }
  }, 180000); // 3 minute timeout
});