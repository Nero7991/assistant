/**
 * Test Schedule Formatting
 * 
 * This script tests the updated schedule parsing functionality
 * to verify that task IDs and subtask IDs are correctly extracted from
 * formatted schedule items.
 */
// Use the default parser instead of the new one
import { parseScheduleFromLLMResponse } from './server/services/schedule-parser.js';

// Test with a properly formatted sample response
const sampleResponse = `
Hello! Here's your schedule for today.

The final schedule is as follows:
08:00 Morning routine
08:30 Work on Project X (Task ID: 12)
09:15 Short break
10:00 Design User Interface (Task ID: 43)
10:30 Create wireframes (Subtask ID: 75)
11:00 Short break
11:15 Research component libraries (Subtask ID: 76)
12:00 Lunch break
13:00 Team meeting
14:00 Code review (Task ID: 44)
15:00 Fix responsive layout issues (Subtask ID: 77)
16:00 End of day wrap-up
`;

// Run the test
function testScheduleFormatting() {
  console.log('Starting test for schedule item formatting...\n');
  
  // Parse the sample response
  const parsedSchedule = parseScheduleFromLLMResponse(sampleResponse);
  
  if (!parsedSchedule) {
    console.error('❌ Failed to parse schedule from response');
    return;
  }
  
  console.log(`✅ Successfully parsed schedule with ${parsedSchedule.scheduleItems.length} items\n`);
  console.log('--- Extracted Schedule Items ---');
  
  // Print each schedule item with its parsed task ID and/or subtask ID
  parsedSchedule.scheduleItems.forEach((item, index) => {
    let itemInfo = `${index + 1}. "${item.title}" at ${item.startTime}`;
    
    if (item.taskId) {
      itemInfo += ` (Task ID: ${item.taskId})`;
    }
    
    if (item.subtaskId) {
      itemInfo += ` (Subtask ID: ${item.subtaskId})`;
    }
    
    console.log(itemInfo);
  });
  
  // Count how many items had a task ID or subtask ID
  const itemsWithTaskId = parsedSchedule.scheduleItems.filter(item => item.taskId).length;
  const itemsWithSubtaskId = parsedSchedule.scheduleItems.filter(item => item.subtaskId).length;
  
  console.log('\n--- Summary ---');
  console.log(`Items with Task ID: ${itemsWithTaskId} of ${parsedSchedule.scheduleItems.length}`);
  console.log(`Items with Subtask ID: ${itemsWithSubtaskId} of ${parsedSchedule.scheduleItems.length}`);
  
  // Verify if all expected IDs were parsed correctly
  const expectedTaskIds = [12, 43, 44];
  const expectedSubtaskIds = [75, 76, 77];
  
  const foundTaskIds = parsedSchedule.scheduleItems
    .filter(item => item.taskId)
    .map(item => item.taskId);
  
  const foundSubtaskIds = parsedSchedule.scheduleItems
    .filter(item => item.subtaskId)
    .map(item => item.subtaskId);
  
  const allTaskIdsFound = expectedTaskIds.every(id => foundTaskIds.includes(id));
  const allSubtaskIdsFound = expectedSubtaskIds.every(id => foundSubtaskIds.includes(id));
  
  console.log(`\nAll expected Task IDs found: ${allTaskIdsFound ? '✅ Yes' : '❌ No'}`);
  console.log(`All expected Subtask IDs found: ${allSubtaskIdsFound ? '✅ Yes' : '❌ No'}`);
}

testScheduleFormatting();