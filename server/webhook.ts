import { Request, Response } from "express";
import twilio from "twilio";
import { MessagingService } from "./services/messaging";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function handleWhatsAppWebhook(req: Request, res: Response) {
  // Verify the request is coming from Twilio
  const signature = req.headers["x-twilio-signature"] as string;
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const isValidRequest = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature,
    url,
    req.body
  );

  if (!isValidRequest) {
    console.error("Invalid Twilio signature");
    return res.status(403).send("Invalid signature");
  }

  try {
    const messagingService = new MessagingService();
    const messageBody = req.body.Body;
    const from = req.body.From;

    // Extract user ID from message metadata or lookup by phone number
    // For now, we'll implement a simple version
    const userPhone = from.replace("whatsapp:", "");
    
    // TODO: Lookup user by phone number from database
    const userId = 1; // Placeholder, implement actual user lookup
    
    console.log(`Received WhatsApp message from ${userPhone}: ${messageBody}`);
    
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
