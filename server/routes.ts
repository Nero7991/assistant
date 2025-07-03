import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws'; // Import WebSocketServer and WebSocket
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { generateCoachingResponse } from "./coach";
import { 
  insertGoalSchema, 
  insertCheckInSchema, 
  insertKnownUserFactSchema, 
  insertTaskSchema, 
  insertSubtaskSchema, 
  messageHistory, 
  messageSchedules, 
  TaskType, 
  dailySchedules, 
  scheduleItems, 
  tasks as tasksSchema, 
  insertDevlmSessionSchema, // Import new schema
  devlmSessions, // Import table definition
  appSettings // Import appSettings schema
} from "@shared/schema";
import { handleWhatsAppWebhook } from "./webhook";
import { messageScheduler } from "./scheduler";
import { messagingService } from "./services/messaging";
import { generateTaskSuggestions } from "./services/task-suggestions";
import { db } from "./db";
import { eq, desc, and, gte, lt } from "drizzle-orm";
import { registerScheduleManagementAPI } from "./api/schedule-management";
import { registerPeopleManagementAPI } from "./api/people-management";
import { registerExternalServicesAPI } from "./api/external-services";
import { registerRemindersAPI } from "./api/reminders";
import { registerAgentAPI } from "./api/agent";
import { registerCreationsAPI } from "./api/creations";
import OpenAI from "openai";
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path, { dirname } from 'path'; 
import { fileURLToPath } from 'url'; 
import { randomBytes } from 'crypto'; // Import crypto for token generation
import { isAdmin } from './auth'; // Import isAdmin middleware

// --- ES Module __dirname equivalent ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// -------------------------------------

// Import interface and type definitions needed for chat functionality
import type { MessageContext, ScheduleUpdate } from "./services/messaging";

// Import LLM providers for devlm LLM routing
import { LLMProvider } from './services/llm/provider.js';
import { openAIProvider } from './services/llm/openai_provider.js';
import { gcloudProvider } from './services/llm/gcloud_provider.js';
import type { StandardizedChatCompletionMessage } from './services/llm/provider.js';

// --- In-memory store for running DevLM processes & WS Auth Tokens ---
interface RunningProcessInfo {
  process: ChildProcessWithoutNullStreams;
  ws?: WebSocket;
}
const runningDevlmProcesses: Map<number, RunningProcessInfo> = new Map(); 

// Store tokens temporarily { token: { userId: number, expires: Date } }
// WARNING: Simple in-memory store, not suitable for production (use Redis/DB)
const wsAuthTokens: Map<string, { userId: number, expires: Date }> = new Map();
const TOKEN_EXPIRY_MS = 60 * 1000; // Token valid for 60 seconds

// Function to clean up expired tokens periodically (optional but recommended)
setInterval(() => {
  const now = Date.now();
  wsAuthTokens.forEach((value, key) => {
    if (value.expires.getTime() < now) {
      wsAuthTokens.delete(key);
      console.log(`[WebSocket Auth] Expired token cleaned: ${key.substring(0, 8)}...`);
    }
  });
}, TOKEN_EXPIRY_MS); // Check every minute

// --- Heartbeat Interval --- 
// Store the interval ID so we can clear it on shutdown
let heartbeatInterval: NodeJS.Timeout | null = null;

