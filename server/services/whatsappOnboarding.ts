import { db } from '../db';
import { users, contactVerifications } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sendVerificationEmail } from './emailService'; // Path seems correct based on previous usage
import { generateVerificationCode } from '../messaging'; // Corrected path based on search
import { hashPassword } from '../auth'; // Corrected path based on search
import { storage } from '../storage'; // Import storage for verification DB operations

// Remove in-memory state for verification code/expiry
interface OnboardingState {
    step: 'start' | 'awaiting_confirmation' | 'awaiting_name' | 'awaiting_email' | 'awaiting_email_verification' | 'completed';
    firstName?: string;
    email?: string;
    // Removed verificationCode and verificationExpiresAt from here
}

const onboardingSessions: Map<string, OnboardingState> = new Map();

// Helper to clean phone number for use as tempId
function cleanPhoneNumberForTempId(phoneNumber: string): string {
    return phoneNumber.replace(/\D/g, ''); // Remove non-digit characters
}

/**
 * Handles an incoming WhatsApp message for potential onboarding.
 * @param fromPhoneNumber The sender's phone number (e.g., whatsapp:+1234567890)
 * @param messageBody The content of the message.
 * @returns A response message to send back to the user, or null if no response needed.
 */
export async function handleWhatsAppOnboarding(fromPhoneNumber: string, messageBody: string): Promise<string | null> {
    console.log(`Handling WhatsApp message from ${fromPhoneNumber}: \"${messageBody}\"`);

    const existingUser = await db.query.users.findFirst({
        where: eq(users.phoneNumber, fromPhoneNumber),
    });

    if (existingUser) {
        console.log(`Phone number ${fromPhoneNumber} already associated with user ID ${existingUser.id}. No onboarding needed.`);
        onboardingSessions.delete(fromPhoneNumber); // Clean up any stale state
        return null;
    }

    let state = onboardingSessions.get(fromPhoneNumber);
    const tempId = cleanPhoneNumberForTempId(fromPhoneNumber);

    if (!state) {
        state = { step: 'start' };
        onboardingSessions.set(fromPhoneNumber, state);
        state.step = 'awaiting_confirmation';
        return "Hello! I'm your ADHD Assistant coach. It looks like this number isn't registered yet. Would you like to sign up? (yes/no)";
    }

    switch (state.step) {
        case 'awaiting_confirmation':
            if (messageBody.trim().toLowerCase() === 'yes') {
                state.step = 'awaiting_name';
                return "Great! What's your first name?";
            } else {
                onboardingSessions.delete(fromPhoneNumber);
                return "Okay, no problem. Let me know if you change your mind!";
            }

        case 'awaiting_name':
            state.firstName = messageBody.trim();
            if (!state.firstName) {
                return "Please enter a valid first name.";
            }
            state.step = 'awaiting_email';
            return `Thanks ${state.firstName}! What's your email address? We'll send a code to verify it.`;

        case 'awaiting_email':
            const email = messageBody.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return "That doesn't look like a valid email address. Please try again.";
            }
            state.email = email;

            const emailExists = await db.query.users.findFirst({ where: eq(users.email, state.email) });
            if (emailExists) {
                state.step = 'awaiting_email';
                return "This email is already associated with an account. Please provide a different email address.";
            }

            try {
                const code = generateVerificationCode();
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

                // Use storage method to create verification record using phone number as tempId
                await storage.createContactVerification({
                    tempId: tempId,
                    type: 'email',
                    code: code,
                    expiresAt: expiresAt,
                });

                await sendVerificationEmail(state.email, code);
                state.step = 'awaiting_email_verification';
                return `Okay, I've sent a 6-digit verification code to ${state.email}. Please enter it here.`;
            } catch (error) {
                console.error(`Failed to initiate email verification for ${state.email} (tempId: ${tempId}):`, error);
                return "Sorry, I wasn't able to send the verification email. Please try providing your email again.";
            }

        case 'awaiting_email_verification':
            const enteredCode = messageBody.trim();
            try {
                 // Fetch the latest verification attempt for this tempId (phone number)
                const verification = await storage.getLatestContactVerification(tempId, 'email');

                if (!verification) {
                    // Should not happen if the flow is correct
                    state.step = 'awaiting_email'; // Go back to email step
                    return "Something went wrong. Let's try getting your email again.";
                }

                if (new Date() > verification.expiresAt) {
                    state.step = 'awaiting_email';
                    // No need to delete code/expiry from state now
                    return "That verification code has expired. Let's try sending it again. What's your email address?";
                }

                if (verification.code === enteredCode) {
                    // Mark verified in the DB
                    await storage.markContactVerified(tempId, 'email');

                    // Verification successful! Create user.
                    if (!state.email || !state.firstName) {
                        console.error('Error: Missing email or firstName during final verification step.', state);
                        onboardingSessions.delete(fromPhoneNumber);
                        return "Something went wrong during signup. Please try starting the process again.";
                    }

                    const tempPassword = Math.random().toString(36).slice(-8);
                    const hashedPassword = await hashPassword(tempPassword); // Hash the password

                    await db.insert(users).values({
                        username: state.email, // Use email as username
                        password: hashedPassword, // Store hashed password
                        email: state.email,
                        phoneNumber: fromPhoneNumber,
                        firstName: state.firstName,
                        contactPreference: 'whatsapp',
                        isPhoneVerified: true,
                        isEmailVerified: true, // Email is now verified
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        // Ensure other non-nullable fields have defaults or are set
                        allowEmailNotifications: true, // Example default
                        allowPhoneNotifications: true, // Example default for WhatsApp onboarding
                        wakeTime: users.wakeTime.default,
                        routineStartTime: users.routineStartTime.default,
                        sleepTime: users.sleepTime.default,
                        preferredModel: users.preferredModel.default,
                        isActive: users.isActive.default,
                    });

                    state.step = 'completed';
                    onboardingSessions.delete(fromPhoneNumber);

                    console.log(`User ${state.firstName} (${state.email}) created successfully via WhatsApp from ${fromPhoneNumber}.`);
                    // TODO: Consider sending the temporary password or instructing user on next steps
                    return `Thanks ${state.firstName}! Your email is verified, and your account is set up. You can now start using the ADHD Assistant! We'll primarily contact you via WhatsApp.`;

                } else {
                    return "That code doesn't seem right. Please double-check and enter the 6-digit code again.";
                }
            } catch (error) {
                 console.error(`Failed to verify code or create user for ${state.email} (tempId: ${tempId}):`, error);
                 onboardingSessions.delete(fromPhoneNumber);
                 return "Sorry, there was an error verifying your code or creating your account. Please try signing up again later.";
            }

        case 'completed':
             return "You're already set up! How can I help you today?";

        case 'start':
        default:
            console.warn(`Unexpected state '${state.step}' for ${fromPhoneNumber}`);
            onboardingSessions.delete(fromPhoneNumber);
            // Reset to start
            state = { step: 'start' };
            onboardingSessions.set(fromPhoneNumber, state);
            state.step = 'awaiting_confirmation';
            return "Sorry, something went wrong. Let's start over. Would you like to sign up? (yes/no)";
    }
}
 