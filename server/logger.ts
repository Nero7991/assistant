import pino from 'pino';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logDir = path.resolve('logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const systemMessagesLogPath = path.join(logDir, 'system_messages.log');

// Define streams
const streams = [];

// Console stream (pretty print for development)
if (process.env.NODE_ENV !== 'production') {
  streams.push({
    level: 'debug', // Log debug messages and above to console in dev
    stream: pino.destination({ fd: process.stdout.fd }), // Use pino destination for console
    options: { // Options for pino-pretty if used via pipeline (not directly here)
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    }
  });
} else {
    // Simple console log for production (info level)
    streams.push({
        level: 'info',
        stream: pino.destination({ fd: process.stdout.fd })
    });
}

// File stream for system messages (JSON format)
streams.push({
  level: 'info', // Log info messages and above to the file
  stream: pino.destination(systemMessagesLogPath)
});

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug', // Set default level
  timestamp: pino.stdTimeFunctions.isoTime, // Use standard ISO timestamp
}, pino.multistream(streams));


// If running in dev and pino-pretty is installed, consider piping output through it in package.json script
// e.g., "dev": "tsx server/index.ts | pino-pretty"

console.log(`Logger initialized. System messages logging to: ${systemMessagesLogPath}`);

export default logger; 