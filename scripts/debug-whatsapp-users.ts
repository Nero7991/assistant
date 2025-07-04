#!/usr/bin/env tsx
import { db } from '../server/db';
import { users } from '@shared/schema';
import { eq, isNotNull } from 'drizzle-orm';

async function debugWhatsAppUsers() {
  console.log('=== WhatsApp Users Debug ===\n');
  
  try {
    // Get all users with phone numbers (WhatsApp users)
    const whatsappUsers = await db.select().from(users).where(isNotNull(users.phoneNumber));
    console.log(`Found ${whatsappUsers.length} users with phone numbers:`);
    
    for (const user of whatsappUsers) {
      console.log(`\nUser ID: ${user.id}`);
      console.log(`Username: ${user.username}`);
      console.log(`Email: ${user.email}`);
      console.log(`Phone: ${user.phoneNumber}`);
      console.log(`Contact Preference: ${user.contactPreference}`);
      console.log(`Phone Verified: ${user.isPhoneVerified}`);
      console.log(`Email Verified: ${user.isEmailVerified}`);
      console.log(`Allow Phone Notifications: ${user.allowPhoneNotifications}`);
      console.log(`Active: ${user.isActive}`);
      console.log(`Deactivated At: ${user.deactivatedAt}`);
      console.log(`Last User Message: ${user.last_user_initiated_message_at}`);
      console.log(`Time Zone: ${user.timeZone}`);
      console.log('---');
    }
    
    // Get all users without phone numbers (web-only users)
    const webUsers = await db.select().from(users).where(eq(users.phoneNumber, null));
    console.log(`\nFound ${webUsers.length} web-only users:`);
    
    for (const user of webUsers) {
      console.log(`\nUser ID: ${user.id}`);
      console.log(`Username: ${user.username}`);
      console.log(`Email: ${user.email}`);
      console.log(`Contact Preference: ${user.contactPreference}`);
      console.log(`Email Verified: ${user.isEmailVerified}`);
      console.log(`Active: ${user.isActive}`);
      console.log(`Last User Message: ${user.last_user_initiated_message_at}`);
      console.log('---');
    }
    
    // Summary comparison
    console.log('\n=== SUMMARY ===');
    console.log(`WhatsApp users: ${whatsappUsers.length}`);
    console.log(`Web-only users: ${webUsers.length}`);
    console.log(`Total users: ${whatsappUsers.length + webUsers.length}`);
    
    // Check for any issues
    const inactiveWhatsAppUsers = whatsappUsers.filter(u => !u.isActive);
    const unverifiedWhatsAppUsers = whatsappUsers.filter(u => !u.isPhoneVerified);
    const whatsAppUsersWithoutNotifications = whatsappUsers.filter(u => !u.allowPhoneNotifications);
    
    console.log('\n=== POTENTIAL ISSUES ===');
    console.log(`Inactive WhatsApp users: ${inactiveWhatsAppUsers.length}`);
    console.log(`Unverified WhatsApp users: ${unverifiedWhatsAppUsers.length}`);
    console.log(`WhatsApp users without phone notifications: ${whatsAppUsersWithoutNotifications.length}`);
    
    if (inactiveWhatsAppUsers.length > 0) {
      console.log('\nInactive WhatsApp users:');
      inactiveWhatsAppUsers.forEach(u => console.log(`- ${u.email} (${u.phoneNumber})`));
    }
    
    if (unverifiedWhatsAppUsers.length > 0) {
      console.log('\nUnverified WhatsApp users:');
      unverifiedWhatsAppUsers.forEach(u => console.log(`- ${u.email} (${u.phoneNumber})`));
    }
    
    if (whatsAppUsersWithoutNotifications.length > 0) {
      console.log('\nWhatsApp users without phone notifications:');
      whatsAppUsersWithoutNotifications.forEach(u => console.log(`- ${u.email} (${u.phoneNumber})`));
    }
    
  } catch (error) {
    console.error('Error debugging WhatsApp users:', error);
  }
}

// Run the debug function
debugWhatsAppUsers().catch(console.error);