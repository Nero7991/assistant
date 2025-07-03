#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface LogEntry {
  timestamp: string;
  category: string;
  message: string;
  data?: any;
}

class AgentProgressMonitor {
  private logFilePath: string;
  private lastPosition = 0;
  private monitorInterval: NodeJS.Timeout | null = null;
  private summary = {
    started: false,
    authenticated: false,
    taskSent: false,
    currentPhase: 'unknown',
    llmRequests: 0,
    fileOperations: 0,
    errors: 0,
    warnings: 0,
    lastActivity: '',
    finished: false,
    success: false,
  };

  constructor(logFilePath: string) {
    this.logFilePath = logFilePath;
  }

  start() {
    console.log(chalk.bold.blue('🔍 Agent Progress Monitor Started'));
    console.log(chalk.gray(`Monitoring: ${this.logFilePath}`));
    console.log(chalk.gray('Checking every 30 seconds...\n'));

    // Initial check
    this.checkProgress();

    // Set up monitoring interval
    this.monitorInterval = setInterval(() => {
      this.checkProgress();
    }, 30000); // 30 seconds
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    console.log(chalk.yellow('\n🛑 Monitoring stopped'));
  }

  private checkProgress() {
    try {
      if (!fs.existsSync(this.logFilePath)) {
        console.log(chalk.red('❌ Log file not found yet...'));
        return;
      }

      const stats = fs.statSync(this.logFilePath);
      if (stats.size <= this.lastPosition) {
        console.log(chalk.gray('⏸️  No new activity...'));
        return;
      }

      // Read new content
      const fd = fs.openSync(this.logFilePath, 'r');
      const buffer = Buffer.alloc(stats.size - this.lastPosition);
      fs.readSync(fd, buffer, 0, buffer.length, this.lastPosition);
      fs.closeSync(fd);

      const newContent = buffer.toString();
      this.lastPosition = stats.size;

      // Process new log entries
      const lines = newContent.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const entry: LogEntry = JSON.parse(line);
          this.processLogEntry(entry);
        } catch (error) {
          // Skip invalid JSON lines
        }
      }

      this.displaySummary();

    } catch (error) {
      console.error(chalk.red('Error reading log file:'), error);
    }
  }

  private processLogEntry(entry: LogEntry) {
    this.summary.lastActivity = entry.timestamp;

    switch (entry.category) {
      case 'SESSION':
        this.summary.started = true;
        break;
        
      case 'AUTH_SUCCESS':
        this.summary.authenticated = true;
        break;
        
      case 'TASK_SENT':
        this.summary.taskSent = true;
        break;
        
      case 'PHASE_CHANGE':
        this.summary.currentPhase = entry.data?.phase || 'unknown';
        break;
        
      case 'LLM_REQUEST_START':
        this.summary.llmRequests++;
        break;
        
      case 'FILE_OP_START':
      case 'FILE_OP_COMPLETE':
        this.summary.fileOperations++;
        break;
        
      case 'ERROR':
        this.summary.errors++;
        break;
        
      case 'WARNING':
        this.summary.warnings++;
        break;
        
      case 'PROCESS_END':
        if (entry.data?.success) {
          this.summary.finished = true;
          this.summary.success = true;
        } else {
          this.summary.finished = true;
          this.summary.success = false;
        }
        break;
    }
  }

  private displaySummary() {
    console.clear();
    console.log(chalk.bold.blue('🔍 Agent Progress Monitor'));
    console.log(chalk.gray(`Last updated: ${new Date().toLocaleTimeString()}`));
    console.log(chalk.gray(`Log file: ${path.basename(this.logFilePath)}\n`));

    // Status indicators
    const getStatus = (condition: boolean) => condition ? chalk.green('✓') : chalk.red('✗');
    
    console.log(chalk.bold('📊 Current Status:'));
    console.log(`${getStatus(this.summary.started)} Session Started`);
    console.log(`${getStatus(this.summary.authenticated)} WebSocket Authenticated`);
    console.log(`${getStatus(this.summary.taskSent)} Task Sent to Agent`);
    
    if (this.summary.finished) {
      const finishIcon = this.summary.success ? chalk.green('✅') : chalk.red('❌');
      console.log(`${finishIcon} Process Finished (${this.summary.success ? 'Success' : 'Failed'})`);
    }
    
    console.log('');

    // Current activity
    console.log(chalk.bold('🔄 Current Activity:'));
    console.log(`Phase: ${chalk.cyan(this.summary.currentPhase)}`);
    console.log(`LLM Requests: ${chalk.yellow(this.summary.llmRequests)}`);
    console.log(`File Operations: ${chalk.blue(this.summary.fileOperations)}`);
    
    if (this.summary.errors > 0) {
      console.log(`Errors: ${chalk.red(this.summary.errors)}`);
    }
    if (this.summary.warnings > 0) {
      console.log(`Warnings: ${chalk.yellow(this.summary.warnings)}`);
    }
    
    console.log('');

    // Recent activity
    if (this.summary.lastActivity) {
      const lastTime = new Date(this.summary.lastActivity);
      const timeSince = Math.floor((Date.now() - lastTime.getTime()) / 1000);
      console.log(chalk.bold('⏰ Last Activity:'));
      console.log(`${timeSince}s ago (${lastTime.toLocaleTimeString()})`);
    }
    
    console.log('');
    console.log(chalk.gray('Press Ctrl+C to stop monitoring...'));

    // Auto-stop if finished
    if (this.summary.finished) {
      console.log(chalk.bold.green('\n🎉 Agent task completed!'));
      setTimeout(() => {
        this.stop();
        this.showFinalSummary();
        process.exit(0);
      }, 5000);
    }
  }

  private showFinalSummary() {
    console.log(chalk.bold.blue('\n📋 Final Summary:'));
    console.log('==========================================');
    console.log(`Status: ${this.summary.success ? chalk.green('SUCCESS') : chalk.red('FAILED')}`);
    console.log(`Total LLM Requests: ${this.summary.llmRequests}`);
    console.log(`Total File Operations: ${this.summary.fileOperations}`);
    console.log(`Errors: ${this.summary.errors}`);
    console.log(`Warnings: ${this.summary.warnings}`);
    console.log(`Log file: ${this.logFilePath}`);
    
    // Show file operations summary
    this.showCreatedFiles();
  }

  private showCreatedFiles() {
    try {
      const content = fs.readFileSync(this.logFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      const fileOps = new Set<string>();
      
      for (const line of lines) {
        try {
          const entry: LogEntry = JSON.parse(line);
          if (entry.category === 'FILE_OP_START' && entry.data?.path) {
            fileOps.add(entry.data.path);
          }
        } catch (error) {
          // Skip invalid entries
        }
      }
      
      if (fileOps.size > 0) {
        console.log(chalk.bold.blue('\n📁 Files Created/Modified:'));
        Array.from(fileOps).forEach(file => {
          console.log(`  ${chalk.blue(file)}`);
        });
      }
    } catch (error) {
      console.log(chalk.red('Could not analyze created files'));
    }
  }
}

// CLI usage
if (require.main === module) {
  const logFilePath = process.argv[2];
  
  if (!logFilePath) {
    console.error(chalk.red('Usage: npx tsx monitor-agent-progress.ts <log-file-path>'));
    process.exit(1);
  }
  
  const monitor = new AgentProgressMonitor(logFilePath);
  
  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });
  
  monitor.start();
}

export { AgentProgressMonitor };