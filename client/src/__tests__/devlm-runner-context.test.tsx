/**
 * Tests for DevlmRunnerContext
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, renderHook, waitFor } from '@testing-library/react';
import { DevlmRunnerProvider, useDevlmRunner } from '@/context/devlm-runner-context';
import React from 'react';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static mockInstances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen?: (event: Event) => void;
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: Event) => void;
  onclose?: (event: CloseEvent) => void;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.mockInstances.push(this);
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  send(data: string) {
    // Store sent messages for testing
    (this as any).sentMessages = (this as any).sentMessages || [];
    (this as any).sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { wasClean: true }));
  }

  // Test helper methods
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { 
        data: JSON.stringify(data) 
      }));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  getSentMessages() {
    return (this as any).sentMessages || [];
  }

  static clearInstances() {
    MockWebSocket.mockInstances = [];
  }
}

// Mock fetch for auth token
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock WebSocket globally
(global as any).WebSocket = MockWebSocket;

describe('DevlmRunnerContext', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
    
    // Mock successful auth token fetch
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-token-123' })
    });

    // Mock location
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        host: 'localhost:3000',
        origin: 'http://localhost:3000'
      },
      writable: true
    });

    // Override global fetch with our mock
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
    MockWebSocket.clearInstances();
  });

  describe('Provider Setup', () => {
    it('should provide context values', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DevlmRunnerProvider>{children}</DevlmRunnerProvider>
      );

      const { result } = renderHook(() => useDevlmRunner(), { wrapper });

      expect(result.current).toMatchObject({
        output: [],
        isRunning: false,
        error: null,
        isConnected: false,
        startScript: expect.any(Function),
        stopScript: expect.any(Function),
        sendStdin: expect.any(Function),
      });
    });

    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = vi.fn();

      expect(() => {
        renderHook(() => useDevlmRunner());
      }).toThrow('useDevlmRunner must be used within a DevlmRunnerProvider');

      console.error = originalError;
    });
  });

  describe('WebSocket Connection', () => {
    it('should establish WebSocket connection when starting script', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DevlmRunnerProvider>{children}</DevlmRunnerProvider>
      );

      const { result } = renderHook(() => useDevlmRunner(), { wrapper });

      const params = {
        task: 'Test task',
        mode: 'test',
        model: 'claude',
        source: 'anthropic',
        projectPath: '.',
        writeMode: 'diff',
        debugPrompt: false,
        noApproval: false,
        frontend: false,
      };

      await act(async () => {
        await result.current.startScript(params);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/devlm/ws-token', { method: 'POST' });
      });
    });

    it('should handle auth token failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Auth failed' })
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DevlmRunnerProvider>{children}</DevlmRunnerProvider>
      );

      const { result } = renderHook(() => useDevlmRunner(), { wrapper });

      const params = {
        task: 'Test task',
        mode: 'test',
        model: 'claude',
        source: 'anthropic',
        projectPath: '.',
        writeMode: 'diff',
        debugPrompt: false,
        noApproval: false,
        frontend: false,
      };

      await act(async () => {
        await result.current.startScript(params);
      });

      await waitFor(() => {
        expect(result.current.error).toContain('Authentication setup failed');
        expect(result.current.isRunning).toBe(false);
      });
    });
  });

  describe('Event Handling', () => {
    let wrapper: ({ children }: { children: React.ReactNode }) => JSX.Element;
    let result: any;

    beforeEach(async () => {
      wrapper = ({ children }: { children: React.ReactNode }) => (
        <DevlmRunnerProvider>{children}</DevlmRunnerProvider>
      );

      const hookResult = renderHook(() => useDevlmRunner(), { wrapper });
      result = hookResult.result;

      // Start script to establish connection
      const params = {
        task: 'Test task',
        mode: 'test',
        model: 'claude',
        source: 'anthropic',
        projectPath: '.',
        writeMode: 'diff',
        debugPrompt: false,
        noApproval: false,
        frontend: false,
      };

      await act(async () => {
        await result.current.startScript(params);
      });

      // Wait for connection
      await waitFor(() => {
        expect(result.current.output.length).toBeGreaterThan(0);
      });
    });

    it('should handle process_start events', async () => {
      const processStartEvent = {
        type: 'process_start',
        payload: {
          taskDescription: 'Test task description',
          taskId: 'task-123'
        }
      };

      await act(async () => {
        // Simulate WebSocket message
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(processStartEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output).toContain('[PROCESS] Started: Test task description');
      });
    });

    it('should handle phase_change events', async () => {
      const phaseChangeEvent = {
        type: 'phase_change',
        payload: {
          phaseName: 'Initializing',
          details: 'Setting up environment'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(phaseChangeEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[PHASE] Initializing: Setting up environment')
        )).toBe(true);
      });
    });

    it('should handle llm_request_start events', async () => {
      const llmStartEvent = {
        type: 'llm_request_start',
        payload: {
          model: 'claude-3-5-sonnet',
          promptSummary: 'Test prompt summary...'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(llmStartEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[LLM] Starting request to claude-3-5-sonnet')
        )).toBe(true);
      });
    });

    it('should handle llm_request_error events', async () => {
      const llmErrorEvent = {
        type: 'llm_request_error',
        payload: {
          errorMessage: 'Rate limit exceeded'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(llmErrorEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[LLM ERROR] Rate limit exceeded')
        )).toBe(true);
        expect(result.current.error).toBe('LLM Error: Rate limit exceeded');
      });
    });

    it('should handle tool_execution_start events', async () => {
      const toolStartEvent = {
        type: 'tool_execution_start',
        payload: {
          toolName: 'execute_command',
          explanation: 'Running test command'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(toolStartEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[TOOL] Starting: execute_command - Running test command')
        )).toBe(true);
      });
    });

    it('should handle tool_execution_result events', async () => {
      const toolResultEvent = {
        type: 'tool_execution_result',
        payload: {
          toolName: 'execute_command',
          status: 'success',
          resultSummary: 'Command completed successfully'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(toolResultEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[TOOL SUCCESS] execute_command: Command completed successfully')
        )).toBe(true);
      });
    });

    it('should handle file_operation_start events', async () => {
      const fileOpStartEvent = {
        type: 'file_operation_start',
        payload: {
          operationType: 'read',
          filePath: '/path/to/file.txt'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(fileOpStartEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[FILE] read operation starting on /path/to/file.txt')
        )).toBe(true);
      });
    });

    it('should handle file_operation_complete events', async () => {
      const fileOpCompleteEvent = {
        type: 'file_operation_complete',
        payload: {
          operationType: 'write',
          success: true,
          details: 'File written successfully'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(fileOpCompleteEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[FILE SUCCESS] write: File written successfully')
        )).toBe(true);
      });
    });

    it('should handle system_log events', async () => {
      const systemLogEvent = {
        type: 'system_log',
        payload: {
          level: 'info',
          message: 'System initialized'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(systemLogEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[INFO] System initialized')
        )).toBe(true);
      });
    });

    it('should handle waiting_for_approval events', async () => {
      const approvalEvent = {
        type: 'waiting_for_approval',
        payload: {
          actionDescription: 'Execute dangerous command',
          proposedCommand: 'rm -rf /'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(approvalEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[APPROVAL REQUIRED] Execute dangerous command')
        )).toBe(true);
        expect(output.some((line: string) => 
          line.includes('[APPROVAL] Command: rm -rf /')
        )).toBe(true);
      });
    });

    it('should handle approval_response_received events', async () => {
      const approvalResponseEvent = {
        type: 'approval_response_received',
        payload: {
          approved: false,
          message: 'User denied the action'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(approvalResponseEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[APPROVAL DENIED] User denied the action')
        )).toBe(true);
      });
    });

    it('should handle process_end events', async () => {
      const processEndEvent = {
        type: 'process_end',
        payload: {
          status: 'completed',
          message: 'Process completed successfully'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(processEndEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[PROCESS] Ended: completed - Process completed successfully')
        )).toBe(true);
        expect(result.current.isRunning).toBe(false);
      });
    });

    it('should handle unknown events gracefully', async () => {
      const unknownEvent = {
        type: 'unknown_event_type',
        payload: {
          someData: 'test data'
        }
      };

      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws) {
          ws.simulateMessage(unknownEvent);
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[UNKNOWN EVENT] unknown_event_type')
        )).toBe(true);
      });
    });

    it('should handle malformed messages gracefully', async () => {
      await act(async () => {
        const ws = MockWebSocket.mockInstances[0];
        if (ws && ws.onmessage) {
          // Send malformed JSON
          ws.onmessage(new MessageEvent('message', { 
            data: 'invalid json{' 
          }));
        }
      });

      await waitFor(() => {
        const output = result.current.output;
        expect(output.some((line: string) => 
          line.includes('[ERROR] Received malformed data from server')
        )).toBe(true);
      });
    });
  });

  describe('Script Control', () => {
    it('should send stop command', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DevlmRunnerProvider>{children}</DevlmRunnerProvider>
      );

      const { result } = renderHook(() => useDevlmRunner(), { wrapper });

      // Start script first
      const params = {
        task: 'Test task',
        mode: 'test',
        model: 'claude',
        source: 'anthropic',
        projectPath: '.',
        writeMode: 'diff',
        debugPrompt: false,
        noApproval: false,
        frontend: false,
      };

      await act(async () => {
        await result.current.startScript(params);
      });

      // Wait for running state
      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Send stop command
      await act(async () => {
        result.current.stopScript();
      });

      // Should have sent stop message
      const ws = (global as any).WebSocket.mockInstances?.[0];
      if (ws) {
        const sentMessages = ws.getSentMessages();
        expect(sentMessages.some((msg: string) => 
          JSON.parse(msg).type === 'stop'
        )).toBe(true);
      }
    });

    it('should send stdin data', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <DevlmRunnerProvider>{children}</DevlmRunnerProvider>
      );

      const { result } = renderHook(() => useDevlmRunner(), { wrapper });

      // Start script first
      const params = {
        task: 'Test task',
        mode: 'test',
        model: 'claude',
        source: 'anthropic',
        projectPath: '.',
        writeMode: 'diff',
        debugPrompt: false,
        noApproval: false,
        frontend: false,
      };

      await act(async () => {
        await result.current.startScript(params);
      });

      // Wait for authentication
      await waitFor(() => {
        expect(result.current.isRunning).toBe(true);
      });

      // Send stdin
      await act(async () => {
        result.current.sendStdin('test input');
      });

      // Should have sent stdin message
      const ws = (global as any).WebSocket.mockInstances?.[0];
      if (ws) {
        const sentMessages = ws.getSentMessages();
        expect(sentMessages.some((msg: string) => {
          const parsed = JSON.parse(msg);
          return parsed.type === 'stdin' && parsed.payload?.data === 'test input\n';
        })).toBe(true);
      }
    });
  });
});