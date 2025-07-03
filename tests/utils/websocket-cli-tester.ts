#!/usr/bin/env node

import WebSocket from 'ws';
import axios, { AxiosInstance } from 'axios';
import readline from 'readline';
import chalk from 'chalk';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

interface DevLMEvent {
  type: string;
  data: any;
}

interface FileOperation {
  path: string;
  operation: 'read' | 'write' | 'edit';
  timestamp: string;
  content?: string;
}

class WebSocketCLITester {
  private ws: WebSocket | null = null;
  private axios: AxiosInstance;
  private isAuthenticated = false;
  private rl: readline.Interface;
  private fileOperations: FileOperation[] = [];
  private currentTask: string = '';
  private isRunning = false;
  private wsAuthenticated = false;
  private logFilePath: string;

  constructor() {
    const jar = new CookieJar();
    this.axios = wrapper(axios.create({
      jar,
      withCredentials: true,
      baseURL: process.env.API_URL || 'http://localhost:5001',
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFilePath = `/tmp/agent-test-${timestamp}.log`;
    console.log(chalk.gray(`Log file: ${this.logFilePath}`));
    this.writeToLog('=== Agent Test Session Started ===', 'SESSION');
  }

  private writeToLog(message: string, category: string = 'INFO', data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      category,
      message,
      data: data || null
    };
    
    try {
      fs.appendFileSync(this.logFilePath, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    const prefix = {
      info: chalk.blue('[INFO]'),
      success: chalk.green('[SUCCESS]'),
      error: chalk.red('[ERROR]'),
      warning: chalk.yellow('[WARNING]'),
    };
    console.log(`${prefix[type]} ${message}`);
    this.writeToLog(message, type.toUpperCase());
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  async login(): Promise<boolean> {
    this.log('Welcome to Kona WebSocket CLI Tester', 'info');
    
    const email = await this.prompt('Email: ');
    const password = await this.prompt('Password: ');

    try {
      const response = await this.axios.post('/api/login', {
        email,
        password,
      });

      if (response.data) {
        this.isAuthenticated = true;
        this.log(`Logged in as ${response.data.email}`, 'success');
        return true;
      } else {
        this.log('Login failed', 'error');
        return false;
      }
    } catch (error: any) {
      this.log(`Login error: ${error.response?.data?.message || error.message}`, 'error');
      return false;
    }
  }

  async connectWebSocket(): Promise<void> {
    try {
      // Get WebSocket token
      this.log('Requesting WebSocket token...', 'info');
      const tokenResponse = await this.axios.post('/api/devlm/ws-token');
      const { token } = tokenResponse.data;
      this.log(`Received token: ${token.substring(0, 8)}...`, 'info');

      // Determine WebSocket URL
      const baseUrl = process.env.API_URL || 'http://localhost:5001';
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/devlm/ws';
      
      this.log(`Connecting to WebSocket at ${wsUrl}...`, 'info');

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.log('WebSocket connected, sending auth...', 'info');
        // Send authentication message
        this.ws!.send(JSON.stringify({ type: 'auth', token }));
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', (code, reason) => {
        this.log(`WebSocket disconnected: ${code} ${reason}`, 'warning');
        this.isRunning = false;
      });

      this.ws.on('error', (error) => {
        this.log(`WebSocket error: ${error.message}`, 'error');
      });

      // Wait for connection or timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        this.ws!.on('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.ws!.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error: any) {
      this.log(`Failed to connect: ${error.response?.data?.error || error.message}`, 'error');
      throw error;
    }
  }

  private handleMessage(message: string) {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'auth_success':
          this.log('WebSocket authenticated', 'success');
          this.wsAuthenticated = true;
          this.writeToLog('WebSocket authenticated successfully', 'AUTH_SUCCESS');
          break;

        case 'status':
          const statusMsg = data.payload?.message || data.message || 'Status update';
          this.log(statusMsg, 'info');
          this.writeToLog(statusMsg, 'STATUS', data);
          break;

        case 'warning':
          const warningMsg = data.payload?.message || data.message || 'Warning';
          this.log(warningMsg, 'warning');
          this.writeToLog(warningMsg, 'WARNING', data);
          break;

        case 'error':
          const errorMsg = data.payload?.message || data.message || data.error || 'Error';
          this.log(errorMsg, 'error');
          this.writeToLog(errorMsg, 'ERROR', data);
          if (data.type === 'error' && data.message?.includes('terminated')) {
            this.isRunning = false;
          }
          break;

        case 'stdout':
          const stdoutData = data.payload?.data || data.data || '';
          console.log(stdoutData);
          this.writeToLog('STDOUT output', 'STDOUT', { output: stdoutData });
          break;

        case 'stderr':
          const stderrData = data.payload?.data || data.data || '';
          console.error(chalk.red(stderrData));
          this.writeToLog('STDERR output', 'STDERR', { output: stderrData });
          break;

        case 'end':
          const exitCode = data.payload?.exitCode || data.code || 0;
          this.log(`Process ended with code ${exitCode}`, exitCode === 0 ? 'success' : 'error');
          this.writeToLog(`Process ended with exit code ${exitCode}`, 'PROCESS_END', { exitCode, success: exitCode === 0 });
          this.isRunning = false;
          break;

        // DevLM specific events
        case 'process_start':
          this.log(`DevLM process started`, 'info');
          this.writeToLog('DevLM process started', 'PROCESS_START', data);
          this.isRunning = true;
          break;

        case 'process_end':
          this.log(`DevLM process ended`, 'info');
          this.writeToLog('DevLM process ended', 'PROCESS_END', data);
          this.isRunning = false;
          break;

        case 'phase_change':
          const phase = data.payload?.phase || data.payload?.phaseName || data.phase || 'unknown';
          const details = data.payload?.details || '';
          this.log(`Phase: ${chalk.cyan(phase)}`, 'info');
          this.writeToLog(`Phase changed to: ${phase}`, 'PHASE_CHANGE', { phase, details, rawData: data });
          break;

        case 'llm_request_start':
          const provider = data.payload?.provider || data.provider || 'unknown';
          const model = data.payload?.model || data.model || 'unknown';
          this.log(`LLM Request: ${chalk.yellow(provider)} - ${model}`, 'info');
          this.writeToLog('LLM request started', 'LLM_REQUEST_START', { provider, model, rawData: data });
          const messages = data.payload?.messages || data.messages;
          if (messages) {
            console.log(chalk.gray('Messages:'), messages.length);
          }
          break;

        case 'llm_request_success':
          const tokens = data.payload?.usage?.total_tokens || data.usage?.total_tokens || 0;
          this.log(`LLM Response received (${tokens} tokens)`, 'success');
          this.writeToLog('LLM request completed successfully', 'LLM_REQUEST_SUCCESS', { tokens, rawData: data });
          break;

        case 'llm_request_error':
          const error = data.payload?.error || data.error || 'Unknown error';
          this.log(`LLM Error: ${error}`, 'error');
          this.writeToLog('LLM request failed', 'LLM_REQUEST_ERROR', { error, rawData: data });
          break;

        case 'tool_execution_start':
          const toolName = data.payload?.tool_name || data.tool_name || 'unknown';
          this.log(`Tool: ${chalk.magenta(toolName)}`, 'info');
          this.writeToLog('Tool execution started', 'TOOL_START', { toolName, rawData: data });
          const parameters = data.payload?.parameters || data.parameters;
          if (parameters) {
            console.log(chalk.gray('Parameters:'), JSON.stringify(parameters, null, 2));
          }
          break;

        case 'tool_execution_result':
          this.log(`Tool Result: ${chalk.green('✓')}`, 'success');
          this.writeToLog('Tool execution completed', 'TOOL_RESULT', data);
          const result = data.payload?.result || data.result;
          if (result) {
            console.log(chalk.gray(JSON.stringify(result, null, 2)));
          }
          break;

        case 'file_operation_start':
          const path = data.payload?.path || data.payload?.filePath || data.path || 'unknown';
          const operation = data.payload?.operation || data.payload?.operationType || data.operation || 'unknown';
          const op = {
            path,
            operation,
            timestamp: new Date().toISOString(),
          };
          this.fileOperations.push(op);
          this.log(`File ${operation}: ${chalk.blue(path)}`, 'info');
          this.writeToLog('File operation started', 'FILE_OP_START', { path, operation, rawData: data });
          break;

        case 'file_operation_complete':
          const completePath = data.payload?.path || data.payload?.filePath || data.path || 'unknown';
          const completeOp = data.payload?.operation || data.payload?.operationType || 'unknown';
          this.log(`File operation completed: ${chalk.blue(completePath)}`, 'success');
          this.writeToLog('File operation completed', 'FILE_OP_COMPLETE', { path: completePath, operation: completeOp, rawData: data });
          break;

        case 'system_log':
          const systemMessage = data.payload?.message || data.message || 'System log';
          console.log(chalk.gray(`[SYSTEM] ${systemMessage}`));
          this.writeToLog('System log', 'SYSTEM_LOG', data);
          break;

        case 'waiting_for_approval':
          this.log('Waiting for approval...', 'warning');
          this.writeToLog('Waiting for approval', 'APPROVAL_REQUEST', data);
          this.handleApprovalRequest(data);
          break;

        case 'approval_response_received':
          this.log(`Approval: ${data.approved ? 'Approved' : 'Rejected'}`, 
                   data.approved ? 'success' : 'warning');
          this.writeToLog('Approval response received', 'APPROVAL_RESPONSE', data);
          break;

        default:
          console.log(chalk.gray(`[${data.type}]`), data);
          this.writeToLog(`Unknown event type: ${data.type}`, 'UNKNOWN_EVENT', data);
      }
    } catch (error) {
      console.error('Failed to parse message:', message);
    }
  }

  private async handleApprovalRequest(data: any) {
    console.log('\n' + chalk.yellow('=== APPROVAL REQUIRED ==='));
    console.log(data.message || 'The system is requesting approval to proceed.');
    
    const response = await this.prompt('Approve? (y/n): ');
    const approved = response.toLowerCase() === 'y';
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'stdin',
        data: approved ? 'y\n' : 'n\n'
      }));
    }
  }

  async sendTask(task: string, model?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('WebSocket not connected', 'error');
      return;
    }

    if (!this.wsAuthenticated) {
      this.log('WebSocket not authenticated', 'error');
      return;
    }

    if (this.isRunning) {
      this.log('A task is already running', 'warning');
      return;
    }

    this.currentTask = task;
    this.fileOperations = [];

    const runCommand = {
      type: 'run',
      payload: {
        task,
        model: model || 'gemini-2.0-flash-exp',
        mode: 'generate',
        noApproval: false,
        source: 'kona',
      },
    };

    this.log(`Sending task: ${chalk.cyan(task)}`, 'info');
    this.writeToLog('Task sent to agent', 'TASK_SENT', { task, model, command: runCommand });
    this.ws.send(JSON.stringify(runCommand));
  }

  async stopTask() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('WebSocket not connected', 'error');
      return;
    }

    if (!this.isRunning) {
      this.log('No task is running', 'warning');
      return;
    }

    this.log('Stopping current task...', 'warning');
    this.ws.send(JSON.stringify({ type: 'stop' }));
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }

  async showFileOperations() {
    if (this.fileOperations.length === 0) {
      this.log('No file operations recorded', 'info');
      return;
    }

    console.log('\n' + chalk.bold('File Operations:'));
    this.fileOperations.forEach((op, index) => {
      console.log(`${index + 1}. ${chalk.yellow(op.operation)} ${chalk.blue(op.path)} at ${op.timestamp}`);
    });
    this.writeToLog('File operations listed', 'FILE_OPERATIONS_SUMMARY', { operations: this.fileOperations });
  }

  async interactiveMode() {
    console.log('\n' + chalk.bold('Kona WebSocket CLI Tester - Interactive Mode'));
    console.log(chalk.gray('Commands: task <message>, stop, files, exit'));

    while (true) {
      const input = await this.prompt('\n> ');
      const [command, ...args] = input.trim().split(' ');

      switch (command.toLowerCase()) {
        case 'task':
          const taskMessage = args.join(' ');
          if (taskMessage) {
            await this.sendTask(taskMessage);
          } else {
            this.log('Please provide a task message', 'error');
          }
          break;

        case 'stop':
          await this.stopTask();
          break;

        case 'files':
          await this.showFileOperations();
          break;

        case 'exit':
        case 'quit':
          this.log('Goodbye!', 'info');
          if (this.ws) {
            this.ws.close();
          }
          this.rl.close();
          process.exit(0);

        case 'help':
          console.log(chalk.bold('\nAvailable commands:'));
          console.log('  task <message>  - Send a DevLM task');
          console.log('  stop           - Stop the current task');
          console.log('  files          - Show file operations');
          console.log('  exit/quit      - Exit the program');
          break;

        default:
          if (command) {
            this.log(`Unknown command: ${command}. Type 'help' for available commands.`, 'warning');
          }
      }
    }
  }

  async run() {
    try {
      // Login
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        this.log('Failed to login. Exiting.', 'error');
        process.exit(1);
      }

      // Connect WebSocket
      await this.connectWebSocket();

      // Wait a moment for authentication
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start interactive mode
      await this.interactiveMode();

    } catch (error: any) {
      this.log(`Fatal error: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Run the CLI tester
const tester = new WebSocketCLITester();
tester.run().catch(console.error);