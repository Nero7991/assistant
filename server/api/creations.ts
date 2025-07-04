import type { Express, Request, Response } from "express";
import { db } from "../db";
import { 
  creations, 
  creationTasks, 
  creationSubtasks,
  insertCreationSchema,
  insertCreationTaskSchema, 
  insertCreationSubtaskSchema,
  CreationStatus,
  TaskStatus,
  type Creation,
  type CreationTask,
  type CreationSubtask
} from "@shared/schema";
import { eq, and, desc, asc, isNull } from "drizzle-orm";
import { generateArchitecturePlan, generateTaskBreakdown } from "../services/llm-functions";

export function registerCreationsAPI(app: Express) {

// Get all creations for a user
app.get("/api/creations", async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userCreations = await db
      .select()
      .from(creations)
      .where(and(
        eq(creations.userId, req.user.id),
        isNull(creations.deletedAt)
      ))
      .orderBy(desc(creations.createdAt));

    res.json(userCreations);
  } catch (error) {
    console.error("Error fetching creations:", error);
    res.status(500).json({ error: "Failed to fetch creations" });
  }
});

// Get a specific creation with its tasks and subtasks
app.get("/api/creations/:id", async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const creationId = parseInt(req.params.id);
    if (isNaN(creationId)) {
      return res.status(400).json({ error: "Invalid creation ID" });
    }

    // Get the creation
    const creation = await db
      .select()
      .from(creations)
      .where(and(
        eq(creations.id, creationId),
        eq(creations.userId, req.user.id)
      ))
      .limit(1);

    if (creation.length === 0) {
      return res.status(404).json({ error: "Creation not found" });
    }

    // Get tasks for this creation
    const tasks = await db
      .select()
      .from(creationTasks)
      .where(eq(creationTasks.creationId, creationId))
      .orderBy(asc(creationTasks.orderIndex));

    // Get subtasks for this creation
    const subtasks = await db
      .select()
      .from(creationSubtasks)
      .where(eq(creationSubtasks.creationId, creationId))
      .orderBy(asc(creationSubtasks.orderIndex));

    res.json({
      creation: creation[0],
      tasks,
      subtasks,
    });
  } catch (error) {
    console.error("Error fetching creation:", error);
    res.status(500).json({ error: "Failed to fetch creation" });
  }
});

