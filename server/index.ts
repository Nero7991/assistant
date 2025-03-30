import express, { type Request, Response, NextFunction } from "express";
import cors from 'cors';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initDatabase } from './init-db';

const app = express();

// Configure CORS before other middleware
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true, // Important: needed for cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-twilio-signature']
}));

// Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true })); //Updated to true to handle form-encoded data

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Set trust proxy to handle cookies properly behind reverse proxy
  app.set('trust proxy', 1);
  
  // Initialize database tables if they don't exist
  console.log("Starting database initialization...");
  const dbInitSuccess = await initDatabase();
  if (!dbInitSuccess) {
    console.error("WARNING: Database initialization failed or had issues. Some features may not work properly.");
  } else {
    console.log("Database initialization successful!");
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Error:", err);
    res.status(status).json({ message });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    // Log the full server URL for Twilio webhook configuration
    const replId = process.env.REPL_ID;
    const replSlug = process.env.REPL_SLUG;
    const webhookUrl = `https://${replSlug}.${replId}.repl.co/api/webhook/whatsapp`;
    log(`Server running at http://0.0.0.0:${port}`);
    log(`Configure Twilio webhook URL as: ${webhookUrl}`);
  });
})();