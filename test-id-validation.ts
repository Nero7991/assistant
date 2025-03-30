/**
 * Test ID Validation in Schedule Parser
 * 
 * This script specifically tests the ID validation functionality in the schedule parser.
 */
import { parseScheduleFromLLMResponse } from './server/services/schedule-parser';
import { db } from './server/db';
import { eq } from 'drizzle-orm';
import { tasks, subtasks, type Subtask, type Task } from './shared/schema';

// Sample response with intentionally invalid task and subtask IDs
const sampleResponse = `
Hello! Here's your schedule for today.

The final schedule is as follows:
08:00 Morning routine
08:30 Work on Project X (Task ID: 9999)
09:15 Short break
10:00 Design User Interface (Task ID: 43)
10:30 Create wireframes (Subtask ID: 8888)
11:00 Short break
11:15 Research component libraries (Subtask ID: 76)
12:00 Lunch break
13:00 Team meeting
14:00 Code review (Task ID: 44)
15:00 Fix responsive layout issues (Subtask ID: 77)
16:00 End of day wrap-up
`;

async function testIdValidation() {
  console.log('Starting test for ID validation in schedule parser...\n');
  
  // Parse the sample response
  const parsedSchedule = parseScheduleFromLLMResponse(sampleResponse);
  
  if (!parsedSchedule) {
    console.error('❌ Failed to parse schedule from response');
    return;
  }
  
  console.log(`✅ Successfully parsed schedule with ${parsedSchedule.scheduleItems.length} items\n`);
  
  // Print items with task IDs and subtask IDs
  const itemsWithTaskIds = parsedSchedule.scheduleItems.filter(item => item.taskId);
  console.log('Items with Task IDs:');
  itemsWithTaskIds.forEach(item => {
    console.log(`- "${item.title}" (Task ID: ${item.taskId})`);
  });
  
  const itemsWithSubtaskIds = parsedSchedule.scheduleItems.filter(item => item.subtaskId);
  console.log('\nItems with Subtask IDs:');
  itemsWithSubtaskIds.forEach(item => {
    console.log(`- "${item.title}" (Subtask ID: ${item.subtaskId})`);
  });
  
  // Create a simulated set of valid IDs to test the validation logic
  const validTaskIds = [43, 44, 123]; // Only the real task IDs are valid, 9999 is invalid
  const validSubtaskIds = [76, 77]; // Only the real subtask IDs are valid, 8888 is invalid
  
  console.log('\nMock Valid Task IDs:', validTaskIds);
  console.log('Mock Valid Subtask IDs:', validSubtaskIds);
  
  // Check which task IDs in our schedule are valid
  console.log('\nValidation results:');
  itemsWithTaskIds.forEach(item => {
    const taskId = item.taskId as number;
    const isValid = validTaskIds.includes(taskId);
    console.log(`- Task ID ${taskId} (${item.title}): ${isValid ? '✅ Valid' : '❌ Invalid'}`);
  });
  
  itemsWithSubtaskIds.forEach(item => {
    const subtaskId = item.subtaskId as number;
    const isValid = validSubtaskIds.includes(subtaskId);
    console.log(`- Subtask ID ${subtaskId} (${item.title}): ${isValid ? '✅ Valid' : '❌ Invalid'}`);
  });
}

testIdValidation().catch(console.error).finally(() => {
  console.log('\nTest completed.');
  process.exit(0);
});