#!/usr/bin/env node

import WebSocket from 'ws';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

async function testWebSocket() {
  console.log('🧪 Simple WebSocket Test\n');

  // Setup axios with cookies
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    baseURL: 'http://localhost:5001',
    headers: { 'Content-Type': 'application/json' },
  }));

  try {
    // 1. Login
    console.log('1. Logging in...');
    const loginResponse = await client.post('/api/login', {
      email: 'testuser@example.com',
      password: 'testpass123',
    });
    console.log('✓ Logged in as:', loginResponse.data.email);

    // 2. Get WebSocket token
    console.log('2. Getting WebSocket token...');
    const tokenResponse = await client.post('/api/devlm/ws-token');
    const { token } = tokenResponse.data;
    console.log('✓ Token received:', token.substring(0, 8) + '...');

    // 3. Connect to WebSocket
    console.log('3. Connecting to WebSocket...');
    const ws = new WebSocket('ws://localhost:5001/api/devlm/ws');

    let authenticated = false;

    ws.on('open', () => {
      console.log('✓ WebSocket connected');
      console.log('4. Sending authentication...');
      ws.send(JSON.stringify({ type: 'auth', token }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log('📨 Message:', message);

      if (message.type === 'auth_success') {
        authenticated = true;
        console.log('✓ Authentication successful');
        console.log('5. Sending simple task...');
        
        // Send a very simple task
        ws.send(JSON.stringify({
          type: 'run',
          payload: {
            task: 'create a simple hello world python script',
            model: 'gemini-2.0-flash-exp',
            mode: 'generate',
            noApproval: false,
            source: 'kona',
          },
        }));
      }
    });

    ws.on('close', (code, reason) => {
      console.log('❌ WebSocket closed:', code, reason.toString());
      process.exit(authenticated ? 0 : 1);
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      process.exit(1);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      console.log('⏰ Test timeout');
      ws.close();
      process.exit(1);
    }, 30000);

  } catch (error: any) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

testWebSocket();