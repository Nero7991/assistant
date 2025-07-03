// Simple script to test the agent API directly
import fetch from 'node-fetch';

async function testAgentAPI() {
  const baseUrl = 'http://localhost:5001';
  
  try {
    console.log('🔧 Testing Agent API...');
    
    // Test executions endpoint
    console.log('📡 Testing /api/agent/executions...');
    const execResponse = await fetch(`${baseUrl}/api/agent/executions`);
    
    if (!execResponse.ok) {
      throw new Error(`Executions endpoint failed: ${execResponse.status}`);
    }
    
    const execData = await execResponse.json();
    console.log(`✅ Executions endpoint works! Found ${execData.executions.length} executions`);
    
    // Test submitting a task
    console.log('📤 Submitting simple task...');
    const taskResponse = await fetch(`${baseUrl}/api/agent/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'Create a simple hello.txt file with "Hello, World!" content',
        timeout: 60000,
        project_path: './test-output-hello'
      })
    });
    
    if (!taskResponse.ok) {
      throw new Error(`Task submission failed: ${taskResponse.status}`);
    }
    
    const taskData = await taskResponse.json();
    console.log(`✅ Task submitted! Execution ID: ${taskData.execution_id}`);
    
    // Monitor the task
    console.log('⏳ Monitoring task progress...');
    let status = 'running';
    let attempts = 0;
    
    while (status === 'running' && attempts < 15) { // 30 seconds max
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`${baseUrl}/api/agent/status/${taskData.execution_id}`);
      const statusData = await statusResponse.json();
      
      status = statusData.status;
      console.log(`📊 Status ${attempts + 1}: ${status}`);
      
      if (statusData.output && statusData.output.length > 0) {
        const recent = statusData.output.slice(-2);
        recent.forEach(line => {
          if (line.includes('[') || line.includes('Error') || line.includes('CREATE')) {
            console.log(`  📝 ${line}`);
          }
        });
      }
      
      attempts++;
    }
    
    // Get final status
    const finalResponse = await fetch(`${baseUrl}/api/agent/status/${taskData.execution_id}`);
    const finalData = await finalResponse.json();
    
    console.log(`\n🎯 Final Result:`);
    console.log(`   Status: ${finalData.status}`);
    console.log(`   Files: ${finalData.files?.join(', ') || 'none'}`);
    console.log(`   Output lines: ${finalData.output?.length || 0}`);
    
    if (finalData.error) {
      console.log(`   Error: ${finalData.error}`);
    }
    
    console.log('\n✅ Agent API test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAgentAPI();