describe('LLMFunctions Integration Tests', () => {

  beforeEach(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  // --- Task Function Tests --- 

  it('should create a new task via create_task', async () => {
    const context = { userId: testUserId };
    const params = {
      title: 'New Task via LLM',
      taskType: 'one-time',
      description: 'Test description'
    };
    
    const result = await llmFunctions.create_task(context, params);
    
    expect(result.success).toBe(true);
    expect(result.taskId).toBeDefined();
    expect(result.title).toBe(params.title);

    // Verify in DB
    const dbTask = await storage.getTask(result.taskId!); // Assumes getTask exists
    expect(dbTask).toBeDefined();
    expect(dbTask?.title).toBe(params.title);
    expect(dbTask?.userId).toBe(testUserId);
    expect(dbTask?.taskType).toBe(params.taskType);
  });
  
  it('should update an existing task via update_task', async () => {
    // Arrange: Create a task first
    const initialTask = await storage.createTask({ 
      userId: testUserId, 
      title: 'Task to Update', 
      taskType: 'one-time' 
    });
    
    const context = { userId: testUserId };
    const params = {
      taskId: initialTask.id,
      updates: {
        title: 'Updated Task Title',
        status: 'in_progress' // Example update
      }
    };

    const result = await llmFunctions.update_task(context, params);
    
    expect(result.success).toBe(true);
    expect(result.taskId).toBe(initialTask.id);

    // Verify in DB
    const dbTask = await storage.getTask(initialTask.id);
    expect(dbTask).toBeDefined();
    expect(dbTask?.title).toBe(params.updates.title);
    expect(dbTask?.status).toBe(params.updates.status);
  });
  
  it('should delete a task via delete_task', async () => {
    // Arrange: Create a task first
    const taskToDelete = await storage.createTask({ 
      userId: testUserId, 
      title: 'Task to Delete', 
      taskType: 'one-time' 
    });
    
    const context = { userId: testUserId };
    const params = { taskId: taskToDelete.id };

    const result = await llmFunctions.delete_task(context, params);
    
    expect(result.success).toBe(true);
    expect(result.taskId).toBe(taskToDelete.id);

    // Verify in DB (assuming soft delete via deletedAt)
    const dbTask = await db.select().from(tasks).where(eq(tasks.id, taskToDelete.id)).limit(1);
    expect(dbTask).toBeDefined();
    // Adjust this check based on actual delete implementation (soft vs hard)
    // expect(dbTask[0]?.deletedAt).not.toBeNull(); 
    expect(dbTask.length).toBe(0); // Assuming hard delete for now based on storage.deleteTask signature
  });
  
  // --- Subtask Function Tests --- 

  it('should create a subtask via create_subtask', async () => {
    const parentTask = await storage.createTask({ userId: testUserId, title: 'Parent Task', taskType: 'one-time' });
    const context = { userId: testUserId };
    const params = { parentTaskId: parentTask.id, title: 'New Subtask' };

    const result = await llmFunctions.create_subtask(context, params);

    expect(result.success).toBe(true);
    expect(result.subtaskId).toBeDefined();
    
    const dbSubtask = await db.select().from(subtasks).where(eq(subtasks.id, result.subtaskId!)).limit(1);
    expect(dbSubtask[0]?.title).toBe(params.title);
    expect(dbSubtask[0]?.parentTaskId).toBe(params.parentTaskId);
  });

  it('should update a subtask via update_subtask', async () => {
    const parentTask = await storage.createTask({ userId: testUserId, title: 'Parent Task', taskType: 'one-time' });
    const initialSubtask = await storage.createSubtask(parentTask.id, { title: 'Subtask to Update' });
    const context = { userId: testUserId };
    const params = { subtaskId: initialSubtask.id, updates: { title: 'Updated Subtask' } };

    const result = await llmFunctions.update_subtask(context, params);

    expect(result.success).toBe(true);
    const dbSubtask = await db.select().from(subtasks).where(eq(subtasks.id, initialSubtask.id)).limit(1);
    expect(dbSubtask[0]?.title).toBe(params.updates.title);
  });

  it('should delete a subtask via delete_subtask', async () => {
    const parentTask = await storage.createTask({ userId: testUserId, title: 'Parent Task', taskType: 'one-time' });
    const subtaskToDelete = await storage.createSubtask(parentTask.id, { title: 'Subtask to Delete' });
    const context = { userId: testUserId };
    const params = { subtaskId: subtaskToDelete.id, parentTaskId: parentTask.id };

    const result = await llmFunctions.delete_subtask(context, params);

    expect(result.success).toBe(true);
    const dbSubtask = await db.select().from(subtasks).where(eq(subtasks.id, subtaskToDelete.id)).limit(1);
    // Adjust based on delete implementation (soft vs hard)
    expect(dbSubtask.length).toBe(0); 
  });

  // --- Schedule Item Function Tests --- 

  it('should create a schedule item via create_schedule_item', async () => {
    // Arrange: Need a schedule first
    const schedule = await storage.createDailySchedule({ userId: testUserId, date: new Date(), originalContent: 'test' });
    const context = { userId: testUserId };
    const params = { scheduleId: schedule.id, title: 'New Schedule Item', startTime: '10:00' };

    const result = await llmFunctions.create_schedule_item(context, params);

    expect(result.success).toBe(true);
    expect(result.itemId).toBeDefined();
    const dbItem = await db.select().from(scheduleItems).where(eq(scheduleItems.id, result.itemId!)).limit(1);
    expect(dbItem[0]?.title).toBe(params.title);
    expect(dbItem[0]?.scheduleId).toBe(params.scheduleId);
  });
  
  // Add tests for update_schedule_item and delete_schedule_item similarly...

  // --- Scheduled Message Function Tests --- 

  it('should schedule a message via schedule_message', async () => {
    const context = { userId: testUserId };
    const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const params = { 
      content: 'LLM Test Reminder', 
      scheduledFor: futureDate.toISOString(), 
      type: 'reminder' 
    };

    const result = await llmFunctions.schedule_message(context, params);

    expect(result.success).toBe(true);
    expect(result.messageScheduleId).toBeDefined();
    const dbMessage = await db.select().from(messageSchedules).where(eq(messageSchedules.id, result.messageScheduleId!)).limit(1);
    expect(dbMessage[0]?.content).toBe(params.content);
    expect(dbMessage[0]?.userId).toBe(testUserId);
    expect(dbMessage[0]?.status).toBe('pending');
  });

  it('should delete a scheduled message via delete_scheduled_message', async () => {
    // Arrange: Schedule a message first
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    const [scheduledMsg] = await db.insert(messageSchedules).values({
      userId: testUserId,
      content: 'Message to Delete',
      scheduledFor: futureDate,
      type: 'reminder',
      status: 'pending'
    }).returning();

    const context = { userId: testUserId };
    const params = { messageScheduleId: scheduledMsg.id };

    const result = await llmFunctions.delete_scheduled_message(context, params);

    expect(result.success).toBe(true);
    const dbMessage = await db.select().from(messageSchedules).where(eq(messageSchedules.id, scheduledMsg.id)).limit(1);
    expect(dbMessage[0]?.status).toBe('cancelled'); // Verify soft delete
  });

});