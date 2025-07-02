# Timezone Implementation Checklist

## Phase 1: Core Infrastructure ✓
- [x] Create country timezone lookup table (`server/utils/countryTimezones.ts`)
  - [x] Define CountryTimezone interface
  - [x] Create comprehensive country code mapping (100+ countries)
  - [x] Add utility functions:
    - [x] `extractCountryCode()` - Extract country code from phone number
    - [x] `getTimezonesForCountry()` - Get timezone list for a country
    - [x] `needsTimezoneSelection()` - Check if country has multiple timezones
    - [x] `getCountryName()` - Get country name from code
    - [x] `formatTimezoneForDisplay()` - Format timezone for user display
    - [x] `isValidTimezone()` - Validate timezone string

## Phase 2: WhatsApp Onboarding Updates
- [ ] Update `server/services/whatsappOnboarding.ts`
  - [ ] Add new onboarding states:
    - [ ] `CONFIRMING_TIMEZONE` - For single timezone countries
    - [ ] `SELECTING_TIMEZONE` - For multi-timezone countries
    - [ ] `TIMEZONE_SET` - Confirmation state
  - [ ] Add timezone data to user state:
    - [ ] `proposedTimezone?: string`
    - [ ] `timezoneOptions?: string[]`
    - [ ] `countryCode?: string`
  - [ ] Implement timezone detection after email verification
  - [ ] Handle timezone confirmation/selection responses
  - [ ] Inject system message to Kona after timezone is set

## Phase 3: LLM Function for Timezone Updates
- [ ] Add to `server/services/llm-functions.ts`:
  - [ ] Create `updateUserTimezone` function
  - [ ] Add input schema with timezone parameter
  - [ ] Implement timezone validation
  - [ ] Update user record in database
  - [ ] Return success/failure response

## Phase 4: Message Flow Implementation
- [ ] After user confirms timezone:
  - [ ] Update user record with confirmed timezone
  - [ ] Send system message to Kona: "Please set the user's timezone to [timezone]"
  - [ ] Let Kona's natural language processing handle the update
  - [ ] Send confirmation to user via WhatsApp

## Phase 5: Testing
- [ ] Unit Tests (`tests/countryTimezones.test.ts`):
  - [ ] Test country code extraction with various formats
  - [ ] Test timezone lookup for different countries
  - [ ] Test edge cases (invalid codes, missing data)
  - [ ] Test timezone validation

- [ ] Integration Tests (`tests/whatsappTimezone.test.ts`):
  - [ ] Test full onboarding flow with single timezone country
  - [ ] Test full onboarding flow with multi-timezone country
  - [ ] Test timezone confirmation responses
  - [ ] Test system message injection to Kona
  - [ ] Test LLM function execution

## Phase 6: Edge Cases & Error Handling
- [ ] Handle unknown country codes
- [ ] Handle invalid timezone selections
- [ ] Handle timeout during timezone selection
- [ ] Add retry mechanism for failed timezone updates
- [ ] Log timezone setting for debugging

## Phase 7: Documentation & Deployment
- [ ] Update API documentation
- [ ] Add timezone flow to onboarding documentation
- [ ] Test with real WhatsApp numbers from different countries
- [ ] Monitor logs for any issues
- [ ] Create rollback plan if needed

## Testing Scenarios

### Single Timezone Countries (e.g., UK +44)
1. User sends message from +44 number
2. System detects UK (single timezone)
3. System asks: "I've detected you're in United Kingdom. Should I set your timezone to Europe/London? (Yes/No)"
4. User responds "Yes"
5. System updates timezone and tells Kona to set it

### Multi-Timezone Countries (e.g., USA +1)
1. User sends message from +1 number
2. System detects USA/Canada (multiple timezones)
3. System asks: "I see you're in United States/Canada which has multiple timezones. Please select your timezone by replying with a number:
   1. Eastern Time (New York)
   2. Central Time (Chicago)
   3. Mountain Time (Denver)
   4. Pacific Time (Los Angeles)
   ..."
4. User responds "4"
5. System updates timezone to America/Los_Angeles and tells Kona to set it

### Unknown Country Code
1. User sends message from unknown country code
2. System asks: "I couldn't detect your timezone from your phone number. What timezone are you in?"
3. User responds with timezone info
4. System tells Kona to interpret and set the timezone

## Success Criteria
- [ ] All new WhatsApp users have correct timezone set
- [ ] Users can update timezone through natural language with Kona
- [ ] No regression in existing onboarding flow
- [ ] Clear user communication throughout the process
- [ ] Proper error handling and logging