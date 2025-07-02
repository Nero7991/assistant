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
  '52': {
    countryCode: '52',
    countryName: 'Mexico',
    timezones: [
      'America/Mexico_City',
      'America/Cancun',
      'America/Monterrey',
      'America/Tijuana',
      'America/Hermosillo',
      'America/Chihuahua'
    ],
    defaultTimezone: 'America/Mexico_City'
  },
  '34': {
    countryCode: '34',
    countryName: 'Spain',
    timezones: ['Europe/Madrid', 'Atlantic/Canary'],
    defaultTimezone: 'Europe/Madrid'
  },
  '39': {
    countryCode: '39',
    countryName: 'Italy',
    timezones: ['Europe/Rome'],
    defaultTimezone: 'Europe/Rome'
  },
  '82': {
    countryCode: '82',
    countryName: 'South Korea',
    timezones: ['Asia/Seoul'],
    defaultTimezone: 'Asia/Seoul'
  },
  '31': {
    countryCode: '31',
    countryName: 'Netherlands',
    timezones: ['Europe/Amsterdam'],
    defaultTimezone: 'Europe/Amsterdam'
  },
  '46': {
    countryCode: '46',
    countryName: 'Sweden',
    timezones: ['Europe/Stockholm'],
    defaultTimezone: 'Europe/Stockholm'
  },
  '47': {
    countryCode: '47',
    countryName: 'Norway',
    timezones: ['Europe/Oslo'],
    defaultTimezone: 'Europe/Oslo'
  },
  '45': {
    countryCode: '45',
    countryName: 'Denmark',
    timezones: ['Europe/Copenhagen'],
    defaultTimezone: 'Europe/Copenhagen'
  },
  '358': {
    countryCode: '358',
    countryName: 'Finland',
    timezones: ['Europe/Helsinki'],
    defaultTimezone: 'Europe/Helsinki'
  },
  '48': {
    countryCode: '48',
    countryName: 'Poland',
    timezones: ['Europe/Warsaw'],
    defaultTimezone: 'Europe/Warsaw'
  },
  '41': {
    countryCode: '41',
    countryName: 'Switzerland',
    timezones: ['Europe/Zurich'],
    defaultTimezone: 'Europe/Zurich'
  },
  '43': {
    countryCode: '43',
    countryName: 'Austria',
    timezones: ['Europe/Vienna'],
    defaultTimezone: 'Europe/Vienna'
  },
  '32': {
    countryCode: '32',
    countryName: 'Belgium',
    timezones: ['Europe/Brussels'],
    defaultTimezone: 'Europe/Brussels'
  },
  '353': {
    countryCode: '353',
    countryName: 'Ireland',
    timezones: ['Europe/Dublin'],
    defaultTimezone: 'Europe/Dublin'
  },
  '351': {
    countryCode: '351',
    countryName: 'Portugal',
    timezones: ['Europe/Lisbon', 'Atlantic/Azores'],
    defaultTimezone: 'Europe/Lisbon'
  },
  '30': {
    countryCode: '30',
    countryName: 'Greece',
    timezones: ['Europe/Athens'],
    defaultTimezone: 'Europe/Athens'
  },
  '90': {
    countryCode: '90',
    countryName: 'Turkey',
    timezones: ['Europe/Istanbul'],
    defaultTimezone: 'Europe/Istanbul'
  },
  '27': {
    countryCode: '27',
    countryName: 'South Africa',
    timezones: ['Africa/Johannesburg'],
    defaultTimezone: 'Africa/Johannesburg'
  },
  '234': {
    countryCode: '234',
    countryName: 'Nigeria',
    timezones: ['Africa/Lagos'],
    defaultTimezone: 'Africa/Lagos'
  },
  '254': {
    countryCode: '254',
    countryName: 'Kenya',
    timezones: ['Africa/Nairobi'],
    defaultTimezone: 'Africa/Nairobi'
  },
  '20': {
    countryCode: '20',
    countryName: 'Egypt',
    timezones: ['Africa/Cairo'],
    defaultTimezone: 'Africa/Cairo'
  },
  '212': {
    countryCode: '212',
    countryName: 'Morocco',
    timezones: ['Africa/Casablanca'],
    defaultTimezone: 'Africa/Casablanca'
  },
  '213': {
    countryCode: '213',
    countryName: 'Algeria',
    timezones: ['Africa/Algiers'],
    defaultTimezone: 'Africa/Algiers'
  },
  '216': {
    countryCode: '216',
    countryName: 'Tunisia',
    timezones: ['Africa/Tunis'],
    defaultTimezone: 'Africa/Tunis'
  },
  '966': {
    countryCode: '966',
    countryName: 'Saudi Arabia',
    timezones: ['Asia/Riyadh'],
    defaultTimezone: 'Asia/Riyadh'
  },
  '971': {
    countryCode: '971',
    countryName: 'United Arab Emirates',
    timezones: ['Asia/Dubai'],
    defaultTimezone: 'Asia/Dubai'
  },
  '972': {
    countryCode: '972',
    countryName: 'Israel',
    timezones: ['Asia/Jerusalem'],
    defaultTimezone: 'Asia/Jerusalem'
  },
  '98': {
    countryCode: '98',
    countryName: 'Iran',
    timezones: ['Asia/Tehran'],
    defaultTimezone: 'Asia/Tehran'
  },
  '92': {
    countryCode: '92',
    countryName: 'Pakistan',
    timezones: ['Asia/Karachi'],
    defaultTimezone: 'Asia/Karachi'
  },
  '880': {
    countryCode: '880',
    countryName: 'Bangladesh',
    timezones: ['Asia/Dhaka'],
    defaultTimezone: 'Asia/Dhaka'
  },
  '94': {
    countryCode: '94',
    countryName: 'Sri Lanka',
    timezones: ['Asia/Colombo'],
    defaultTimezone: 'Asia/Colombo'
  },
  '977': {
    countryCode: '977',
    countryName: 'Nepal',
    timezones: ['Asia/Kathmandu'],
    defaultTimezone: 'Asia/Kathmandu'
  },
  '66': {
    countryCode: '66',
    countryName: 'Thailand',
    timezones: ['Asia/Bangkok'],
    defaultTimezone: 'Asia/Bangkok'
  },
  '84': {
    countryCode: '84',
    countryName: 'Vietnam',
    timezones: ['Asia/Ho_Chi_Minh'],
    defaultTimezone: 'Asia/Ho_Chi_Minh'
  },
  '65': {
    countryCode: '65',
    countryName: 'Singapore',
    timezones: ['Asia/Singapore'],
    defaultTimezone: 'Asia/Singapore'
  },
  '60': {
    countryCode: '60',
    countryName: 'Malaysia',
    timezones: ['Asia/Kuala_Lumpur'],
    defaultTimezone: 'Asia/Kuala_Lumpur'
  },
  '62': {
    countryCode: '62',
    countryName: 'Indonesia',
    timezones: [
      'Asia/Jakarta',
      'Asia/Makassar',
      'Asia/Jayapura'
    ],
    defaultTimezone: 'Asia/Jakarta'
  },
  '63': {
    countryCode: '63',
    countryName: 'Philippines',
    timezones: ['Asia/Manila'],
    defaultTimezone: 'Asia/Manila'
  },
  '64': {
    countryCode: '64',
    countryName: 'New Zealand',
    timezones: ['Pacific/Auckland', 'Pacific/Chatham'],
    defaultTimezone: 'Pacific/Auckland'
  },
  '54': {
    countryCode: '54',
    countryName: 'Argentina',
    timezones: ['America/Argentina/Buenos_Aires'],
    defaultTimezone: 'America/Argentina/Buenos_Aires'
  },
  '56': {
    countryCode: '56',
    countryName: 'Chile',
    timezones: ['America/Santiago', 'Pacific/Easter'],
    defaultTimezone: 'America/Santiago'
  },
  '57': {
    countryCode: '57',
    countryName: 'Colombia',
    timezones: ['America/Bogota'],
    defaultTimezone: 'America/Bogota'
  },
  '58': {
    countryCode: '58',
    countryName: 'Venezuela',
    timezones: ['America/Caracas'],
    defaultTimezone: 'America/Caracas'
  },
  '51': {
    countryCode: '51',
    countryName: 'Peru',
    timezones: ['America/Lima'],
    defaultTimezone: 'America/Lima'
  },
  '593': {
    countryCode: '593',
    countryName: 'Ecuador',
    timezones: ['America/Guayaquil', 'Pacific/Galapagos'],
    defaultTimezone: 'America/Guayaquil'
  },
  '598': {
    countryCode: '598',
    countryName: 'Uruguay',
    timezones: ['America/Montevideo'],
    defaultTimezone: 'America/Montevideo'
  },
  '595': {
    countryCode: '595',
    countryName: 'Paraguay',
    timezones: ['America/Asuncion'],
    defaultTimezone: 'America/Asuncion'
  },
  '591': {
    countryCode: '591',
    countryName: 'Bolivia',
    timezones: ['America/La_Paz'],
    defaultTimezone: 'America/La_Paz'
  },
  '502': {
    countryCode: '502',
    countryName: 'Guatemala',
    timezones: ['America/Guatemala'],
    defaultTimezone: 'America/Guatemala'
  },
  '503': {
    countryCode: '503',
    countryName: 'El Salvador',
    timezones: ['America/El_Salvador'],
    defaultTimezone: 'America/El_Salvador'
  },
  '504': {
    countryCode: '504',
    countryName: 'Honduras',
    timezones: ['America/Tegucigalpa'],
    defaultTimezone: 'America/Tegucigalpa'
  },
  '505': {
    countryCode: '505',
    countryName: 'Nicaragua',
    timezones: ['America/Managua'],
    defaultTimezone: 'America/Managua'
  },
  '506': {
    countryCode: '506',
    countryName: 'Costa Rica',
    timezones: ['America/Costa_Rica'],
    defaultTimezone: 'America/Costa_Rica'
  },
  '507': {
    countryCode: '507',
    countryName: 'Panama',
    timezones: ['America/Panama'],
    defaultTimezone: 'America/Panama'
  },
  '509': {
    countryCode: '509',
    countryName: 'Haiti',
    timezones: ['America/Port-au-Prince'],
    defaultTimezone: 'America/Port-au-Prince'
  },
  '1876': {
    countryCode: '1876',
    countryName: 'Jamaica',
    timezones: ['America/Jamaica'],
    defaultTimezone: 'America/Jamaica'
  },
  '1868': {
    countryCode: '1868',
    countryName: 'Trinidad and Tobago',
    timezones: ['America/Port_of_Spain'],
    defaultTimezone: 'America/Port_of_Spain'
  },
  '1246': {
    countryCode: '1246',
    countryName: 'Barbados',
    timezones: ['America/Barbados'],
    defaultTimezone: 'America/Barbados'
  },
  '1242': {
    countryCode: '1242',
    countryName: 'Bahamas',
    timezones: ['America/Nassau'],
    defaultTimezone: 'America/Nassau'
  },
  '1809': {
    countryCode: '1809',
    countryName: 'Dominican Republic',
    timezones: ['America/Santo_Domingo'],
    defaultTimezone: 'America/Santo_Domingo'
  },
  '1787': {
    countryCode: '1787',
    countryName: 'Puerto Rico',
    timezones: ['America/Puerto_Rico'],
    defaultTimezone: 'America/Puerto_Rico'
  },
  '53': {
    countryCode: '53',
    countryName: 'Cuba',
    timezones: ['America/Havana'],
    defaultTimezone: 'America/Havana'
  }
};

