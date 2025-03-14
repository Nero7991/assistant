import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const COACHING_PROMPT = `You are a supportive ADHD coach helping users stay accountable and achieve their goals. Provide encouraging, practical advice that accounts for ADHD challenges. Focus on breaking down tasks, providing structure, and maintaining motivation.

Respond with JSON in this format:
{
  "message": "Your coaching response",
  "nextCheckIn": "Suggested time for next check-in (e.g. '4 hours', 'tomorrow morning')",
  "actionItems": ["List", "of", "specific", "action", "items"]
}`;

export async function generateCoachingResponse(
  checkInContent: string,
  previousResponses?: string[]
): Promise<{
  message: string;
  nextCheckIn: string;
  actionItems: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: COACHING_PROMPT },
        ...(previousResponses?.map(msg => ({ role: "assistant" as const, content: msg })) || []),
        { role: "user", content: checkInContent }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to generate coaching response");
  }
}
