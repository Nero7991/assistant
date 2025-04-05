import { randomInt } from "crypto";
import { sendVerificationEmail } from "./email";
import twilio from "twilio";

// Log Twilio configuration at startup for debugging
console.log("Initializing Twilio client with:", {
  accountSid: process.env.TWILIO_ACCOUNT_SID?.substring(0, 8) + "...",
  authToken: process.env.TWILIO_AUTH_TOKEN ? "[REDACTED]" : "missing",
  phoneNumber: process.env.TWILIO_PHONE_NUMBER
});

let client: any = null;
let twilioPhone = "+18557270654"; // Production WhatsApp business number

// Only initialize Twilio if credentials are available
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  twilioPhone = process.env.TWILIO_PHONE_NUMBER;
} else {
  console.log("Twilio credentials not found - messaging features will be disabled");
}

export async function sendWhatsAppMessage(to: string, code: string): Promise<boolean> {
  if (!client) {
    console.log("[DEV] Would send WhatsApp message:", { to, code });
    return true;
  }
  
  try {
    console.log("Attempting to send WhatsApp message to:", to);
    const formattedNumber = to.startsWith("+") ? to : `+${to}`;
    const fromWhatsApp = `whatsapp:${twilioPhone}`;
    const toWhatsApp = `whatsapp:${formattedNumber}`;

    // Log full request details for debugging
    console.log("Using Twilio credentials:", {
      accountSid: process.env.TWILIO_ACCOUNT_SID?.substring(0, 8) + "...",
      hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN
    });

    // Build message request parameters using the OTP template
    const messageRequest = {
      to: toWhatsApp,
      from: fromWhatsApp,
      contentSid: "HXe3a9d41c8e65346abaa70daaa14f698a", // verify_otp template SID
      contentVariables: JSON.stringify({
        "1": code // Pass the generated OTP code as variable {{1}}
      })
    };

    console.log("Twilio WhatsApp OTP request parameters:", messageRequest);

    const response = await client.messages.create(messageRequest);

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