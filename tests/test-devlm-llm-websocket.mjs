#!/usr/bin/env node
/**
 * Test suite for DevLM LLM WebSocket routing functionality
 * Tests the new LLM request/response flow through WebSocket
 */

import WebSocket from 'ws';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const SERVER_URL = 'ws://localhost:5001/api/devlm/ws';
const AUTH_ENDPOINT = 'http://localhost:5001/api/devlm/ws-token';
const TEST_TIMEOUT = 30000; // 30 seconds

// Color codes for output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test utilities
class TestRunner {
    constructor() {
        this.serverProcess = null;
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    async startServer() {
        log('Starting test server...', 'blue');
        
        // Start the server in test mode
        this.serverProcess = spawn('npm', ['run', 'dev'], {
            cwd: join(__dirname, '..'),
            env: { ...process.env, PORT: '5001' },
            stdio: 'pipe'
        });

        // Wait for server to be ready
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Server startup timeout'));
            }, 15000);

            this.serverProcess.stdout.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Server running at')) {
                    clearTimeout(timeout);
                    log('Test server started successfully', 'green');
                    resolve();
                }
            });

            this.serverProcess.stderr.on('data', (data) => {
                console.error('Server error:', data.toString());
            });

            this.serverProcess.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    async stopServer() {
        if (this.serverProcess) {
            log('Stopping test server...', 'blue');
            this.serverProcess.kill('SIGTERM');
            this.serverProcess = null;
        }
    }

    async getAuthToken() {
        // In a real test, we'd need to authenticate first
        // For now, we'll simulate getting a token
        try {
            const response = await fetch(AUTH_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // Add authentication data here
                    userId: 5 // Test user ID
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.token;
            }
            throw new Error('Failed to get auth token');
        } catch (error) {
            log(`Auth token request failed: ${error.message}`, 'yellow');
            // Return a mock token for testing
            return 'test-token-12345';
        }
    }

    async createWebSocketConnection() {
        const token = await this.getAuthToken();
        const ws = new WebSocket(SERVER_URL);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 5000);

            ws.on('open', () => {
                // Send authentication
                ws.send(JSON.stringify({ type: 'auth', token }));
            });

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'auth_success') {
                    clearTimeout(timeout);
                    resolve(ws);
                } else if (message.type === 'error' && message.payload.message.includes('Authentication')) {
                    clearTimeout(timeout);
                    reject(new Error('Authentication failed'));
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    test(name, testFn) {
        this.tests.push({ name, testFn });
    }

    async runTests() {
        log(`Running ${this.tests.length} tests...`, 'blue');
        
        for (const { name, testFn } of this.tests) {
            try {
                log(`Testing: ${name}`, 'yellow');
                await testFn();
                this.passed++;
                log(`✓ ${name}`, 'green');
            } catch (error) {
                this.failed++;
                log(`✗ ${name}: ${error.message}`, 'red');
            }
        }

        // Print summary
        log(`\nTest Results:`, 'blue');
        log(`Passed: ${this.passed}`, 'green');
        log(`Failed: ${this.failed}`, this.failed > 0 ? 'red' : 'green');
        log(`Total: ${this.tests.length}`, 'blue');

        return this.failed === 0;
    }
}

// Test cases
const runner = new TestRunner();

runner.test('WebSocket connection and authentication', async () => {
    const ws = await runner.createWebSocketConnection();
    ws.close();
});

runner.test('LLM request with Anthropic provider', async () => {
    const ws = await runner.createWebSocketConnection();
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('LLM request timeout'));
        }, TEST_TIMEOUT);

        let responseReceived = false;

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'llm_response') {
                responseReceived = true;
                clearTimeout(timeout);
                
                // Validate response structure
                if (!message.payload.content) {
                    reject(new Error('Response missing content'));
                    return;
                }
                
                if (!message.payload.requestId) {
                    reject(new Error('Response missing requestId'));
                    return;
                }

                ws.close();
                resolve();
            } else if (message.type === 'llm_error') {
                clearTimeout(timeout);
                reject(new Error(`LLM error: ${message.payload.error}`));
            }
        });

        // Send LLM request
        ws.send(JSON.stringify({
            type: 'llm_request',
            payload: {
                requestId: 'test-req-001',
                messages: [
                    { role: 'user', content: 'Hello, this is a test message. Please respond with "Test successful".' }
                ],
                temperature: 0.7,
                stream: false
            }
        }));
    });
});

