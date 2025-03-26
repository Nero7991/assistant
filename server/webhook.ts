import { Request, Response } from "express";
import twilio from "twilio";
import { MessagingService, messagingService } from "./services/messaging";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

// Initialize Twilio client and log configuration
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Log Twilio configuration on startup (without exposing sensitive data)
console.log('Initializing Twilio client with:', {
  accountSid: process.env.TWILIO_ACCOUNT_SID?.substring(0, 10) + '...',
  authToken: '[REDACTED]',
  phoneNumber: process.env.TWILIO_PHONE_NUMBER
});

/**
 * Find a user by their phone number
 * @param phoneNumber Phone number to lookup (without the whatsapp: prefix)
 * @returns User ID if found, null otherwise
 */
async function findUserByPhoneNumber(phoneNumber: string): Promise<number | null> {
  try {
    // Normalize phone number format
    // Remove any non-digit characters to ensure consistent matching
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    
    // Check both formats - with and without country code
    const possibleFormats = [
      normalizedPhone,                   // Full format with country code
      normalizedPhone.replace(/^1/, '')  // US number without the leading 1
    ];
    
    // Find users with matching phone numbers
    const matchedUsers = await db
      .select()
      .from(users)
      .where(
        // Check if any of the possible formats match by stripping non-digits from DB values too
        eq(users.isPhoneVerified, true)
      );
      
    // Manual filter since we need to normalize the stored numbers for comparison too
    const user = matchedUsers.find(user => {
      if (!user.phoneNumber) return false;
      const userPhone = user.phoneNumber.replace(/\D/g, '');
      return possibleFormats.some(format => userPhone.includes(format) || format.includes(userPhone));
    });
    
    if (user) {
      console.log(`Found user ${user.id} (${user.username}) with matching phone number: ${phoneNumber}`);
      return user.id;
    }
    
    console.log(`No user found with phone number: ${phoneNumber}`);
    return null;
  } catch (error) {
    console.error(`Error finding user by phone number:`, error);
    return null;
  }
}

export async function handleWhatsAppWebhook(req: Request, res: Response) {
  // Log raw request details for debugging
  console.log('********** INCOMING WHATSAPP WEBHOOK REQUEST **********');
  console.log('Request body:', {
    ...req.body,
    timestamp: new Date().toISOString()
  });
  console.log('****************************************************');
  
  try {
    // Check if this is a status update webhook rather than a message
    if (req.body.SmsStatus) {
      console.log(`Received status update: ${req.body.SmsStatus} for message ${req.body.MessageSid}`);
      // Just acknowledge status updates
      return res.status(200).send('Status update received');
    }
    
    // Process incoming message
    const messageBody = req.body.Body;
    const from = req.body.From;
    
    if (!messageBody || !from) {
      console.log('Missing required fields in webhook request');
      return res.status(400).send('Missing required fields');
    }

    // Extract phone number without the whatsapp: prefix
    const userPhone = from.replace("whatsapp:", "");
    
    // Find the user ID based on phone number
    const userId = await findUserByPhoneNumber(userPhone);
    
    if (!userId) {
      console.log(`No user found with phone ${userPhone}, unable to process message`);
      
      // For unrecognized numbers, send a polite response
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message('Sorry, we couldn\'t identify your account. Please make sure you\'ve verified your phone number in the app.');
      return res.type("text/xml").send(twiml.toString());
    }
    
    console.log(`Processing WhatsApp message from user ${userId} (${userPhone}): ${messageBody.substring(0, 50)}${messageBody.length > 50 ? '...' : ''}`);

    // Handle the user's response with the messagingService singleton
    await messagingService.handleUserResponse(userId, messageBody);

    // Send a TwiML response (required by Twilio)
    // We won't respond here since the message handling process will send a response message separately
    const twiml = new twilio.twiml.MessagingResponse();
    return res.type("text/xml").send(twiml.toString());
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    res.status(500).send("Error processing message");
  }
}