#!/usr/bin/env node

import fetch from 'node-fetch';
import { createHash } from 'crypto';
import chalk from 'chalk';

// Test configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5001';
const TEST_USERNAME = process.env.TEST_USERNAME || `test_external_${Date.now()}`;
const TEST_EMAIL = process.env.TEST_EMAIL || `${TEST_USERNAME}@example.com`;
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPassword123!';

// Use environment variables to bypass registration if needed
const BYPASS_REGISTRATION = process.env.BYPASS_REGISTRATION === 'true';
const EXISTING_USER_ID = process.env.TEST_USER_ID ? parseInt(process.env.TEST_USER_ID) : null;

// Test state
let authCookie = null;
let userId = null;
let serviceId = null;
let serviceSlug = null;
let accessToken = null;
let webhookUrl = null;

// Helper functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: chalk.blue('[INFO]'),
    success: chalk.green('[SUCCESS]'),
    error: chalk.red('[ERROR]'),
    warning: chalk.yellow('[WARNING]')
  };
  console.log(`${timestamp} ${prefix[type]} ${message}`);
}

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (authCookie) {
    headers['Cookie'] = authCookie;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  // Capture cookies from registration/login
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader && (endpoint === '/api/register' || endpoint === '/api/login')) {
    authCookie = setCookieHeader.split(';')[0];
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { response, data };
}

// Test functions
async function testUserRegistration() {
  log('Testing user registration/login...');

  // If bypass registration is enabled and we have an existing user ID, skip auth
  if (BYPASS_REGISTRATION && EXISTING_USER_ID) {
    userId = EXISTING_USER_ID;
    log(`Using existing user ID from environment: ${userId}`, 'warning');
    
    // Still need to login to get auth cookie
    const { response: loginResponse, data: loginData } = await makeRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: TEST_EMAIL,  // Login uses email, not username
        password: TEST_PASSWORD
      })
    });
    
    if (loginResponse.status === 200) {
      log('Logged in successfully with provided credentials', 'success');
      return true;
    }
  }

  // First try to register
  const { response: regResponse, data: regData } = await makeRequest('/api/register', {
    method: 'POST',
    body: JSON.stringify({
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      contactPreference: 'email'
    })
  });

  if (regResponse.status === 201) {
    userId = regData.user.id;
    log(`User registered successfully. ID: ${userId}`, 'success');
    return true;
  }

  // If registration is disabled or user exists, try to login
  log('Registration failed or disabled, attempting login...', 'warning');
  
  const { response: loginResponse, data: loginData } = await makeRequest('/api/login', {
    method: 'POST',
    body: JSON.stringify({
      email: TEST_EMAIL,  // Login uses email field
      password: TEST_PASSWORD
    })
  });

  if (loginResponse.status !== 200) {
    // Try with a known test user if available
    const knownTestUser = {
      email: 'testuser@example.com',  // Use the test email we created
      password: 'testpass123'
    };
    
    const { response: fallbackResponse, data: fallbackData } = await makeRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify(knownTestUser)
    });
    
    if (fallbackResponse.status !== 200) {
      throw new Error(`Login failed: ${JSON.stringify(fallbackData)}`);
    }
    
    userId = fallbackData.id;
    log(`Logged in with known test user. ID: ${userId}`, 'success');
  } else {
    userId = loginData.id;
    log(`Logged in successfully. ID: ${userId}`, 'success');
  }
  
  return true;
}

async function testCreateExternalService() {
  log('Testing external service creation...');

  const serviceName = 'Claude Code';
  const { response, data } = await makeRequest('/api/external-services', {
    method: 'POST',
    body: JSON.stringify({
      serviceName,
      rateLimit: 50,
      metadata: {
        description: 'AI coding assistant',
        version: '1.0'
      }
    })
  });

  if (response.status !== 201) {
    throw new Error(`Service creation failed: ${JSON.stringify(data)}`);
  }

  serviceId = data.id;
  serviceSlug = data.serviceSlug;
  accessToken = data.accessToken;
  webhookUrl = data.webhookUrl;

  log(`Service created successfully:`, 'success');
  log(`  - ID: ${serviceId}`);
  log(`  - Name: ${data.serviceName}`);
  log(`  - Slug: ${serviceSlug}`);
  log(`  - Webhook URL: ${webhookUrl}`);
  log(`  - Access Token: ${accessToken.substring(0, 10)}...`);
  
  return true;
}

