# Timezone Lookup Implementation Plan

## Overview
Add country code-based timezone detection to the WhatsApp registration flow with user confirmation. This will replace the current server-side timezone detection that incorrectly uses the server's timezone.

## Implementation Steps

### 1. Create Country Code to Timezone Lookup Table

**File**: `server/utils/countryTimezones.ts`

```typescript
export interface CountryTimezone {
  countryCode: string;
  countryName: string;
  timezones: string[];
  defaultTimezone: string;
}

export const countryTimezones: Record<string, CountryTimezone> = {
  '1': {
    countryCode: '1',
    countryName: 'United States/Canada',
    timezones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Anchorage',
      'Pacific/Honolulu',
      'America/Toronto',
      'America/Vancouver',
      'America/Winnipeg',
      'America/Halifax'
    ],
    defaultTimezone: 'America/New_York'
  },
  '44': {
    countryCode: '44',
    countryName: 'United Kingdom',
    timezones: ['Europe/London'],
    defaultTimezone: 'Europe/London'
  },
  '91': {
    countryCode: '91',
    countryName: 'India',
    timezones: ['Asia/Kolkata'],
    defaultTimezone: 'Asia/Kolkata'
  },
  '86': {
    countryCode: '86',
    countryName: 'China',
    timezones: ['Asia/Shanghai'],
    defaultTimezone: 'Asia/Shanghai'
  },
  '81': {
    countryCode: '81',
    countryName: 'Japan',
    timezones: ['Asia/Tokyo'],
    defaultTimezone: 'Asia/Tokyo'
  },
  '49': {
    countryCode: '49',
    countryName: 'Germany',
    timezones: ['Europe/Berlin'],
    defaultTimezone: 'Europe/Berlin'
  },
  '33': {
    countryCode: '33',
    countryName: 'France',
    timezones: ['Europe/Paris'],
    defaultTimezone: 'Europe/Paris'
  },
  '7': {
    countryCode: '7',
    countryName: 'Russia',
    timezones: [
      'Europe/Moscow',
      'Europe/Kaliningrad',
      'Europe/Samara',
      'Asia/Yekaterinburg',
      'Asia/Omsk',
      'Asia/Krasnoyarsk',
      'Asia/Irkutsk',
      'Asia/Yakutsk',
      'Asia/Vladivostok',
      'Asia/Magadan',
      'Asia/Kamchatka'
    ],
    defaultTimezone: 'Europe/Moscow'
  },
  '55': {
    countryCode: '55',
    countryName: 'Brazil',
    timezones: [
      'America/Sao_Paulo',
      'America/Bahia',
      'America/Fortaleza',
      'America/Manaus',
      'America/Rio_Branco'
    ],
    defaultTimezone: 'America/Sao_Paulo'
  },
  '61': {
    countryCode: '61',
    countryName: 'Australia',
    timezones: [
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Brisbane',
      'Australia/Perth',
      'Australia/Adelaide',
      'Australia/Darwin',
      'Australia/Hobart'
    ],
    defaultTimezone: 'Australia/Sydney'
  },
  // Add more countries as needed
};

export function extractCountryCode(phoneNumber: string): string | null {
  // Remove 'whatsapp:' prefix if present
  const cleanNumber = phoneNumber.replace('whatsapp:', '').replace(/\D/g, '');
  
  // Check 1-3 digit country codes (most common lengths)
  for (let len = 1; len <= 3; len++) {
    const possibleCode = cleanNumber.substring(0, len);
    if (countryTimezones[possibleCode]) {
      return possibleCode;
    }
  }
  
  return null;
}

export function getTimezonesForCountry(countryCode: string): string[] {
  return countryTimezones[countryCode]?.timezones || [];
}

export function needsTimezoneSelection(countryCode: string): boolean {
  const country = countryTimezones[countryCode];
  return country ? country.timezones.length > 1 : false;
}
```

### 2. Update WhatsApp Onboarding State

**Modify**: `server/services/whatsappOnboarding.ts`

Add new states to handle timezone selection:
- `CONFIRMING_TIMEZONE` - For single timezone countries
- `SELECTING_TIMEZONE` - For multi-timezone countries

### 3. Implement Timezone Detection Flow

**In WhatsApp onboarding after email verification:**

