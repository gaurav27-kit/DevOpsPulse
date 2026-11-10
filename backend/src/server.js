import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import * as schedulerService from './services/schedulerService.js';
import { cleanupInterruptedDeliveries } from './services/notificationService.js';
import { initSockets, closeIO } from './sockets/index.js';

const startServer = async () => {
  // Connect to MongoDB before starting HTTP server or scheduler
  await connectDB();

  // Clean up any stale in-flight deliveries interrupted across restarts
  await cleanupInterruptedDeliveries();

  const httpServer = http.createServer(app);

  // Initialize Socket.IO with cookie-based JWT authentication
  initSockets(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(`[Server] DevOpsPulse API & WebSockets running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });

  // Start monitoring scheduler only if enabled in config
  if (env.SCHEDULER_ENABLED) {
    schedulerService.start();
  } else {
    console.log('[Scheduler] Disabled via SCHEDULER_ENABLED=false');
  }

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error(`[Unhandled Rejection] ${err.message}`, err);
    schedulerService.stop();
    closeIO();
    httpServer.close(() => process.exit(1));
  });

  // Graceful shutdown on termination signals
  const shutdown = async () => {
    console.log('[Server] Gracefully shutting down...');
    schedulerService.stop();
    closeIO();
    httpServer.close(async () => {
      try {
        await mongoose.connection.close();
      } catch {
        // ignore error during disconnect
      }
      console.log('[Server] Process terminated.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer();
