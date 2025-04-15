import { MessagingService, messagingService } from "./services/messaging";
import { db } from "./db";
import { users, messagingPreferences, messageSchedules, messageHistory } from "@shared/schema";
import { eq, and, lte, desc, gt } from "drizzle-orm";
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { set, addDays } from 'date-fns';
import fs from 'fs/promises';
import path from 'path';

// Define the log directory path (e.g., logs directory in the workspace root)
const logDir = path.join(process.cwd(), 'logs');
const errorLogPath = 'scheduler_errors.log';
const scheduleLogPath = 'morning_schedules.log';

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

  // ---> NEW: Helper function for logging to a file
  private async logToFile(filePath: string, message: string): Promise<void> {
      try {
          // Ensure log directory exists
          await fs.mkdir(logDir, { recursive: true });
          const timestamp = new Date().toISOString();
          const logMessage = `${timestamp} - ${message}\n`; // Add timestamp and newline
          await fs.appendFile(path.join(logDir, filePath), logMessage);
      } catch (logError) {
          // Log to console if file logging fails
          console.error(`[Logger] Failed to write to log file ${filePath}:`, logError);
          console.error(`[Logger] Original message: ${message}`);
      }
  }
  // <--- END NEW

  start() {
    // Check for pending messages based on the configured interval
    this.schedulerInterval = setInterval(() => {
      this.processPendingMessages().catch(error => {
        const msg = `Error processing pending messages: ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        this.logToFile(errorLogPath, msg);
      });
    }, this.checkInterval);

    // Schedule morning messages once per day (or every 5 minutes in test mode)
    const dailyScheduleInterval = this.isTestMode ? 5 * 60000 : 24 * 60 * 60000;
    this.dailySchedulerInterval = setInterval(() => {
      this.scheduleAllMorningMessages().catch(error => {
        const msg = `Error scheduling morning messages (interval): ${error instanceof Error ? error.message : String(error)}`;
        console.error(msg);
        this.logToFile(errorLogPath, msg);
      });
    }, dailyScheduleInterval);

    // Also schedule morning messages immediately on startup
    this.scheduleAllMorningMessages().catch(error => {
      const msg = `Error scheduling initial morning messages: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      this.logToFile(errorLogPath, msg);
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
      // Log error from processPendingSchedules
      const msg = `Error in processPendingMessages calling processPendingSchedules: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      this.logToFile(errorLogPath, msg); 
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
        title: 'Test Morning Message',
        scheduledFor,
        status: 'pending',
        metadata: { type: 'test_message' },
        createdAt: new Date()
      });

      return scheduledFor;
    } catch (error) {
      const msg = `Error scheduling test message for user ${userId}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      this.logToFile(errorLogPath, msg);
      throw error; // Re-throw original error
    }
  }

  private async scheduleAllMorningMessages() {
    console.log(`[Scheduler] Starting scheduleAllMorningMessages run...`);
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
        
        // Add try/catch around individual scheduling to prevent one user error stopping all
        try {
          await this.scheduleMorningMessage(user);
        } catch (individualError) {
           const msg = `Error scheduling for individual user ${user.userId} (${user.username}): ${individualError instanceof Error ? individualError.message : String(individualError)}`;
           console.error(msg);
           this.logToFile(errorLogPath, msg);
        }
      }
    } catch (error) {
      // Log error from scheduleAllMorningMessages itself
      const msg = `Error in scheduleAllMorningMessages main block: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      this.logToFile(errorLogPath, msg);
    }
    console.log(`[Scheduler] Finished scheduleAllMorningMessages run.`);
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
      
      // Use default values if necessary
      const timeZone = user.timeZone || "UTC";
      const preferredTime = user.preferredTime || "08:00";
      const [hours, minutes] = preferredTime.split(":").map(Number);

      // Check if hours/minutes are valid
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
         const msg = `[Scheduler] Invalid preferredTime format '${preferredTime}' for user ${user.userId}. Skipping.`;
         console.error(msg);
         this.logToFile(errorLogPath, msg); // Log validation error
         return;
      }

      // Get the current time in the user's timezone
      const now = new Date();
      const nowInUserTz = toZonedTime(now, timeZone);
      
      // Calculate the target time for today in the user's timezone
      let targetTimeInUserTz = set(nowInUserTz, {
        hours: hours,
        minutes: minutes,
        seconds: 0,
        milliseconds: 0
      });

      // If the target time has already passed today, schedule for tomorrow
      if (targetTimeInUserTz <= nowInUserTz) {
        targetTimeInUserTz = addDays(targetTimeInUserTz, 1);
        console.log(`[Scheduler] Preferred time ${preferredTime} already passed today for user ${user.userId}. Scheduling for tomorrow.`);
      }

      // The targetTimeInUserTz Date object now represents the correct instant (implicitly UTC)
      const scheduledTime = targetTimeInUserTz; 

      // Insert the scheduled message
      const insertResult = await db.insert(messageSchedules).values({
        userId: user.userId,
        type: "morning_message",
        title: "Daily Morning Schedule",
        scheduledFor: scheduledTime, // Store the calculated UTC instant
        status: "pending", 
        metadata: { 
          type: "morning_message",
          username: user.username,
          phoneNumber: user.phoneNumber
        },
        createdAt: new Date()
        // Removed updatedAt, as it defaults
      }).returning({ id: messageSchedules.id }); // Return ID for logging
      
      const logTimestampUTC = scheduledTime.toISOString();
      const logTimestampLocal = formatInTimeZone(scheduledTime, timeZone, 'yyyy-MM-dd HH:mm:ss zzzz');
      const successMsg = `Scheduled morning message ID ${insertResult[0]?.id} for user ${user.userId} (${user.username}) at ${logTimestampUTC} (UTC) / ${logTimestampLocal}`;
      console.log(successMsg);
      // ---> Log success to file
      await this.logToFile(scheduleLogPath, successMsg);
      // <--- End success log

    } catch (error) {
      // Log error from scheduleMorningMessage
      const msg = `Error scheduling morning message for user ${user.userId}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(msg);
      this.logToFile(errorLogPath, msg);
      // Do not re-throw here, allow scheduleAllMorningMessages to continue with next user
    }
  }
  
  /**
   * Schedule a follow-up message for a specific user
   * @param userId The user ID to schedule a follow-up for
   * @param delayMinutes How many minutes from now to schedule the follow-up
   * @param context Optional context information for the follow-up
   * @param title Optional title to describe what the follow-up is for (e.g., "Task Reminder", "Project Update")
   */
  async scheduleFollowUp(userId: number, delayMinutes: number, context: Record<string, any> = {}, title?: string) {
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
      
      // Determine title based on context
      let followUpTitle = title;
      
      // If no title provided but we have context with a taskId, use that for the title
      if (!followUpTitle && context.taskId) {
        followUpTitle = `Task Follow-up (ID: ${context.taskId})`;
      }
      
      // Default title if none provided
      if (!followUpTitle) {
        followUpTitle = context.rescheduled ? "Schedule Check-in" : "Follow-up Check-in";
      }
      
      await db.insert(messageSchedules).values({
        userId,
        type: "follow_up",
        title: followUpTitle,
        scheduledFor,
        status: "pending",
        metadata: { 
          ...context,
          username: user.username,
          phoneNumber: user.phoneNumber 
        },
        createdAt: new Date()
      });
      
      console.log(`Scheduled follow-up "${followUpTitle}" for user ${userId} (${user.username}) at ${scheduledFor}`);
    } catch (error) {
      console.error(`Error scheduling follow-up for user ${userId}:`, error);
    }
  }
}

// Export singleton instance with test mode flag from environment
export const messageScheduler = new MessageScheduler({
  testMode: process.env.NODE_ENV === 'development'
});