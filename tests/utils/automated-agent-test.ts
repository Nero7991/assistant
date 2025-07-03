#!/usr/bin/env node

import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';
import * as fs from 'fs';
import { AgentProgressMonitor } from './monitor-agent-progress';

class AutomatedAgentTest {
  private cliProcess: ChildProcess | null = null;
  private monitor: AgentProgressMonitor | null = null;
  private logFilePath: string = '';
  private testStartTime: Date = new Date();

  async runCalculatorTest(): Promise<void> {
    console.log(chalk.bold.blue('🧪 Automated Calculator Web Server Agent Test\n'));
    console.log(chalk.yellow('This test will:'));
    console.log('1. Start WebSocket CLI tester');
    console.log('2. Automatically login and send calculator task');
    console.log('3. Monitor progress in real-time');
    console.log('4. Report results when complete\n');

    try {
      await this.startCLITester();
      await this.waitForCompletion();
    } catch (error) {
      console.error(chalk.red('Test failed:'), error);
      process.exit(1);
    } finally {
      this.cleanup();
    }
  }

  private async startCLITester(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(chalk.yellow('Starting WebSocket CLI Tester...'));

      this.cliProcess = spawn('npx', ['tsx', 'websocket-cli-tester.ts'], {
        cwd: __dirname,
        env: { ...process.env, API_URL: 'http://localhost:5001' },
      });

      let authenticated = false;
      let taskSent = false;
      let logFileFound = false;

      this.cliProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        
        // Extract log file path from CLI tester
        if (!logFileFound) {
          const logMatch = output.match(/agent-test-([^.]+)\.log/);
          if (logMatch) {
            this.logFilePath = `/tmp/agent-test-${logMatch[1]}.log`;
            logFileFound = true;
            console.log(chalk.green(`Log file: ${this.logFilePath}`));
            
            // Start monitoring
            setTimeout(() => {
              this.monitor = new AgentProgressMonitor(this.logFilePath);
              this.monitor.start();
            }, 2000);
          }
        }
        
        // Auto-respond to prompts
        if (!authenticated && output.includes('Email:')) {
          this.cliProcess!.stdin?.write('testuser@example.com\n');
        } else if (!authenticated && output.includes('Password:')) {
          this.cliProcess!.stdin?.write('testpass123\n');
        } else if (output.includes('WebSocket authenticated')) {
          authenticated = true;
          console.log(chalk.green('✓ Authentication successful'));
        } else if (authenticated && !taskSent && output.includes('Commands: task')) {
          // Send the calculator task
          console.log(chalk.green('✓ Sending calculator web server task...'));
          this.cliProcess!.stdin?.write('task create a calculator web server with Express that supports basic operations (add, subtract, multiply, divide) via REST API endpoints. Include error handling for division by zero.\n');
          taskSent = true;
          resolve();
        }

        // Log all output for debugging
        process.stdout.write(output);
      });

      this.cliProcess.stderr?.on('data', (data) => {
        console.error(chalk.red(data.toString()));
      });

      this.cliProcess.on('error', (error) => {
        reject(error);
      });

      // Timeout if setup takes too long
      setTimeout(() => {
        if (!taskSent) {
          reject(new Error('CLI Tester setup timeout'));
        }
      }, 60000); // 1 minute timeout for setup
    });
  }

  private async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      console.log(chalk.yellow('\n⏳ Waiting for agent to complete the task...'));
      console.log(chalk.gray('The monitor will show progress every 30 seconds.\n'));

      // Check completion every 30 seconds
      const checkInterval = setInterval(() => {
        if (this.logFilePath && fs.existsSync(this.logFilePath)) {
          const content = fs.readFileSync(this.logFilePath, 'utf-8');
          
          // Check if process is finished
          if (content.includes('"category":"PROCESS_END"')) {
            clearInterval(checkInterval);
            setTimeout(() => {
              this.showResults();
              resolve();
            }, 5000); // Give monitor time to show final summary
          }
          
          // Check for early termination
          const lines = content.split('\n');
          const errorCount = lines.filter(line => 
            line.includes('"category":"ERROR"') || 
            line.includes('"category":"LLM_REQUEST_ERROR"')
          ).length;
          
          if (errorCount > 5) { // Too many errors
            console.log(chalk.red('\n❌ Too many errors detected, stopping test...'));
            clearInterval(checkInterval);
            this.showResults();
            resolve();
          }
        }
      }, 30000);

      // Maximum test duration: 20 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        console.log(chalk.yellow('\n⏰ Test timeout reached (20 minutes)'));
        this.showResults();
        resolve();
      }, 20 * 60 * 1000);
    });
  }

  private showResults(): void {
    console.log(chalk.bold.blue('\n📊 Test Results Summary'));
    console.log('==========================================');
    
    const testDuration = Date.now() - this.testStartTime.getTime();
    const minutes = Math.floor(testDuration / 60000);
    const seconds = Math.floor((testDuration % 60000) / 1000);
    
    console.log(`Test Duration: ${minutes}m ${seconds}s`);
    
    if (this.logFilePath && fs.existsSync(this.logFilePath)) {
      try {
        const content = fs.readFileSync(this.logFilePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        // Analyze results
        let llmRequests = 0;
        let fileOperations = 0;
        let errors = 0;
        let success = false;
        const createdFiles = new Set<string>();
        
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            switch (entry.category) {
              case 'LLM_REQUEST_START':
                llmRequests++;
                break;
              case 'FILE_OP_START':
                fileOperations++;
                if (entry.data?.path) createdFiles.add(entry.data.path);
                break;
              case 'ERROR':
                errors++;
                break;
              case 'PROCESS_END':
                success = entry.data?.success || false;
                break;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
        
        // Display metrics
        console.log(`Status: ${success ? chalk.green('SUCCESS') : chalk.red('FAILED')}`);
        console.log(`LLM Requests: ${llmRequests}`);
        console.log(`File Operations: ${fileOperations}`);
        console.log(`Errors: ${errors}`);
        console.log(`Log File: ${this.logFilePath}`);
        
        if (createdFiles.size > 0) {
          console.log(chalk.bold.blue('\n📁 Files Created:'));
          Array.from(createdFiles).forEach(file => {
            console.log(`  ${chalk.blue(file)}`);
          });
        }
        
        // Test specific validation
        this.validateCalculatorServer(Array.from(createdFiles));
        
      } catch (error) {
        console.error(chalk.red('Error analyzing results:'), error);
      }
    } else {
      console.log(chalk.red('No log file found - test may have failed early'));
    }
  }

  private validateCalculatorServer(files: string[]): void {
    console.log(chalk.bold.blue('\n🧮 Calculator Server Validation:'));
    
    const hasServerFile = files.some(f => 
      f.includes('server') || f.includes('app') || f.includes('calculator')
    );
    const hasPackageJson = files.some(f => f.includes('package.json'));
    
    console.log(`${hasServerFile ? '✅' : '❌'} Server file created`);
    console.log(`${hasPackageJson ? '✅' : '❌'} Package.json created`);
    
    // Check file contents if possible
    for (const file of files) {
      if (file.includes('.js') && (file.includes('server') || file.includes('app'))) {
        this.checkServerFileContent(file);
        break;
      }
    }
  }

  private checkServerFileContent(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        const hasExpress = content.includes('express');
        const hasAddEndpoint = content.includes('/add') || content.includes('add');
        const hasSubtractEndpoint = content.includes('/subtract') || content.includes('subtract');
        const hasMultiplyEndpoint = content.includes('/multiply') || content.includes('multiply');
        const hasDivideEndpoint = content.includes('/divide') || content.includes('divide');
        const hasDivisionByZeroCheck = content.includes('zero') || content.includes('0');
        
        console.log(`${hasExpress ? '✅' : '❌'} Express framework used`);
        console.log(`${hasAddEndpoint ? '✅' : '❌'} Add endpoint implemented`);
        console.log(`${hasSubtractEndpoint ? '✅' : '❌'} Subtract endpoint implemented`);
        console.log(`${hasMultiplyEndpoint ? '✅' : '❌'} Multiply endpoint implemented`);
        console.log(`${hasDivideEndpoint ? '✅' : '❌'} Divide endpoint implemented`);
        console.log(`${hasDivisionByZeroCheck ? '✅' : '❌'} Division by zero handling present`);
        
      } else {
        console.log(chalk.red(`❌ Server file not found: ${filePath}`));
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error reading server file: ${error}`));
    }
  }

  private cleanup(): void {
    if (this.monitor) {
      this.monitor.stop();
    }
    
    if (this.cliProcess) {
      this.cliProcess.stdin?.write('exit\n');
      this.cliProcess.kill();
    }
  }
}

// CLI usage
if (require.main === module) {
  const test = new AutomatedAgentTest();
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n🛑 Test interrupted by user'));
    process.exit(0);
  });
  
  test.runCalculatorTest().catch(console.error);
}