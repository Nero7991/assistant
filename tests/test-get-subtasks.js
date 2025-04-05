/**
 * Test script for fetching all subtasks for a user
 * This script tests both the new endpoints for getting all subtasks
 * 
 * To run this script: node test-get-subtasks.js
 */

import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

async function makeRequest(endpoint, method, body = null) {
  const cookieContent = fs.readFileSync('./cookies.txt', 'utf8');
  const cookieLine = cookieContent.split('\n').find(line => line.includes('connect.sid'));
  const cookieValue = cookieLine ? cookieLine.split(/\s+/).slice(-1)[0] : '';
  
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `connect.sid=${cookieValue}`
  };

  const options = {
    method,
    headers,
    credentials: 'include'
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`http://localhost:5000${endpoint}`, options);
  
  if (response.status === 204) {
    return null; // No content
  }
  
  const data = await response.json();
  return { status: response.status, data };
}

async function login() {
  try {
    // This logs us in with the existing user
    const loginResult = await makeRequest('/api/login', 'POST', { 
      username: 'orencollaco',
      password: '1122' // Try another password
    });
    
    if (loginResult && loginResult.status === 200) {
      console.log('Logged in successfully');
      return true;
    } else {
      console.log('Login failed:', loginResult);
      return false;
    }
  } catch (error) {
    console.error('Error during login:', error);
    return false;
  }
}

async function testGetAllSubtasks() {
  try {
    // Test the simplified endpoint
    console.log('\n--- Testing GET /api/subtasks/all ---');
    const result1 = await makeRequest('/api/subtasks/all', 'GET');
    console.log('Response status:', result1.status);
    console.log('Found subtasks:', result1.data.length);
    console.log('First few subtasks:', result1.data.slice(0, 3));
    
    // Test the user-specific endpoint
    console.log('\n--- Testing GET /api/users/:userId/subtasks/all ---');
    // Get the current user ID first
    const userResult = await makeRequest('/api/user', 'GET');
    if (userResult && userResult.status === 200) {
      const userId = userResult.data.id;
      console.log('Current user ID:', userId);
      
      const result2 = await makeRequest(`/api/users/${userId}/subtasks/all`, 'GET');
      console.log('Response status:', result2.status);
      console.log('Found subtasks:', result2.data.length);
      console.log('First few subtasks:', result2.data.slice(0, 3));
      
      // Verify both endpoints return the same data
      const subtasksMatch = JSON.stringify(result1.data) === JSON.stringify(result2.data);
      console.log('Both endpoints return identical data:', subtasksMatch);
    } else {
      console.log('Could not get current user ID:', userResult);
    }
  } catch (error) {
    console.error('Error testing subtasks endpoints:', error);
  }
}

async function runTests() {
  // Login first 
  const loggedIn = await login();
  
  if (!loggedIn) {
    console.log('Using existing cookie from cookies.txt file');
  }
  
  // Test our endpoints
  await testGetAllSubtasks();
}

// Use IIFE pattern for modules
(async () => {
  try {
    await runTests();
  } catch (error) {
    console.error('Error running tests:', error);
  }
})();