import dotenv from 'dotenv';
import app from './app';
import { logger } from './utils/logger';
import { checkDatabaseConnection } from './config/db';

console.log('STEP 1: server.ts loaded');

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    console.log('STEP 2: before database connection');

    const isDbConnected = await checkDatabaseConnection();

    if (!isDbConnected) {
      logger.warn('Warning: Server starting, but MySQL database is currently disconnected.');
    } else {
      logger.info('MySQL Database connected successfully.');
      const { runDatabaseMigrations } = await import('./config/migrate');
      await runDatabaseMigrations();
    }

    console.log('STEP 3: before app.listen');

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
      logger.info(`Interactive Swagger Documentation: http://localhost:${PORT}/api/docs`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use by another process. Please free port ${PORT} and try again.`);
      } else {
        logger.error('Server socket error:', error);
      }
    });
  } catch (error) {
    console.error('SERVER STARTUP ERROR:', error);
  }
}

startServer();