// Create a new creation
app.post("/api/creations", async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let validatedData;
    try {
      validatedData = insertCreationSchema.parse(req.body);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: error.errors.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      throw error;
    }

    // Generate a page name if not provided
    let pageName = validatedData.pageName;
    if (!pageName) {
      pageName = validatedData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
      
      // Ensure uniqueness
      let counter = 1;
      let uniquePageName = pageName;
      let attempts = 0;
      const maxAttempts = 100; // Prevent infinite loops
      
      while (attempts < maxAttempts) {
        const existing = await db
          .select()
          .from(creations)
          .where(and(
            eq(creations.pageName, uniquePageName),
            isNull(creations.deletedAt)
          ))
          .limit(1);
        
        if (existing.length === 0) {
          pageName = uniquePageName;
          break;
        }
        
        uniquePageName = `${pageName}-${counter}`;
        counter++;
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        return res.status(400).json({ 
          error: "Unable to generate a unique page name. Please specify a custom page name." 
        });
      }
    }

    // Check for page name conflicts with non-deleted creations
    if (pageName) {
      const existingPageName = await db
        .select()
        .from(creations)
        .where(and(
          eq(creations.pageName, pageName),
          isNull(creations.deletedAt)
        ))
        .limit(1);
      
      if (existingPageName.length > 0) {
        return res.status(409).json({ 
          error: "Page name already exists. Please choose a different page name." 
        });
      }
    }

    // Create the creation
    const newCreation = await db
      .insert(creations)
      .values({
        userId: req.user.id,
        title: validatedData.title,
        description: validatedData.description,
        pageName,
        status: CreationStatus.BRAINSTORMING,
        deploymentUrl: `https://pages.orenslab.com/${pageName}`,
        techStack: validatedData.techStack || [],
        estimatedDuration: validatedData.estimatedDuration,
      })
      .returning();

    res.status(201).json(newCreation[0]);
  } catch (error: any) {
    console.error("Creation error:", error.message);
    
    // Extract error information from nested error objects (Drizzle wraps database errors)
    const errorToCheck = error.cause || error.original || error;
    const errorCode = errorToCheck.code || error.code;
    const errorDetail = errorToCheck.detail || error.detail || errorToCheck.message || error.message;
    const errorConstraint = errorToCheck.constraint || error.constraint;
    
    // Handle specific database constraint violations
    if (errorCode === '23505') { // PostgreSQL unique constraint violation
      // Check for page name constraint
      const isPageNameError = (
        errorConstraint?.includes('page_name') ||
        errorConstraint?.includes('pageName') ||
        errorDetail?.includes('page_name') ||
        errorDetail?.includes('pageName') ||
        (errorDetail && errorDetail.toLowerCase().includes('duplicate key')) ||
        (errorDetail && errorDetail.toLowerCase().includes('already exists'))
      );
      
      if (isPageNameError) {
        return res.status(409).json({ 
          error: "Page name already exists. Please choose a different page name." 
        });
      }
      
      return res.status(409).json({ 
        error: "A creation with these details already exists." 
      });
    }
    
    // Handle other database errors
    if (errorCode === '23503') { // Foreign key constraint violation
      return res.status(400).json({ 
        error: "Invalid user reference. Please log in again." 
      });
    }
    
    if (errorCode === '23514') { // Check constraint violation
      return res.status(400).json({ 
        error: "Data violates database constraints. Please check your input." 
      });
    }
    
    // Check for common error messages that indicate constraint violations
    if (errorDetail && typeof errorDetail === 'string') {
      const lowerDetail = errorDetail.toLowerCase();
      if (lowerDetail.includes('duplicate key') || lowerDetail.includes('already exists')) {
        if (lowerDetail.includes('page_name') || lowerDetail.includes('pagename')) {
          return res.status(409).json({ 
            error: "Page name already exists. Please choose a different page name." 
          });
        }
        return res.status(409).json({ 
          error: "A creation with these details already exists." 
        });
      }
    }
    
    // Generic error fallback
    return res.status(500).json({ 
      error: `Creation failed: ${errorDetail || error.message || 'Unknown error'}` 
    });
  }
});

// Generate architecture plan for a creation
app.post("/api/creations/:id/plan", async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const creationId = parseInt(req.params.id);
    if (isNaN(creationId)) {
      return res.status(400).json({ error: "Invalid creation ID" });
    }

    // Get the creation
    const creation = await db
      .select()
      .from(creations)
      .where(and(
        eq(creations.id, creationId),
        eq(creations.userId, req.user.id)
      ))
      .limit(1);

    if (creation.length === 0) {
      return res.status(404).json({ error: "Creation not found" });
    }

    const currentCreation = creation[0];

    // Update status to planning
    await db
      .update(creations)
      .set({ 
        status: CreationStatus.PLANNING,
        updatedAt: new Date(),
      })
      .where(eq(creations.id, creationId));

    try {
      // Generate architecture plan using user's preferred LLM
      const architecturePlan = await generateArchitecturePlan(
        req.user.id,
        currentCreation.title,
        currentCreation.description
      );

      // Generate task breakdown using user's preferred LLM
      const taskBreakdown = await generateTaskBreakdown(
        req.user.id,
        currentCreation.title,
        currentCreation.description,
        architecturePlan
      );

      // Update creation with plan
      await db
        .update(creations)
        .set({
          architecturePlan,
          planningPrompt: `Title: ${currentCreation.title}\nDescription: ${currentCreation.description}`,
          status: CreationStatus.APPROVED,
          totalTasks: taskBreakdown.length,
          totalSubtasks: taskBreakdown.reduce((sum, task) => sum + task.subtasks.length, 0),
          updatedAt: new Date(),
        })
        .where(eq(creations.id, creationId));

      // Create tasks and subtasks
      for (let i = 0; i < taskBreakdown.length; i++) {
        const task = taskBreakdown[i];
        
        const newTask = await db
          .insert(creationTasks)
          .values({
            creationId,
            title: task.title,
            description: task.description,
            category: task.category,
            orderIndex: i,
            estimatedDuration: task.estimatedDuration,
            totalSubtasks: task.subtasks.length,
            geminiPrompt: task.geminiPrompt,
          })
          .returning();

        // Create subtasks for this task
        for (let j = 0; j < task.subtasks.length; j++) {
          const subtask = task.subtasks[j];
          
          await db
            .insert(creationSubtasks)
            .values({
              creationId,
              taskId: newTask[0].id,
              title: subtask.title,
              description: subtask.description,
              orderIndex: j,
              estimatedDuration: subtask.estimatedDuration,
              filesPaths: subtask.filesPaths || [],
              geminiPrompt: subtask.geminiPrompt,
            });
        }
      }

      res.json({ 
        message: "Architecture plan generated successfully",
        architecturePlan,
        totalTasks: taskBreakdown.length,
        totalSubtasks: taskBreakdown.reduce((sum, task) => sum + task.subtasks.length, 0),
      });

    } catch (planError) {
      console.error("Error generating plan:", planError);
      
      // Revert status back to brainstorming
      await db
        .update(creations)
        .set({ 
          status: CreationStatus.BRAINSTORMING,
          updatedAt: new Date(),
        })
        .where(eq(creations.id, creationId));

      res.status(500).json({ error: "Failed to generate architecture plan" });
    }

  } catch (error) {
    console.error("Error in plan generation:", error);
    res.status(500).json({ error: "Failed to generate plan" });
  }
});

