/**
 * Quick test to validate the o1-mini model reschedule functionality
 */
import fetch from 'node-fetch';

async function testReschedule() {
  try {
    console.log('🧪 Testing o1-mini model reschedule functionality...');
    
    // Test the reschedule endpoint
    console.log('\n1️⃣ Testing reschedule endpoint');
    const rescheduleResponse = await fetch('http://localhost:5000/api/messages/simulate-reschedule', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        userId: 2
      })
    });

    if (!rescheduleResponse.ok) {
      throw new Error(`Reschedule test failed: ${rescheduleResponse.status} ${rescheduleResponse.statusText}`);
    }
    
    const rescheduleResult = await rescheduleResponse.json();
    console.log('✅ Reschedule test succeeded!');
    console.log('Message sample:', rescheduleResult.message.substring(0, 50) + '...');
    console.log('Schedule updates count:', rescheduleResult.scheduleUpdates.length);
    
    // Print the first update as a sample
    if (rescheduleResult.scheduleUpdates.length > 0) {
      console.log('Sample schedule update:', JSON.stringify(rescheduleResult.scheduleUpdates[0], null, 2));
    }
    
    console.log('\n🎉 Test completed successfully! The reschedule functionality is working correctly.');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testReschedule();