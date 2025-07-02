import { db } from '../db';
import { users, contactVerifications } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
// TODO: Create or import proper email service
// import { sendVerificationEmail } from './emailService';
import { sendVerificationMessage, generateVerificationCode } from '../messaging';
import { hashPassword } from '../auth'; // Corrected path based on search
import { storage } from '../storage'; // Import storage for verification DB operations
import { extractCountryCode, getTimezonesForCountry, needsTimezoneSelection, getCountryName, formatTimezoneForDisplay } from '../utils/countryTimezones';

// Remove in-memory state for verification code/expiry
interface OnboardingState {
    step: 'start' | 'awaiting_confirmation' | 'awaiting_name' | 'awaiting_email' | 'awaiting_email_verification' | 'confirming_timezone' | 'selecting_timezone' | 'completed';
    firstName?: string;
    email?: string;
    // Removed verificationCode and verificationExpiresAt from here
    proposedTimezone?: string;
    timezoneOptions?: string[];
    countryCode?: string;
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
        return "Hello! I'm Kona, your kind and encouraging AI personal assistant. It looks like this number isn't registered yet. Would you like to sign up? (yes/no)";
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
                    tempId: tempId, // Use tempId directly as string
                    type: 'email',
                    code: code,
                    expiresAt: expiresAt,
                });

                await sendVerificationMessage('email', state.email, code);
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
                const verification = await storage.getLatestContactVerification(tempId);

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

                    // Verification successful! Now handle timezone before creating user
                    if (!state.email || !state.firstName) {
                        console.error('Error: Missing email or firstName during final verification step.', state);
                        onboardingSessions.delete(fromPhoneNumber);
                        return "Something went wrong during signup. Please try starting the process again.";
                    }

                    // Extract country code and determine timezone flow
                    const countryCode = extractCountryCode(fromPhoneNumber);
                    if (countryCode) {
                        state.countryCode = countryCode;
                        const timezones = getTimezonesForCountry(countryCode);
                        const countryName = getCountryName(countryCode);
                        
                        if (timezones.length === 0) {
                            // Unknown country, ask directly
                            state.step = 'selecting_timezone';
                            return `Thanks ${state.firstName}! Your email is verified. I couldn't detect your timezone from your phone number. What timezone are you in? (e.g., "Eastern Time", "PST", "Europe/London")`;
                        } else if (timezones.length === 1) {
                            // Single timezone country - just confirm
                            state.proposedTimezone = timezones[0];
                            state.step = 'confirming_timezone';
                            return `Thanks ${state.firstName}! Your email is verified. I've detected you're in ${countryName}. Should I set your timezone to ${formatTimezoneForDisplay(timezones[0])}? (Yes/No)`;
                        } else {
                            // Multiple timezones - ask user to select
                            state.timezoneOptions = timezones;
                            state.step = 'selecting_timezone';
                            const options = timezones.map((tz, idx) => `${idx + 1}. ${formatTimezoneForDisplay(tz)}`).join('\n');
                            return `Thanks ${state.firstName}! Your email is verified. I see you're in ${countryName} which has multiple timezones.\n\nPlease select your timezone by replying with a number:\n${options}`;
                        }
                    } else {
                        // Fallback - ask directly
                        state.step = 'selecting_timezone';
                        return `Thanks ${state.firstName}! Your email is verified. I couldn't detect your timezone from your phone number. What timezone are you in? (e.g., "Eastern Time", "PST", "Europe/London")`;
                    }

                } else {
                    return "That code doesn't seem right. Please double-check and enter the 6-digit code again.";
                }
            } catch (error) {
                 console.error(`Failed to verify code or create user for ${state.email} (tempId: ${tempId}):`, error);
                 onboardingSessions.delete(fromPhoneNumber);
                 return "Sorry, there was an error verifying your code or creating your account. Please try signing up again later.";
            }

        case 'confirming_timezone':
            const confirmResponse = messageBody.trim().toLowerCase();
            if (confirmResponse === 'yes' || confirmResponse === 'y') {
                // User confirmed the timezone
                if (!state.proposedTimezone || !state.email || !state.firstName) {
                    console.error('Error: Missing required data during timezone confirmation.', state);
                    onboardingSessions.delete(fromPhoneNumber);
                    return "Something went wrong during signup. Please try starting the process again.";
                }
                
                // Create user with confirmed timezone
                return await createUserWithTimezone(fromPhoneNumber, state, state.proposedTimezone);
            } else if (confirmResponse === 'no' || confirmResponse === 'n') {
                // User rejected the proposed timezone, ask them to specify
                state.step = 'selecting_timezone';
                return "What timezone are you in? You can tell me the city name or timezone (e.g., 'New York', 'Pacific Time', 'GMT+5:30')";
            } else {
                return "Please reply with 'Yes' or 'No' to confirm your timezone.";
            }

        case 'selecting_timezone':
            const timezoneInput = messageBody.trim();
            
            // Check if user selected from numbered list
            if (state.timezoneOptions && /^\d+$/.test(timezoneInput)) {
                const index = parseInt(timezoneInput) - 1;
                if (index >= 0 && index < state.timezoneOptions.length) {
                    const selectedTimezone = state.timezoneOptions[index];
                    return await createUserWithTimezone(fromPhoneNumber, state, selectedTimezone);
                } else {
                    return `Please select a number between 1 and ${state.timezoneOptions.length}.`;
                }
            } else {
                // User provided timezone as text - we'll let Kona handle this after user creation
                // For now, create user with a default timezone and let Kona update it
                const defaultTimezone = 'UTC'; // Safe default
                return await createUserWithTimezone(fromPhoneNumber, state, defaultTimezone, timezoneInput);
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

// Helper function to create user with timezone and inject message to Kona
async function createUserWithTimezone(
    fromPhoneNumber: string, 
    state: OnboardingState, 
    timezone: string,
    userProvidedTimezone?: string
): Promise<string> {
    if (!state.email || !state.firstName) {
        throw new Error('Missing email or firstName when creating user');
    }

    try {
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await hashPassword(tempPassword);

        const [newUser] = await db.insert(users).values({
            username: state.email,
            password: hashedPassword,
            email: state.email,
            phoneNumber: fromPhoneNumber,
            firstName: state.firstName,
            contactPreference: 'whatsapp',
            isPhoneVerified: true,
            isEmailVerified: true,
            timeZone: timezone,
            allowEmailNotifications: true,
            allowPhoneNotifications: true,
            wakeTime: users.wakeTime.default,
            routineStartTime: users.routineStartTime.default,
            sleepTime: users.sleepTime.default,
            preferredModel: users.preferredModel.default,
            isActive: users.isActive.default,
        }).returning();

        state.step = 'completed';
        onboardingSessions.delete(fromPhoneNumber);

        console.log(`User ${state.firstName} (${state.email}) created successfully via WhatsApp from ${fromPhoneNumber} with timezone ${timezone}.`);

        // If user provided a custom timezone string, inject a system message to Kona to update it
        if (userProvidedTimezone) {
            // Import messaging service to handle the timezone update
            const { MessagingService } = await import('./messaging');
            const messagingService = new MessagingService();
            
            // Send a system message to Kona to update the timezone
            setTimeout(async () => {
                const systemMessage = `System: The user just told me their timezone is "${userProvidedTimezone}". Please update their timezone setting accordingly.`;
                await messagingService.handleUserResponse(newUser.id, systemMessage);
            }, 1000); // Small delay to ensure user is created

            return `Welcome ${state.firstName}! Your account is all set up. I'll update your timezone to ${userProvidedTimezone} and we can start chatting. How can I help you today?`;
        } else {
            return `Welcome ${state.firstName}! Your account is all set up with timezone ${formatTimezoneForDisplay(timezone)}. You can start using Kona now! How can I help you today?`;
        }
    } catch (error) {
        console.error(`Failed to create user for ${state.email}:`, error);
        onboardingSessions.delete(fromPhoneNumber);
        return "Sorry, there was an error creating your account. Please try signing up again later.";
    }
}
 