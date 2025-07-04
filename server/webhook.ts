import { Request, Response, Router } from "express";
import twilio from "twilio";
import { MessagingService, messagingService } from "./services/messaging";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { handleWhatsAppOnboarding } from "./services/whatsappOnboarding";

// Create a router for webhook endpoints
const webhookRouter = Router();

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
    console.log(`[DEBUG] Looking up phone number: ${phoneNumber}`);
    
    // Normalize phone number format
    // Remove any non-digit characters to ensure consistent matching
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    console.log(`[DEBUG] Normalized phone: ${normalizedPhone}`);
    
    // Check both formats - with and without country code
    const possibleFormats = [
      normalizedPhone,                   // Full format with country code
      normalizedPhone.replace(/^1/, '')  // US number without the leading 1
    ];
    console.log(`[DEBUG] Possible formats: ${possibleFormats.join(', ')}`);
    
    // Get all phone-verified users (we need to do manual filtering because of phone number normalization)
    const matchedUsers = await db
      .select()
      .from(users)
      .where(
        eq(users.isPhoneVerified, true)
      );
      
    console.log(`[DEBUG] Found ${matchedUsers.length} phone-verified users in database`);
    
    // Manual filter since we need to normalize the stored numbers for comparison too
    const user = matchedUsers.find(user => {
      if (!user.phoneNumber) return false;
      const userPhone = user.phoneNumber.replace(/\D/g, '');
      console.log(`[DEBUG] Checking user ${user.id} (${user.email}) with phone: ${user.phoneNumber} -> normalized: ${userPhone}`);
      
      // Also handle the case where the DB might have 'whatsapp:' prefix (legacy data)
      const userPhoneWithoutPrefix = user.phoneNumber.replace('whatsapp:', '').replace(/\D/g, '');
      
      // Check for exact match first
      const exactMatch = possibleFormats.some(format => 
        userPhone === format || userPhoneWithoutPrefix === format
      );
      if (exactMatch) {
        console.log(`[DEBUG] Found exact match for user ${user.id}`);
        return true;
      }
      
      // Check for partial match (includes)
      const partialMatch = possibleFormats.some(format => 
        userPhone.includes(format) || format.includes(userPhone) ||
        userPhoneWithoutPrefix.includes(format) || format.includes(userPhoneWithoutPrefix)
      );
      if (partialMatch) {
        console.log(`[DEBUG] Found partial match for user ${user.id}`);
        return true;
      }
      
      console.log(`[DEBUG] No match for user ${user.id}`);
      return false;
    });
    
    if (user) {
      console.log(`[DEBUG] Successfully found user ${user.id} (${user.email}) with matching phone number: ${phoneNumber}`);
      return user.id;
    }
    
    console.log(`[DEBUG] No user found with phone number: ${phoneNumber}`);
    return null;
  } catch (error) {
    console.error(`[ERROR] Error finding user by phone number:`, error);
    return null;
  }
}

// Define the webhook endpoint handler
export async function handleWhatsAppWebhook(req: Request, res: Response) {
  // Log raw request details for debugging
  console.log('********** INCOMING WHATSAPP WEBHOOK REQUEST **********');
  console.log('Request body:', {
    ...req.body,
    timestamp: new Date().toISOString()
  });
  console.log('****************************************************');
  
  try {
    // ---> REVISED LOGIC: Prioritize checking for essential message fields
    const messageBody = req.body.Body;
    const from = req.body.From;
    const smsStatus = req.body.SmsStatus;

    // Check if it's a valid incoming message payload
    if (messageBody && from) {
      console.log(`[Webhook] Valid incoming message detected (Body & From exist). Processing...`);

      // Extract phone number without the whatsapp: prefix
      const userPhone = from.replace("whatsapp:", "");
      
      // Find the user ID based on phone number
      const userId = await findUserByPhoneNumber(userPhone);
      
      if (!userId) {
        console.log(`[Webhook] No user found with phone ${userPhone}, initiating onboarding.`);
        
        // Handle onboarding for new users
        try {
          const onboardingResponse = await handleWhatsAppOnboarding(from, messageBody);
          
          if (onboardingResponse) {
            // Send the onboarding response
            const twimlResponse = new twilio.twiml.MessagingResponse();
            twimlResponse.message(onboardingResponse);
            return res.type("text/xml").send(twimlResponse.toString());
          } else {
            // No response needed (existing user or error)
            const twimlAck = new twilio.twiml.MessagingResponse();
            return res.type("text/xml").send(twimlAck.toString());
          }
        } catch (onboardingError) {
          console.error(`[Webhook] Error during onboarding:`, onboardingError);
          const twimlError = new twilio.twiml.MessagingResponse();
          twimlError.message('Sorry, there was an error processing your request. Please try again later.');
          return res.type("text/xml").send(twimlError.toString());
        }
      }
      
      console.log(`[DEBUG] Processing WhatsApp message from user ${userId} (${userPhone}): ${messageBody.substring(0, 50)}${messageBody.length > 50 ? '...' : ''}`);

      // Respond to Twilio IMMEDIATELY with empty TwiML to acknowledge receipt
      const twimlAck = new twilio.twiml.MessagingResponse();
      res.type("text/xml").send(twimlAck.toString());
      console.log(`[DEBUG] Sent TwiML acknowledgment to Twilio for user ${userId}`);

      // Process the message ASYNCHRONOUSLY in the background
      (async () => {
          try {
              console.log(`[DEBUG] Starting async message processing for user ${userId}`);
              await messagingService.handleUserResponse(userId, messageBody);
              console.log(`[DEBUG] Successfully processed message from user ${userId}`);
          } catch (asyncError) {
              console.error(`[ERROR] Error processing message from user ${userId}:`, asyncError);
              console.error(`[ERROR] Stack trace:`, asyncError.stack);
          }
      })();

    } else if (smsStatus) {
      // If Body or From is missing, but SmsStatus IS present, treat as a status update
      console.log(`[Webhook] Received status update: ${smsStatus} for message ${req.body.MessageSid}. Acknowledging.`);
      // Just acknowledge status updates with 200 OK
      return res.status(200).send('Status update received');
    } else {
      // If none of the above, it's an invalid/incomplete request
      console.log('[Webhook] Invalid webhook request: Missing Body/From and not a status update.');
      return res.status(400).send('Invalid request: Missing required fields or not a status update.');
    }
    // <--- END REVISED LOGIC

  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    // Send a generic 500 error if something unexpected happens
    // Avoid sending TwiML here as the initial response might have already gone out
    if (!res.headersSent) {
       res.status(500).send("Error processing message");
    }
  }
}

// Register the WhatsApp webhook route
webhookRouter.post('/whatsapp', handleWhatsAppWebhook);

// Export the router for use in the main app
export { webhookRouter };