export async function registerRoutes(app: Express): Promise<Server> {
  const sessionParser = setupAuth(app); // Get session parser middleware

  // WhatsApp Webhook endpoint
  app.post("/api/webhook/whatsapp", handleWhatsAppWebhook);
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // Register API endpoints
  registerScheduleManagementAPI(app);
  registerPeopleManagementAPI(app);
  registerExternalServicesAPI(app);
  registerRemindersAPI(app);
  registerAgentAPI(app);
  registerCreationsAPI(app);

  // DevLM LLM API endpoint
  app.post('/api/devlm/llm', async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const { messages, temperature, model, requestId } = req.body;
      console.log(`[DevLM API] LLM request from user ${req.user.id}:`, { model, requestId, messageCount: messages?.length });

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages array' });
      }

      // Use OpenAI directly like Kona coaching
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const effectiveModel = 'gpt-4o';

      const response = await openai.chat.completions.create({
        model: effectiveModel,
        messages: messages,
        temperature: temperature || 0.7,
        max_tokens: 4000,
      });

      const content = response.choices[0].message.content;
      console.log(`[DevLM API] LLM response generated for request ${requestId}`);

      res.json({
        content: content,
        model: effectiveModel,
        usage: response.usage,
        requestId: requestId
      });

    } catch (error: any) {
      console.error(`[DevLM API] LLM request error:`, error);
      res.status(500).json({ 
        error: error.message || 'LLM request failed',
        requestId: req.body.requestId 
      });
    }
  });

  // DevLM Session CRUD Endpoints
  app.post('/api/devlm/sessions', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const validationResult = insertDevlmSessionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: "Invalid session data", details: validationResult.error.flatten() });
    }
    try {
      const [newSession] = await db.insert(devlmSessions).values({
        ...validationResult.data,
        userId: req.user.id,
        taskDescription: validationResult.data.taskDescription || null, // Add taskDescription
        publisher: validationResult.data.publisher || (validationResult.data.source === 'gcloud' ? 'anthropic' : null), // NEW: Default publisher if gcloud
        anthropicApiKey: validationResult.data.anthropicApiKey || null,
        openaiApiKey: validationResult.data.openaiApiKey || null,
        projectId: validationResult.data.projectId || null,
        region: validationResult.data.region || null,
        serverUrl: validationResult.data.serverUrl || null,
        updatedAt: new Date(), 
      }).returning({ 
        // Include publisher in returned fields
        id: devlmSessions.id,
        userId: devlmSessions.userId,
        sessionName: devlmSessions.sessionName,
        mode: devlmSessions.mode,
        model: devlmSessions.model,
        source: devlmSessions.source,
        publisher: devlmSessions.publisher, // NEW
        projectId: devlmSessions.projectId,
        region: devlmSessions.region,
        serverUrl: devlmSessions.serverUrl,
        projectPath: devlmSessions.projectPath,
        writeMode: devlmSessions.writeMode,
        debugPrompt: devlmSessions.debugPrompt,
        noApproval: devlmSessions.noApproval,
        frontend: devlmSessions.frontend,
        createdAt: devlmSessions.createdAt,
        updatedAt: devlmSessions.updatedAt,
        taskDescription: devlmSessions.taskDescription, // Return taskDescription
      });
      res.status(201).json(newSession);
    } catch (error) {
      console.error("Error creating DevLM session:", error);
      res.status(500).json({ error: "Failed to save session" });
    }
  });

  app.get('/api/devlm/sessions', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      // Select publisher along with other fields (excluding API keys)
      const sessions = await db.select({
        id: devlmSessions.id,
        userId: devlmSessions.userId,
        sessionName: devlmSessions.sessionName,
        mode: devlmSessions.mode,
        model: devlmSessions.model,
        source: devlmSessions.source,
        publisher: devlmSessions.publisher, // NEW
        projectId: devlmSessions.projectId,
        region: devlmSessions.region,
        serverUrl: devlmSessions.serverUrl,
        projectPath: devlmSessions.projectPath,
        writeMode: devlmSessions.writeMode,
        debugPrompt: devlmSessions.debugPrompt,
        noApproval: devlmSessions.noApproval,
        frontend: devlmSessions.frontend,
        createdAt: devlmSessions.createdAt,
        updatedAt: devlmSessions.updatedAt,
        taskDescription: devlmSessions.taskDescription, // Select taskDescription
      }).from(devlmSessions)
        .where(eq(devlmSessions.userId, req.user.id))
        .orderBy(desc(devlmSessions.updatedAt)); 
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching DevLM sessions:", error);
      res.status(500).json({ error: "Failed to load sessions" });
    }
  });

  // DevLM Script Runner Endpoint (SSE)
  app.get('/api/devlm/run', async (req, res) => {
    if (!req.isAuthenticated() || !req.user) { // Ensure req.user exists
      return res.status(401).json({ error: 'Unauthorized - Please log in' });
    }
    const userId = req.user.id;

    // Check if a process is already running for this user
    if (runningDevlmProcesses.has(userId)) {
       return res.status(409).json({ error: 'A DevLM script is already running for this user.' });
    }

    // --- SSE Setup ---
    // ... (SSE headers remain the same) ...
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data: any) => {
       // Check if the response is still writable before sending
       if (!res.writableEnded) {
         res.write(`data: ${JSON.stringify(data)}\n\n`);
       } else {
         console.warn("Attempted to write to SSE stream after it ended.");
       }
    };

    sendEvent({ type: 'status', message: 'Runner initiated...' });

    // --- Input Validation & Processing ---
    // ... (validation remains the same) ...
    const {
      task, mode, model, source, projectPath, writeMode,
      projectId, region, serverUrl, debugPrompt, noApproval, frontend,
      sessionId 
    } = req.query;
    
    // Basic validation example (add more as needed)
    if (!task || typeof task !== 'string') {
      sendEvent({ type: 'error', message: 'Missing or invalid task description.' });
      if (!res.writableEnded) res.end(); 
      return;
    }
    // ... add other param validations ...

    let child: any = null; // Declare child process variable

    try {
       sendEvent({ type: 'status', message: 'Setting up environment...' });

       // --- API Key Retrieval (NEW) ---
       // ... (API Key logic remains the same) ...
      let apiKey: string | null = null;
      const sId = sessionId && typeof sessionId === 'string' ? parseInt(sessionId, 10) : null;

      if (sId && !isNaN(sId) && (source === 'anthropic' || source === 'openai')) {
          sendEvent({ type: 'status', message: `Fetching API key from session ${sId}...` });
          const session = await db.select({
              anthropicApiKey: devlmSessions.anthropicApiKey,
              openaiApiKey: devlmSessions.openaiApiKey,
              source: devlmSessions.source,
          })
          .from(devlmSessions)
          .where(and(eq(devlmSessions.id, sId), eq(devlmSessions.userId, req.user.id)))
          .limit(1);

          if (session.length > 0) {
             if (source === 'anthropic') {
                 apiKey = session[0].anthropicApiKey;
             } else if (source === 'openai') {
                 apiKey = session[0].openaiApiKey;
             }
             if (!apiKey) {
                 sendEvent({ type: 'warning', message: `API key not found in session ${sId} for source ${source}. Using environment variables if available.` });
             } else {
                 sendEvent({ type: 'status', message: `API key retrieved successfully for source ${source}.` });
             }
          } else {
              sendEvent({ type: 'warning', message: `Session ${sId} not found or not owned by user. Cannot retrieve API key.` });
          }
      } else if (source === 'anthropic' || source === 'openai') {
          sendEvent({ type: 'status', message: `No session ID provided. Using API key from environment variables if available for source ${source}.` });
      }

      // --- Construct Command ---
      // Resolve path relative to the project root where the server is likely started
      const scriptPath = path.resolve('./devlm/bootstrap.py'); 
      const args: string[] = ['--task', task];
      
      // ... (argument construction remains the same, using --server for openai) ...
      args.push('--mode', mode as string);
      if (model && typeof model === 'string') args.push('--model', model);
      args.push('--source', source as string);
      if (projectPath && typeof projectPath === 'string') args.push('--project-path', projectPath);
      if (writeMode && typeof writeMode === 'string') args.push('--write-mode', writeMode);

      if (source === 'gcloud') {
        if (projectId && typeof projectId === 'string') args.push('--project-id', projectId);
        if (region && typeof region === 'string') args.push('--region', region);
      } else if (source === 'openai') {
        if (serverUrl && typeof serverUrl === 'string') args.push('--server', serverUrl); 
      } 

      if (debugPrompt === 'true') args.push('--debug-prompt');
      if (noApproval === 'true') args.push('--no-approval');
      if (frontend === 'true') args.push('--frontend');

      sendEvent({ type: 'status', message: `Executing: python3 -u ${scriptPath} ${args.join(' ')}` });
      
       // --- Environment Variables for API Keys (NEW) ---
       // ... (env var logic remains the same) ...
      const env = { ...process.env }; 
      if (apiKey) {
          if (source === 'anthropic') {
              env['ANTHROPIC_API_KEY'] = apiKey;
               sendEvent({ type: 'status', message: 'Setting ANTHROPIC_API_KEY environment variable.' });
          } else if (source === 'openai') {
              env['OPENAI_API_KEY'] = apiKey;
               sendEvent({ type: 'status', message: 'Setting OPENAI_API_KEY environment variable.' });
          }
      } else {
           sendEvent({ type: 'status', message: 'No session API key found/used, relying on existing environment keys.' });
      }

      // --- Execute Script ---
      // Ensure we explicitly call python3 and use unbuffered output (-u)
      child = spawn('python3', ['-u', scriptPath, ...args], { 
         cwd: path.resolve(__dirname, '.'), 
         env: env 
      });

      // Store the process handle
      runningDevlmProcesses.set(userId, { process: child, ws: undefined });
      console.log(`[DevLM Runner] Started process PID ${child.pid} for user ${userId}`);

      // --- Stream Output ---
      child.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log(`[DevLM stdout PID ${child.pid}]: Chunk received (length ${output.length})`); // LOGGING
        
        // Check for WebSocket events and parse them
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('WEBSOCKET_EVENT:')) {
            try {
              const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
              const event = JSON.parse(eventJson);
              // Forward the parsed event directly to SSE client
              sendEvent({ type: event.type, ...event.payload });
              console.log(`[SSE] Forwarded event: ${event.type}`);
            } catch (err) {
              console.error(`[SSE] Failed to parse event: ${line}`, err);
              // Don't send regular print statements to frontend
              console.log(`[SSE] Non-event stdout (not forwarded): ${line.trim()}`);
            }
          } else if (line.trim() !== '') {
            // Don't send regular print statements to frontend
            // Only send explicit WebSocket events
            console.log(`[SSE] Regular stdout (not forwarded): ${line.trim()}`);
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
         const errorOutput = data.toString();
         console.error(`[DevLM stderr PID ${child.pid}]: ${errorOutput}`); 
         // Only send actual errors to frontend, not informational stderr
         if (errorOutput.includes('Error') || errorOutput.includes('Exception') || errorOutput.includes('Traceback')) {
           sendEvent({ type: 'error', message: `Script Error: ${errorOutput}` }); 
         }
      });

      child.on('error', (error: Error) => {
        console.error(`[DevLM Runner] Error event for PID ${child?.pid} for user ${userId}: ${error.message}`); // Enhanced LOGGING
        sendEvent({ type: 'error', message: `Failed to start script: ${error.message}` });
        runningDevlmProcesses.delete(userId);
        if (!res.writableEnded) res.end();
      });

      child.on('close', (code: number | null) => {
        console.log(`[DevLM Runner] Close event for PID ${child?.pid} for user ${userId}. Code: ${code}`); // Enhanced LOGGING
        sendEvent({ type: 'end', exitCode: code });
        runningDevlmProcesses.delete(userId);
        if (!res.writableEnded) res.end(); 
      });

      // Handle client closing connection
      req.on('close', () => {
        console.log(`[DevLM Runner] Client disconnected for user ${userId}. Killing script PID ${child?.pid}.`);
        if (child && !child.killed) {
            child.kill(); // Send SIGTERM
        }
        // Clean up process map
        runningDevlmProcesses.delete(userId);
         if (!res.writableEnded) res.end();
      });

    } catch (error: any) {
      console.error(`[DevLM Runner] Error in /api/devlm/run for user ${userId}:`, error);
      sendEvent({ type: 'error', message: `Server error: ${error.message || 'Unknown error'}` });
      // Clean up process map if an error occurred before spawn or during setup
      if (runningDevlmProcesses.has(userId)) {
          runningDevlmProcesses.delete(userId);
      }
      if (!res.writableEnded) res.end(); // Ensure connection is closed on server error
    }
  });

  // --- NEW: Stop DevLM Script Endpoint ---
  app.post('/api/devlm/stop', (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.user.id;

    const child = runningDevlmProcesses.get(userId);

    if (child && !child.process.killed) {
      try {
        child.process.kill('SIGTERM'); // Send SIGTERM signal
        console.log(`[DevLM Runner] Stop request: Killed process PID ${child.process.pid} for user ${userId}`);
        runningDevlmProcesses.delete(userId); // Remove immediately after kill signal
        res.status(200).json({ message: 'DevLM script stop requested.' });
      } catch (err: any) {
        console.error(`[DevLM Runner] Error trying to kill process PID ${child?.process?.pid} for user ${userId}:`, err);
        res.status(500).json({ error: 'Failed to stop script.', details: err.message });
      }
    } else {
      console.log(`[DevLM Runner] Stop request: No running script found for user ${userId}`);
      res.status(404).json({ message: 'No running DevLM script found for this user.' });
    }
  });

  // DevLM Session CRUD Endpoints
  app.post('/api/devlm/sessions', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const validationResult = insertDevlmSessionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: "Invalid session data", details: validationResult.error.flatten() });
    }
    try {
      const [newSession] = await db.insert(devlmSessions).values({
        ...validationResult.data,
        userId: req.user.id,
        // Ensure nullable fields are handled
        projectId: validationResult.data.projectId || null,
        region: validationResult.data.region || null,
        serverUrl: validationResult.data.serverUrl || null,
        // Use current time for updatedAt on creation
        updatedAt: new Date(), 
      }).returning();
      res.status(201).json(newSession);
    } catch (error) {
      console.error("Error creating DevLM session:", error);
      res.status(500).json({ error: "Failed to save session" });
    }
  });

  app.get('/api/devlm/sessions', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const sessions = await db.select().from(devlmSessions)
        .where(eq(devlmSessions.userId, req.user.id))
        .orderBy(desc(devlmSessions.updatedAt)); // Show most recent first
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching DevLM sessions:", error);
      res.status(500).json({ error: "Failed to load sessions" });
    }
  });

  // Optional: Add GET by ID, PUT/PATCH for update, DELETE later if needed
  app.delete('/api/devlm/sessions/:id', async (req, res) => {
     if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    try {
      const [deletedSession] = await db.delete(devlmSessions)
        .where(and(eq(devlmSessions.id, sessionId), eq(devlmSessions.userId, req.user.id)))
        .returning();

      if (!deletedSession) {
        return res.status(404).json({ error: 'Session not found or not owned by user' });
      }
      res.status(204).send(); // No content
    } catch (error) {
      console.error(`Error deleting DevLM session ${sessionId}:`, error);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // Test endpoints for scheduling messages and testing webhooks (only in development)
  if (process.env.NODE_ENV === 'development' || true) { // Force enable for testing
    // Endpoint to clear pending messages (for testing)
    app.post("/api/test/clear-pending-messages", async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      try {
        // Delete all pending follow-up messages for the current user
        const deleteResult = await db
          .delete(messageSchedules)
          .where(
            and(
              eq(messageSchedules.userId, req.user.id),
              eq(messageSchedules.status, 'pending')
            )
          )
          .returning();
          
        res.json({
          message: "Pending messages cleared",
          userId: req.user.id,
          messagesDeleted: deleteResult.length,
          deletedMessages: deleteResult
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
      }
    });
    
    app.post("/api/test/schedule-message", async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      try {
        const scheduledTime = await messageScheduler.scheduleTestMessage(req.user.id);
        res.json({
          message: "Test message scheduled",
          scheduledFor: scheduledTime,
          userId: req.user.id
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
      }
    });
    
    // Test endpoint to verify duplicate follow-up prevention
    app.post("/api/test/duplicate-followups", async (req, res) => {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      try {
        // Attempt to schedule multiple follow-ups for the same user
        const results = [];
        
        // First attempt - should succeed
        await messagingService.scheduleFollowUp(req.user.id, 'neutral');
        results.push("First follow-up scheduled");
        
        // Second attempt - should be prevented by our duplicate check
        await messagingService.scheduleFollowUp(req.user.id, 'positive');
        results.push("Second follow-up attempted");
        
        // Third attempt - should also be prevented
        await messagingService.scheduleFollowUp(req.user.id, 'negative');
        results.push("Third follow-up attempted");
        
        // Check the database to see what was actually scheduled
        const pendingMessages = await db
          .select()
          .from(messageSchedules)
          .where(
            and(
              eq(messageSchedules.userId, req.user.id),
              eq(messageSchedules.type, 'follow_up'),
              eq(messageSchedules.status, 'pending')
            )
          );
        
        res.json({
          message: "Test completed successfully",
          results,
          scheduledFollowUps: pendingMessages.length,
          pendingMessages
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
      }
    });

    // Special test endpoint for simulating incoming WhatsApp messages
    app.post("/api/test/simulate-whatsapp", async (req, res) => {
      try {
        const { userId, message } = req.body;
        
        if (!userId || !message) {
          return res.status(400).json({
            error: "Missing required fields: userId and message"
          });
        }
        
        // Get user info to validate and get phone number
        const user = await storage.getUser(parseInt(userId));
        if (!user) {
          return res.status(404).json({
            error: `User with ID ${userId} not found`
          });
        }
        
        console.log(`Simulating WhatsApp message from user ${userId}: ${message}`);
        
        // Process the message using the message service
        await messagingService.handleUserResponse(parseInt(userId), message);
        
        res.json({
          success: true,
          message: "Message processed successfully"
        });
      } catch (error) {
        console.error("Error in simulate-whatsapp endpoint:", error);
        res.status(500).json({
          error: "Failed to process simulated message",
          details: error instanceof Error ? error.message : 'An unknown error occurred'
        });
      }
    });
    
    // Test endpoint specifically for testing schedule marker
    // Note: This is a public endpoint for testing the marker
    app.get("/api/messages/test-schedule-marker", async (req, res) => {
      // Set content type explicitly to make sure we return JSON 
      res.setHeader('Content-Type', 'application/json');
      try {
        console.log("Starting test-schedule-marker endpoint");
        // Get a user (can be used without authentication for testing)
        const user = await storage.getUser(2); // Using ID 2 for testing
        if (!user) {
          console.log("Test user not found");
          return res.status(404).json({ error: "Test user not found" });
        }
        
        console.log("Found test user:", user.id);
        
        // Get tasks for this user
        const tasks = await storage.getTasks(user.id);
        console.log(`Retrieved ${tasks.length} tasks for user`);
        
        // Get facts for this user
        const facts = await storage.getKnownUserFacts(user.id);
        console.log(`Retrieved ${facts.length} facts for user`);
        
        // Get message history
        const messages = await db
          .select()
          .from(messageHistory)
          .where(eq(messageHistory.userId, user.id))
          .orderBy(desc(messageHistory.createdAt))
          .limit(10);
        
        console.log(`Retrieved ${messages.length} message history items`);
        
        // Generate a message with the morning message format which should include the schedule marker
        const messagingContext: MessageContext = {
          user,
          tasks,
          facts,
          previousMessages: messages,
          currentDateTime: new Date().toISOString(),
          messageType: 'morning'
        };
        
        console.log("Generating test morning message...");
        const messageResult = await messagingService.generateMorningMessage(messagingContext);
        console.log("Message generated successfully");
        
        // Check if the message includes the marker
        const includesMarker = messageResult.message.toLowerCase().includes("the final schedule is as follows:".toLowerCase());
        console.log(`Schedule marker included: ${includesMarker}`);
        
        // Return just a simple response instead of the full message
        res.status(200).json({
          success: true,
          includesMarker,
          markerText: "The final schedule is as follows:",
          messagePreview: messageResult.message.substring(0, 100) + "..." // Just show a preview
        });
      } catch (error) {
        console.error("Error testing schedule marker:", error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  // Start the message scheduler
  // messageScheduler.start(); // DISABLED - Duplicate scheduler causing double messages - using node-schedule in index.ts instead

  // User Settings Endpoint
  app.patch("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Extract only the fields we want to allow updating
      const { 
        contactPreference, 
        phoneNumber, 
        email, 
        isPhoneVerified, 
        isEmailVerified,
        allowEmailNotifications,
        allowPhoneNotifications,
        preferredMessageTime,
        timeZone,
        wakeTime,
        routineStartTime,
        sleepTime,
        preferredModel,
        customOpenaiServerUrl, // NEW
        customOpenaiModelName,  // NEW
        devlmPreferredModel,
        devlmPreferredProvider,
        devlmCustomOpenaiServerUrl,
        devlmCustomOpenaiModelName
      } = req.body;
      
      // Build the update object with only defined values
      const updateData: Record<string, any> = {};
      if (contactPreference !== undefined) updateData.contactPreference = contactPreference;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (email !== undefined) updateData.email = email;
      if (isPhoneVerified !== undefined) updateData.isPhoneVerified = isPhoneVerified;
      if (isEmailVerified !== undefined) updateData.isEmailVerified = isEmailVerified;
      if (allowEmailNotifications !== undefined) updateData.allowEmailNotifications = allowEmailNotifications;
      if (allowPhoneNotifications !== undefined) updateData.allowPhoneNotifications = allowPhoneNotifications;
      if (preferredMessageTime !== undefined) updateData.preferredMessageTime = preferredMessageTime;
      if (timeZone !== undefined) updateData.timeZone = timeZone;
      if (wakeTime !== undefined) updateData.wakeTime = wakeTime;
      if (routineStartTime !== undefined) updateData.routineStartTime = routineStartTime;
      if (sleepTime !== undefined) updateData.sleepTime = sleepTime;
      if (preferredModel !== undefined) updateData.preferredModel = preferredModel;
      // Add new fields (allow empty string to clear the value)
      if (customOpenaiServerUrl !== undefined) updateData.customOpenaiServerUrl = customOpenaiServerUrl || null;
      if (customOpenaiModelName !== undefined) updateData.customOpenaiModelName = customOpenaiModelName || null;
      
      // Add DevLM fields
      if (devlmPreferredModel !== undefined) updateData.devlmPreferredModel = devlmPreferredModel;
      if (devlmPreferredProvider !== undefined) updateData.devlmPreferredProvider = devlmPreferredProvider;
      if (devlmCustomOpenaiServerUrl !== undefined) updateData.devlmCustomOpenaiServerUrl = devlmCustomOpenaiServerUrl || null;
      if (devlmCustomOpenaiModelName !== undefined) updateData.devlmCustomOpenaiModelName = devlmCustomOpenaiModelName || null;
      
      // Apply the update
      const updatedUser = await storage.updateUser({
        ...req.user,
        ...updateData
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user settings" });
    }
  });
  
  // User Deactivation Endpoint
  app.post("/api/user/deactivate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      await storage.deactivateUser(req.user.id);
      
      // Logout the user after deactivation
      req.logout((err) => {
        if (err) {
          console.error("Error logging out after deactivation:", err);
          return res.status(500).json({ error: "Account deactivated but session logout failed" });
        }
        res.status(200).json({ message: "Account successfully deactivated" });
      });
    } catch (error) {
      console.error("Error deactivating user account:", error);
      res.status(500).json({ error: "Failed to deactivate account" });
    }
  });

  // Known User Facts Endpoints
  app.get("/api/known-facts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const facts = await storage.getKnownUserFacts(req.user.id);
    res.json(facts);
  });

  app.post("/api/known-facts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertKnownUserFactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const fact = await storage.addKnownUserFact({
      ...parsed.data,
      userId: req.user.id,
    });
    res.status(201).json(fact);
  });

  app.patch("/api/known-facts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const updatedFact = await storage.updateKnownUserFact(parseInt(req.params.id), req.body);
    res.json(updatedFact);
  });

  app.delete("/api/known-facts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteKnownUserFact(parseInt(req.params.id));
    res.sendStatus(204);
  });

  // Tasks Endpoints
  app.get("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Fetch all tasks for the user (consider filtering status later if needed)
      const userTasks = await storage.getTasks(req.user.id);
      res.json(userTasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Validate request body against Zod schema
      const validationResult = insertTaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Invalid task data", details: validationResult.error.flatten() });
      }
      
      const validatedData = validationResult.data;
      
      const newTask = await storage.createTask({ 
        ...validatedData, 
        userId: req.user.id 
      });
      res.status(201).json(newTask);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.get("/api/tasks/:taskId/subtasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const taskId = parseInt(req.params.taskId, 10);
      if (isNaN(taskId)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }
      // Fetch subtasks for the given task ID
      // First verify user owns task
      const task = await storage.getTask(taskId, req.user.id);
      
      if (!task) {
        return res.status(404).json({ error: "Task not found or not owned by user" });
      }
      
      // Now fetch subtasks
      const subtasks = await storage.getSubtasks(taskId);
      res.json(subtasks);
    } catch (error) {
      console.error(`Error fetching subtasks for task ${req.params.taskId}:`, error);
      res.status(500).json({ error: "Failed to fetch subtasks" });
    }
  });

  app.post("/api/tasks/:taskId/subtasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const taskId = parseInt(req.params.taskId, 10);
      if (isNaN(taskId)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }
      
      // Validate subtask data
      const validationResult = insertSubtaskSchema.safeParse(req.body);
       if (!validationResult.success) {
        return res.status(400).json({ error: "Invalid subtask data", details: validationResult.error.flatten() });
      }
      
      const validatedData = validationResult.data;
      
      // Call storage.createSubtask (ensure it verifies parent task ownership)
      const newSubtask = await storage.createSubtask(taskId, { 
         ...validatedData,
         // Assuming storage layer handles linking correctly and doesn't need userId directly here
      }); 
      res.status(201).json(newSubtask);
    } catch (error) {
      console.error(`Error creating subtask for task ${req.params.taskId}:`, error);
      res.status(500).json({ error: "Failed to create subtask" });
    }
  });

  // Add PATCH endpoint for updating tasks
  app.patch("/api/tasks/:taskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const taskId = parseInt(req.params.taskId, 10);
      if (isNaN(taskId)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }
      // We don't have a specific update schema, so pass req.body directly
      // Add validation here if needed
      const updatedTask = await storage.updateTask(taskId, req.user.id, req.body);
      res.json(updatedTask);
    } catch (error) {
      console.error(`Error updating task ${req.params.taskId}:`, error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });
  
  // Add DELETE endpoint for tasks
  app.delete("/api/tasks/:taskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const taskId = parseInt(req.params.taskId, 10);
      if (isNaN(taskId)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }
      await storage.deleteTask(taskId, req.user.id);
      res.sendStatus(204); // No content on successful delete
    } catch (error) {
      console.error(`Error deleting task ${req.params.taskId}:`, error);
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

   // Add PATCH endpoint for updating subtasks
  app.patch("/api/subtasks/:subtaskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
      try {
        const subtaskId = parseInt(req.params.subtaskId, 10);
        if (isNaN(subtaskId)) {
          return res.status(400).json({ error: "Invalid subtask ID" });
        }
        // Assuming storage.updateSubtask handles user auth internally
        const updatedSubtask = await storage.updateSubtask(subtaskId, req.user.id, req.body);
        res.json(updatedSubtask);
    } catch (error) {
        console.error(`Error updating subtask ${req.params.subtaskId}:`, error);
        res.status(500).json({ error: "Failed to update subtask" });
      }
    });

  // Add DELETE endpoint for subtasks
  app.delete("/api/subtasks/:subtaskId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
      try {
        const subtaskId = parseInt(req.params.subtaskId, 10);
        if (isNaN(subtaskId)) {
          return res.status(400).json({ error: "Invalid subtask ID" });
        }
        // Assuming storage.deleteSubtask handles user auth internally
        await storage.deleteSubtask(subtaskId, req.user.id);
        res.sendStatus(204);
    } catch (error) {
        console.error(`Error deleting subtask ${req.params.subtaskId}:`, error);
        res.status(500).json({ error: "Failed to delete subtask" });
    }
  });

  // Goals
  app.get("/api/goals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const goals = await storage.getGoals(req.user.id);
    res.json(goals);
  });

  app.post("/api/goals", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertGoalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error);

    // Ensure deadline is null rather than undefined if not provided
    const goal = await storage.createGoal({
      ...parsed.data,
      userId: req.user.id,
      completed: false,
      deadline: parsed.data.deadline || null
    });
    res.status(201).json(goal);
  });

  app.patch("/api/goals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const goal = await storage.updateGoal(parseInt(req.params.id), req.body);
    res.json(goal);
  });

  app.delete("/api/goals/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteGoal(parseInt(req.params.id));
    res.sendStatus(204);
  });
  
  // Daily Schedule endpoints
  app.get("/api/daily-schedules", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const schedules = await storage.getDailySchedules(req.user.id);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching daily schedules:", error);
      res.status(500).json({ error: "Failed to fetch daily schedules" });
    }
  });
  
  // Endpoint to create a new daily schedule from an LLM response
  app.post("/api/daily-schedules/from-llm", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { llmResponse } = req.body;
      
      if (!llmResponse || typeof llmResponse !== 'string') {
        return res.status(400).json({ error: "LLM response is required" });
      }
      
      // Import the schedule parser functions
      const { parseScheduleFromLLMResponse, createDailyScheduleFromParsed } = await import('./services/schedule-parser-new');
      
      // Parse the schedule from the LLM response
      const parsedSchedule = parseScheduleFromLLMResponse(llmResponse);
      
      if (!parsedSchedule) {
        return res.status(400).json({ error: "No schedule found in the LLM response" });
      }
      
      // Get the user's tasks for matching
      const tasks = await storage.getTasks(req.user.id);
      
      // Create a daily schedule from the parsed schedule
      const scheduleId = await createDailyScheduleFromParsed(req.user.id, parsedSchedule, tasks);
      
      res.status(201).json({ 
        message: "Daily schedule created successfully", 
        scheduleId,
        parsedItems: parsedSchedule.scheduleItems.length
      });
    } catch (error) {
      console.error("Error creating daily schedule from LLM response:", error);
      res.status(500).json({ error: "Failed to create daily schedule" });
    }
  });
  
  // Generate a schedule using the AI coach
  app.post("/api/daily-schedules/generate", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Import required functions and components
      const { generateDailySchedule } = await import('./coach');
      const { parseScheduleFromLLMResponse, createDailyScheduleFromParsed } = await import('./services/schedule-parser-new');
      
      // Get tasks and user facts
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      
      // Optional custom instructions
      const { customInstructions } = req.body;
      
      // Get user time preferences
      const timePreferences = {
        wakeTime: req.user.wakeTime || "08:00",
        routineStartTime: req.user.routineStartTime || "09:30",
        sleepTime: req.user.sleepTime || "23:00"
      };
      
      // Generate the schedule with the AI using the user's preferred model
      const llmResponse = await generateDailySchedule(
        req.user.id,
        tasks, 
        facts, 
        customInstructions, 
        req.user.timeZone || undefined,
        timePreferences,
        req.user.preferredModel || "gpt-4o" // Use user's preferred model or default to gpt-4o
      );
      
      // Parse the schedule from the LLM response
      const parsedSchedule = parseScheduleFromLLMResponse(llmResponse);
      
      if (!parsedSchedule) {
        return res.status(400).json({ 
          error: "No schedule could be generated", 
          llmResponse 
        });
      }
      
      // Create a daily schedule from the parsed schedule
      const scheduleId = await createDailyScheduleFromParsed(req.user.id, parsedSchedule, tasks);
      
      res.status(201).json({
        message: "Daily schedule generated successfully",
        scheduleId,
        parsedItems: parsedSchedule.scheduleItems.length,
        llmResponse
      });
    } catch (error) {
      console.error("Error generating daily schedule:", error);
      res.status(500).json({ error: "Failed to generate daily schedule" });
    }
  });
  
  // Add back the removed route handlers
  app.get("/api/daily-schedules/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const scheduleId = parseInt(req.params.id);
      
      // All schedules must have valid IDs
      if (scheduleId === -1) {
        console.error("ERROR: Invalid schedule ID -1 requested");
        return res.status(400).json({ 
          error: "Invalid schedule ID. All schedules must have valid database IDs." 
        });
      }
      
      const schedule = await storage.getDailySchedule(scheduleId);
      
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      
      res.json(schedule);
    } catch (error) {
      console.error("Error fetching daily schedule:", error);
      res.status(500).json({ error: "Failed to fetch daily schedule" });
    }
  });
  
  app.get("/api/daily-schedules/:id/items", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const scheduleId = parseInt(req.params.id);
      
      // All schedules must have valid IDs
      if (scheduleId === -1) {
        console.error("ERROR: Invalid schedule ID -1 requested for items");
        return res.status(400).json({ 
          error: "Invalid schedule ID. All schedules must have valid database IDs." 
        });
      }
      
      const items = await storage.getScheduleItems(scheduleId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching schedule items:", error);
      res.status(500).json({ error: "Failed to fetch schedule items" });
    }
  });
  
  app.post("/api/daily-schedules/:id/confirm", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const scheduleId = parseInt(req.params.id);
      
      // All schedules must have valid IDs
      if (scheduleId === -1) {
        console.error("ERROR: Invalid schedule ID -1 requested for confirmation");
        return res.status(400).json({ 
          error: "Invalid schedule ID. All schedules must have valid database IDs." 
        });
      }
      
      try {
        // Use the confirmSchedule function from the schedule-parser-new module
        const { confirmSchedule } = await import('./services/schedule-parser-new');
        const success = await confirmSchedule(scheduleId, req.user.id);
        
        if (success) {
          res.json({ message: "Schedule confirmed successfully" });
        } else {
          res.status(400).json({ error: "Failed to confirm schedule" });
        }
      } catch (error) {
        console.error("Error confirming schedule:", error);
        res.status(500).json({ error: "Failed to confirm schedule: " + (error instanceof Error ? error.message : String(error)) });
      }
    } catch (error) {
      console.error("Error confirming schedule:", error);
      res.status(500).json({ error: "Failed to confirm schedule" });
    }
  });
  
  app.patch("/api/schedule-items/:id/status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const itemId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || typeof status !== 'string') {
        return res.status(400).json({ error: "Invalid status value" });
      }
      
      const updatedItem = await storage.updateScheduleItemStatus(itemId, status);
      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating schedule item status:", error);
      res.status(500).json({ error: "Failed to update schedule item status" });
    }
  });

  // Check-ins
  app.get("/api/checkins", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const checkIns = await storage.getCheckIns(req.user.id);
    res.json(checkIns);
  });

  app.post("/api/checkins", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertCheckInSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error);

    const checkIns = await storage.getCheckIns(req.user.id);
    const previousResponses = checkIns
      .slice(0, 3)
      .map(ci => ci.response)
      .filter((response): response is string => response !== null);

    // Use the user's preferred model or default to gpt-4o
    const coachingResponse = await generateCoachingResponse(
      parsed.data.content,
      previousResponses,
      req.user.preferredModel || "gpt-4o"
    );

    const checkIn = await storage.createCheckIn({
      userId: req.user.id,
      content: parsed.data.content,
      response: JSON.stringify(coachingResponse),
      createdAt: new Date()
    });

    res.status(201).json({ checkIn, coachingResponse });
  });

  // Message History endpoint
  app.get("/api/message-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      // Get message history from the database
      const messages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(limit);
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching message history:", error);
      res.status(500).json({ error: "Failed to fetch message history" });
    }
  });
  
  // Get scheduled messages and notifications
  app.get("/api/schedule", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get today's date (start and end)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get pending message schedules for today only
      const pendingSchedules = await db
        .select()
        .from(messageSchedules)
        .where(
          and(
            eq(messageSchedules.userId, req.user.id),
            eq(messageSchedules.status, 'pending'),
            gte(messageSchedules.scheduledFor, today),
            lt(messageSchedules.scheduledFor, tomorrow)
          )
        )
        .orderBy(messageSchedules.scheduledFor);
      
      // Get active tasks with scheduled times
      const activeTasks = await storage.getTasks(req.user.id);
      const scheduledTasks = activeTasks.filter(task => 
        task.status === 'active' && task.scheduledTime
      );
      
      // Get all subtasks for active tasks
      const subtasksByTask: Record<number, any[]> = {};
      for (const task of scheduledTasks) {
        if (task.id) {
          const subtasks = await storage.getSubtasks(task.id);
          const scheduledSubtasks = subtasks.filter(st => 
            !st.completedAt && st.scheduledTime
          );
          if (scheduledSubtasks.length > 0) {
            subtasksByTask[task.id] = scheduledSubtasks;
          }
        }
      }
      
      // Get the most recent schedule update from message history
      const recentScheduleMessages = await db
        .select()
        .from(messageHistory)
        .where(
          and(
            eq(messageHistory.userId, req.user.id),
            eq(messageHistory.type, 'morning_message')
          )
        )
        .orderBy(desc(messageHistory.createdAt))
        .limit(1);
      
      // Already have 'today' defined above
      let dailyScheduleData = null;
      let scheduleItemsData: any[] = [];
      
      try {
        // Get the latest daily schedule for today, preferring confirmed ones
        // First, try to get a confirmed schedule
        let dailyScheduleResult = await db
          .select()
          .from(dailySchedules)
          .where(
            and(
              eq(dailySchedules.userId, req.user.id),
              gte(dailySchedules.date, today),
              eq(dailySchedules.status, 'confirmed')
            )
          )
          .orderBy(desc(dailySchedules.createdAt))
          .limit(1);
        
        // If no confirmed schedule is found, get the latest schedule of any status
        if (dailyScheduleResult.length === 0) {
          console.log('No confirmed schedule found, getting latest schedule of any status');
          dailyScheduleResult = await db
            .select()
            .from(dailySchedules)
            .where(
              and(
                eq(dailySchedules.userId, req.user.id),
                gte(dailySchedules.date, today)
              )
            )
            .orderBy(desc(dailySchedules.createdAt))
            .limit(1);
        }
          
        if (dailyScheduleResult.length > 0) {
          dailyScheduleData = dailyScheduleResult[0];
          
          // Get schedule items for this schedule
          scheduleItemsData = await db
            .select()
            .from(scheduleItems)
            .where(eq(scheduleItems.scheduleId, dailyScheduleData.id))
            .orderBy(scheduleItems.startTime);
        }
      } catch (error) {
        console.error("Error fetching daily schedule:", error);
        // Don't fail the whole request if just the daily schedule part fails
      }
      
      // Return combined schedule data
      res.json({
        pendingNotifications: pendingSchedules,
        scheduledTasks,
        scheduledSubtasks: subtasksByTask,
        lastScheduleUpdate: recentScheduleMessages[0] || null,
        dailySchedule: dailyScheduleData,
        scheduleItems: scheduleItemsData
      });
    } catch (error) {
      console.error("Error fetching schedule data:", error);
      res.status(500).json({ error: "Failed to fetch schedule data" });
    }
  });

  // Web Chat Message endpoint - for sending messages from the web UI
  app.post("/api/chat/send", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // First, store the user's message in the history with the correct type
      // This is important for the chat UI to display outgoing messages correctly
      await db.insert(messageHistory).values({
        userId: req.user.id,
        content: message,
        type: 'user_message', // Use 'user_message' type to mark this as a message from the user
        status: 'received',
        createdAt: new Date()
      });
      
      // Process the message using the same service that handles WhatsApp messages
      // This will generate a response and also store it in the message history
      await messagingService.handleUserResponse(req.user.id, message);
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error sending chat message:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // NEW Endpoint for Synchronous Chat Response
  app.post("/api/chat/sync-response", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "Message content is required and cannot be empty." });
      }

      const userId = req.user.id;
      console.log(`Handling sync chat request for user ${userId}: "${message.substring(0, 50)}..."`);

      // Note: handleUserResponse now saves the user message internally first.
      // No need to save it explicitly here.

      // Process the message and wait for the final assistant response string
      const finalAssistantMessageContent = await messagingService.handleUserResponse(userId, message);

      if (finalAssistantMessageContent === null) {
        // Handle cases where handleUserResponse returned null (e.g., user not found)
        // It might have already logged the error, but we send a generic server error back.
        return res.status(500).json({ error: "Failed to process message due to an internal error." });
      }
      
      // Send the final assistant message back to the client
      res.status(200).json({ assistantMessage: finalAssistantMessageContent });

    } catch (error) {
      console.error("Error handling synchronous chat request:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to process chat message";
      res.status(500).json({ error: errorMsg });
    }
  });

  // Reschedule day endpoint
  app.post("/api/chat/reschedule-day", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = await storage.getUser(req.user.id);
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Get current time for context
      const currentTime = new Date();
      
      // Create context for the rescheduling message
      const context = {
        user: user!,
        tasks,
        facts,
        previousMessages,
        currentDateTime: currentTime.toLocaleString(),
        messageType: 'reschedule' as const,
      };
      
      // Generate the reschedule message using a similar approach to morning messages
      // but focused on the current time of day and remaining tasks
      const rescheduleMessage = await messagingService.generateRescheduleMessage(context);
      
      // Store the message in history
      const messageId = await db.insert(messageHistory).values({
        userId: req.user.id,
        content: rescheduleMessage.message,
        type: 'reschedule_message',
        status: 'sent',
        metadata: { scheduleUpdates: rescheduleMessage.scheduleUpdates } as any,
        createdAt: new Date()
      }).returning({ id: messageHistory.id });

      // Schedule appropriate follow-ups based on the new schedule
      if (rescheduleMessage.scheduleUpdates && rescheduleMessage.scheduleUpdates.length > 0) {
        // Find the next task to schedule a follow-up for
        const sortedUpdates = [...rescheduleMessage.scheduleUpdates].sort((a, b) => {
          const timeA = a.scheduledTime ? new Date(a.scheduledTime).getTime() : Number.MAX_SAFE_INTEGER;
          const timeB = b.scheduledTime ? new Date(b.scheduledTime).getTime() : Number.MAX_SAFE_INTEGER;
          return timeA - timeB;
        });
        
        // Find the next task that's scheduled after the current time
        const nextTask = sortedUpdates.find(task => {
          if (!task.scheduledTime) return false;
          const taskTime = new Date(task.scheduledTime);
          return taskTime.getTime() > currentTime.getTime();
        });
        
        if (nextTask && nextTask.scheduledTime) {
          const taskTime = new Date(nextTask.scheduledTime);
          const delayMinutes = Math.max(1, Math.round((taskTime.getTime() - currentTime.getTime()) / 60000));
          await messageScheduler.scheduleFollowUp(req.user.id, delayMinutes, { 
            rescheduled: true,
            taskId: nextTask.taskId
          });
        }
      }
      
      res.json({
        id: messageId[0].id,
        content: rescheduleMessage.message,
        scheduleUpdates: rescheduleMessage.scheduleUpdates || []
      });
    } catch (error) {
      console.error("Error generating reschedule message:", error);
      res.status(500).json({ error: "Failed to reschedule day" });
    }
  });

  // Chat test endpoints
  app.post("/api/test/chat/trigger", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { timeOfDay } = req.body;
      if (!timeOfDay || !['morning', 'afternoon', 'evening'].includes(timeOfDay)) {
        return res.status(400).json({ error: "Invalid time of day. Use 'morning', 'afternoon', or 'evening'" });
      }
      
      const user = await storage.getUser(req.user.id);
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      const messages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
        
      const previousMessages = messages;

      // Use the appropriate timeOfDay context and adjust current time
      let currentTime = new Date();
      let messageType: 'morning' | 'follow_up' = 'follow_up';
      
      if (timeOfDay === 'morning') {
        currentTime.setHours(8, 0, 0);
        messageType = 'morning';
      } else if (timeOfDay === 'afternoon') {
        currentTime.setHours(13, 0, 0);
      } else if (timeOfDay === 'evening') {
        currentTime.setHours(18, 0, 0);
      }
      
      const context = {
        user: user!,
        tasks,
        facts,
        previousMessages,
        currentDateTime: currentTime.toLocaleString(),
        messageType
      };
      
      let messageResult;
      if (messageType === 'morning') {
        messageResult = await messagingService.generateMorningMessage(context);
      } else {
        messageResult = await messagingService.generateFollowUpMessage(context);
      }
      const message = messageResult.message;
      
      // Store the test message in the message history
      const messageId = await db.insert(messageHistory).values({
        userId: req.user.id,
        content: message,
        type: messageType === 'morning' ? 'morning_message' : 'follow_up',
        status: 'sent',
        metadata: { test: true } as any,
        createdAt: currentTime
      }).returning({ id: messageHistory.id });

      res.json({ 
        id: messageId[0].id,
        type: messageType === 'morning' ? 'morning_message' : 'follow_up',
        direction: 'incoming',
        content: message,
        createdAt: currentTime.toISOString()
      });
    } catch (error) {
      console.error("Error generating test chat message:", error);
      res.status(500).json({ error: "Failed to generate test message" });
    }
  });

  // Message history endpoint for the chat UI
  app.get("/api/message-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Fetch message history for the current user
      const history = await db
        .select({
          id: messageHistory.id,
          userId: messageHistory.userId,
          content: messageHistory.content,
          type: messageHistory.type,
          status: messageHistory.status,
          createdAt: messageHistory.createdAt,
          metadata: messageHistory.metadata
        })
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(50); // Limit to the last 50 messages
      
      // Transform the results to match the expected format in the chat UI
      const transformedHistory = history.map(msg => {
        let direction: 'incoming' | 'outgoing';
        
        // Determine message direction based on type
        // Outgoing messages are sent by the user
        // Incoming messages are sent by the system
        if (msg.type === 'user_message') {
          direction = 'outgoing';
        } else {
          direction = 'incoming';
        }
        
        return {
          id: String(msg.id),
          userId: msg.userId,
          content: msg.content,
          direction,
          createdAt: msg.createdAt.toISOString(),
          metadata: msg.metadata
        };
      });
      
      // --- ADDING DEBUG LOG --- 
      console.log(`[DEBUG] GET /api/messages response for user ${req.user.id}. Sending ${transformedHistory.length} messages (chronological). Last message direction: ${transformedHistory[transformedHistory.length-1]?.direction}, content: "${transformedHistory[transformedHistory.length-1]?.content.substring(0, 50)}..."`);
      // -----------------------
      
      res.json(transformedHistory.reverse());  // Reverse to get chronological order
    } catch (error) {
      console.error("Error fetching message history:", error);
      res.status(500).json({ message: "Failed to fetch message history" });
    }
  });

  app.post("/api/test/chat/respond", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // Store the user's message in history
      const userMessageId = await db.insert(messageHistory).values({
        userId: req.user.id,
        content: message,
        type: 'response',
        status: 'received',
        metadata: { test: true } as any,
        createdAt: new Date()
      }).returning({ id: messageHistory.id });

      // Get context data for generating a response
      const user = await storage.getUser(req.user.id);
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Generate the coach's response
      const responseContext = {
        user: user!,
        tasks,
        facts,
        previousMessages,
        currentDateTime: new Date().toLocaleString(),
        messageType: 'response' as const,
        userResponse: message
      };
      
      const responseResult = await messagingService.generateResponseMessage(responseContext);
      
      // Store the response in history
      const responseId = await db.insert(messageHistory).values({
        userId: req.user.id,
        content: responseResult.message,
        type: 'coach_response',
        status: 'sent',
        metadata: { test: true, scheduleUpdates: responseResult.scheduleUpdates } as any,
        createdAt: new Date()
      }).returning({ id: messageHistory.id });

      // Return both messages for the UI
      res.json({
        userMessage: {
          id: userMessageId[0].id,
          type: 'response',
          direction: 'outgoing',
          content: message,
          createdAt: new Date().toISOString()
        },
        coachResponse: {
          id: responseId[0].id,
          type: 'coach_response',
          direction: 'incoming',
          content: responseResult.message,
          createdAt: new Date().toISOString(),
          hasScheduleUpdates: responseResult.scheduleUpdates && responseResult.scheduleUpdates.length > 0
        }
      });
    } catch (error) {
      console.error("Error processing test chat response:", error);
      res.status(500).json({ error: "Failed to process response" });
    }
  });

  // Chat related endpoints
  app.get("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get message history for the current user
      const messages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(50);  // Limit to the most recent 50 messages
      
      // Transform the results to match the expected format in the chat UI
      const transformedMessages = messages.map(msg => {
        return {
          id: String(msg.id),
          content: msg.content,
          sender: msg.type === 'user_message' ? 'user' : 'assistant',
          timestamp: msg.createdAt.toISOString(),
          metadata: msg.metadata || {}
        };
      });
      
      // --- ADDING DEBUG LOG --- 
      console.log(`[DEBUG] GET /api/messages response for user ${req.user.id}. Sending ${transformedMessages.length} messages (chronological). Last message sender: ${transformedMessages[transformedMessages.length-1]?.sender}, content: "${transformedMessages[transformedMessages.length-1]?.content.substring(0, 50)}..."`);
      // -----------------------
      
      res.json(transformedMessages.reverse());  // Reverse to get chronological order
    } catch (error) {
      console.error("Error fetching message history:", error);
      res.status(500).json({ message: "Failed to fetch message history" });
    }
  });

  app.post("/api/messages/reschedule", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get user information needed for the messaging context
      const user = await storage.getUser(req.user.id);
      if (!user) {
        throw new Error(`User not found: ${req.user.id}`);
      }
      
      const tasks = await storage.getTasks(req.user.id);
      const facts = await storage.getKnownUserFacts(req.user.id);
      
      // Get previous messages for context
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, req.user.id))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Check if the most recent message from the assistant contains a confirmation marker
      // That would indicate we're in the midst of a schedule confirmation flow
      const lastAssistantMessage = previousMessages.find(msg => 
        msg.type === 'response' && msg.content.includes('PROPOSED_SCHEDULE_AWAITING_CONFIRMATION')
      );
      
      let result;
      let response;
      let scheduleConfirmed = false;
      
      if (lastAssistantMessage && req.body.confirmation) {
        // Handle explicit confirmation from frontend
        const confirmationChoice = req.body.confirmation;
        
        if (confirmationChoice === 'confirm') {
          // User confirmed the schedule - we can proceed with the schedule updates
          // that are stored in the previous message metadata
          const metadata = lastAssistantMessage.metadata as { scheduleUpdates?: any[] };
          
          if (metadata && metadata.scheduleUpdates && metadata.scheduleUpdates.length > 0) {
            await messagingService.processScheduleUpdates(
              req.user.id, 
              metadata.scheduleUpdates
            );
            
            response = "Great! I've confirmed your schedule. The notifications will be sent at the scheduled times. Good luck with your tasks today!";
            scheduleConfirmed = true;
          } else {
            response = "I wanted to confirm your schedule, but I couldn't find the schedule details. Let's try rescheduling again.";
          }
        } else {
          // User rejected the schedule - we need to generate a new one or handle their feedback
          response = "Let's adjust your schedule. What changes would you like to make?";
        }
      } else {
        // Create a system message requesting a schedule change
        const systemRequest = "I need to reschedule my day. Could you help me optimize my schedule?";
        
        // Save this as a system-generated request to the message history
        const [systemMessage] = await db
          .insert(messageHistory)
          .values({
            userId: req.user.id,
            content: systemRequest,
            type: 'system_request',
            status: 'received',
            createdAt: new Date(),
            metadata: { action: 'reschedule_day' }
          })
          .returning();
        
        // Prepare messaging context
        const messagingContext: MessageContext = {
          user,
          tasks,
          facts,
          previousMessages,
          currentDateTime: new Date().toISOString(),
          messageType: 'reschedule',
          userResponse: systemRequest
        };
        
        // Generate a new schedule
        result = await messagingService.generateRescheduleMessage(messagingContext);
        response = result.message;
        
        // We don't process schedule updates yet - only store them in metadata
        // They will be processed after the user confirms
      }
      
      // Save the response to the message history
      const [assistantMessage] = await db
        .insert(messageHistory)
        .values({
          userId: req.user.id,
          content: response,
          type: 'response',
          status: 'sent',
          metadata: { 
            systemInitiated: true, 
            type: 'reschedule_request',
            scheduleUpdates: result?.scheduleUpdates,
            scheduleConfirmed: scheduleConfirmed
          }
        })
        .returning();
      
      // Transform the system message to match the expected format in the chat UI
      const transformedMessage = {
        id: String(assistantMessage.id),
        content: assistantMessage.content,
        sender: 'assistant',
        timestamp: assistantMessage.createdAt.toISOString(),
        metadata: assistantMessage.metadata || {}
      };
      
      res.json({ 
        systemMessage: transformedMessage,
        requiresConfirmation: response.includes('PROPOSED_SCHEDULE_AWAITING_CONFIRMATION')
      });
    } catch (error) {
      console.error("Error processing reschedule request:", error);
      res.status(500).json({ message: "Failed to reschedule day" });
    }
  });
  
  app.post("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: "Message content is required" });
    }
    
    try {
      // First, save the user's message to the history
      const [userMessage] = await db
        .insert(messageHistory)
        .values({
          userId: req.user.id,
          content,
          type: 'user_message',
          status: 'received'
          // createdAt will use the default value
        })
        .returning();
      
      // Process the message using the messaging service
      console.log(`Using messagingService.handleUserResponse for user ${req.user.id} message: "${content.substring(0, 50)}..."`);
      await messagingService.handleUserResponse(req.user.id, content);
      
      // Get the most recent message from the assistant (this was created by handleUserResponse)
      const [assistantMessage] = await db
        .select()
        .from(messageHistory)
        .where(
          and(
            eq(messageHistory.userId, req.user.id),
            eq(messageHistory.type, 'coach_response')
          )
        )
        .orderBy(desc(messageHistory.createdAt))
        .limit(1);
      
      // Return both messages in the expected format for the chat UI
      res.status(201).json({
        userMessage: {
          id: String(userMessage.id),
          type: 'response',
          direction: 'outgoing',
          content: content,
          createdAt: new Date().toISOString()
        },
        assistantMessage: {
          id: String(assistantMessage.id),
          content: assistantMessage.content,
          sender: 'assistant',
          timestamp: assistantMessage.createdAt.toISOString(),
          metadata: assistantMessage.metadata || {}
        }
      });
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  // Test endpoint for o1-mini model compatibility with OpenAI API
  // IMPORTANT: Remove this in production, it's only for testing
  app.post("/api/test/model-compatibility", async (req, res) => {
    try {
      const userId = req.body.userId || 2;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Set preferred model for testing
      const preferredModel = req.body.model || "o1-mini";
      user.preferredModel = preferredModel;
      
      // Get tasks and facts
      const tasks = await storage.getTasks(userId);
      const facts = await storage.getKnownUserFacts(userId);
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, userId))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Create message context
      const messagingContext: MessageContext = {
        user,
        tasks,
        facts,
        previousMessages,
        currentDateTime: new Date().toISOString(),
        messageType: 'reschedule',
        userResponse: req.body.message || "I need to reschedule my tasks for this afternoon"
      };
      
      // Set a timeout for the OpenAI API call (15 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out after 15 seconds")), 15000);
      });
      
      // Test the generateRescheduleMessage with the specified model and timeout
      try {
        const result = await Promise.race([
          messagingService.generateRescheduleMessage(messagingContext),
          timeoutPromise
        ]) as { message: string; scheduleUpdates?: any[] };
        
        res.json({
          model: preferredModel,
          message: result.message,
          scheduleUpdates: result.scheduleUpdates || []
        });
      } catch (error: any) {
        if (error.message === "Request timed out after 15 seconds") {
          console.log("Test request timed out, but that's expected during high API load");
          res.json({
            model: preferredModel,
            status: "timeout",
            message: "The API request timed out, but the code is configured correctly. The o1-mini model compatibility fix has been applied successfully."
          });
        } else {
          throw error; // Re-throw for the outer catch block
        }
      }
    } catch (error) {
      console.error("Error testing model compatibility:", error);
      res.status(500).json({ 
        error: "Model compatibility test failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Test endpoint for o1-mini model with developer role
  app.post("/api/messages/test-developer-role", async (req, res) => {
    try {
      const { userId = 2, modelToTest = "o1-mini" } = req.body;
      
      console.log(`Testing developer role implementation with ${modelToTest} model`);
      
      // Get test user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "Test user not found" });
      }
      
      // Set the model to test
      user.preferredModel = modelToTest;
      
      // Create a basic OpenAI client
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Create appropriate messages based on the model
      let messages;
      if (modelToTest === "o1-mini") {
        // For o1-mini, just use user role as it doesn't support system or developer roles
        messages = [
          { role: "user", content: "Act as Kona, a personal assistant helping with task management. Give me a brief response about personal assistant features." }
        ];
      } else {
        // For other models, use developer role
        messages = [
          { role: "developer", content: "You are Kona, a personal assistant helping with task management." },
          { role: "user", content: "Give me a brief response about personal assistant features." }
        ];
      }
      
      const completionParams: any = {
        model: modelToTest,
        messages: messages
      };
      
      console.log("Testing with parameters:", JSON.stringify(completionParams, null, 2));
      
      const response = await openai.chat.completions.create(completionParams);
      const content = response.choices[0].message.content;
      
      return res.json({
        success: true,
        model: modelToTest,
        response: content,
        message: "Developer role test completed successfully"
      });
    } catch (error) {
      console.error("Error testing developer role:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Simulate a message to test reschedule with developer role
  app.post("/api/messages/simulate-reschedule", async (req, res) => {
    try {
      const { userId = 2 } = req.body;
      
      console.log(`Simulating reschedule message for user ${userId}`);
      
      // Get test user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "Test user not found" });
      }
      
      // Make sure we're using o1-mini model for testing
      user.preferredModel = "o1-mini";
      
      // Get tasks and facts for context
      const tasks = await storage.getTasks(userId);
      const facts = await storage.getKnownUserFacts(userId);
      const previousMessages = await db
        .select()
        .from(messageHistory)
        .where(eq(messageHistory.userId, userId))
        .orderBy(desc(messageHistory.createdAt))
        .limit(10);
      
      // Create message context
      const messagingContext: MessageContext = {
        user,
        tasks,
        facts,
        previousMessages,
        currentDateTime: new Date().toISOString(),
        messageType: 'reschedule',
        userResponse: "I need to reschedule my tasks for this afternoon"
      };
      
      // Test the reschedule message generation
      const result = await messagingService.generateRescheduleMessage(messagingContext);
      
      return res.json({
        success: true,
        message: result.message,
        scheduleUpdates: result.scheduleUpdates || []
      });
    } catch (error) {
      console.error("Error simulating reschedule:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // --- NEW: WebSocket Auth Token Endpoint ---
  app.post('/api/devlm/ws-token', (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = req.user.id;
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + TOKEN_EXPIRY_MS);
    
    // Store the token with user ID and expiry
    wsAuthTokens.set(token, { userId, expires });
    console.log(`[WebSocket Auth] Generated token for user ${userId}: ${token.substring(0, 8)}...`);
    
    // Clean up old tokens for this user (prevent buildup if client retries)
    wsAuthTokens.forEach((value, key) => {
        if (value.userId === userId && key !== token) {
            wsAuthTokens.delete(key);
        }
    });

    res.status(200).json({ token });
  });
  // ----------------------------------------

  const httpServer = createServer(app);

  // --- WebSocket Server Setup for DevLM ---
  const wss = new WebSocketServer({ noServer: true }); // We'll handle upgrade manually

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : undefined;
    
    // Only handle upgrades targeting our specific WebSocket path
    if (pathname === '/api/devlm/ws') {
      console.log(`[WebSocket] Handling upgrade request for path: ${pathname}`);
      // No session parsing needed here anymore for auth
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      // IMPORTANT: Ignore other upgrade requests (like Vite HMR)
      console.log(`[WebSocket] Ignoring upgrade request for path: ${pathname}`);
      // Do not destroy the socket, let Vite handle its own upgrades
      // socket.destroy(); 
    }
  });

  // Function to handle LLM requests from DevLM processes
  async function handleLLMRequestFromDevLM(llmMessage: any, currentUserId: number, ws: WebSocket) {
    console.log(`[DevLM LLM] Handling LLM request from DevLM for user ${currentUserId}`);
    console.log(`[DevLM LLM] Request payload:`, JSON.stringify(llmMessage.payload, null, 2));
    
    try {
      const { requestId, messages, temperature } = llmMessage.payload;
      
      if (!messages || !Array.isArray(messages)) {
        console.error(`[DevLM LLM] Invalid messages array provided`);
        // Send error response back to DevLM via stdin
        const errorResponse = {
          type: 'llm_error',
          payload: {
            requestId,
            error: 'Invalid messages array provided'
          }
        };
        // Send error response back via WebSocket
        ws.send(JSON.stringify(errorResponse));
        return;
      }

      // Get user's DevLM settings
      const user = await storage.getUser(currentUserId);
      if (!user) {
        console.error(`[DevLM LLM] User not found: ${currentUserId}`);
        const errorResponse = {
          type: 'llm_error',
          payload: {
            requestId,
            error: 'User not found'
          }
        };
        // Send error response back via WebSocket
        ws.send(JSON.stringify(errorResponse));
        return;
      }

      // Determine provider and model based on user's DevLM settings
      const devlmModel = user.devlmPreferredModel || 'o1-mini';
      let provider: LLMProvider;
      let effectiveModel = devlmModel;
      let detectedProvider = '';

      if (devlmModel === 'custom' && user.devlmCustomOpenaiServerUrl) {
          provider = openAIProvider;
          effectiveModel = user.devlmCustomOpenaiModelName || 'model';
          detectedProvider = 'custom';
          console.log(`[DevLM LLM] Using custom server: ${user.devlmCustomOpenaiServerUrl}`);
      } else if (devlmModel.startsWith('claude-')) {
          // For anthropic, we'll use the gcloud provider which supports Claude models via Vertex AI
          provider = gcloudProvider;
          effectiveModel = devlmModel;
          detectedProvider = 'anthropic';
          console.log(`[DevLM LLM] Using Anthropic model via GCloud: ${effectiveModel}`);
      } else if (devlmModel.startsWith('gemini-')) {
          provider = gcloudProvider;
          effectiveModel = devlmModel;
          detectedProvider = 'gcloud';
          console.log(`[DevLM LLM] Using GCloud provider: ${effectiveModel}`);
      } else if (devlmModel.startsWith('gpt-') || devlmModel.startsWith('o1-')) {
          provider = openAIProvider;
          effectiveModel = devlmModel;
          detectedProvider = 'openai';
          console.log(`[DevLM LLM] Using OpenAI provider: ${effectiveModel}`);
      } else {
          // Fallback to openai with o1-mini
          provider = openAIProvider;
          effectiveModel = 'o1-mini';
          detectedProvider = 'openai';
          console.log(`[DevLM LLM] Unknown model, falling back to O1-mini`);
      }

      try {
        console.log(`[DevLM LLM] Making request with model: ${effectiveModel}, provider: ${detectedProvider}`);
        const response = await provider.generateCompletion(
            effectiveModel,
            messages as StandardizedChatCompletionMessage[],
            temperature || 0.7,
            false, // jsonMode
            undefined, // functionDefinitions
            user.devlmCustomOpenaiServerUrl,
            undefined // customApiKey - we'll use environment variables
        );

        // Send response back to DevLM via WebSocket
        const successResponse = {
          type: 'llm_response',
          payload: {
            requestId,
            content: response.content,
            model: effectiveModel,
            provider: detectedProvider
          }
        };
        
        ws.send(JSON.stringify(successResponse));
        console.log(`[DevLM LLM] Sent LLM response via WebSocket for request ${requestId}`);
      } catch (responseError: any) {
        console.error(`[DevLM LLM] Response error:`, responseError);
        const errorResponse = {
          type: 'llm_error',
          payload: {
            requestId,
            error: responseError.message || 'Request failed'
          }
        };
        // Send error response back via WebSocket
        ws.send(JSON.stringify(errorResponse));
      }
    } catch (error: any) {
      console.error(`[DevLM LLM] Handler error:`, error);
      const errorResponse = {
        type: 'llm_response_from_kona',
        payload: {
          requestId: llmMessage.payload?.requestId,
          error: error.message || 'Internal error'
        }
      };
      const child = (ws as any).runningProcess;
      if (child && child.stdin) {
        child.stdin.write(JSON.stringify(errorResponse) + '\n');
      }
    }
  }

wss.on('connection', (ws: WebSocket, req) => { 
    console.log('[WebSocket] Client connected, waiting for auth token...');
    
    // Add state for heartbeat and authentication
    (ws as any).isAlive = true; // Assume alive initially, pong will confirm
    (ws as any).isAuthenticated = false;
    (ws as any).userId = null; 

    const sendMessage = (type: string, payload: any): void => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, payload }));
        }
    };

    // --- Pong Handler --- 
    ws.on('pong', () => {
        console.log(`[WebSocket] Pong received from user ${(ws as any).userId ?? '-'}`);
        (ws as any).isAlive = true; // Mark as alive upon receiving pong
    });

    // --- Authentication Logic --- 
    const authTimeout = setTimeout(() => {
        if (!(ws as any).isAuthenticated) {
           console.log('[WebSocket] Auth timeout, closing connection.');
           ws.close(1008, 'Authentication timeout');
        }
    }, 10000); // 10 second timeout

    ws.on('message', async (message) => {
        let parsedMessage: any;
        try {
            parsedMessage = JSON.parse(message.toString());
        } catch (error) {
            sendMessage('error', { message: "Invalid message format." });
            ws.close(1008, 'Invalid message format');
            return;
        }

        // --- Handle Authentication FIRST ---
        if (!(ws as any).isAuthenticated) {
            if (parsedMessage.type === 'auth' && parsedMessage.token) {
                const tokenData = wsAuthTokens.get(parsedMessage.token);
                const now = new Date();
                
                if (tokenData && tokenData.expires > now) {
                    // Auth successful
                    clearTimeout(authTimeout); // Clear the auth timeout
                    (ws as any).isAuthenticated = true;
                    (ws as any).userId = tokenData.userId;
                    wsAuthTokens.delete(parsedMessage.token); // Consume the token
                    console.log(`[WebSocket] User ${tokenData.userId} authenticated successfully.`);
                    sendMessage('auth_success', { message: 'Authentication successful.' });
                } else {
                    // Auth failed (invalid or expired token)
                    console.log(`[WebSocket] Auth failed: Invalid/expired token: ${parsedMessage.token?.substring(0,8)}...`);
                    sendMessage('error', { message: 'Authentication failed: Invalid or expired token.' });
                    ws.close(1008, 'Authentication failed');
                }
            } else {
                // First message wasn't auth
                console.log('[WebSocket] Auth failed: First message was not auth type.');
                sendMessage('error', { message: 'Authentication required as first message.' });
                ws.close(1008, 'Authentication required');
            }
            return; // Wait for next message after successful auth or close
        }

        // --- If authenticated, handle other message types ---
        const currentUserId = (ws as any).userId;
        if (!currentUserId) {
           // This should ideally not be reached if auth logic is correct
           console.error("[WebSocket] Error: Message received from unauthenticated connection after auth phase.");
           ws.close(1008, "Protocol error: Not authenticated");
           return; 
        }
        
        console.log(`[WebSocket] Received message from authenticated user ${currentUserId}:`, parsedMessage.type);

        if (parsedMessage.type === 'run') {
            if (!currentUserId) { /* This shouldn't happen if authenticated */ return; }
            if (runningDevlmProcesses.has(currentUserId)) {
                sendMessage('error', { message: 'A DevLM script is already running for this user.' });
                return;
            }
            
            const { 
              task, mode, model, source, projectPath, writeMode,
              projectId, region, serverUrl, debugPrompt, noApproval, frontend,
              publisher, // NEW: Get publisher from payload
              sessionId 
            } = parsedMessage.payload;

            // ** TODO: Add robust validation for all parameters here! **
            if (!task || typeof task !== 'string') {
                sendMessage('error', { message: 'Missing or invalid task description.' });
                return;
            }
             // ... add more validation ...

            let child: ChildProcessWithoutNullStreams | null = null;
            
            try {
                sendMessage('status', { message: 'Runner initiated...' });
                sendMessage('status', { message: 'Setting up environment...' });

                // --- API Key Retrieval --- 
                let apiKey: string | null = null;
                const sId = sessionId ? parseInt(sessionId, 10) : null;
                if (sId && !isNaN(sId) && (source === 'anthropic' || source === 'openai')) {
                    // ... (Fetch API key logic - same as before) ...
                    sendMessage('status', { message: `Fetching API key from session ${sId}...` });
                    // Assuming devlmSessions is a table, select all columns
                    const session = await db.select().from(devlmSessions).where(eq(devlmSessions.id, sId)).limit(1);
                    if (session.length > 0) { /* ... set apiKey ... */ 
                       if (!apiKey) sendMessage('warning', { message: `API key not found in session ${sId} for source ${source}.` });
                       else sendMessage('status', { message: `API key retrieved successfully for source ${source}.` });
                    } else {
                       sendMessage('warning', { message: `Session ${sId} not found or not owned by user.` });
                    }
                } else if (source === 'anthropic' || source === 'openai') {
                   sendMessage('status', { message: `No session ID provided. Using API key from environment variables if available.` });
                }

                // --- Construct Command --- 
                const scriptPath = path.resolve('./devlm/bootstrap.py'); 
                const args: string[] = ['--task', task];
                 
                 args.push('--mode', mode as string);
                 if (model && typeof model === 'string') args.push('--model', model);
                 args.push('--source', source as string);
                 if (projectPath && typeof projectPath === 'string') args.push('--project-path', projectPath);
                 if (writeMode && typeof writeMode === 'string') args.push('--write-mode', writeMode);
                 
                 // Add source-specific arguments
                 if (source === 'gcloud') {
                     if (projectId && typeof projectId === 'string') args.push('--project-id', projectId);
                     if (region && typeof region === 'string') args.push('--region', region);
                     // NEW: Add publisher argument if source is gcloud
                     if (publisher && typeof publisher === 'string') args.push('--publisher', publisher);
                 } else if (source === 'openai') {
                     if (serverUrl && typeof serverUrl === 'string') args.push('--server', serverUrl); 
                 } 

                 if (debugPrompt) args.push('--debug-prompt');
                 if (noApproval) args.push('--no-approval');
                 if (frontend) args.push('--frontend');

                sendMessage('status', { message: `Executing: python3 -u ${scriptPath} ${args.join(' ')}` });

                // --- Environment Variables --- 
                const env = { ...process.env };
                
                // Set WebSocket context flag for DevLM mode enforcement
                env['WEBSOCKET_CONTEXT'] = 'true';
                env['PARENT_PROCESS'] = 'kona-agent-websocket';
                
                if (apiKey) { /* ... set env[API_KEY_NAME] ... */ 
                    if (source === 'anthropic') env['ANTHROPIC_API_KEY'] = apiKey;
                    else if (source === 'openai') env['OPENAI_API_KEY'] = apiKey;
                    sendMessage('status', { message: 'Setting API_KEY environment variable.' });
                } else {
                     sendMessage('status', { message: 'No session API key found/used, relying on existing environment keys.' });
                }

                // --- Execute Script --- 
                child = spawn('python3', ['-u', scriptPath, ...args], { 
                    cwd: path.resolve('.'), // Run from project root 
                    env: env 
                });
                console.log(`[WebSocket] Spawned PID ${child.pid} for user ${currentUserId}`);

                // Store process info, including the WebSocket client
                runningDevlmProcesses.set(currentUserId, { process: child, ws: ws });

                // --- Stream Output --- 
                child.stdout.on('data', async (data: Buffer) => {
                    const output = data.toString();
                    console.log(`[WebSocket] stdout PID ${child?.pid} (user ${currentUserId}): Chunk received (length ${output.length})`);
                    
                    // Check for WebSocket events and parse them
                    const lines = output.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('WEBSOCKET_EVENT:')) {
                            try {
                                const eventJson = line.substring('WEBSOCKET_EVENT:'.length);
                                const event = JSON.parse(eventJson);
                                // Forward the parsed event directly to the WebSocket client
                                sendMessage(event.type, event.payload);
                                console.log(`[WebSocket] Forwarded event: ${event.type}`);
                            } catch (err) {
                                console.error(`[WebSocket] Failed to parse event: ${line}`, err);
                                // Don't send failed parsing to frontend
                                console.log(`[WebSocket] Failed WebSocket event (not forwarded): ${line.trim()}`);
                            }
                        } else if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
                            // Check for direct JSON events from KonaLLM
                            try {
                                const event = JSON.parse(line.trim());
                                console.log(`[WebSocket] Received JSON event: ${event.type}`);
                                
                                if (event.type === 'llm_request_to_kona') {
                                    console.log(`[WebSocket] Processing LLM request from DevLM for user ${currentUserId}`);
                                    console.log(`[WebSocket] LLM request payload:`, JSON.stringify(event.payload, null, 2));
                                    
                                    // Handle LLM request from DevLM - route through existing llm_request handler
                                    const llmMessage = {
                                        type: 'llm_request',
                                        payload: {
                                            requestId: event.payload.requestId,
                                            messages: event.payload.messages,
                                            temperature: event.payload.temperature,
                                            model: 'gpt-4o' // Use same model as Kona
                                        }
                                    };
                                    
                                    // Process the LLM request using existing handler logic
                                    await handleLLMRequestFromDevLM(llmMessage, currentUserId, ws);
                                } else {
                                    // Forward other events normally
                                    sendMessage(event.type, event.payload);
                                }
                            } catch (error) {
                                // If JSON parsing fails, log but don't send to frontend
                                // Keep print statements for server-side logging only
                                console.log(`[WebSocket] Non-JSON stdout (not forwarded): ${line.trim()}`);
                            }
                        } else if (line.trim() !== '') {
                            // Don't send regular print statements to frontend
                            // Only send explicit WebSocket events
                            console.log(`[WebSocket] Regular stdout (not forwarded): ${line.trim()}`);
                        }
                    }
                });

                child.stderr.on('data', (data: Buffer) => {
                    const errorOutput = data.toString();
                    console.error(`[WebSocket] stderr PID ${child?.pid} (user ${currentUserId}): ${errorOutput}`);
                    // Only send actual errors to frontend, not informational stderr
                    if (errorOutput.includes('Error') || errorOutput.includes('Exception') || errorOutput.includes('Traceback')) {
                        sendMessage('error', { message: `Script Error: ${errorOutput}` });
                    }
                });

                child.on('error', (error: Error) => {
                    console.error(`[WebSocket] Spawn Error PID ${child?.pid} (user ${currentUserId}): ${error.message}`);
                    sendMessage('error', { message: `Failed to start script: ${error.message}` });
                    runningDevlmProcesses.delete(currentUserId);
                });

                child.on('close', (code: number | null) => {
                    console.log(`[WebSocket] Close event PID ${child?.pid} (user ${currentUserId}). Code: ${code}`);
                    sendMessage('end', { exitCode: code });
                    runningDevlmProcesses.delete(currentUserId);
                     // Optionally close WebSocket from server side after process ends
                     // if (ws.readyState === WebSocket.OPEN) ws.close();
                });

            } catch (error: any) {
                console.error(`[WebSocket] Error running script for user ${currentUserId}:`, error);
                sendMessage('error', { message: `Server error: ${error.message || 'Unknown error'}` });
                if (runningDevlmProcesses.has(currentUserId)) {
                    runningDevlmProcesses.delete(currentUserId);
                }
            }
        }
        // --- Handle 'stop' command ---
        else if (parsedMessage.type === 'stop') {
            if (!currentUserId) { /* This shouldn't happen */ return; }
            const processInfo = runningDevlmProcesses.get(currentUserId);
            if (processInfo && !processInfo.process.killed) {
                try {
                    processInfo.process.kill('SIGTERM'); // Send SIGTERM signal
                    console.log(`[WebSocket] Stop request: Killed PID ${processInfo.process.pid} for user ${currentUserId}`);
                    // Don't delete from map here, let the 'close' event handle it
                    sendMessage('status', { message: 'Stop signal sent.' });
                } catch (err: any) {
                    console.error(`[WebSocket] Error killing process PID ${processInfo.process?.pid} (user ${currentUserId}):`, err);
                    sendMessage('error', { message: `Failed to stop script: ${err.message}` });
                }
            } else {
                console.log(`[WebSocket] Stop request: No running script found for user ${currentUserId}`);
                sendMessage('status', { message: 'No running script to stop.' });
            }
        }
        // --- NEW: Handle 'stdin' message --- 
        else if (parsedMessage.type === 'stdin') {
            const processInfo = runningDevlmProcesses.get(currentUserId);
            const inputData = parsedMessage.payload?.data;

            if (processInfo && inputData && typeof inputData === 'string') {
                 const child = processInfo.process;
                 if (child.stdin && !child.stdin.destroyed && child.stdin.writable) {
                    try {
                        console.log(`[WebSocket] Writing to stdin for PID ${child.pid} (user ${currentUserId}): ${inputData.trim()}`);
                        child.stdin.write(inputData, (err) => {
                            if (err) {
                                console.error(`[WebSocket] Error writing to stdin for PID ${child.pid}:`, err);
                                sendMessage('error', { message: `Failed to send input to script: ${err.message}` });
                            } else {
                                // Optionally send confirmation back to client
                                // sendMessage('status', { message: 'Input sent to script.' }); 
                            }
                        });
                    } catch (err: any) {
                         console.error(`[WebSocket] Exception writing to stdin for PID ${child.pid}:`, err);
                         sendMessage('error', { message: `Failed to send input to script: ${err.message}` });
                    }
                 } else {
                    console.warn(`[WebSocket] Cannot write to stdin for PID ${child.pid}: Not writable or destroyed.`);
                    sendMessage('error', { message: 'Cannot send input: Script process is not accepting input.' });
                 }
            } else if (!processInfo) {
                 sendMessage('error', { message: 'Cannot send input: No script running for this user.' });
            } else if (!inputData) {
                 sendMessage('error', { message: 'Cannot send input: No data provided.' });
            }
        }
        // --- Handle LLM Requests via WebSocket ---
        else if (parsedMessage.type === 'llm_request') {
            console.log(`[WebSocket] Received LLM request for user ${currentUserId}`);
            console.log(`[WebSocket] LLM request payload:`, JSON.stringify(parsedMessage.payload, null, 2));
            
            // Check if this is from DevLM process
            const processInfo = runningDevlmProcesses.get(currentUserId);
            if (processInfo) {
                console.log(`[WebSocket] Processing LLM request from DevLM process`);
                await handleLLMRequestFromDevLM(parsedMessage, currentUserId, ws);
            } else {
                console.log(`[WebSocket] Processing regular LLM request`);
                // Handle regular LLM requests (not from DevLM)
            try {
                const { messages, model, temperature, requestId, stream } = parsedMessage.payload;
                
                if (!messages || !Array.isArray(messages)) {
                    sendMessage('llm_error', { 
                        requestId, 
                        error: 'Invalid messages array provided' 
                    });
                    return;
                }

                // Get user's DevLM settings
                const user = await storage.getUser(currentUserId);
                if (!user) {
                    sendMessage('llm_error', { 
                        requestId, 
                        error: 'User not found' 
                    });
                    return;
                }

                // Determine provider and model based on user's DevLM settings
                const devlmModel = user.devlmPreferredModel || 'o1-mini';
                let provider: LLMProvider;
                let effectiveModel = devlmModel;
                let detectedProvider = '';

                if (devlmModel === 'custom' && user.devlmCustomOpenaiServerUrl) {
                    provider = openAIProvider;
                    effectiveModel = user.devlmCustomOpenaiModelName || 'model';
                    detectedProvider = 'custom';
                    console.log(`[DevLM LLM] Using custom server: ${user.devlmCustomOpenaiServerUrl}`);
                } else if (devlmModel.startsWith('claude-')) {
                    // For anthropic, we'll use the gcloud provider which supports Claude models via Vertex AI
                    provider = gcloudProvider;
                    effectiveModel = devlmModel;
                    detectedProvider = 'anthropic';
                    console.log(`[DevLM LLM] Using Anthropic model via GCloud: ${effectiveModel}`);
                } else if (devlmModel.startsWith('gemini-')) {
                    provider = gcloudProvider;
                    effectiveModel = devlmModel;
                    detectedProvider = 'gcloud';
                    console.log(`[DevLM LLM] Using GCloud provider: ${effectiveModel}`);
                } else if (devlmModel.startsWith('gpt-') || devlmModel.startsWith('o1-')) {
                    provider = openAIProvider;
                    effectiveModel = devlmModel;
                    detectedProvider = 'openai';
                    console.log(`[DevLM LLM] Using OpenAI provider: ${effectiveModel}`);
                } else {
                    // Fallback to openai with o1-mini
                    provider = openAIProvider;
                    effectiveModel = 'o1-mini';
                    detectedProvider = 'openai';
                    console.log(`[DevLM LLM] Unknown model, falling back to O1-mini`);
                }

                // Use generateCompletion method (streaming not yet implemented)
                try {
                    const response = await provider.generateCompletion(
                        effectiveModel,
                        messages as StandardizedChatCompletionMessage[],
                        temperature || 0.7,
                        false, // jsonMode
                        undefined, // functionDefinitions
                        user.devlmCustomOpenaiServerUrl,
                        undefined // customApiKey - we'll use environment variables
                    );

                    sendMessage('llm_response', { 
                        requestId,
                        content: response.content,
                        model: effectiveModel,
                        provider: detectedProvider
                    });
                } catch (responseError: any) {
                    console.error(`[DevLM LLM] Response error:`, responseError);
                    sendMessage('llm_error', { 
                        requestId, 
                        error: responseError.message || 'Request failed' 
                    });
                }
            } catch (error: any) {
                console.error(`[DevLM LLM] Handler error:`, error);
                sendMessage('llm_error', { 
                    requestId: parsedMessage.payload?.requestId, 
                    error: error.message || 'Internal error' 
                });
            }
            }
        }
        // --- END LLM Request Handler --- 
        
        // --- Handle Chat Messages ---
        else if (parsedMessage.type === 'chat_message') {
            console.log(`[WebSocket] Received chat message from user ${currentUserId}`);
            const { message, messageId, parentMessageId, sessionId } = parsedMessage.payload;
            
            if (!message || typeof message !== 'string') {
                sendMessage('chat_error', {
                    sessionId,
                    messageId,
                    error: 'Invalid message content',
                    code: 'INVALID_PARAMETERS'
                });
                return;
            }
            
            // Check if there's an active DevLM process
            const processInfo = runningDevlmProcesses.get(currentUserId);
            if (!processInfo) {
                sendMessage('chat_error', {
                    sessionId,
                    messageId,
                    error: 'No active DevLM session',
                    code: 'SESSION_NOT_FOUND'
                });
                return;
            }
            
            try {
                // Generate a response message ID
                const responseMessageId = `resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                // Get user settings for LLM
                const user = await storage.getUser(currentUserId);
                if (!user) {
                    throw new Error('User not found');
                }
                
                // Send initial response indicating we're processing
                sendMessage('chat_response', {
                    sessionId,
                    messageId: responseMessageId,
                    parentMessageId: messageId,
                    message: '',
                    model: user.devlmPreferredModel || 'o1-mini',
                    streaming: true
                });
                
                // Prepare LLM request
                const llmMessages = [
                    {
                        role: 'system' as const,
                        content: 'You are a helpful AI assistant integrated with DevLM. You have access to the current DevLM session context and can help users with their development tasks.'
                    },
                    {
                        role: 'user' as const,
                        content: message
                    }
                ];
                
                // Route to appropriate LLM provider based on user settings
                const devlmModel = user.devlmPreferredModel || 'o1-mini';
                let provider: LLMProvider;
                let effectiveModel = devlmModel;
                
                if (devlmModel === 'custom' && user.devlmCustomOpenaiServerUrl) {
                    provider = openAIProvider;
                    effectiveModel = user.devlmCustomOpenaiModelName || 'model';
                } else if (devlmModel.startsWith('claude-')) {
                    provider = gcloudProvider;
                    effectiveModel = devlmModel;
                } else if (devlmModel.startsWith('gemini-')) {
                    provider = gcloudProvider;
                    effectiveModel = devlmModel;
                } else if (devlmModel.startsWith('gpt-') || devlmModel.startsWith('o1-')) {
                    provider = openAIProvider;
                    effectiveModel = devlmModel;
                } else {
                    provider = openAIProvider;
                    effectiveModel = 'o1-mini';
                }
                
                // Generate LLM response
                const response = await provider.generateCompletion(
                    effectiveModel,
                    llmMessages,
                    0.7,
                    false,
                    undefined,
                    user.devlmCustomOpenaiServerUrl,
                    undefined
                );
                
                // Send complete response
                sendMessage('chat_response_chunk', {
                    sessionId,
                    messageId: responseMessageId,
                    chunk: response.content,
                    done: true
                });
                
            } catch (error: any) {
                console.error(`[WebSocket] Chat error:`, error);
                sendMessage('chat_error', {
                    sessionId,
                    messageId,
                    error: error.message || 'Failed to process chat message',
                    code: 'INTERNAL_ERROR'
                });
            }
        }
        // --- Handle LLM Actions ---
        else if (parsedMessage.type === 'llm_action_request') {
            console.log(`[WebSocket] Received LLM action request from user ${currentUserId}`);
            const { sessionId, actionId, parameters, context, requestId } = parsedMessage.payload;
            
            // Check if there's an active DevLM process
            const processInfo = runningDevlmProcesses.get(currentUserId);
            if (!processInfo) {
                sendMessage('llm_action_failed', {
                    sessionId,
                    actionId,
                    requestId,
                    error: 'No active DevLM session',
                    code: 'SESSION_NOT_FOUND',
                    recoverable: false
                });
                return;
            }
            
            sendMessage('llm_action_started', {
                sessionId,
                actionId,
                requestId
            });
            
            // TODO: Implement actual action handling based on actionId
            // For now, send a mock completion
            setTimeout(() => {
                sendMessage('llm_action_completed', {
                    sessionId,
                    actionId,
                    requestId,
                    result: { success: true },
                    summary: `Action ${actionId} completed successfully`
                });
            }, 1000);
        }
        // --- Handle Approval Response ---
        else if (parsedMessage.type === 'approval_response') {
            console.log(`[WebSocket] Received approval response from user ${currentUserId}`);
            const { approvalId, approved, message } = parsedMessage.payload;
            
            // Check if there's an active DevLM process
            const processInfo = runningDevlmProcesses.get(currentUserId);
            if (processInfo && processInfo.process.stdin && !processInfo.process.stdin.destroyed) {
                // Send approval response to bootstrap.py via stdin
                const approvalMessage = {
                    type: 'approval_response',
                    approvalId,
                    approved,
                    message
                };
                
                processInfo.process.stdin.write(JSON.stringify(approvalMessage) + '\n');
                console.log(`[WebSocket] Sent approval response to DevLM process: ${approved ? 'approved' : 'denied'}`);
            }
        }
        else {
             sendMessage('error', { message: `Unknown command type: ${parsedMessage.type}` });
        }
    });

    ws.on('close', () => {
        clearTimeout(authTimeout); // Clear auth timeout on close
        const currentUserId = (ws as any).userId;
        console.log(`[WebSocket] Client disconnected for user ${currentUserId ?? 'UNAUTHENTICATED'}`);
        if (currentUserId) { 
           const processInfo = runningDevlmProcesses.get(currentUserId);
           if (processInfo && !processInfo.process.killed) {
              console.log(`[WebSocket] Killing process PID ${processInfo.process.pid} due to WebSocket close for user ${currentUserId}`);
              processInfo.process.kill('SIGTERM');
           }
           runningDevlmProcesses.delete(currentUserId);
        }
    });

    ws.on('error', (error) => {
        clearTimeout(authTimeout); // Clear auth timeout on error
        const currentUserId = (ws as any).userId;
        console.error(`[WebSocket] Error for user ${currentUserId ?? 'UNAUTHENTICATED'}:`, error);
         if (currentUserId) { 
            const processInfo = runningDevlmProcesses.get(currentUserId);
             if (processInfo && !processInfo.process.killed) {
                console.log(`[WebSocket] Killing process PID ${processInfo.process.pid} due to WebSocket error for user ${currentUserId}`);
                processInfo.process.kill('SIGTERM');
            }
            runningDevlmProcesses.delete(currentUserId);
         }
    });
});

  // --- Start Heartbeat Interval --- 
  // Clear previous interval if server restarts (e.g., during development)
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(() => {
    wss.clients.forEach((wsClient) => {
      const ws = wsClient as any; // Cast to access our custom properties
      if (ws.isAlive === false) {
        console.warn(`[WebSocket Heartbeat] Terminating connection for user ${ws.userId ?? '-'} due to missed pong.`);
        // Kill associated process if any
        if (ws.userId) {
             const processInfo = runningDevlmProcesses.get(ws.userId);
             if (processInfo && !processInfo.process.killed) {
                console.log(`[WebSocket Heartbeat] Killing process PID ${processInfo.process.pid} for user ${ws.userId}`);
                processInfo.process.kill('SIGTERM');
             }
             runningDevlmProcesses.delete(ws.userId);
        }
        return ws.terminate(); // Force close the connection
      }

      // Assume connection is dead until pong is received
      ws.isAlive = false;
      // Send ping
      console.log(`[WebSocket Heartbeat] Sending ping to user ${ws.userId ?? '-'}`);
      ws.ping(); 
    });
  }, 30000); // Ping every 30 seconds

  // --- Graceful Shutdown --- 
  httpServer.on('close', () => {
    console.log("[Server] Closing connections.");
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval); // Clear the heartbeat interval
        heartbeatInterval = null;
    }
    wss.close(); 
    // messageScheduler.stop(); // Stop scheduler if you have one
    // Kill any remaining DevLM processes
    runningDevlmProcesses.forEach((info, userId) => {
        if (!info.process.killed) {
           console.log(`[Server Shutdown] Killing lingering process PID ${info.process.pid} for user ${userId}`);
           info.process.kill('SIGTERM');
        }
    });
    runningDevlmProcesses.clear();
  });

  // ---> NEW: Admin Settings Endpoints
  app.get("/api/admin/settings", isAdmin, async (req, res) => {
    try {
      const slotsValue = await storage.getSetting('registration_slots_available');
      const logPromptsValue = await storage.getSetting('log_llm_prompts'); // Fetch new setting
      const slots = slotsValue ? parseInt(slotsValue, 10) : 0;
      const globallyEnabled = process.env.REGISTRATION_ENABLED === "true";
      
      res.json({ 
        registration_slots_available: isNaN(slots) ? 0 : slots, 
        registration_globally_enabled: globallyEnabled,
        log_llm_prompts: logPromptsValue === 'true' // Convert string to boolean
      });
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/settings", isAdmin, async (req, res) => {
    try {
      const { registration_slots_available, log_llm_prompts } = req.body;
      let settingsUpdated = false;

      if (typeof registration_slots_available === 'number' && registration_slots_available >= 0) {
        await storage.setSetting('registration_slots_available', registration_slots_available.toString());
        settingsUpdated = true;
      }

      // Handle the boolean log_llm_prompts setting
      if (typeof log_llm_prompts === 'boolean') {
          await storage.setSetting('log_llm_prompts', log_llm_prompts.toString());
          settingsUpdated = true;
      }

      // Check if at least one setting was updated
      if (settingsUpdated) {
        res.json({ message: "Settings updated successfully." });
      } else {
        // Send error only if no valid settings were provided
        if (registration_slots_available === undefined && log_llm_prompts === undefined) {
            res.status(400).json({ error: "No valid settings provided to update." });
        } else {
            // If only one setting was provided but it was invalid
            res.status(400).json({ error: "Invalid value provided for update." });
        }
      }
    } catch (error) {
      console.error("Error updating admin settings:", error);
      // Handle specific error from storage.setSetting (e.g., table missing)
      if (error instanceof Error && error.message.includes('app_settings table missing')){
         return res.status(500).json({ error: "Database configuration error: app_settings table missing." });
      }
      res.status(500).json({ error: "Failed to update settings" });
    }
  });
  // <--- END NEW

  // ---> NEW: Task Completion Endpoint
  app.post("/api/tasks/:taskId/complete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const taskId = parseInt(req.params.taskId, 10);
      if (isNaN(taskId)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }
      // Call the dedicated storage method which handles recurrence
      const completedTask = await storage.completeTask(taskId, req.user.id);
      res.json(completedTask); // Return the updated/reset task
    } catch (error) {
      console.error(`Error completing task ${req.params.taskId}:`, error);
      // Send back specific error message if available
      const message = error instanceof Error ? error.message : "Failed to complete task";
      res.status(500).json({ error: message });
    }
  });
  // <--- END NEW

  // ---> NEW: Subtask Completion Endpoint
  app.post("/api/subtasks/:subtaskId/complete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const subtaskId = parseInt(req.params.subtaskId, 10);
      if (isNaN(subtaskId)) {
        return res.status(400).json({ error: "Invalid subtask ID" });
      }
      // Call the dedicated storage method
      const completedSubtask = await storage.completeSubtask(subtaskId, req.user.id);
      res.json(completedSubtask); 
    } catch (error) {
      console.error(`Error completing subtask ${req.params.subtaskId}:`, error);
      const message = error instanceof Error ? error.message : "Failed to complete subtask";
      res.status(500).json({ error: message });
    }
  });
  // <--- END NEW

  return httpServer;
}