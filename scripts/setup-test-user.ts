import 'dotenv/config';
import { db } from '../server/db';
import { users, appSettings } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

async function setupTestUser() {
  console.log('Setting up test user...');
  
  try {
    // First, check for existing users
    console.log('\n=== Checking existing users ===');
    const existingUsers = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      isActive: users.isActive
    }).from(users).limit(10);
    
    console.log(`Found ${existingUsers.length} existing users:`);
    existingUsers.forEach(user => {
      console.log(`- ID: ${user.id}, Username: ${user.username}, Email: ${user.email}, Active: ${user.isActive}`);
    });

    // Check if test user already exists
    const testUsername = 'testuser';
    const testUser = await db.select().from(users).where(eq(users.username, testUsername)).limit(1);
    
    if (testUser.length > 0) {
      console.log(`\nTest user '${testUsername}' already exists with ID: ${testUser[0].id}`);
      return testUser[0];
    }

    // Set registration slots if needed
    console.log('\n=== Setting registration slots ===');
    const slotsKey = 'registration_slots_available';
    
    // Check current slots
    const currentSlots = await db.select().from(appSettings).where(eq(appSettings.key, slotsKey)).limit(1);
    if (currentSlots.length === 0) {
      await db.insert(appSettings).values({
        key: slotsKey,
        value: '10'
      });
      console.log('Created registration slots setting with value: 10');
    } else {
      await db.update(appSettings).set({ value: '10' }).where(eq(appSettings.key, slotsKey));
      console.log('Updated registration slots to: 10');
    }

    // Create test user
    console.log('\n=== Creating test user ===');
    const password = 'testpass123';
    
    // Hash password using scrypt (same as auth.ts)
    const scryptAsync = promisify(scrypt);
    const salt = randomBytes(16).toString("hex");
    const derivedKey = await scryptAsync(password, salt, 64) as Buffer;
    const hashedPassword = salt + ":" + derivedKey.toString("hex");
    
    const [newUser] = await db.insert(users).values({
      username: testUsername,
      password: hashedPassword,
      email: 'testuser@example.com',
      firstName: 'Test',
      contactPreference: 'email',
      isEmailVerified: true,
      isPhoneVerified: false,
      allowEmailNotifications: true,
      allowPhoneNotifications: false,
      isActive: true,
      timeZone: 'America/New_York'
    }).returning();

    console.log('\n✅ Test user created successfully!');
    console.log(`Username: ${testUsername}`);
    console.log(`Password: ${password}`);
    console.log(`Email: ${newUser.email}`);
    console.log(`User ID: ${newUser.id}`);
    
    // Decrement registration slots
    const updatedSlots = parseInt(currentSlots[0]?.value || '10') - 1;
    await db.update(appSettings).set({ value: updatedSlots.toString() }).where(eq(appSettings.key, slotsKey));
    console.log(`\nRegistration slots remaining: ${updatedSlots}`);

    return newUser;
  } catch (error) {
    console.error('Error setting up test user:', error);
    process.exit(1);
  }
}

// Run the setup
setupTestUser().then((user) => {
  console.log('\n=== Setup Complete ===');
  console.log('\nAdd the following to your test environment or CLAUDE.md:');
  console.log(`TEST_USERNAME=testuser`);
  console.log(`TEST_PASSWORD=testpass123`);
  console.log(`TEST_USER_ID=${user.id}`);
  process.exit(0);
}).catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
});