import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = 'kona@orencollaco.com'; // Updated sender email
const PASSWORD_RESET_EXPIRY_MINUTES = 60; // Token valid for 1 hour

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<boolean> {
  try {
    console.log("Preparing to send verification email:", {
      to,
      from: FROM_EMAIL,
      subject: 'Verify your Kona account'
    });

    const emailData = {
      to,
      from: FROM_EMAIL,
      subject: 'Verify your Kona account',
      text: `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Welcome to Kona!</h1>
          <p>Please use the following code to verify your account:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
            <strong>${code}</strong>
          </div>
          <p style="color: #666;">This code will expire in 10 minutes.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">
            If you didn't request this verification, please ignore this email.
          </p>
        </div>
      `,
    };

    console.log("Sending verification email with SendGrid...");
    const response = await mailService.send(emailData);
    console.log("SendGrid API Response:", response);
    console.log("Verification email sent successfully to:", to);
    return true;
  } catch (error: any) {
    console.error("SendGrid email error:", error);
    if (error.response) {
      console.error("SendGrid API Error Response:", {
        status: error.response.status,
        body: error.response.body,
        headers: error.response.headers
      });
    }
    return false;
  }
}

// ---> NEW: Send Password Reset Email
export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  resetLink: string
): Promise<boolean> {
  try {
    console.log("Preparing password reset email:", { to, from: FROM_EMAIL });
    const emailData = {
      to,
      from: FROM_EMAIL,
      subject: 'Reset your Kona Password',
      text: `Hi ${firstName},\n\nYou requested a password reset. Click the link below to set a new password:\n${resetLink}\n\nThis link will expire in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.\n\nIf you didn't request this, please ignore this email.\n\nThanks,\nThe Kona Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hi ${firstName},</p>
          <p>We received a request to reset the password for your Kona account.</p>
          <p>Click the button below to set a new password:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px;">
              Reset Your Password
            </a>
          </p>
          <p>This password reset link will expire in <strong>${PASSWORD_RESET_EXPIRY_MINUTES} minutes</strong>.</p>
          <p style="color: #666;">If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Thanks,<br>The Kona Team</p>
        </div>
      `,
    };

    console.log("Sending password reset email with SendGrid...");
    await mailService.send(emailData);
    console.log("Password reset email sent successfully to:", to);
    return true;
  } catch (error: any) {
    console.error("SendGrid password reset email error:", error);
    if (error.response) {
      console.error("SendGrid API Error Response:", error.response.body);
    }
    return false;
  }
}
// <--- END NEW