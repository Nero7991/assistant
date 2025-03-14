import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = 'noreply@adhdcoach.repl.co'; // Replace with your verified sender

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<boolean> {
  try {
    console.log("Sending verification email to:", to);
    await mailService.send({
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
    });
    console.log("Verification email sent successfully");
    return true;
  } catch (error) {
    console.error("SendGrid email error:", error);
    return false;
  }
}
