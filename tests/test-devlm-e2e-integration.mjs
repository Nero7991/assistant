/**
 * End-to-end integration tests for DevLM interactive frontend
 * Tests the complete flow from bootstrap.py event emission through backend parsing to frontend display
 */

import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const TEST_PORT = 9999;
const WEBSOCKET_PORT = 9998;

class DevLMIntegrationTest {
  constructor() {
    this.server = null;
    this.wss = null;
    this.receivedEvents = [];
    this.clientConnections = [];
  }

  async setup() {
    console.log('Setting up integration test environment...');
    
    // Create HTTP server for WebSocket
    this.server = createServer();
    this.wss = new WebSocketServer({ server: this.server });

    // Handle WebSocket connections (simulating frontend)
    this.wss.on('connection', (ws) => {
      console.log('Frontend client connected');
      this.clientConnections.push(ws);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('Received from frontend:', message);
        } catch (err) {
          console.log('Received raw message:', data.toString());
        }
      });

      ws.on('close', () => {
        console.log('Frontend client disconnected');
        this.clientConnections = this.clientConnections.filter(conn => conn !== ws);
      });
    });

    // Start server
    await new Promise((resolve) => {
      this.server.listen(WEBSOCKET_PORT, resolve);
    });

    console.log(`WebSocket test server running on port ${WEBSOCKET_PORT}`);
  }

  async teardown() {
    console.log('Tearing down test environment...');
    
    // Close all client connections
    this.clientConnections.forEach(ws => ws.close());
    
    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }
    
    // Close HTTP server
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }

  // Simulate backend event parsing (like in routes.ts)
  parseBootstrapOutput(output) {
    const events = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('WEBSOCKET_EVENT:')) {
        try {
          const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
          const event = JSON.parse(eventJson);
          events.push(event);
          
          // Simulate forwarding to WebSocket clients (like backend does)
          this.forwardEventToClients(event);
        } catch (err) {
          console.error('Failed to parse event:', line, err);
        }
      }
    }
    
    return events;
  }

  forwardEventToClients(event) {
    const message = JSON.stringify({
      type: event.type,
      payload: event.payload
    });

    this.clientConnections.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    });

    // Store for verification
    this.receivedEvents.push(event);
  }

  // Test 1: Event emission from Python script
  async testEventEmission() {
    console.log('\n=== Test 1: Event Emission ===');
    
    return new Promise((resolve, reject) => {
      // Create a simple Python script that imports and uses the event functions
      const testScript = `
import sys
import os
sys.path.insert(0, '${join(__dirname, '..', 'devlm')}')

# Import event functions
from bootstrap import (
    emit_process_start,
    emit_phase_change,
    emit_llm_request_start,
    emit_system_log,
    emit_process_end
)

# Test event emissions
emit_process_start("test-task-123", "Integration test task", {"mode": "test"})
emit_phase_change("Testing", "Running integration tests")
emit_llm_request_start("req-123", "claude-3-5-sonnet", "Test prompt")
emit_system_log("info", "Integration test running")
emit_process_end("test-task-123", "completed", "Test completed", 0, "All tests passed")
`;

      const pythonProcess = spawn('python3', ['-c', testScript], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let hasEmittedEvents = false;

      pythonProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Parse events as they come (simulating backend)
        const events = this.parseBootstrapOutput(chunk);
        if (events.length > 0) {
          hasEmittedEvents = true;
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error('Python stderr:', data.toString());
      });

      pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
        
        if (code !== 0) {
          reject(new Error(`Python process failed with code ${code}`));
          return;
        }

        // Verify events were emitted
        const allEvents = this.parseBootstrapOutput(output);
        
        console.log(`Captured ${allEvents.length} events:`);
        allEvents.forEach((event, i) => {
          console.log(`  ${i + 1}. ${event.type}: ${JSON.stringify(event.payload).substring(0, 100)}...`);
        });

        // Verify specific events
        const eventTypes = allEvents.map(e => e.type);
        const expectedEvents = [
          'process_start',
          'phase_change', 
          'llm_request_start',
          'system_log',
          'process_end'
        ];

        expectedEvents.forEach(expectedType => {
          assert(eventTypes.includes(expectedType), `Missing event type: ${expectedType}`);
        });

        console.log('✓ Event emission test passed');
        resolve(allEvents);
      });

      pythonProcess.on('error', (err) => {
        reject(new Error(`Failed to start Python process: ${err.message}`));
      });
    });
  }

  // Test 2: Backend event parsing
  async testBackendParsing() {
    console.log('\n=== Test 2: Backend Event Parsing ===');
    
    // Simulate stdout output with WebSocket events (like from bootstrap.py)
    const simulatedOutput = `
Regular output line
WEBSOCKET_EVENT:{"type":"process_start","payload":{"taskId":"test-123","taskDescription":"Test task","configuration":{"mode":"test"}},"timestamp":"2024-01-01T00:00:00.000Z"}
Another regular line
WEBSOCKET_EVENT:{"type":"llm_request_start","payload":{"requestId":"req-123","model":"claude-3-5-sonnet","promptSummary":"Test prompt..."}}
WEBSOCKET_EVENT:{"type":"tool_execution_result","payload":{"toolExecutionId":"tool-123","toolName":"execute_command","status":"success","resultSummary":"Command completed"}}
Final output line
`;

    // Parse using our backend parsing logic
    const events = this.parseBootstrapOutput(simulatedOutput);
    
    console.log(`Parsed ${events.length} events from simulated output`);
    
    // Verify parsed events
    assert.strictEqual(events.length, 3, 'Should parse exactly 3 events');
    assert.strictEqual(events[0].type, 'process_start');
    assert.strictEqual(events[1].type, 'llm_request_start');
    assert.strictEqual(events[2].type, 'tool_execution_result');
    
    // Verify payload structure
    assert(events[0].payload.taskId, 'process_start should have taskId');
    assert(events[1].payload.requestId, 'llm_request_start should have requestId');
    assert(events[2].payload.toolExecutionId, 'tool_execution_result should have toolExecutionId');
    
    console.log('✓ Backend parsing test passed');
    return events;
  }

  // Test 3: WebSocket message forwarding
  async testWebSocketForwarding() {
    console.log('\n=== Test 3: WebSocket Message Forwarding ===');
    
    return new Promise(async (resolve, reject) => {
      const { WebSocket } = await import('ws');
      
      // Connect a test client
      const client = new WebSocket(`ws://localhost:${WEBSOCKET_PORT}`);
      const receivedMessages = [];
      
      client.on('open', () => {
        console.log('Test client connected to WebSocket server');
        
        // Simulate backend forwarding events
        const testEvents = [
          {
            type: 'process_start',
            payload: { taskId: 'test-123', taskDescription: 'WebSocket test' }
          },
          {
            type: 'phase_change',
            payload: { phaseName: 'Testing', details: 'WebSocket forwarding' }
          },
          {
            type: 'system_log',
            payload: { level: 'info', message: 'WebSocket test message' }
          }
        ];
        
        // Forward events (simulating backend behavior)
        testEvents.forEach(event => {
          this.forwardEventToClients(event);
        });
      });
      
      client.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          receivedMessages.push(message);
          console.log(`Client received: ${message.type}`);
          
          // Check if we've received all expected messages
          if (receivedMessages.length === 3) {
            client.close();
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', data.toString());
        }
      });
      
      client.on('close', () => {
        console.log('Test client disconnected');
        
        // Verify received messages
        assert.strictEqual(receivedMessages.length, 3, 'Should receive 3 messages');
        
        const messageTypes = receivedMessages.map(m => m.type);
        assert(messageTypes.includes('process_start'), 'Should receive process_start');
        assert(messageTypes.includes('phase_change'), 'Should receive phase_change');
        assert(messageTypes.includes('system_log'), 'Should receive system_log');
        
        console.log('✓ WebSocket forwarding test passed');
        resolve(receivedMessages);
      });
      
      client.on('error', (err) => {
        reject(new Error(`WebSocket client error: ${err.message}`));
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        client.close();
        reject(new Error('WebSocket test timed out'));
      }, 10000);
    });
  }

  // Test 4: Frontend event handling simulation
  async testFrontendEventHandling() {
    console.log('\n=== Test 4: Frontend Event Handling Simulation ===');
    
    // Simulate the frontend DevlmRunnerContext event handling logic
    const simulateEventHandling = (eventData) => {
      const { type, payload } = eventData;
      let outputLine = '';
      let error = null;
      let isRunning = null;
      
      switch (type) {
        case 'process_start':
          outputLine = `[PROCESS] Started: ${payload.taskDescription}`;
          break;
        case 'process_end':
          outputLine = `[PROCESS] Ended: ${payload.status} - ${payload.message || 'No message'}`;
          isRunning = false;
          break;
        case 'phase_change':
          outputLine = `[PHASE] ${payload.phaseName}: ${payload.details || ''}`;
          break;
        case 'llm_request_start':
          outputLine = `[LLM] Starting request to ${payload.model}: ${payload.promptSummary}`;
          break;
        case 'llm_request_success':
          outputLine = `[LLM] Request completed: ${payload.responseSummary || 'Response received'}`;
          break;
        case 'llm_request_error':
          outputLine = `[LLM ERROR] ${payload.errorMessage}`;
          error = `LLM Error: ${payload.errorMessage}`;
          break;
        case 'tool_execution_start':
          outputLine = `[TOOL] Starting: ${payload.toolName} - ${payload.explanation || 'No details'}`;
          break;
        case 'tool_execution_result':
          const status = payload.status.toUpperCase();
          outputLine = `[TOOL ${status}] ${payload.toolName}: ${payload.resultSummary || 'Completed'}`;
          if (payload.status === 'failure' && payload.errorMessage) {
            error = `Tool Error: ${payload.errorMessage}`;
          }
          break;
        case 'system_log':
          const logLevel = payload.level.toUpperCase();
          outputLine = `[${logLevel}] ${payload.message}`;
          if (payload.level === 'error') {
            error = payload.message;
          }
          break;
        default:
          outputLine = `[UNKNOWN EVENT] ${type}: ${JSON.stringify(payload)}`;
      }
      
      return { outputLine, error, isRunning };
    };
    
    // Test with various event types
    const testEvents = [
      {
        type: 'process_start',
        payload: { taskDescription: 'Frontend test task', taskId: 'test-456' }
      },
      {
        type: 'phase_change',
        payload: { phaseName: 'Initialization', details: 'Setting up test environment' }
      },
      {
        type: 'llm_request_start',
        payload: { model: 'claude-3-5-sonnet', promptSummary: 'Frontend test prompt...' }
      },
      {
        type: 'tool_execution_result',
        payload: { toolName: 'test_tool', status: 'success', resultSummary: 'Tool completed successfully' }
      },
      {
        type: 'system_log',
        payload: { level: 'info', message: 'Frontend test message' }
      },
      {
        type: 'llm_request_error',
        payload: { errorMessage: 'Test error message' }
      },
      {
        type: 'process_end',
        payload: { status: 'completed', message: 'Frontend test completed' }
      }
    ];
    
    const results = testEvents.map(event => {
      const result = simulateEventHandling(event);
      console.log(`  ${event.type} -> "${result.outputLine}"`);
      if (result.error) console.log(`    Error: ${result.error}`);
      if (result.isRunning !== null) console.log(`    Running: ${result.isRunning}`);
      return result;
    });
    
    // Verify results
    assert(results[0].outputLine.includes('[PROCESS] Started:'), 'Process start should be formatted correctly');
    assert(results[1].outputLine.includes('[PHASE]'), 'Phase change should be formatted correctly');
    assert(results[2].outputLine.includes('[LLM] Starting request'), 'LLM start should be formatted correctly');
    assert(results[3].outputLine.includes('[TOOL SUCCESS]'), 'Tool success should be formatted correctly');
    assert(results[4].outputLine.includes('[INFO]'), 'System log should be formatted correctly');
    assert(results[5].error !== null, 'LLM error should set error state');
    assert(results[6].isRunning === false, 'Process end should set running to false');
    
    console.log('✓ Frontend event handling test passed');
    return results;
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting DevLM E2E Integration Tests\n');
    
    try {
      await this.setup();
      
      // Run tests sequentially
      await this.testEventEmission();
      await this.testBackendParsing();
      await this.testWebSocketForwarding();
      await this.testFrontendEventHandling();
      
      console.log('\n🎉 All integration tests passed!');
      
    } catch (error) {
      console.error('\n❌ Integration test failed:', error.message);
      throw error;
    } finally {
      await this.teardown();
    }
  }
}

// Run tests if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const test = new DevLMIntegrationTest();
  
  test.runAllTests().catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export { DevLMIntegrationTest };