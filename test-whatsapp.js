/**
 * This is a test script for simulating WhatsApp conversations.
 * To use it, first make sure you're logged in to the application.
 * Run this script with Node.js: node test-whatsapp.js
 */

const USER_ID = 2; // Replace with your actual user ID after login
const BASE_URL = 'http://localhost:5000';

const runTest = async () => {
  try {
    // 1. First, let's schedule a morning message
    console.log('Scheduling a morning message...');
    const scheduleResponse = await fetch(`${BASE_URL}/api/test/schedule-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!scheduleResponse.ok) {
      const errorText = await scheduleResponse.text();
      console.error(`Failed to schedule message: ${scheduleResponse.status} ${errorText}`);
      console.log('Make sure you are logged in first!');
      return;
    }

    const scheduleData = await scheduleResponse.json();
    console.log(`Message scheduled for: ${scheduleData.scheduledFor}`);
    console.log(`User ID: ${scheduleData.userId}`);

    // 2. Wait a few seconds to simulate processing
    console.log('Waiting for 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. Now simulate a reply from the user
    console.log('\nSimulating a user response...');
    const userMessage = "I'm struggling to get started on my project today. I have a meeting at 2pm and need to prepare for it.";
    
    const responseResult = await fetch(`${BASE_URL}/api/test/simulate-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: USER_ID,
        message: userMessage
      })
    });

    if (!responseResult.ok) {
      const errorText = await responseResult.text();
      console.error(`Failed to simulate response: ${responseResult.status} ${errorText}`);
      return;
    }

    console.log('User response processed successfully!');
    console.log('The AI coach should now process this message and may schedule a follow-up.');

    // 4. Send another message to test conversation continuity
    console.log('\nWaiting 5 seconds before sending a follow-up message...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('Sending a follow-up message from user...');
    const followUpMessage = "I completed the preparation for my meeting. Now I want to start working on the project but still feeling stuck.";
    
    const followUpResult = await fetch(`${BASE_URL}/api/test/simulate-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: USER_ID,
        message: followUpMessage
      })
    });

    if (!followUpResult.ok) {
      const errorText = await followUpResult.text();
      console.error(`Failed to simulate follow-up: ${followUpResult.status} ${errorText}`);
      return;
    }

    console.log('Follow-up message processed successfully!');
    console.log('Check the server logs for AI responses and processing details.');
    
  } catch (error) {
    console.error('Test failed with error:', error);
  }
};

runTest();