import { Request, Response } from "express";
import twilio from "twilio";
import { MessagingService } from "./services/messaging";

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

export async function handleWhatsAppWebhook(req: Request, res: Response) {
  // Log raw request details first
  console.log('********** INCOMING WHATSAPP WEBHOOK REQUEST **********');
  console.log('Incoming webhook request:', {
    headers: req.headers,
    body: req.body,
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
  console.log('****************************************************');

  try {
    const messagingService = new MessagingService();
    const messageBody = req.body.Body;
    const from = req.body.From;

    // Log incoming message details
    console.log(`Received WhatsApp message:`, {
      from,
      body: messageBody,
      timestamp: new Date().toISOString(),
      headers: req.headers,
    });

    // Extract user ID from message metadata or lookup by phone number
    const userPhone = from.replace("whatsapp:", "");

    // TODO: Lookup user by phone number from database
    const userId = 1; // Placeholder, implement actual user lookup

    console.log(`Processing WhatsApp message from ${userPhone}: ${messageBody}`);

    // Handle the user's response
    await messagingService.handleUserResponse(userId, messageBody);

    // Send a TwiML response (required by Twilio)
    const twiml = new twilio.twiml.MessagingResponse();
    res.type("text/xml").send(twiml.toString());
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
    res.status(500).send("Error processing message");
  }
}