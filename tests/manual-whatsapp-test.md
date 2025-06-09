# Manual WhatsApp Onboarding Test Guide

This guide helps you manually test the WhatsApp/SMS onboarding flow.

## Prerequisites

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Ensure you have Twilio credentials configured in your `.env` file:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER` (your WhatsApp-enabled Twilio number)

3. Have a WhatsApp account ready for testing

## Test Flow

### 1. Initial Contact
- Send "Hello" or any message to your Twilio WhatsApp number
- **Expected**: You should receive a welcome message asking if you want to sign up

### 2. Confirm Signup
- Reply with "yes"
- **Expected**: Bot asks for your first name

### 3. Provide Name
- Reply with your first name (e.g., "John")
- **Expected**: Bot thanks you and asks for your email address

### 4. Provide Email
- Reply with a valid email address
- **Expected**: Bot sends a verification code to your email

### 5. Enter Verification Code
- Check your email for the 6-digit code
- Reply with the code
- **Expected**: Bot confirms account creation and welcomes you

### 6. Test Post-Signup
- Send any message after signup
- **Expected**: The message should be processed by the main messaging service (not onboarding)

## Edge Cases to Test

### Invalid Email
1. During the email step, provide an invalid email (e.g., "notanemail")
2. **Expected**: Bot asks for a valid email address

### Existing Email
1. Try to sign up with an email already in the system
2. **Expected**: Bot indicates the email is already in use

### Wrong Verification Code
1. Enter an incorrect 6-digit code
2. **Expected**: Bot asks you to try again

### Expired Code
1. Wait more than 10 minutes before entering the code
2. **Expected**: Bot indicates the code has expired

### Decline Signup
1. At the initial prompt, reply with "no"
2. **Expected**: Bot acknowledges and ends the conversation

## Automated Test Script

Run the automated webhook test:
```bash
node tests/test-whatsapp-webhook-flow.mjs
```

## Database Verification

After successful signup, verify the user was created:

```sql
SELECT * FROM users WHERE phone_number LIKE '%YOUR_PHONE_NUMBER%';
```

Check verification records:
```sql
SELECT * FROM contact_verifications WHERE user_id = YOUR_USER_ID;
```

## Troubleshooting

### Messages Not Received
- Check Twilio console for webhook logs
- Verify webhook URL is correctly configured in Twilio
- Check server logs for webhook processing

### Verification Code Not Sent
- Check email service configuration
- Verify SendGrid API key is set
- Check server logs for email sending errors

### User Not Created
- Check database connection
- Verify all required fields are provided
- Check server logs for database errors

## Clean Up Test Data

To remove test users:
```sql
DELETE FROM users WHERE email LIKE 'test_%@example.com';
DELETE FROM contact_verifications WHERE user_id NOT IN (SELECT id FROM users);
```