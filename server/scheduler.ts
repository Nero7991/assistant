import { MessagingService } from "./services/messaging";
import { db } from "./db";
import { users, messagingPreferences, messageSchedules } from "@shared/schema";
import { eq } from "drizzle-orm";

export class MessageScheduler {
  private messagingService: MessagingService;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.messagingService = new MessagingService();
  }

  start() {
    // Check for pending messages every minute
    this.schedulerInterval = setInterval(() => {
      this.processPendingMessages().catch(error => {
        console.error("Error processing pending messages:", error);
      });
    }, 60000); // 1 minute

    // Schedule morning messages daily
    this.scheduleAllMorningMessages().catch(error => {
      console.error("Error scheduling morning messages:", error);
    });

    console.log("Message scheduler started");
  }

  stop() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  private async processPendingMessages() {
    await this.messagingService.processPendingSchedules();
  }

  private async scheduleAllMorningMessages() {
    try {
      // Get all users with messaging preferences
      const userPrefs = await db
        .select({
          userId: users.id,
          phoneNumber: users.phoneNumber,
          timeZone: messagingPreferences.timeZone,
          preferredTime: messagingPreferences.preferredTime,
        })
        .from(users)
        .innerJoin(
          messagingPreferences,
          eq(users.id, messagingPreferences.userId)
        )
        .where(eq(messagingPreferences.isEnabled, true));

      for (const user of userPrefs) {
        await this.scheduleMorningMessage(user);
      }
    } catch (error) {
      console.error("Error scheduling morning messages:", error);
    }
  }

  private async scheduleMorningMessage(user: {
    userId: number;
    timeZone: string;
    preferredTime: string;
  }) {
    try {
      const [hours, minutes] = user.preferredTime.split(":").map(Number);
      const now = new Date();
      const userTime = new Date(now.toLocaleString("en-US", { timeZone: user.timeZone }));
      
      // Set the target time for tomorrow
      const targetTime = new Date(userTime);
      targetTime.setHours(hours, minutes, 0, 0);
      
      if (targetTime <= userTime) {
        targetTime.setDate(targetTime.getDate() + 1);
      }

      // Convert target time back to UTC for storage
      const scheduledTime = new Date(targetTime.toLocaleString("en-US", { timeZone: "UTC" }));

      await db.insert(messageSchedules).values({
        userId: user.userId,
        type: "morning_message",
        scheduledFor: scheduledTime,
        status: "pending",
        metadata: { type: "morning_message" },
      });

      console.log(`Scheduled morning message for user ${user.userId} at ${scheduledTime}`);
    } catch (error) {
      console.error(`Error scheduling morning message for user ${user.userId}:`, error);
    }
  }
}

// Export singleton instance
export const messageScheduler = new MessageScheduler();
