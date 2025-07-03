#!/usr/bin/env node

import readline from 'readline';
import chalk from 'chalk';

async function main() {
  console.log(chalk.bold.blue('🧪 Manual Calculator Web Server Agent Test\n'));
  
  console.log(chalk.yellow('Follow these steps to test the agent:'));
  console.log('');
  console.log('1. Open the Kona web interface (http://localhost:5001)');
  console.log('2. Login with test credentials:');
  console.log('   - Email: testuser@example.com');
  console.log('   - Password: testpass123');
  console.log('3. Navigate to the Agent page');
  console.log('4. Send this task:');
  console.log('');
  console.log(chalk.cyan('   create a calculator web server with Express that supports basic operations (add, subtract, multiply, divide) via REST API endpoints. Include error handling for division by zero.'));
  console.log('');
  console.log('5. Watch for the following expected behavior:');
  console.log('   ✓ Agent creates server files (app.js, server.js, or similar)');
  console.log('   ✓ Package.json includes Express dependency');
  console.log('   ✓ Server has endpoints: /add, /subtract, /multiply, /divide');
  console.log('   ✓ Division by zero returns error (not crash)');
  console.log('   ✓ All endpoints return correct calculations');
  console.log('');
  console.log('6. Test the created server:');
  console.log('   - Navigate to the directory created by the agent');
  console.log('   - Run: npm install');
  console.log('   - Run: npm start (or node [server-file])');
  console.log('   - Test endpoints with curl or Postman');
  console.log('');
  console.log(chalk.green('Example API tests:'));
  console.log('   curl -X POST http://localhost:3000/add -H "Content-Type: application/json" -d \'{"a": 5, "b": 3}\'');
  console.log('   curl -X POST http://localhost:3000/divide -H "Content-Type: application/json" -d \'{"a": 10, "b": 0}\'');
  console.log('');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  console.log(chalk.yellow('Press Enter when you have completed the test...'));
  await new Promise(resolve => rl.question('', resolve));
  
  console.log('');
  console.log(chalk.bold.green('✅ Manual test completed!'));
  console.log('Please verify all expected behaviors were observed.');
  
  rl.close();
}

main().catch(console.error);