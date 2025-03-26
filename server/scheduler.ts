import { MessagingService, messagingService } from "./services/messaging";
import { db } from "./db";
import { users, messagingPreferences, messageSchedules, messageHistory } from "@shared/schema";
import { eq, and, lte, desc, gt } from "drizzle-orm";

export class MessageScheduler {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private dailySchedulerInterval: NodeJS.Timeout | null = null;
  private readonly checkInterval: number;
  private readonly isTestMode: boolean;

  constructor(options = { testMode: false }) {
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

    // Schedule morning messages once per day (or every 5 minutes in test mode)
    const dailyScheduleInterval = this.isTestMode ? 5 * 60000 : 24 * 60 * 60000;
    this.dailySchedulerInterval = setInterval(() => {
      this.scheduleAllMorningMessages().catch(error => {
        console.error("Error scheduling morning messages:", error);
      });
    }, dailyScheduleInterval);

    // Also schedule morning messages immediately on startup
    this.scheduleAllMorningMessages().catch(error => {
      console.error("Error scheduling initial morning messages:", error);
    });

    console.log(`Message scheduler started in ${this.isTestMode ? 'test' : 'normal'} mode`);
    console.log(`Checking for messages every ${this.checkInterval / 1000} seconds`);
  }

  stop() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    
    if (this.dailySchedulerInterval) {
      clearInterval(this.dailySchedulerInterval);
      this.dailySchedulerInterval = null;
    }
    
