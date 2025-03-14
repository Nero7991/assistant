import twilio from "twilio";
import { randomInt } from "crypto";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

export async function sendWhatsAppMessage(to: string, message: string) {
  try {
    await client.messages.create({
      body: message,
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${to}`,
    });
    return true;
  } catch (error) {
    console.error("WhatsApp message error:", error);
    return false;
  }
}

export async function sendSMS(to: string, message: string) {
  try {
    await client.messages.create({
      body: message,
      from: twilioPhone,
      to: to,
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
  type: "whatsapp" | "imessage",
  contact: string,
  code: string
) {
  const message = `Your ADHD Coach verification code is: ${code}. This code will expire in 10 minutes.`;

  switch (type) {
    case "whatsapp":
      return sendWhatsAppMessage(contact, message);
    case "imessage":
      return sendSMS(contact, message);
  }
}