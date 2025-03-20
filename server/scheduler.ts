import { MessagingService } from "./services/messaging";
import { db } from "./db";
import { users, messagingPreferences, messageSchedules } from "@shared/schema";
import { eq } from "drizzle-orm";

export class MessageScheduler {
  private messagingService: MessagingService;
  private schedulerInterval: NodeJS.Timeout | null = null;
  private readonly checkInterval: number;
  private readonly isTestMode: boolean;

  constructor(options = { testMode: false }) {
    this.messagingService = new MessagingService();
    this.isTestMode = options.testMode;
    // In test mode, check every minute, otherwise every 5 minutes
    this.checkInterval = this.isTestMode ? 60000 : 300000;
  }

  start() {
    // Check for pending messages based on the configured interval
    this.schedulerInterval = setInterval(() => {
      this.processPendingMessages().catch(error => {
        console.error("Error processing pending messages:", error);
      });
    }, this.checkInterval);

    // Schedule morning messages daily
    this.scheduleAllMorningMessages().catch(error => {
      console.error("Error scheduling morning messages:", error);
    });

    console.log(`Message scheduler started in ${this.isTestMode ? 'test' : 'normal'} mode`);
    console.log(`Checking for messages every ${this.checkInterval / 1000} seconds`);
  }

  stop() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      console.log("Message scheduler stopped");
    }
  }

  private async processPendingMessages() {
    try {
      console.log("Processing pending messages...");
      await this.messagingService.processPendingSchedules();
      console.log("Finished processing pending messages");
    } catch (error) {
      console.error("Error in processPendingMessages:", error);
    }
  }

  async scheduleTestMessage(userId: number) {
    if (!this.isTestMode) {
      throw new Error("Test messages can only be scheduled in test mode");
    }

    const scheduledFor = new Date(Date.now() + 60000); // 1 minute from now
    console.log(`Scheduling test message for user ${userId} at ${scheduledFor}`);

    await db.insert(messageSchedules).values({
      userId,
      type: 'morning_message',
      scheduledFor,
      status: 'pending',
      metadata: { type: 'test_message' },
    });

    return scheduledFor;
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

      console.log(`Scheduling morning messages for ${userPrefs.length} users`);

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

      // Set the target time for tomorrow if in test mode, otherwise use preferred time
      const targetTime = new Date(userTime);
      if (this.isTestMode) {
        // Schedule 1 minute from now for testing
        targetTime.setMinutes(targetTime.getMinutes() + 1);
      } else {
        targetTime.setHours(hours, minutes, 0, 0);
        if (targetTime <= userTime) {
          targetTime.setDate(targetTime.getDate() + 1);
        }
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

// Export singleton instance with test mode flag from environment
export const messageScheduler = new MessageScheduler({
  testMode: process.env.NODE_ENV === 'development'
});