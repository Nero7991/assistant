import twilio from "twilio";
import { randomInt } from "crypto";
import { sendVerificationEmail } from "./email";

// Log Twilio configuration
console.log("Initializing Twilio client with:", {
  accountSid: process.env.TWILIO_ACCOUNT_SID?.substring(0, 8) + "...",
  phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN
});

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

export async function sendWhatsAppMessage(to: string, message: string) {
  try {
    console.log("Attempting to send WhatsApp message to:", to);
    // Ensure the phone number has the correct format for WhatsApp
    const formattedNumber = to.startsWith('+') ? to : `+${to}`;

    console.log("WhatsApp request details:", {
      to: `whatsapp:${formattedNumber}`,
      from: `whatsapp:${twilioPhone}`,
      body: message.substring(0, 20) + "..." // Log first 20 chars of message
    });

    const response = await client.messages.create({
      body: message,
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${formattedNumber}`,
    });

    console.log("WhatsApp message sent successfully:", {
      sid: response.sid,
      status: response.status,
      errorCode: response.errorCode,
      errorMessage: response.errorMessage,
      to: formattedNumber,
      from: `whatsapp:${twilioPhone}`
    });
    return true;
  } catch (error: any) {
    console.error("WhatsApp message error:", error);
    if (error.code) {
      console.error("Twilio error details:", {
        code: error.code,
        message: error.message,
        status: error.status,
        moreInfo: error.moreInfo
      });
    }
    return false;
  }
}

export async function sendSMS(to: string, message: string) {
  try {
    console.log("Attempting to send SMS to:", to);
    const formattedNumber = to.startsWith('+') ? to : `+${to}`;

    console.log("SMS request details:", {
      to: formattedNumber,
      from: twilioPhone,
      body: message.substring(0, 20) + "..." // Log first 20 chars of message
    });

    const response = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: formattedNumber,
    });

    console.log("SMS sent successfully:", {
      sid: response.sid,
      status: response.status,
      errorCode: response.errorCode,
      errorMessage: response.errorMessage,
      to: formattedNumber
    });
    return true;
  } catch (error: any) {
    console.error("SMS message error:", error);
    if (error.code) {
      console.error("Twilio error details:", {
        code: error.code,
        message: error.message,
        status: error.status,
        moreInfo: error.moreInfo
      });
    }
    return false;
  }
}

export function generateVerificationCode(): string {
  return randomInt(100000, 999999).toString();
}

export async function sendVerificationMessage(
  type: "whatsapp" | "imessage" | "email",
  contact: string,
  code: string
) {
  const message = `Your ADHD Coach verification code is: ${code}. This code will expire in 10 minutes.`;

  console.log("Sending verification message:", {
    type,
    contact,
    code,
  });

  let result;
  switch (type) {
    case "whatsapp":
      result = await sendWhatsAppMessage(contact, message);
      break;
    case "imessage":
      result = await sendSMS(contact, message);
      break;
    case "email":
      result = await sendVerificationEmail(contact, code);
      break;
  }

  console.log("Verification message result:", {
    type,
    contact,
    success: result
  });

  return result;
}