    console.log("Message scheduler stopped");
  }

  private async processPendingMessages() {
    try {
      await messagingService.processPendingSchedules();
    } catch (error) {
      console.error("Error in processPendingMessages:", error);
    }
  }

  async scheduleTestMessage(userId: number) {
    if (!this.isTestMode && process.env.NODE_ENV !== 'development') {
      throw new Error("Test messages can only be scheduled in test mode or development environment");
    }

    try {
      // Get the user to make sure they exist
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }
      
      if (!user.phoneNumber) {
        throw new Error(`User ${userId} has no phone number`);
      }
      
      const scheduledFor = new Date(Date.now() + 60000); // 1 minute from now
      console.log(`Scheduling test message for user ${userId} at ${scheduledFor}`);

      await db.insert(messageSchedules).values({
        userId,
        type: 'morning_message',
        scheduledFor,
        status: 'pending',
        metadata: { type: 'test_message' },
        createdAt: new Date()
      });

      return scheduledFor;
    } catch (error) {
      console.error(`Error scheduling test message for user ${userId}:`, error);
      throw error;
    }
  }

  private async scheduleAllMorningMessages() {
    try {
      // Get all users with messaging preferences and verified phone numbers
      const userPrefs = await db
        .select({
          userId: users.id,
          username: users.username,
          phoneNumber: users.phoneNumber,
          timeZone: messagingPreferences.timeZone || 'UTC',
          preferredTime: messagingPreferences.preferredTime || '08:00',
        })
        .from(users)
        .leftJoin(
          messagingPreferences,
          eq(users.id, messagingPreferences.userId)
        )
        .where(
          and(
            eq(users.isPhoneVerified, true),
            // Either messaging preferences are enabled or the user doesn't have preferences yet (default to enabled)
            // We check null explicitly because eq() doesn't handle that case well
            eq(messagingPreferences.isEnabled, true)
          )
        );

      console.log(`Scheduling morning messages for ${userPrefs.length} users`);

      for (const user of userPrefs) {
        // Skip users without phone numbers
        if (!user.phoneNumber) {
          console.log(`Skipping user ${user.userId} (${user.username}) - no phone number`);
          continue;
        }
        
        await this.scheduleMorningMessage(user);
      }
    } catch (error) {
      console.error("Error scheduling morning messages:", error);
    }
  }

  private async scheduleMorningMessage(user: {
    userId: number;
    username: string;
    phoneNumber: string | null;
    timeZone: string | null;
    preferredTime: string | null;
  }) {
    try {
      // Check if we already have a pending morning message for this user
      const pendingMessages = await db
        .select()
        .from(messageSchedules)
        .where(
          and(
            eq(messageSchedules.userId, user.userId),
            eq(messageSchedules.type, "morning_message"),
            eq(messageSchedules.status, "pending")
          )
        );
      
      if (pendingMessages.length > 0) {
        // Skip scheduling if there's already a pending message
        console.log(`User ${user.userId} already has a pending morning message scheduled for ${pendingMessages[0].scheduledFor}`);
        return;
      }
      
      // Parse the preferred time (default to 8:00 AM if not set)
      const preferredTime = user.preferredTime || "08:00";
      const [hours, minutes] = preferredTime.split(":").map(Number);
      const now = new Date();
      
      // Convert to user's local time zone to determine the next occurrence
      let userTime;
      try {
        // Use UTC if the user hasn't set a timezone
        const timeZone = user.timeZone || "UTC";
        userTime = new Date(now.toLocaleString("en-US", { timeZone }));
      } catch (error) {
        console.error(`Invalid time zone for user ${user.userId}: ${user.timeZone}. Using UTC.`);
        userTime = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
      }

      // Set the target time for the next morning message
      const targetTime = new Date(userTime);
      
      if (this.isTestMode) {
        // For test mode, schedule near future
        targetTime.setMinutes(targetTime.getMinutes() + 2);
        console.log(`TEST MODE: Scheduling message for user ${user.userId} in 2 minutes`);
      } else {
        // Set to the user's preferred time
        targetTime.setHours(hours || 8, minutes || 0, 0, 0);
        
        // If the time has already passed today, schedule for tomorrow
        if (targetTime <= userTime) {
          targetTime.setDate(targetTime.getDate() + 1);
        }
      }

      // Convert target time back to UTC for storage
      // Use a more precise way to convert time zones
      const timezoneOffset = new Date().getTimezoneOffset();
      const scheduledTime = new Date(targetTime.getTime() - timezoneOffset * 60000);

      // Insert the scheduled message
      await db.insert(messageSchedules).values({
        userId: user.userId,
        type: "morning_message",
        scheduledFor: scheduledTime,
        status: "pending", 
        metadata: { 
          type: "morning_message",
          username: user.username,
          phoneNumber: user.phoneNumber
        },
        createdAt: new Date()
      });

      console.log(`Scheduled morning message for user ${user.userId} (${user.username}) at ${scheduledTime}`);
    } catch (error) {
      console.error(`Error scheduling morning message for user ${user.userId}:`, error);
    }
  }
  
  /**
   * Schedule a follow-up message for a specific user
   * @param userId The user ID to schedule a follow-up for
   * @param delayMinutes How many minutes from now to schedule the follow-up
   * @param context Optional context information for the follow-up
   */
  async scheduleFollowUp(userId: number, delayMinutes: number, context: Record<string, any> = {}) {
    try {
      // Check if the user already has a pending follow-up message
      const pendingFollowUps = await db
        .select()
        .from(messageSchedules)
        .where(
          and(
            eq(messageSchedules.userId, userId),
            eq(messageSchedules.type, 'follow_up'),
            eq(messageSchedules.status, 'pending')
          )
        );
        
      if (pendingFollowUps.length > 0) {
        console.log(`User ${userId} already has a pending follow-up scheduled for ${pendingFollowUps[0].scheduledFor}`);
        return;
      }
      
      // Get the user to verify they exist and have a phone number
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      
      if (!user || !user.phoneNumber) {
        console.error(`Cannot schedule follow-up: User ${userId} not found or has no phone number`);
        return;
      }
      
      const scheduledFor = new Date(Date.now() + delayMinutes * 60000);
      
      await db.insert(messageSchedules).values({
        userId,
        type: "follow_up",
        scheduledFor,
        status: "pending",
        metadata: { 
          ...context,
          username: user.username,
          phoneNumber: user.phoneNumber 
        },
        createdAt: new Date()
      });
      
      console.log(`Scheduled follow-up for user ${userId} (${user.username}) at ${scheduledFor}`);
    } catch (error) {
      console.error(`Error scheduling follow-up for user ${userId}:`, error);
    }
  }
}

// Export singleton instance with test mode flag from environment
export const messageScheduler = new MessageScheduler({
  testMode: process.env.NODE_ENV === 'development'
});