```typescript
// After user creation, before completing onboarding
const countryCode = extractCountryCode(phoneNumber);
if (countryCode) {
  const timezones = getTimezonesForCountry(countryCode);
  
  if (timezones.length === 1) {
    // Single timezone country - just confirm
    await sendMessage(phoneNumber, 
      `I've detected you're in ${countryTimezones[countryCode].countryName}. ` +
      `Should I set your timezone to ${timezones[0]}? (Yes/No)`
    );
    userState.state = 'CONFIRMING_TIMEZONE';
    userState.proposedTimezone = timezones[0];
  } else if (timezones.length > 1) {
    // Multiple timezones - ask user to select
    const options = timezones.map((tz, idx) => `${idx + 1}. ${tz}`).join('\n');
    await sendMessage(phoneNumber,
      `I see you're in ${countryTimezones[countryCode].countryName} which has multiple timezones.\n` +
      `Please select your timezone by replying with a number:\n${options}`
    );
    userState.state = 'SELECTING_TIMEZONE';
    userState.timezoneOptions = timezones;
  }
} else {
  // Fallback - ask directly
  await sendMessage(phoneNumber,
    `I couldn't detect your timezone from your phone number. ` +
    `What timezone are you in? (e.g., "Eastern Time", "PST", "Europe/London")`
  );
  userState.state = 'ASKING_TIMEZONE';
}
```

### 4. Create LLM Function for Timezone Updates

**Add to**: `server/services/llm-functions.ts`

```typescript
{
  name: 'updateUserTimezone',
  description: 'Update the user\'s timezone setting',
  inputSchema: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'IANA timezone identifier (e.g., America/New_York)'
      }
    },
    required: ['timezone']
  },
  executor: async (args, userId) => {
    const { timezone } = args;
    
    // Validate timezone
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch (error) {
      return { 
        success: false, 
        message: `Invalid timezone: ${timezone}` 
      };
    }
    
    // Update user timezone
    await db.update(users)
      .set({ timeZone: timezone })
      .where(eq(users.id, userId));
    
    return {
      success: true,
      message: `Timezone updated to ${timezone}`
    };
  }
}
```

### 5. Natural Language Timezone Parsing

**Add to**: `server/services/timezoneParser.ts`

```typescript
const commonTimezoneNames: Record<string, string> = {
  'eastern': 'America/New_York',
  'est': 'America/New_York',
  'edt': 'America/New_York',
  'central': 'America/Chicago',
  'cst': 'America/Chicago',
  'cdt': 'America/Chicago',
  'mountain': 'America/Denver',
  'mst': 'America/Denver',
  'mdt': 'America/Denver',
  'pacific': 'America/Los_Angeles',
  'pst': 'America/Los_Angeles',
  'pdt': 'America/Los_Angeles',
  'gmt': 'Europe/London',
  'bst': 'Europe/London',
  'ist': 'Asia/Kolkata',
  // Add more mappings
};

export function parseTimezoneFromText(text: string): string | null {
  const normalized = text.toLowerCase().trim();
  
  // Check common names
  for (const [key, tz] of Object.entries(commonTimezoneNames)) {
    if (normalized.includes(key)) {
      return tz;
    }
  }
  
  // Check if it's already a valid IANA timezone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: text });
    return text;
  } catch {}
  
  return null;
}
```

### 6. Database Migration

Add migration to update existing users with server timezone to prompt for update:

```sql
-- Mark users with default/server timezone for update
UPDATE users 
SET needs_timezone_update = true 
WHERE time_zone = 'America/New_York' 
  AND phone_number IS NOT NULL;
```

### 7. Testing Plan

1. **Unit Tests**:
   - Country code extraction from various phone formats
   - Timezone lookup for different countries
   - Natural language timezone parsing

2. **Integration Tests**:
   - WhatsApp onboarding with single timezone country
   - WhatsApp onboarding with multi-timezone country
   - Timezone update via chat command
   - Existing user timezone migration

3. **Manual Testing**:
   - Test with phone numbers from different countries
   - Verify timezone confirmation flow
   - Test natural language timezone updates

## Implementation Order

1. Create country timezone lookup table and utilities
2. Update WhatsApp onboarding to detect country code
3. Implement timezone confirmation/selection states
4. Add LLM function for timezone updates
5. Create natural language timezone parser
6. Add tests
7. Deploy and monitor

## Considerations

- Store all times in UTC in database
- Convert to user timezone for display/scheduling
- Handle edge cases (invalid country codes, VoIP numbers)
- Support timezone changes (user travel, DST)
- Provide clear timezone display in user settings