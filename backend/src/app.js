import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import applicationRoutes from './routes/applications.js';
import incidentRoutes from './routes/incidents.js';
import deploymentRoutes from './routes/deployments.js';
import dashboardRoutes from './routes/dashboard.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

// Security headers
app.use(helmet());

// CORS configuration allowing cookies from frontend client
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true
  })
);

// Body parsing with payload size limitation to prevent DOS attacks
app.use(express.json({ limit: '10kb' }));

// Parse HTTP cookies (specifically JWT auth cookie)
app.use(cookieParser());

// Health check endpoint (PRD requirement)
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Mount modular API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/applications', applicationRoutes);
app.use('/api/v1/incidents', incidentRoutes);
app.use('/api/v1/deployments', deploymentRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// Catch 404 for undefined routes
app.use(notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

export default app;

