import { Router, Request, Response } from 'express';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { randomBytes } from 'crypto';
import { WebSocket } from 'ws';
import fs from 'fs/promises';

export const agentRouter = Router();

// Store active agent executions
interface AgentExecution {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  task: string;
  startTime: Date;
  endTime?: Date;
  output: string[];
  files: string[];
  error?: string;
  child?: ChildProcessWithoutNullStreams;
}

const activeExecutions = new Map<string, AgentExecution>();

// Agent execution endpoint
agentRouter.post('/execute', async (req: Request, res: Response) => {
  try {
    const { 
      task, 
      timeout = 300000, // 5 minutes default
      project_path = './test-output',
      options = {} 
    } = req.body;

    if (!task || typeof task !== 'string') {
      return res.status(400).json({ 
        error: 'Task description is required and must be a string' 
      });
    }

    // Generate unique execution ID
    const executionId = `exec_${randomBytes(8).toString('hex')}`;
    
    // Create execution record
    const execution: AgentExecution = {
      id: executionId,
      status: 'running',
      task,
      startTime: new Date(),
      output: [],
      files: []
    };

    activeExecutions.set(executionId, execution);

    // Start the devlm process asynchronously
    executeAgentTask(execution, project_path, options, timeout);

    res.json({
      execution_id: executionId,
      status: 'started',
      message: 'Task execution initiated'
    });

  } catch (error) {
    console.error('Agent execution error:', error);
    res.status(500).json({ 
      error: 'Failed to start agent execution',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get execution status
agentRouter.get('/status/:executionId', (req: Request, res: Response) => {
  const { executionId } = req.params;
  const execution = activeExecutions.get(executionId);

  if (!execution) {
    return res.status(404).json({ error: 'Execution not found' });
  }

  res.json({
    execution_id: executionId,
    status: execution.status,
    task: execution.task,
    start_time: execution.startTime,
    end_time: execution.endTime,
    output: execution.output,
    files: execution.files,
    error: execution.error
  });
});

// Get all executions (for debugging)
agentRouter.get('/executions', (req: Request, res: Response) => {
  const executions = Array.from(activeExecutions.values()).map(exec => ({
    execution_id: exec.id,
    status: exec.status,
    task: exec.task.substring(0, 100) + (exec.task.length > 100 ? '...' : ''),
    start_time: exec.startTime,
    end_time: exec.endTime
  }));

  res.json({ executions });
});

// Stop execution
agentRouter.post('/stop/:executionId', (req: Request, res: Response) => {
  const { executionId } = req.params;
  const execution = activeExecutions.get(executionId);

  if (!execution) {
    return res.status(404).json({ error: 'Execution not found' });
  }

  if (execution.child && execution.status === 'running') {
    execution.child.kill('SIGTERM');
    execution.status = 'failed';
    execution.endTime = new Date();
    execution.error = 'Execution stopped by user';
  }

  res.json({
    execution_id: executionId,
    status: execution.status,
    message: 'Execution stopped'
  });
});

async function executeAgentTask(
  execution: AgentExecution, 
  projectPath: string, 
  options: any, 
  timeout: number
) {
  try {
    // Create project directory if it doesn't exist
    await fs.mkdir(projectPath, { recursive: true });

    // Construct devlm command
    const scriptPath = path.resolve('./devlm/bootstrap.py');
    const args: string[] = [
      '--task', execution.task,
      '--mode', options.mode || 'test',
      '--model', options.model || 'claude',
      '--source', options.source || 'kona',
      '--project-path', projectPath,
      '--write-mode', options.write_mode || 'create'
    ];

    if (options.no_approval || true) args.push('--no-approval');
    if (options.debug_prompt) args.push('--debug-prompt');
    if (options.frontend) args.push('--frontend');

    console.log(`[Agent API] Starting execution ${execution.id}: python3 -u ${scriptPath} ${args.join(' ')}`);

    // Set up environment for DevLM mode enforcement
    const env = { ...process.env };
    env['WEBSOCKET_CONTEXT'] = 'true';
    env['PARENT_PROCESS'] = 'kona-agent-api';

    // Start the process
    const child = spawn('python3', ['-u', scriptPath, ...args], {
      cwd: path.resolve('.'),
      env: env
    });

    execution.child = child;

    // Set timeout
    const timeoutId = setTimeout(() => {
      if (execution.status === 'running') {
        child.kill('SIGTERM');
        execution.status = 'timeout';
        execution.endTime = new Date();
        execution.error = `Execution timed out after ${timeout}ms`;
        console.log(`[Agent API] Execution ${execution.id} timed out`);
      }
    }, timeout);

    // Handle stdout
    child.stdout.on('data', (data) => {
      const output = data.toString();
      execution.output.push(...output.split('\n').filter((line: string) => line.trim()));
      
      // Track file operations
      if (output.includes('[FILE]') && output.includes('CREATE')) {
        const match = output.match(/(?:CREATE|MODIFY|EDIT).*?([^\s]+\.(js|ts|py|json|md|txt|html|css))/i);
        if (match && match[1]) {
          execution.files.push(match[1]);
        }
      }
    });

    // Handle stderr
    child.stderr.on('data', (data) => {
      const error = data.toString();
      execution.output.push(`[ERROR] ${error}`);
    });

    // Handle process completion
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (execution.status === 'running') {
        execution.status = code === 0 ? 'completed' : 'failed';
        execution.endTime = new Date();
        
        if (code !== 0) {
          execution.error = `Process exited with code ${code}`;
        }
      }
      
      console.log(`[Agent API] Execution ${execution.id} finished with status: ${execution.status}`);
    });

    // Handle process errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.error = `Process error: ${error.message}`;
      console.error(`[Agent API] Execution ${execution.id} error:`, error);
    });

  } catch (error) {
    execution.status = 'failed';
    execution.endTime = new Date();
    execution.error = `Setup error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`[Agent API] Execution ${execution.id} setup error:`, error);
  }
}

export function registerAgentAPI(app: any) {
  app.use('/api/agent', agentRouter);
}