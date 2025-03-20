import OpenAI from "openai";
import twilio from "twilio";
import { Task, User, KnownUserFact, MessageHistory, MessageSchedule, messageHistory, messageSchedules, users } from "@shared/schema";
import { db } from "../db";
import { eq, and, lte } from "drizzle-orm";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

interface MessageContext {
  user: User;
  tasks: Task[];
  facts: KnownUserFact[];
  previousMessages: MessageHistory[];
}

export class MessagingService {
  async generateMessage(context: MessageContext): Promise<string> {
    const prompt = `
      As an ADHD coach, create a motivating morning message for ${context.user.username}.

      Context about the user:
      ${context.facts.map(fact => `- ${fact.category}: ${fact.content}`).join('\n')}

      Their current tasks:
      ${context.tasks.map(task => `- ${task.title} (${task.status})`).join('\n')}

      Previous interactions:
      ${context.previousMessages.map(msg => `- ${msg.content}`).slice(-3).join('\n')}

      Create a friendly, encouraging message that:
      1. Acknowledges their ADHD characteristics
      2. Lists 2-3 achievable tasks for today
      3. Offers a specific strategy or tip
      4. Asks for a response to maintain engagement

      Format the response as a WhatsApp message with clear sections and emojis.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0].message.content || "Unable to generate message";
  }

  async sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
    try {
      await twilioClient.messages.create({
        body: message,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${to}`
      });
      return true;
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      return false;
    }
  }

  async handleUserResponse(userId: number, response: string): Promise<void> {
    const sentiment = await this.analyzeSentiment(response);

    // Schedule appropriate follow-up based on sentiment
    if (sentiment.needsFollowUp) {
      await this.scheduleFollowUp(userId, sentiment.type);
    }

    // Store the response in message history
    await db.insert(messageHistory).values({
      userId,
      content: response,
      type: 'response',
      status: 'received',
      metadata: { sentiment }
    });
  }

  private async analyzeSentiment(text: string): Promise<{
    type: 'positive' | 'negative' | 'neutral';
    needsFollowUp: boolean;
    urgency: number;
  }> {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Analyze the sentiment of this ADHD coaching response. Return JSON with: type (positive/negative/neutral), needsFollowUp (boolean), urgency (1-5)."
        },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" }
    });

    if (!response.choices[0].message.content) {
      throw new Error("No response content from OpenAI");
    }

    return JSON.parse(response.choices[0].message.content);
  }

  async scheduleFollowUp(userId: number, responseType: 'positive' | 'negative' | 'neutral'): Promise<void> {
    const followUpDelay = responseType === 'negative' ? 30 : 120; // minutes
    const scheduledFor = new Date(Date.now() + followUpDelay * 60000);

    await db.insert(messageSchedules).values({
      userId,
      type: 'follow_up',
      scheduledFor,
      status: 'pending',
      metadata: { responseType }
    });
  }

  async processPendingSchedules(): Promise<void> {
    const now = new Date();
    const pendingSchedules = await db
      .select()
      .from(messageSchedules)
      .where(
        and(
          eq(messageSchedules.status, 'pending'),
          lte(messageSchedules.scheduledFor, now)
        )
      );

    for (const schedule of pendingSchedules) {
      try {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, schedule.userId))
          .limit(1);

        if (!user) continue;

        const tasks = []; // TODO: Fetch tasks
        const facts = []; // TODO: Fetch facts
        const previousMessages = []; // TODO: Fetch previous messages

        const message = await this.generateMessage({
          user,
          tasks,
          facts,
          previousMessages
        });

        const success = await this.sendWhatsAppMessage(
          user.phoneNumber!,
          message
        );

        if (success) {
          await db
            .update(messageSchedules)
            .set({ status: 'sent', sentAt: now })
            .where(eq(messageSchedules.id, schedule.id));

          await db.insert(messageHistory).values({
            userId: user.id,
            content: message,
            type: schedule.type,
            status: 'sent'
          });
        }
      } catch (error) {
        console.error(`Failed to process schedule ${schedule.id}:`, error);
      }
    }
  }
}

export const messagingService = new MessagingService();