export function extractCountryCode(phoneNumber: string): string | null {
  // Remove 'whatsapp:' prefix if present and clean the number
  const cleanNumber = phoneNumber.replace('whatsapp:', '').replace(/[^\d]/g, '');
  
  // Try to match country codes from longest to shortest (1-4 digits)
  // This handles special cases like 1876 (Jamaica) vs 1 (US/Canada)
  for (let len = 4; len >= 1; len--) {
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

export function getCountryName(countryCode: string): string {
  return countryTimezones[countryCode]?.countryName || 'Unknown';
}

export function formatTimezoneForDisplay(timezone: string): string {
  // Convert IANA timezone to a more readable format
  // e.g., "America/New_York" -> "Eastern Time (New York)"
  const parts = timezone.split('/');
  const city = parts[parts.length - 1].replace(/_/g, ' ');
  
  // Common timezone display names
  const displayNames: Record<string, string> = {
    'America/New_York': 'Eastern Time (New York)',
    'America/Chicago': 'Central Time (Chicago)',
    'America/Denver': 'Mountain Time (Denver)',
    'America/Los_Angeles': 'Pacific Time (Los Angeles)',
    'America/Phoenix': 'Mountain Time - Arizona (Phoenix)',
    'America/Anchorage': 'Alaska Time (Anchorage)',
    'Pacific/Honolulu': 'Hawaii Time (Honolulu)',
    'America/Toronto': 'Eastern Time (Toronto)',
    'America/Vancouver': 'Pacific Time (Vancouver)',
    'America/Winnipeg': 'Central Time (Winnipeg)',
    'America/Halifax': 'Atlantic Time (Halifax)',
    'Europe/London': 'British Time (London)',
    'Europe/Paris': 'Central European Time (Paris)',
    'Europe/Berlin': 'Central European Time (Berlin)',
    'Europe/Moscow': 'Moscow Time',
    'Asia/Tokyo': 'Japan Time (Tokyo)',
    'Asia/Shanghai': 'China Time (Shanghai)',
    'Asia/Kolkata': 'India Time (Kolkata)',
    'Australia/Sydney': 'Eastern Australia Time (Sydney)',
    'Australia/Perth': 'Western Australia Time (Perth)'
  };
  
  return displayNames[timezone] || `${city} Time`;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}