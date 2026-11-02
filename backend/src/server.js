import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import * as schedulerService from './services/schedulerService.js';

const startServer = async () => {
  // Connect to MongoDB before starting HTTP server or scheduler
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log(`[Server] DevOpsPulse API running in ${env.NODE_ENV} mode on port ${env.PORT}`);
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
    server.close(() => process.exit(1));
  });

  // Graceful shutdown on termination signals
  const shutdown = () => {
    console.log('[Server] Gracefully shutting down...');
    schedulerService.stop();
    server.close(() => {
      console.log('[Server] Process terminated.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer();
