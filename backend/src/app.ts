import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';

// Load Environment Variables
dotenv.config();

import connectDB from './config/db';
import traceMiddleware from './middleware/trace';
import requestLogger from './middleware/logger';
import errorHandler from './middleware/error';
import router from './routes';
import schedulerService from './services/scheduler.service';
import logger from './utils/logger';

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Database Connection
connectDB();

// Initialize Background Scheduler Cron Job (runs every minute in development for prompt feedback)
const cronSchedule = process.env.CRON_SCHEDULE || '* * * * *';
schedulerService.initialize(cronSchedule);

// Global Middleware Setup
app.use(cors({
  origin: '*', // Enable open CORS as requested in deployment specifications
  credentials: true,
}));

app.use(express.json());
app.use(traceMiddleware);
app.use(requestLogger);

// Setup OpenAPI Swagger documentation
try {
  const swaggerPath = path.join(__dirname, 'config', 'swagger.json');
  if (fs.existsSync(swaggerPath)) {
    const swaggerDocument = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    logger.info('Swagger OpenAPI documentation successfully loaded at /api-docs');
  } else {
    logger.warn('Swagger specification not found at src/config/swagger.json. Skipping API Docs route.');
  }
} catch (swaggerErr: any) {
  logger.error(`Error configuring Swagger UI: ${swaggerErr.message}`);
}

// Bind master Router
app.use(router);

// Centralized Catch-All Error Handler Middleware (must be registered last!)
app.use(errorHandler);

// Bootstrap Express Server Listener
const server = app.listen(PORT, () => {
  logger.info(`===========================================================`);
  logger.info(`   IntelliMeet Meeting Intelligence Service is now online!`);
  logger.info(`   Server Port:   ${PORT}`);
  logger.info(`   Environment:   ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   API Playground: http://localhost:${PORT}/api-docs`);
  logger.info(`===========================================================`);
});

// Handle graceful shutdown hooks
const gracefulShutdown = () => {
  logger.info('Received shutdown signal. Commencing clean server termination...');
  
  // Stop background cron jobs
  schedulerService.stop();
  
  // Close database and HTTP listener
  server.close(() => {
    logger.info('HTTP server has been shut down.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;
