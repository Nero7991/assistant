import twilio from "twilio";
import { randomInt } from "crypto";
import { sendVerificationEmail } from "./email";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

export async function sendWhatsAppMessage(to: string, message: string) {
  try {
    console.log("Attempting to send WhatsApp message to:", to);
    const response = await client.messages.create({
      body: message,
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${to}`,
    });
    console.log("WhatsApp message sent successfully:", {
      sid: response.sid,
      status: response.status,
      errorCode: response.errorCode,
      errorMessage: response.errorMessage,
    });
    return true;
  } catch (error) {
    console.error("WhatsApp message error:", error);
    return false;
  }
}

export async function sendSMS(to: string, message: string) {
  try {
    console.log("Attempting to send SMS to:", to);
    const response = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: to,
    });
    console.log("SMS sent successfully:", {
      sid: response.sid,
      status: response.status,
      errorCode: response.errorCode,
      errorMessage: response.errorMessage,
    });
    return true;
  } catch (error) {
    console.error("SMS message error:", error);
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