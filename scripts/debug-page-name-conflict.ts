/**
 * Debug Script for Page Name Conflicts
 * 
 * This script helps debug why page name conflicts occur after soft deletion.
 */

import { db } from '../server/db';
import { creations } from '../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

async function debugPageNameConflict() {
  try {
    console.log('🔍 Debugging Page Name Conflicts');

    // Find all creations with soft-delete-test in the page name
    console.log('\n📊 Finding all creations with "soft-delete-test" in page name...');
    
    const allTestCreations = await db
      .select()
      .from(creations)
      .where(eq(creations.userId, 5)); // Test user ID

    const testCreations = allTestCreations.filter(c => 
      c.pageName?.includes('soft-delete-test')
    );

    console.log(`Found ${testCreations.length} test creations:`);
    testCreations.forEach(creation => {
      console.log(`  ID: ${creation.id}, Page: ${creation.pageName}, Deleted: ${creation.deletedAt ? 'YES' : 'NO'}`);
    });

    // Find non-deleted creations only
    console.log('\n📋 Finding non-deleted test creations...');
    
    const nonDeletedTestCreations = await db
      .select()
      .from(creations)
      .where(and(
        eq(creations.userId, 5),
        isNull(creations.deletedAt)
      ));

    const nonDeletedTest = nonDeletedTestCreations.filter(c => 
      c.pageName?.includes('soft-delete-test')
    );

    console.log(`Found ${nonDeletedTest.length} non-deleted test creations:`);
    nonDeletedTest.forEach(creation => {
      console.log(`  ID: ${creation.id}, Page: ${creation.pageName}, Created: ${creation.createdAt}`);
    });

    // Check for specific page name that's causing conflict
    const conflictPageName = 'soft-delete-test-1751640819729'; // From the last test
    console.log(`\n🔍 Checking specific page name: ${conflictPageName}`);
    
    const specificConflicts = await db
      .select()
      .from(creations)
      .where(eq(creations.pageName, conflictPageName));

    console.log(`Found ${specificConflicts.length} creations with that exact page name:`);
    specificConflicts.forEach(creation => {
      console.log(`  ID: ${creation.id}, User: ${creation.userId}, Deleted: ${creation.deletedAt ? 'YES' : 'NO'}, Title: ${creation.title}`);
    });

    // Check non-deleted with specific page name
    const nonDeletedSpecific = await db
      .select()
      .from(creations)
      .where(and(
        eq(creations.pageName, conflictPageName),
        isNull(creations.deletedAt)
      ));

    console.log(`Found ${nonDeletedSpecific.length} non-deleted creations with that page name:`);
    nonDeletedSpecific.forEach(creation => {
      console.log(`  ID: ${creation.id}, User: ${creation.userId}, Title: ${creation.title}`);
    });

    console.log('\n✅ Debug complete');

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

debugPageNameConflict();