async function testListExternalServices() {
  log('Testing list external services...');

  const { response, data } = await makeRequest('/api/external-services', {
    method: 'GET'
  });

  if (response.status !== 200) {
    throw new Error(`List services failed: ${JSON.stringify(data)}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Expected at least one service in the list');
  }

  const service = data.find(s => s.id === serviceId);
  if (!service) {
    throw new Error('Created service not found in list');
  }

  log(`Listed ${data.length} service(s) successfully`, 'success');
  return true;
}

async function testUpdateExternalService() {
  log('Testing update external service...');

  const updates = {
    serviceName: 'Claude Code Updated',
    rateLimit: 200,
    metadata: {
      description: 'AI coding assistant',
      version: '2.0',
      updated: true
    }
  };

  const { response, data } = await makeRequest(`/api/external-services/${serviceId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });

  if (response.status !== 200) {
    throw new Error(`Service update failed: ${JSON.stringify(data)}`);
  }

  if (data.serviceName !== updates.serviceName || data.rateLimit !== updates.rateLimit) {
    throw new Error('Service was not updated correctly');
  }

  log('Service updated successfully', 'success');
  return true;
}

async function testWebhookWithValidToken() {
  log('Testing webhook with valid token...');

  const testMessage = "I'm finished implementing this feature, can you test it once?";
  
  // Extract the webhook path from the full URL and adjust for our test server
  const webhookPath = webhookUrl.replace('http://localhost:5000', '').replace(BASE_URL, '');
  
  const { response, data } = await makeRequest(webhookPath, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      message: testMessage,
      deliveryMethod: 'email'
    })
  });

  if (response.status !== 200) {
    throw new Error(`Webhook call failed: ${JSON.stringify(data)}`);
  }

  if (!data.success) {
    throw new Error(`Message delivery failed: ${data.error}`);
  }

  log(`Webhook message sent successfully. Message ID: ${data.messageId}`, 'success');
  return true;
}

async function testWebhookWithInvalidToken() {
  log('Testing webhook with invalid token...');

  const webhookPath = webhookUrl.replace('http://localhost:5000', '').replace(BASE_URL, '');
  
  const { response, data } = await makeRequest(webhookPath, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer invalid_token_12345'
    },
    body: JSON.stringify({
      message: 'This should fail',
      deliveryMethod: 'email'
    })
  });

  if (response.status !== 401) {
    throw new Error(`Expected 401 status, got ${response.status}`);
  }

  log('Webhook correctly rejected invalid token', 'success');
  return true;
}

async function testWebhookRateLimit() {
  log('Testing webhook rate limiting...');

  const webhookPath = webhookUrl.replace('http://localhost:5000', '').replace(BASE_URL, '');
  const rateLimit = 5; // We'll use a lower limit for testing

  // First, update service to have a low rate limit
  await makeRequest(`/api/external-services/${serviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ rateLimit })
  });

  // Send requests up to the limit
  for (let i = 1; i <= rateLimit; i++) {
    const { response } = await makeRequest(webhookPath, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        message: `Rate limit test message ${i}`,
        deliveryMethod: 'email'
      })
    });

    if (response.status !== 200) {
      throw new Error(`Request ${i} failed unexpectedly`);
    }
    log(`  Request ${i}/${rateLimit} succeeded`);
  }

  // Next request should be rate limited
  const { response, data } = await makeRequest(webhookPath, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      message: 'This should be rate limited',
      deliveryMethod: 'email'
    })
  });

  if (response.status !== 429) {
    throw new Error(`Expected 429 status for rate limit, got ${response.status}`);
  }

  log('Rate limiting working correctly', 'success');
  return true;
}

async function testRegenerateToken() {
  log('Testing token regeneration...');

  const { response, data } = await makeRequest(`/api/external-services/${serviceId}/regenerate-token`, {
    method: 'POST'
  });

  if (response.status !== 200) {
    throw new Error(`Token regeneration failed: ${JSON.stringify(data)}`);
  }

  const newToken = data.accessToken;
  if (!newToken || newToken === accessToken) {
    throw new Error('Token was not regenerated');
  }

  log(`Token regenerated successfully: ${newToken.substring(0, 10)}...`, 'success');

  // Test that old token no longer works
  const webhookPath = webhookUrl.replace('http://localhost:5000', '').replace(BASE_URL, '');
  const { response: oldTokenResponse } = await makeRequest(webhookPath, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      message: 'Testing old token',
      deliveryMethod: 'email'
    })
  });

  if (oldTokenResponse.status !== 401) {
    throw new Error('Old token still works after regeneration');
  }

  // Test that new token works
  const { response: newTokenResponse, data: newTokenData } = await makeRequest(webhookPath, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${newToken}`
    },
    body: JSON.stringify({
      message: 'Testing new token',
      deliveryMethod: 'email'
    })
  });

  if (newTokenResponse.status !== 200) {
    throw new Error(`New token does not work. Status: ${newTokenResponse.status}, Response: ${JSON.stringify(newTokenData)}`);
  }

  accessToken = newToken;
  log('Token regeneration verified successfully', 'success');
  return true;
}

