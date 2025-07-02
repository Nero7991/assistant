import { describe, it, expect } from 'vitest';
import {
  extractCountryCode,
  getTimezonesForCountry,
  needsTimezoneSelection,
  getCountryName,
  formatTimezoneForDisplay,
  isValidTimezone,
  countryTimezones
} from '../server/utils/countryTimezones';

describe('Country Timezone Utilities', () => {
  describe('extractCountryCode', () => {
    it('should extract country code from WhatsApp phone numbers', () => {
      expect(extractCountryCode('whatsapp:+12125551234')).toBe('1');
      expect(extractCountryCode('whatsapp:+442071234567')).toBe('44');
      expect(extractCountryCode('whatsapp:+919876543210')).toBe('91');
      expect(extractCountryCode('whatsapp:+8613912345678')).toBe('86');
    });

    it('should extract country code from plain phone numbers', () => {
      expect(extractCountryCode('+12125551234')).toBe('1');
      expect(extractCountryCode('+442071234567')).toBe('44');
      expect(extractCountryCode('+919876543210')).toBe('91');
    });

    it('should handle special 4-digit country codes', () => {
      expect(extractCountryCode('whatsapp:+18765551234')).toBe('1876'); // Jamaica
      expect(extractCountryCode('whatsapp:+18095551234')).toBe('1809'); // Dominican Republic
    });

    it('should return null for invalid or unknown country codes', () => {
      expect(extractCountryCode('whatsapp:+9999999999')).toBeNull();
      expect(extractCountryCode('invalid')).toBeNull();
      expect(extractCountryCode('')).toBeNull();
    });

    it('should handle numbers with non-digit characters', () => {
      expect(extractCountryCode('whatsapp:+1 (212) 555-1234')).toBe('1');
      expect(extractCountryCode('+44-207-123-4567')).toBe('44');
    });
  });

  describe('getTimezonesForCountry', () => {
    it('should return timezones for valid country codes', () => {
      const usTimezones = getTimezonesForCountry('1');
      expect(usTimezones).toContain('America/New_York');
      expect(usTimezones).toContain('America/Los_Angeles');
      expect(usTimezones.length).toBeGreaterThan(5);

      const ukTimezones = getTimezonesForCountry('44');
      expect(ukTimezones).toEqual(['Europe/London']);

      const indiaTimezones = getTimezonesForCountry('91');
      expect(indiaTimezones).toEqual(['Asia/Kolkata']);
    });

    it('should return empty array for unknown country codes', () => {
      expect(getTimezonesForCountry('999')).toEqual([]);
      expect(getTimezonesForCountry('')).toEqual([]);
    });
  });

  describe('needsTimezoneSelection', () => {
    it('should return true for countries with multiple timezones', () => {
      expect(needsTimezoneSelection('1')).toBe(true); // USA/Canada
      expect(needsTimezoneSelection('7')).toBe(true); // Russia
      expect(needsTimezoneSelection('55')).toBe(true); // Brazil
      expect(needsTimezoneSelection('61')).toBe(true); // Australia
    });

    it('should return false for countries with single timezone', () => {
      expect(needsTimezoneSelection('44')).toBe(false); // UK
      expect(needsTimezoneSelection('91')).toBe(false); // India
      expect(needsTimezoneSelection('81')).toBe(false); // Japan
      expect(needsTimezoneSelection('49')).toBe(false); // Germany
    });

    it('should return false for unknown country codes', () => {
      expect(needsTimezoneSelection('999')).toBe(false);
      expect(needsTimezoneSelection('')).toBe(false);
    });
  });

  describe('getCountryName', () => {
    it('should return country names for valid codes', () => {
      expect(getCountryName('1')).toBe('United States/Canada');
      expect(getCountryName('44')).toBe('United Kingdom');
      expect(getCountryName('91')).toBe('India');
      expect(getCountryName('86')).toBe('China');
    });

    it('should return Unknown for invalid codes', () => {
      expect(getCountryName('999')).toBe('Unknown');
      expect(getCountryName('')).toBe('Unknown');
    });
  });

  describe('formatTimezoneForDisplay', () => {
    it('should format common timezones with friendly names', () => {
      expect(formatTimezoneForDisplay('America/New_York')).toBe('Eastern Time (New York)');
      expect(formatTimezoneForDisplay('America/Los_Angeles')).toBe('Pacific Time (Los Angeles)');
      expect(formatTimezoneForDisplay('Europe/London')).toBe('British Time (London)');
      expect(formatTimezoneForDisplay('Asia/Tokyo')).toBe('Japan Time (Tokyo)');
    });

    it('should format unknown timezones by extracting city name', () => {
      expect(formatTimezoneForDisplay('America/Bogota')).toBe('Bogota Time');
      expect(formatTimezoneForDisplay('Pacific/Auckland')).toBe('Auckland Time');
      expect(formatTimezoneForDisplay('Africa/Lagos')).toBe('Lagos Time');
    });

    it('should handle underscores in city names', () => {
      expect(formatTimezoneForDisplay('America/New_York')).toBe('Eastern Time (New York)');
      expect(formatTimezoneForDisplay('America/Los_Angeles')).toBe('Pacific Time (Los Angeles)');
      expect(formatTimezoneForDisplay('America/Port_of_Spain')).toBe('Port of Spain Time');
    });
  });

  describe('isValidTimezone', () => {
    it('should validate correct IANA timezone identifiers', () => {
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
      expect(isValidTimezone('Australia/Sydney')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('should reject invalid timezone identifiers', () => {
      expect(isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(isValidTimezone('America/InvalidCity')).toBe(false);
      expect(isValidTimezone('NotATimezone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('null')).toBe(false);
    });
  });

  describe('countryTimezones data', () => {
    it('should have valid timezone data for all countries', () => {
      Object.entries(countryTimezones).forEach(([code, data]) => {
        // Check structure
        expect(data.countryCode).toBe(code);
        expect(data.countryName).toBeTruthy();
        expect(Array.isArray(data.timezones)).toBe(true);
        expect(data.timezones.length).toBeGreaterThan(0);
        expect(data.defaultTimezone).toBeTruthy();
        
        // Check default timezone is in the list
        expect(data.timezones).toContain(data.defaultTimezone);
        
        // Check all timezones are valid
        data.timezones.forEach(tz => {
          expect(isValidTimezone(tz)).toBe(true);
        });
      });
    });

    it('should cover major countries', () => {
      const majorCountries = ['1', '44', '91', '86', '81', '49', '33', '7', '55', '61', '52'];
      majorCountries.forEach(code => {
        expect(countryTimezones[code]).toBeDefined();
      });
    });
  });
});