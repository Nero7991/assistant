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

    const validatedData = insertCreationSchema.parse(req.body);

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
      while (true) {
        const existing = await db
          .select()
          .from(creations)
          .where(eq(creations.pageName, uniquePageName))
          .limit(1);
        
        if (existing.length === 0) {
          pageName = uniquePageName;
          break;
        }
        
        uniquePageName = `${pageName}-${counter}`;
        counter++;
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
  } catch (error) {
    console.error("Error creating creation:", error);
    res.status(500).json({ error: "Failed to create creation" });
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
      // Generate architecture plan using LLM
      const architecturePlan = await generateArchitecturePlan(
        currentCreation.title,
        currentCreation.description
      );

      // Generate task breakdown
      const taskBreakdown = await generateTaskBreakdown(
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