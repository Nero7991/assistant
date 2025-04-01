/**
 * Test for the tasks query with our improved SQL syntax
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./shared/schema";
import { format } from 'date-fns';
import { sql } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });

async function testTasksQuery() {
  try {
    console.log('Testing tasks query with improved SQL syntax...');
    
    const userId = 6; // test_user
    const status = 'all'; // 'active', 'completed', or 'all'
    
    // Build conditions for the task query
    let conditions = [
      sql`${schema.tasks.userId} = ${userId}`
    ];
    
    // Add status condition
    if (status === 'active') {
      conditions.push(sql`${schema.tasks.completedAt} IS NULL`);
    } else if (status === 'completed') {
      conditions.push(sql`${schema.tasks.completedAt} IS NOT NULL`);
    }
    // For 'all' status, no additional condition needed
    
    // Combine conditions with AND
    const whereClause = sql.join(conditions, sql` AND `);
    
    console.log('Executing query for tasks...');
    
    // Get all tasks with the appropriate filters
    const taskList = await db
      .select()
      .from(schema.tasks)
      .where(whereClause);
    
    console.log(`Found ${taskList.length} tasks`);
    
    // For each task, get its subtasks
    const result = await Promise.all(taskList.map(async (task: any) => {
      // Skip tasks with no ID
      if (!task.id) {
        return {
          ...task,
          subtasks: []
        };
      }
      
      // Construct subtasks query
      const subtasksConditions = [
        sql`${schema.subtasks.parentTaskId} = ${task.id}`
      ];
      
      const subtasksWhereClause = sql.join(subtasksConditions, sql` AND `);
      
      // Get the subtasks for this task
      const subtaskList = await db
        .select()
        .from(schema.subtasks)
        .where(subtasksWhereClause);
        
      return {
        ...task,
        subtasks: subtaskList.map((st: any) => ({
          id: st.id,
          title: st.title,
          status: st.completedAt ? 'completed' : 'active',
          deadline: st.deadline ? format(new Date(st.deadline), 'yyyy-MM-dd') : null
        }))
      };
    }));
    
    console.log('Formatted tasks with subtasks:');
    console.log(JSON.stringify(result, null, 2));
    
    return true;
  } catch (error) {
    console.error('Test failed:', error);
    return false;
  }
}

// Run the test
testTasksQuery().then(success => {
  console.log(`Test ${success ? 'succeeded' : 'failed'}`);
  process.exit(success ? 0 : 1);
});
