import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const mergedServerOptions: Record<string, any> = {
    middlewareMode: true,
    hmr: {
      server 
    },
    host: '0.0.0.0' 
  };
  
  // Safely merge server options
  if (viteConfig.server) {
    Object.assign(mergedServerOptions, viteConfig.server);
    
    // Safely merge hmr options
    if (viteConfig.server.hmr && typeof viteConfig.server.hmr === 'object') {
      mergedServerOptions.hmr = {
        ...mergedServerOptions.hmr,
        ...viteConfig.server.hmr
      };
    }
  }

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: mergedServerOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // ---> ADD BACK SPA Fallback Middleware for development
  app.use("*", async (req, res, next) => {
    // Only handle GET requests intended for HTML
    if (req.method !== 'GET' || req.headers.accept?.includes('text/event-stream')) {
        return next();
    }
    
    const url = req.originalUrl;
    try {
      // 1. Read index.html
      const template = await fs.promises.readFile(
        path.resolve(viteConfig.root || process.cwd(), 'index.html'),
        'utf-8',
      );

      // 2. Apply Vite HTML transforms. This injects HMR client & plugins
      const html = await vite.transformIndexHtml(url, template);

      // 3. Send the transformed HTML to the client
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      // If an error occurs, let Vite fix the stack trace
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
  // <--- END ADD BACK
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
