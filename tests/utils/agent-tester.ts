import fetch from 'node-fetch';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface AgentTestCase {
  name: string;
  task: string;
  timeout: number;
  expectedFiles: string[];
  verificationSteps: VerificationStep[];
}

export interface VerificationStep {
  type: 'file_exists' | 'api_test' | 'content_check' | 'server_start';
  description: string;
  execute: () => Promise<boolean>;
}

export interface AgentExecutionResult {
  success: boolean;
  executionId: string;
  status: string;
  output: string[];
  files: string[];
  error?: string;
  verificationResults: VerificationResult[];
}

export interface VerificationResult {
  step: string;
  success: boolean;
  error?: string;
  details?: any;
}

export class AgentTester {
  private baseUrl: string;
  private testDir: string;

  constructor(baseUrl = 'http://localhost:5001', testDir = './test-output') {
    this.baseUrl = baseUrl;
    this.testDir = testDir;
  }

  async executeTest(testCase: AgentTestCase): Promise<AgentExecutionResult> {
    console.log(`🧪 Starting test: ${testCase.name}`);
    
    let executionId = '';
    let status = '';
    let output: string[] = [];
    let files: string[] = [];
    let error: string | undefined;
    const verificationResults: VerificationResult[] = [];

    try {
      // Clean test directory
      await this.cleanTestDirectory();

      // Submit task to agent
      console.log('📤 Submitting task to agent...');
      const response = await fetch(`${this.baseUrl}/api/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: testCase.task,
          timeout: testCase.timeout,
          project_path: this.testDir,
          options: {
            no_approval: true,
            write_mode: 'create',
            mode: 'generate',
            model: 'claude',
            source: 'anthropic'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to submit task: ${response.statusText}`);
      }

      const submitResult = await response.json() as any;
      executionId = submitResult.execution_id;
      console.log(`🆔 Execution ID: ${executionId}`);

      // Wait for completion
      console.log('⏳ Waiting for agent to complete task...');
      const finalStatus = await this.waitForCompletion(executionId, testCase.timeout + 10000);
      
      status = finalStatus.status;
      output = finalStatus.output || [];
      files = finalStatus.files || [];
      error = finalStatus.error;

      console.log(`✅ Agent finished with status: ${status}`);
      
      if (status !== 'completed') {
        console.log('❌ Agent execution failed');
        console.log('Last output lines:');
        output.slice(-10).forEach(line => console.log(`  ${line}`));
        return {
          success: false,
          executionId,
          status,
          output,
          files,
          error,
          verificationResults
        };
      }

      // Run verification steps
      console.log('🔍 Running verification steps...');
      for (const step of testCase.verificationSteps) {
        console.log(`  📋 ${step.description}`);
        try {
          const success = await step.execute();
          verificationResults.push({
            step: step.description,
            success,
            details: success ? 'Passed' : 'Failed'
          });
          console.log(`    ${success ? '✅' : '❌'} ${step.description}`);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          verificationResults.push({
            step: step.description,
            success: false,
            error: errorMsg
          });
          console.log(`    ❌ ${step.description}: ${errorMsg}`);
        }
      }

      const allStepsPassed = verificationResults.every(r => r.success);
      console.log(`🎯 Test result: ${allStepsPassed ? 'PASSED' : 'FAILED'}`);

      return {
        success: allStepsPassed,
        executionId,
        status,
        output,
        files,
        error,
        verificationResults
      };

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`💥 Test failed with error: ${errorMsg}`);
      
      return {
        success: false,
        executionId,
        status: 'error',
        output,
        files,
        error: errorMsg,
        verificationResults
      };
    }
  }

  private async waitForCompletion(executionId: string, timeout: number): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${this.baseUrl}/api/agent/status/${executionId}`);
        
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.statusText}`);
        }

        const status = await response.json() as any;
        
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'timeout') {
          return status;
        }

        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (err) {
        console.error('Error checking status:', err);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    throw new Error('Timeout waiting for agent completion');
  }

  private async cleanTestDirectory(): Promise<void> {
    try {
      await fs.rm(this.testDir, { recursive: true, force: true });
      await fs.mkdir(this.testDir, { recursive: true });
      console.log(`🧹 Cleaned test directory: ${this.testDir}`);
    } catch (err) {
      console.error('Error cleaning test directory:', err);
    }
  }

  // Utility methods for common verification steps
  static fileExists(filePath: string): VerificationStep {
    return {
      type: 'file_exists',
      description: `File exists: ${filePath}`,
      execute: async () => {
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      }
    };
  }

  static contentCheck(filePath: string, expectedContent: string | RegExp): VerificationStep {
    return {
      type: 'content_check',
      description: `Content check: ${filePath}`,
      execute: async () => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          if (typeof expectedContent === 'string') {
            return content.includes(expectedContent);
          } else {
            return expectedContent.test(content);
          }
        } catch {
          return false;
        }
      }
    };
  }

  static apiTest(serverUrl: string, endpoint: string, expectedResponse: any): VerificationStep {
    return {
      type: 'api_test',
      description: `API test: ${endpoint}`,
      execute: async () => {
        try {
          const response = await fetch(`${serverUrl}${endpoint}`, {
            method: endpoint.includes('calculate') ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' },
            body: endpoint.includes('calculate') ? JSON.stringify(expectedResponse.request) : undefined
          });

          if (!response.ok) {
            return false;
          }

          const data = await response.json();
          
          // Simple equality check for expected response
          if (typeof expectedResponse.response === 'object') {
            return Object.keys(expectedResponse.response).every(key => 
              data[key] === expectedResponse.response[key]
            );
          }
          
          return data === expectedResponse.response;
        } catch {
          return false;
        }
      }
    };
  }

  static serverStart(serverPath: string, port: number, timeout = 10000): VerificationStep {
    return {
      type: 'server_start',
      description: `Server starts: ${serverPath} on port ${port}`,
      execute: async () => {
        return new Promise((resolve) => {
          let resolved = false;
          const timer = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          }, timeout);

          try {
            const child = spawn('node', [serverPath], {
              stdio: 'pipe',
              detached: true
            });

            child.stdout?.on('data', (data) => {
              const output = data.toString();
              if (output.includes(`${port}`) || output.includes('listening') || output.includes('started')) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timer);
                  child.kill();
                  resolve(true);
                }
              }
            });

            child.on('error', () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve(false);
              }
            });

            child.on('exit', () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve(false);
              }
            });

            // Try to connect to the port
            setTimeout(async () => {
              try {
                const response = await fetch(`http://localhost:${port}/health`);
                if (response.ok && !resolved) {
                  resolved = true;
                  clearTimeout(timer);
                  child.kill();
                  resolve(true);
                }
              } catch {
                // Connection failed, keep waiting
              }
            }, 3000);

          } catch {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(false);
            }
          }
        });
      }
    };
  }
}