runner.test('LLM request with OpenAI provider', async () => {
    const ws = await runner.createWebSocketConnection();
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('OpenAI LLM request timeout'));
        }, TEST_TIMEOUT);

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'llm_response') {
                clearTimeout(timeout);
                
                // Check that OpenAI provider was used
                if (message.payload.provider !== 'openai') {
                    log(`Expected OpenAI provider, got: ${message.payload.provider}`, 'yellow');
                }

                ws.close();
                resolve();
            } else if (message.type === 'llm_error') {
                clearTimeout(timeout);
                reject(new Error(`OpenAI LLM error: ${message.payload.error}`));
            }
        });

        // Send LLM request specifying GPT model
        ws.send(JSON.stringify({
            type: 'llm_request',
            payload: {
                requestId: 'test-req-002',
                messages: [
                    { role: 'user', content: 'This is a test for OpenAI. Respond with "OpenAI test successful".' }
                ],
                model: 'gpt-4o-mini',
                temperature: 0.5,
                stream: false
            }
        }));
    });
});

runner.test('Invalid LLM request handling', async () => {
    const ws = await runner.createWebSocketConnection();
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Invalid request test timeout'));
        }, 5000);

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'llm_error') {
                clearTimeout(timeout);
                
                if (message.payload.error.includes('Invalid messages')) {
                    ws.close();
                    resolve();
                } else {
                    reject(new Error(`Unexpected error message: ${message.payload.error}`));
                }
            } else if (message.type === 'llm_response') {
                clearTimeout(timeout);
                reject(new Error('Should have received error, got response instead'));
            }
        });

        // Send invalid LLM request (missing messages)
        ws.send(JSON.stringify({
            type: 'llm_request',
            payload: {
                requestId: 'test-req-003',
                temperature: 0.7
                // Missing messages array
            }
        }));
    });
});

runner.test('Multiple concurrent LLM requests', async () => {
    const ws = await runner.createWebSocketConnection();
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Concurrent requests test timeout'));
        }, TEST_TIMEOUT);

        const responses = new Set();
        const expectedRequestIds = ['req-1', 'req-2', 'req-3'];

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'llm_response') {
                responses.add(message.payload.requestId);
                
                if (responses.size === expectedRequestIds.length) {
                    clearTimeout(timeout);
                    
                    // Verify all requests were handled
                    for (const reqId of expectedRequestIds) {
                        if (!responses.has(reqId)) {
                            reject(new Error(`Missing response for ${reqId}`));
                            return;
                        }
                    }
                    
                    ws.close();
                    resolve();
                }
            } else if (message.type === 'llm_error') {
                clearTimeout(timeout);
                reject(new Error(`Concurrent request error: ${message.payload.error}`));
            }
        });

        // Send multiple requests
        for (let i = 0; i < expectedRequestIds.length; i++) {
            ws.send(JSON.stringify({
                type: 'llm_request',
                payload: {
                    requestId: expectedRequestIds[i],
                    messages: [
                        { role: 'user', content: `Concurrent test ${i + 1}. Please respond briefly.` }
                    ],
                    temperature: 0.7,
                    stream: false
                }
            }));
        }
    });
});

// Main test runner
async function main() {
    try {
        await runner.startServer();
        
        // Wait a bit for server to fully initialize
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const success = await runner.runTests();
        
        await runner.stopServer();
        
        process.exit(success ? 0 : 1);
    } catch (error) {
        log(`Test execution failed: ${error.message}`, 'red');
        await runner.stopServer();
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    log('\nTest interrupted. Cleaning up...', 'yellow');
    await runner.stopServer();
    process.exit(1);
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { TestRunner };