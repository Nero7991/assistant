import { randomInt } from "crypto";
import { sendVerificationEmail } from "./email";
import twilio from "twilio";

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
  throw new Error("Missing required Twilio credentials");
}

// Log Twilio configuration
console.log("Initializing Twilio client with:", {
  accountSid: process.env.TWILIO_ACCOUNT_SID?.substring(0, 8) + "...",
  phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
});

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioPhone = "+18557270654"; // Production WhatsApp business number

export async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  try {
    console.log("Attempting to send WhatsApp message to:", to);
    const formattedNumber = to.startsWith("+") ? to : `+${to}`;
    const fromWhatsApp = `whatsapp:${twilioPhone}`;
    const toWhatsApp = `whatsapp:${formattedNumber}`;

    // Following exact Twilio Content Template format
    const response = await client.messages.create({
      contentSid: "HX02fff4396367e72b923720ae12920172",
      contentVariables: JSON.stringify({
        1: "Karen",
        2: "Drone navigation project"
      }),
      from: fromWhatsApp,
      to: toWhatsApp
    });

    console.log("WhatsApp message sent successfully:", {
      sid: response.sid,
      status: response.status,
      errorCode: response.errorCode,
      errorMessage: response.errorMessage,
      to: formattedNumber
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

export async function sendSMS(to: string, message: string): Promise<boolean> {
  try {
    console.log("Attempting to send SMS to:", to);
    const formattedNumber = to.startsWith("+") ? to : `+${to}`;

    console.log("SMS request details:", {
      to: formattedNumber,
      from: twilioPhone,
      body: message.substring(0, 20) + "..."
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
      to: formattedNumber,
    });
    return true;
  } catch (error: any) {
    console.error("SMS message error:", error);
    if (error.code) {
      console.error("Twilio error details:", {
        code: error.code,
        message: error.message,
        status: error.status,
        moreInfo: error.moreInfo,
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
  code: string,
): Promise<boolean> {
  const message = `Your ADHD Coach verification code is: ${code}. This code will expire in 10 minutes.`;

  console.log("Sending verification message:", {
    type,
    contact,
    code
  });

  let result;
  switch (type) {
    case "whatsapp":
      result = await sendWhatsAppMessage(contact, code);
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
    success: result,
  });

  return result;
}