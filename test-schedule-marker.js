/**
 * Test Schedule Marker Functionality
 * 
 * This script tests the schedule marker detection and parsing functionality
 * by working with the OpenAI API directly. It verifies if the schedule marker
 * is being included in the LLM responses as expected.
 */

import OpenAI from 'openai';
// No need for dotenv as environment variables are already set up

const SCHEDULE_MARKER = "The final schedule is as follows:";

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const DAILY_SCHEDULE_PROMPT = `You are an ADHD coach helping create a structured daily schedule.

Current date and time: ${new Date().toISOString()}

User facts:
- Morning Person: I'm most productive in the mornings.
- Medication: I take ADHD medication at 8am daily.
- Focus Time: I need 90-minute uninterrupted focus blocks.

Tasks information:
- Complete project proposal
  Description: Finalize the marketing plan for Q2
  Estimated Duration: 3 hours
  Deadline: ${new Date().toLocaleDateString()}

- Schedule doctor appointment
  Description: Annual physical check-up
  Estimated Duration: 30 minutes

- Grocery shopping
  Description: Get ingredients for dinner party
  Estimated Duration: 1 hour
  
- Clean apartment
  Description: Vacuum, dust, and organize living room
  Estimated Duration: 2 hours

Your task is to create a daily schedule that:
1. Accounts for the user's ADHD challenges
2. Breaks down the day into manageable time blocks
3. Includes time for breaks, transitions, and self-care
4. Prioritizes important tasks based on deadlines and importance
5. Provides a realistic and achievable schedule
6. Includes specific times for each activity in 24-hour format (e.g., "09:00 - 10:30")

EXTREMELY IMPORTANT: Your response MUST ALWAYS include a section with the EXACT marker "${SCHEDULE_MARKER}" followed by a schedule with each item on a separate line with a time specified. This marker is essential and MUST appear exactly as written. Example format:

${SCHEDULE_MARKER}
08:00 - 08:30 Morning routine
08:30 - 09:15 Work on Project X
09:15 - 09:30 Short break
...

Provide a friendly, encouraging message before presenting the schedule. After the schedule, include 2-3 tips for staying on track.`;

async function testScheduleMarkerInclusion() {
  try {
    console.log("Starting test for schedule marker inclusion...");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: DAILY_SCHEDULE_PROMPT },
        { role: "user", content: "Please create a daily schedule for me based on my tasks and information." }
      ],
      max_tokens: 1500
    });
    
    const content = response.choices[0].message.content;
    
    console.log("\n--- Generated Response ---\n");
    console.log(content);
    
    // Check if the marker is included
    const markerIncluded = content.includes(SCHEDULE_MARKER);
    
    console.log("\n--- Test Results ---");
    console.log(`Schedule marker included: ${markerIncluded ? 'YES ✅' : 'NO ❌'}`);
    
    if (markerIncluded) {
      const markerIndex = content.indexOf(SCHEDULE_MARKER);
      const afterMarker = content.substring(markerIndex + SCHEDULE_MARKER.length).trim();
      
      console.log("\n--- Text after marker ---\n");
      console.log(afterMarker.split('\n').slice(0, 5).join('\n') + '...');
      
      // Try to extract the first few schedule items
      const scheduleLines = afterMarker.split('\n').filter(line => 
        line.trim() && line.match(/\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?/)
      );
      
      console.log("\n--- Extracted schedule items ---");
      scheduleLines.slice(0, 5).forEach(line => console.log(`- ${line.trim()}`));
      console.log(`(${scheduleLines.length} total items found)`);
    }
    
  } catch (error) {
    console.error("Error testing schedule marker:", error);
  }
}

// Run the test
testScheduleMarkerInclusion();