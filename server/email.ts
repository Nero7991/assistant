import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = 'kona@orencollaco.com'; // Updated sender email

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<boolean> {
  try {
    console.log("Preparing to send verification email:", {
      to,
      from: FROM_EMAIL,
      subject: 'Verify your ADHD Coach account'
    });

    const emailData = {
      to,
      from: FROM_EMAIL,
      subject: 'Verify your ADHD Coach account',
      text: `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Welcome to ADHD Coach!</h1>
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