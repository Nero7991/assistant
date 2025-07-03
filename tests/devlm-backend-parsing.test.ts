/**
 * Tests for DevLM backend event parsing functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock WebSocket and child_process for testing
class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  pid = 12345;

  kill() {
    this.killed = true;
    this.emit('close', 0);
  }
}

class MockWebSocket extends EventEmitter {
  readyState = 1; // OPEN
  
  send(data: string) {
    this.emit('mockSend', data);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }
}

describe('DevLM Backend Event Parsing', () => {
  let mockChild: MockChildProcess;
  let mockWs: MockWebSocket;
  let sentMessages: any[];

  beforeEach(() => {
    mockChild = new MockChildProcess();
    mockWs = new MockWebSocket();
    sentMessages = [];

    // Mock the sendMessage function
    const sendMessage = vi.fn((type: string, payload: any) => {
      sentMessages.push({ type, payload });
    });

    // Set up WebSocket message capture
    mockWs.on('mockSend', (data: string) => {
      const parsed = JSON.parse(data);
      sentMessages.push(parsed);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('WebSocket Event Parsing', () => {
    it('should parse and forward WebSocket events from stdout', () => {
      const sendMessage = vi.fn();
      
      // Simulate the stdout handler with event parsing
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            try {
              const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
              const event = JSON.parse(eventJson);
              sendMessage(event.type, event.payload);
            } catch (err) {
              sendMessage('stdout', { data: line + '\n' });
            }
          } else if (line.trim() !== '') {
            sendMessage('stdout', { data: line + '\n' });
          }
        }
      };

      // Test process start event
      const processStartEvent = {
        type: "process_start",
        payload: {
          taskId: "test-task-123",
          taskDescription: "Test task",
          configuration: { mode: "test" }
        },
        timestamp: new Date().toISOString()
      };

      const eventLine = `WEBSOCKET_EVENT:${JSON.stringify(processStartEvent)}`;
      handleStdout(Buffer.from(eventLine));

      expect(sendMessage).toHaveBeenCalledWith('process_start', processStartEvent.payload);
    });

    it('should handle LLM request events', () => {
      const sendMessage = vi.fn();
      
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
            const event = JSON.parse(eventJson);
            sendMessage(event.type, event.payload);
          }
        }
      };

      // Test LLM request start
      const llmStartEvent = {
        type: "llm_request_start",
        payload: {
          requestId: "req-123",
          model: "claude-3-5-sonnet",
          promptSummary: "Test prompt..."
        }
      };

      const eventLine = `WEBSOCKET_EVENT:${JSON.stringify(llmStartEvent)}`;
      handleStdout(Buffer.from(eventLine));

      expect(sendMessage).toHaveBeenCalledWith('llm_request_start', llmStartEvent.payload);
    });

    it('should handle tool execution events', () => {
      const sendMessage = vi.fn();
      
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
            const event = JSON.parse(eventJson);
            sendMessage(event.type, event.payload);
          }
        }
      };

      // Test tool execution start
      const toolStartEvent = {
        type: "tool_execution_start",
        payload: {
          toolExecutionId: "tool-123",
          toolName: "execute_command",
          toolArgs: { command: "ls -la" },
          explanation: "Listing files"
        }
      };

      const eventLine = `WEBSOCKET_EVENT:${JSON.stringify(toolStartEvent)}`;
      handleStdout(Buffer.from(eventLine));

      expect(sendMessage).toHaveBeenCalledWith('tool_execution_start', toolStartEvent.payload);
    });

    it('should handle file operation events', () => {
      const sendMessage = vi.fn();
      
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
            const event = JSON.parse(eventJson);
            sendMessage(event.type, event.payload);
          }
        }
      };

      // Test file operation complete
      const fileOpEvent = {
        type: "file_operation_complete",
        payload: {
          operationId: "op-123",
          operationType: "write",
          success: true,
          filePath: "/path/to/file.txt",
          details: "File written successfully"
        }
      };

      const eventLine = `WEBSOCKET_EVENT:${JSON.stringify(fileOpEvent)}`;
      handleStdout(Buffer.from(eventLine));

      expect(sendMessage).toHaveBeenCalledWith('file_operation_complete', fileOpEvent.payload);
    });

    it('should handle approval workflow events', () => {
      const sendMessage = vi.fn();
      
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
            const event = JSON.parse(eventJson);
            sendMessage(event.type, event.payload);
          }
        }
      };

      // Test waiting for approval
      const approvalEvent = {
        type: "waiting_for_approval",
        payload: {
          approvalId: "approval-123",
          actionDescription: "Execute command",
          proposedCommand: "rm file.txt"
        }
      };

      const eventLine = `WEBSOCKET_EVENT:${JSON.stringify(approvalEvent)}`;
      handleStdout(Buffer.from(eventLine));

      expect(sendMessage).toHaveBeenCalledWith('waiting_for_approval', approvalEvent.payload);
    });

    it('should handle malformed JSON gracefully', () => {
      const sendMessage = vi.fn();
      
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            try {
              const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
              const event = JSON.parse(eventJson);
              sendMessage(event.type, event.payload);
            } catch (err) {
              sendMessage('stdout', { data: line + '\n' });
            }
          }
        }
      };

      const malformedEventLine = 'WEBSOCKET_EVENT:{"invalid":"json"';
      handleStdout(Buffer.from(malformedEventLine));

      expect(sendMessage).toHaveBeenCalledWith('stdout', { data: malformedEventLine + '\n' });
    });

    it('should handle mixed output with events and regular stdout', () => {
      const sendMessage = vi.fn();
      
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            try {
              const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
              const event = JSON.parse(eventJson);
              sendMessage(event.type, event.payload);
            } catch (err) {
              sendMessage('stdout', { data: line + '\n' });
            }
          } else if (line.trim() !== '') {
            sendMessage('stdout', { data: line + '\n' });
          }
        }
      };

      const mixedOutput = `Regular stdout line
WEBSOCKET_EVENT:{"type":"system_log","payload":{"level":"info","message":"Test message"}}
Another stdout line`;

      handleStdout(Buffer.from(mixedOutput));

      expect(sendMessage).toHaveBeenCalledTimes(3);
      expect(sendMessage).toHaveBeenNthCalledWith(1, 'stdout', { data: 'Regular stdout line\n' });
      expect(sendMessage).toHaveBeenNthCalledWith(2, 'system_log', { level: 'info', message: 'Test message' });
      expect(sendMessage).toHaveBeenNthCalledWith(3, 'stdout', { data: 'Another stdout line\n' });
    });

    it('should handle system log events with different levels', () => {
      const sendMessage = vi.fn();
      
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
            const event = JSON.parse(eventJson);
            sendMessage(event.type, event.payload);
          }
        }
      };

      const events = [
        { level: 'info', message: 'Info message' },
        { level: 'warn', message: 'Warning message' },
        { level: 'error', message: 'Error message' },
        { level: 'debug', message: 'Debug message' }
      ];

      events.forEach(({ level, message }) => {
        const event = {
          type: "system_log",
          payload: { level, message, timestamp: new Date().toISOString() }
        };
        const eventLine = `WEBSOCKET_EVENT:${JSON.stringify(event)}`;
        handleStdout(Buffer.from(eventLine));
      });

      expect(sendMessage).toHaveBeenCalledTimes(4);
      events.forEach(({ level, message }, index) => {
        expect(sendMessage).toHaveBeenNthCalledWith(index + 1, 'system_log', 
          expect.objectContaining({ level, message }));
      });
    });

    it('should handle phase change events', () => {
      const sendMessage = vi.fn();
      
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
            const event = JSON.parse(eventJson);
            sendMessage(event.type, event.payload);
          }
        }
      };

      const phaseEvent = {
        type: "phase_change",
        payload: {
          phaseName: "Generating Code",
          details: "Creating new files based on requirements"
        }
      };

      const eventLine = `WEBSOCKET_EVENT:${JSON.stringify(phaseEvent)}`;
      handleStdout(Buffer.from(eventLine));

      expect(sendMessage).toHaveBeenCalledWith('phase_change', phaseEvent.payload);
    });

    it('should handle process end events', () => {
      const sendMessage = vi.fn();
      
      const handleStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
            const event = JSON.parse(eventJson);
            sendMessage(event.type, event.payload);
          }
        }
      };

      const processEndEvent = {
        type: "process_end",
        payload: {
          taskId: "test-task-123",
          status: "completed",
          message: "Process completed successfully",
          exitCode: 0,
          finalSummary: "All tasks completed"
        }
      };

      const eventLine = `WEBSOCKET_EVENT:${JSON.stringify(processEndEvent)}`;
      handleStdout(Buffer.from(eventLine));

      expect(sendMessage).toHaveBeenCalledWith('process_end', processEndEvent.payload);
    });
  });

  describe('SSE Event Handling', () => {
    it('should format events correctly for SSE', () => {
      const sendEvent = vi.fn();
      
      // Simulate SSE event handling
      const handleSseStdout = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            try {
              const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
              const event = JSON.parse(eventJson);
              // For SSE, we spread the payload into the event
              sendEvent({ type: event.type, ...event.payload });
            } catch (err) {
              sendEvent({ type: 'stdout', data: line + '\n' });
            }
          } else if (line.trim() !== '') {
            sendEvent({ type: 'stdout', data: line + '\n' });
          }
        }
      };

      const testEvent = {
        type: "llm_request_success",
        payload: {
          requestId: "req-123",
          model: "claude-3-5-sonnet",
          responseSummary: "Generated response"
        }
      };

      const eventLine = `WEBSOCKET_EVENT:${JSON.stringify(testEvent)}`;
      handleSseStdout(Buffer.from(eventLine));

      expect(sendEvent).toHaveBeenCalledWith({
        type: 'llm_request_success',
        ...testEvent.payload
      });
    });
  });
});