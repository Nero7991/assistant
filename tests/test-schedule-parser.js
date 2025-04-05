// Simple test script for the schedule parser
import { parseScheduleFromLLMResponse } from './server/services/schedule-parser-new.js';

// Test example message
const testMessage = `Hey Sarah! Let's organize your day effectively.

The final schedule is as follows:
08:00 - 08:30 Morning routine
09:00 - 10:30 Work on Project X
10:30 - 10:45 Short break
10:45 - 12:00 Continue Project X
12:00 - 13:00 Lunch and rest
13:00 - 14:30 Team meeting
14:30 - 16:00 Work on documentation
16:00 - 16:15 Break
16:15 - 17:30 Finish up important tasks

Hope this works for you!`;

// Parse the schedule
const parsedSchedule = parseScheduleFromLLMResponse(testMessage);

if (parsedSchedule) {
  console.log('Successfully parsed schedule:');
  console.log(JSON.stringify(parsedSchedule.scheduleItems, null, 2));
  console.log('New schedule parser working correctly!');
} else {
  console.error('Failed to parse schedule');
  console.log('New schedule parser failed.');
}