// Start building a creation (begin executing subtasks)
app.post("/api/creations/:id/build", async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const creationId = parseInt(req.params.id);
    if (isNaN(creationId)) {
      return res.status(400).json({ error: "Invalid creation ID" });
    }

    // Get the creation
    const creation = await db
      .select()
      .from(creations)
      .where(and(
        eq(creations.id, creationId),
        eq(creations.userId, req.user.id)
      ))
      .limit(1);

    if (creation.length === 0) {
      return res.status(404).json({ error: "Creation not found" });
    }

    if (creation[0].status !== CreationStatus.APPROVED) {
      return res.status(400).json({ error: "Creation must be approved before building" });
    }

    // Get the first task
    const firstTask = await db
      .select()
      .from(creationTasks)
      .where(eq(creationTasks.creationId, creationId))
      .orderBy(asc(creationTasks.orderIndex))
      .limit(1);

    if (firstTask.length === 0) {
      return res.status(400).json({ error: "No tasks found for this creation" });
    }

    // Get the first subtask of the first task
    const firstSubtask = await db
      .select()
      .from(creationSubtasks)
      .where(eq(creationSubtasks.taskId, firstTask[0].id))
      .orderBy(asc(creationSubtasks.orderIndex))
      .limit(1);

    // Update creation status to building
    await db
      .update(creations)
      .set({
        status: CreationStatus.BUILDING,
        currentTaskId: firstTask[0].id,
        currentSubtaskId: firstSubtask.length > 0 ? firstSubtask[0].id : null,
        updatedAt: new Date(),
      })
      .where(eq(creations.id, creationId));

    res.json({ 
      message: "Building started successfully",
      currentTask: firstTask[0],
      currentSubtask: firstSubtask.length > 0 ? firstSubtask[0] : null,
    });

  } catch (error) {
    console.error("Error starting build:", error);
    res.status(500).json({ error: "Failed to start building" });
  }
});

// Update a creation
app.put("/api/creations/:id", async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const creationId = parseInt(req.params.id);
    if (isNaN(creationId)) {
      return res.status(400).json({ error: "Invalid creation ID" });
    }

    const { title, description, status } = req.body;

    await db
      .update(creations)
      .set({
        ...(title && { title }),
        ...(description && { description }),
        ...(status && { status }),
        updatedAt: new Date(),
      })
      .where(and(
        eq(creations.id, creationId),
        eq(creations.userId, req.user.id)
      ));

    res.json({ message: "Creation updated successfully" });
  } catch (error) {
    console.error("Error updating creation:", error);
    res.status(500).json({ error: "Failed to update creation" });
  }
});

// Delete a creation (soft delete)
app.delete("/api/creations/:id", async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const creationId = parseInt(req.params.id);
    if (isNaN(creationId)) {
      return res.status(400).json({ error: "Invalid creation ID" });
    }

    await db
      .update(creations)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(creations.id, creationId),
        eq(creations.userId, req.user.id)
      ));

    res.json({ message: "Creation deleted successfully" });
  } catch (error) {
    console.error("Error deleting creation:", error);
    res.status(500).json({ error: "Failed to delete creation" });
  }
});

}