async function testDeleteExternalService() {
  log('Testing delete external service...');

  const { response } = await makeRequest(`/api/external-services/${serviceId}`, {
    method: 'DELETE'
  });

  if (response.status !== 204) {
    throw new Error(`Service deletion failed with status ${response.status}`);
  }

  // Verify service is deleted
  const { data: services } = await makeRequest('/api/external-services', {
    method: 'GET'
  });

  const deletedService = services.find(s => s.id === serviceId);
  if (deletedService) {
    throw new Error('Service still exists after deletion');
  }

  log('Service deleted successfully', 'success');
  return true;
}

async function testDuplicateServiceName() {
  log('Testing duplicate service name prevention...');

  // Create first service
  const { response: firstResponse, data: firstService } = await makeRequest('/api/external-services', {
    method: 'POST',
    body: JSON.stringify({
      serviceName: 'Duplicate Test',
      rateLimit: 100
    })
  });

  if (firstResponse.status !== 201) {
    throw new Error('Failed to create first service');
  }

  // Try to create second service with same name
  const { response: secondResponse, data: secondData } = await makeRequest('/api/external-services', {
    method: 'POST',
    body: JSON.stringify({
      serviceName: 'Duplicate Test',
      rateLimit: 100
    })
  });

  if (secondResponse.status !== 409) {
    throw new Error(`Expected 409 conflict status, got ${secondResponse.status}`);
  }

  // Clean up
  await makeRequest(`/api/external-services/${firstService.id}`, {
    method: 'DELETE'
  });

  log('Duplicate service name correctly prevented', 'success');
  return true;
}

async function runAllTests() {
  log('Starting External Services E2E Tests', 'info');
  log(`Testing against: ${BASE_URL}`, 'info');

  const tests = [
    { name: 'User Registration', fn: testUserRegistration },
    { name: 'Create External Service', fn: testCreateExternalService },
    { name: 'List External Services', fn: testListExternalServices },
    { name: 'Update External Service', fn: testUpdateExternalService },
    { name: 'Webhook with Valid Token', fn: testWebhookWithValidToken },
    { name: 'Webhook with Invalid Token', fn: testWebhookWithInvalidToken },
    { name: 'Webhook Rate Limiting', fn: testWebhookRateLimit },
    { name: 'Regenerate Token', fn: testRegenerateToken },
    { name: 'Delete External Service', fn: testDeleteExternalService },
    { name: 'Duplicate Service Name Prevention', fn: testDuplicateServiceName }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      log(`\nRunning test: ${test.name}`);
      await test.fn();
      passed++;
    } catch (error) {
      failed++;
      log(`Test "${test.name}" failed: ${error.message}`, 'error');
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  log('\n' + '='.repeat(60));
  log(`Test Results: ${passed} passed, ${failed} failed`, failed > 0 ? 'error' : 'success');
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  log(`Unexpected error: ${error.message}`, 'error');
  console.error(error.stack);
  process.exit(1);
});