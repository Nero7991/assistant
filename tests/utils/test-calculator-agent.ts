#!/usr/bin/env node

import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  details?: any;
}

class CalculatorServerTest {
  private results: TestResult[] = [];
  private cliProcess: ChildProcess | null = null;
  private serverProcess: ChildProcess | null = null;
  private testDir: string = '';
  private capturedEvents: string[] = [];
  private fileOperations: string[] = [];

  async runTest(): Promise<void> {
    console.log(chalk.bold.blue('🧪 Calculator Web Server Agent Test\n'));

    try {
      // Step 1: Run WebSocket CLI Tester
      await this.startCLITester();

      // Step 2: Wait for file creation
      await this.waitForFileCreation();

      // Step 3: Analyze created files
      await this.analyzeCreatedFiles();

      // Step 4: Start the server
      await this.startServer();

      // Step 5: Test API endpoints
      await this.testAPIEndpoints();

      // Step 6: Test error handling
      await this.testErrorHandling();

    } catch (error: any) {
      this.addResult('Test Execution', false, error.message);
    } finally {
      // Cleanup
      await this.cleanup();
      this.printResults();
    }
  }

  private async startCLITester(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(chalk.yellow('Starting WebSocket CLI Tester...'));

      this.cliProcess = spawn('npx', ['tsx', 'websocket-cli-tester.ts'], {
        cwd: __dirname,
        env: { ...process.env, API_URL: 'http://localhost:5001' },
      });

      let outputBuffer = '';
      let loginComplete = false;
      let taskSent = false;

      this.cliProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        outputBuffer += output;
        
        // Capture events
        if (output.includes('[INFO]') || output.includes('[SUCCESS]') || output.includes('[WARNING]')) {
          this.capturedEvents.push(output.trim());
        }

        // Track file operations
        if (output.includes('File write:') || output.includes('File operation completed:')) {
          this.fileOperations.push(output.trim());
        }

        // Auto-respond to prompts
        if (!loginComplete && output.includes('Email:')) {
          this.cliProcess!.stdin?.write('testuser@example.com\n');
        } else if (!loginComplete && output.includes('Password:')) {
          this.cliProcess!.stdin?.write('testpass123\n');
          loginComplete = true;
        } else if (loginComplete && !taskSent && output.includes('>')) {
          // Send the task
          console.log(chalk.green('Sending calculator server task...'));
          this.cliProcess!.stdin?.write('task create a calculator web server with Express that supports basic operations (add, subtract, multiply, divide) via REST API endpoints. Include error handling for division by zero.\n');
          taskSent = true;
          
          // Give it time to complete
          setTimeout(() => {
            this.addResult('CLI Tester Started', true, 'Task sent successfully');
            resolve();
          }, 120000); // 2 minutes for task completion
        }

        // Log output for debugging
        process.stdout.write(output);
      });

      this.cliProcess.stderr?.on('data', (data) => {
        console.error(chalk.red(data.toString()));
      });

      this.cliProcess.on('error', (error) => {
        reject(error);
      });

      setTimeout(() => {
        reject(new Error('CLI Tester startup timeout'));
      }, 45000); // 45 second total timeout
    });
  }

  private async waitForFileCreation(): Promise<void> {
    console.log(chalk.yellow('\nWaiting for file creation...'));
    
    // Extract created file paths from captured events
    const createdFiles = this.fileOperations
      .filter(op => op.includes('File write:') || op.includes('completed:'))
      .map(op => {
        const match = op.match(/(?:File write:|completed:)\s*(.+?)(?:\s|$)/);
        return match ? match[1].trim() : null;
      })
      .filter(Boolean);

    if (createdFiles.length === 0) {
      this.addResult('File Creation', false, 'No files were created');
      return;
    }

    // Find the directory containing the server files
    for (const file of createdFiles) {
      if (file && (file.includes('server') || file.includes('app') || file.includes('calculator'))) {
        this.testDir = path.dirname(file);
        break;
      }
    }

    if (!this.testDir) {
      // Try to find package.json
      for (const file of createdFiles) {
        if (file && file.includes('package.json')) {
          this.testDir = path.dirname(file);
          break;
        }
      }
    }

    this.addResult('File Creation', true, `Files created in: ${this.testDir || 'current directory'}`, { 
      fileCount: createdFiles.length,
      files: createdFiles 
    });
  }

  private async analyzeCreatedFiles(): Promise<void> {
    console.log(chalk.yellow('\nAnalyzing created files...'));

    try {
      const workDir = this.testDir || process.cwd();
      const files = await fs.readdir(workDir);
      
      const expectedFiles = {
        server: false,
        package: false,
        readme: false,
      };

      for (const file of files) {
        if (file.match(/server|app|calculator|index/i) && file.endsWith('.js')) {
          expectedFiles.server = true;
          
          // Check server content
          const content = await fs.readFile(path.join(workDir, file), 'utf-8');
          const hasExpress = content.includes('express');
          const hasEndpoints = content.includes('/add') || content.includes('/subtract');
          const hasErrorHandling = content.includes('division by zero') || content.includes('divide by zero');
          
          this.addResult('Server File Analysis', hasExpress && hasEndpoints, 
            hasExpress && hasEndpoints ? 'Server file contains Express and endpoints' : 'Server file missing required components',
            { hasExpress, hasEndpoints, hasErrorHandling }
          );
        }
        
        if (file === 'package.json') {
          expectedFiles.package = true;
          const content = await fs.readFile(path.join(workDir, file), 'utf-8');
          const pkg = JSON.parse(content);
          const hasExpress = pkg.dependencies?.express || pkg.devDependencies?.express;
          
          this.addResult('Package.json Analysis', hasExpress, 
            hasExpress ? 'package.json contains Express dependency' : 'Express dependency missing',
            { dependencies: pkg.dependencies }
          );
        }
        
        if (file.toLowerCase().includes('readme')) {
          expectedFiles.readme = true;
        }
      }

      this.addResult('File Structure', expectedFiles.server && expectedFiles.package,
        `Server: ${expectedFiles.server ? '✓' : '✗'}, Package: ${expectedFiles.package ? '✓' : '✗'}, README: ${expectedFiles.readme ? '✓' : '✗'}`
      );

    } catch (error: any) {
      this.addResult('File Analysis', false, error.message);
    }
  }

  private async startServer(): Promise<void> {
    console.log(chalk.yellow('\nStarting the calculator server...'));

    return new Promise(async (resolve, reject) => {
      try {
        const workDir = this.testDir || process.cwd();
        
        // Install dependencies first
        console.log(chalk.gray('Installing dependencies...'));
        const npmInstall = spawn('npm', ['install'], { cwd: workDir });
        
        await new Promise((res) => {
          npmInstall.on('close', (code) => {
            if (code !== 0) {
              this.addResult('Dependency Installation', false, `npm install failed with code ${code}`);
            } else {
              this.addResult('Dependency Installation', true, 'Dependencies installed successfully');
            }
            res(undefined);
          });
        });

        // Find the server file
        const files = await fs.readdir(workDir);
        const serverFile = files.find(f => 
          (f.match(/server|app|calculator|index/i) && f.endsWith('.js'))
        );

        if (!serverFile) {
          throw new Error('No server file found');
        }

        // Start the server
        this.serverProcess = spawn('node', [serverFile], { cwd: workDir });

        let serverStarted = false;
        this.serverProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          console.log(chalk.gray(`[Server] ${output}`));
          
          if (output.includes('listening') || output.includes('started') || output.includes('3000')) {
            serverStarted = true;
            this.addResult('Server Startup', true, 'Server started successfully');
            setTimeout(resolve, 1000); // Give it a moment to fully initialize
          }
        });

        this.serverProcess.stderr?.on('data', (data) => {
          console.error(chalk.red(`[Server Error] ${data.toString()}`));
        });

        // Timeout if server doesn't start
        setTimeout(() => {
          if (!serverStarted) {
            this.addResult('Server Startup', false, 'Server failed to start within timeout');
            resolve();
          }
        }, 10000);

      } catch (error: any) {
        this.addResult('Server Startup', false, error.message);
        resolve();
      }
    });
  }

  private async testAPIEndpoints(): Promise<void> {
    console.log(chalk.yellow('\nTesting API endpoints...'));

    const baseURL = 'http://localhost:3000';
    const tests = [
      { endpoint: '/add', data: { a: 5, b: 3 }, expected: 8, operation: 'Addition' },
      { endpoint: '/subtract', data: { a: 10, b: 4 }, expected: 6, operation: 'Subtraction' },
      { endpoint: '/multiply', data: { a: 6, b: 7 }, expected: 42, operation: 'Multiplication' },
      { endpoint: '/divide', data: { a: 20, b: 4 }, expected: 5, operation: 'Division' },
    ];

    for (const test of tests) {
      try {
        const response = await axios.post(`${baseURL}${test.endpoint}`, test.data, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        });

        const result = response.data.result ?? response.data.value ?? response.data.answer ?? response.data;
        const success = result === test.expected;

        this.addResult(`API Test: ${test.operation}`, success,
          success ? `Correct result: ${result}` : `Expected ${test.expected}, got ${result}`,
          { request: test.data, response: response.data }
        );
      } catch (error: any) {
        this.addResult(`API Test: ${test.operation}`, false, error.message);
      }
    }
  }

  private async testErrorHandling(): Promise<void> {
    console.log(chalk.yellow('\nTesting error handling...'));

    const baseURL = 'http://localhost:3000';
    const errorTests = [
      { 
        name: 'Division by Zero', 
        endpoint: '/divide', 
        data: { a: 10, b: 0 },
        shouldFail: true 
      },
      { 
        name: 'Missing Parameters', 
        endpoint: '/add', 
        data: { a: 5 },
        shouldFail: true 
      },
      { 
        name: 'Invalid Data Type', 
        endpoint: '/multiply', 
        data: { a: 'five', b: 3 },
        shouldFail: true 
      },
    ];

    for (const test of errorTests) {
      try {
        const response = await axios.post(`${baseURL}${test.endpoint}`, test.data, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
          validateStatus: () => true, // Don't throw on any status
        });

        const isError = response.status >= 400;
        const success = test.shouldFail ? isError : !isError;

        this.addResult(`Error Test: ${test.name}`, success,
          success ? 'Handled correctly' : 'Unexpected behavior',
          { status: response.status, data: response.data }
        );
      } catch (error: any) {
        // Network errors are OK for error tests
        this.addResult(`Error Test: ${test.name}`, test.shouldFail,
          test.shouldFail ? 'Server rejected invalid request' : error.message
        );
      }
    }
  }

  private async cleanup(): Promise<void> {
    console.log(chalk.yellow('\nCleaning up...'));

    // Stop the CLI tester
    if (this.cliProcess) {
      this.cliProcess.stdin?.write('exit\n');
      this.cliProcess.kill();
    }

    // Stop the server
    if (this.serverProcess) {
      this.serverProcess.kill();
    }

    // Note: Not removing created files so they can be inspected
    console.log(chalk.gray('Test files preserved for inspection'));
  }

  private addResult(step: string, success: boolean, message: string, details?: any): void {
    this.results.push({ step, success, message, details });
  }

  private printResults(): void {
    console.log(chalk.bold.blue('\n📊 Test Results Summary\n'));

    let passed = 0;
    let failed = 0;

    for (const result of this.results) {
      const icon = result.success ? chalk.green('✓') : chalk.red('✗');
      const stepName = chalk.bold(result.step);
      
      console.log(`${icon} ${stepName}: ${result.message}`);
      
      if (result.details && !result.success) {
        console.log(chalk.gray(JSON.stringify(result.details, null, 2)));
      }

      if (result.success) passed++;
      else failed++;
    }

    console.log(chalk.bold(`\nTotal: ${passed + failed} tests`));
    console.log(chalk.green(`Passed: ${passed}`));
    console.log(chalk.red(`Failed: ${failed}`));

    const overallSuccess = failed === 0;
    console.log(chalk.bold[overallSuccess ? 'green' : 'red'](
      `\n${overallSuccess ? '✅ All tests passed!' : '❌ Some tests failed'}`
    ));

    // Exit with appropriate code
    process.exit(overallSuccess ? 0 : 1);
  }
}

// Run the test
const test = new CalculatorServerTest();
test.runTest().catch(console.error);