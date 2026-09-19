import { Request, Response, NextFunction } from 'express';
import { checkDatabaseConnection } from '../config/db';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';

export class HealthController {
  static async checkHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isDbConnected = await checkDatabaseConnection();
      const payload = {
        status: isDbConnected ? 'ok' : 'degraded',
        database: isDbConnected ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };

      if (isDbConnected) {
        sendSuccess(res, 'Server health check passed.', payload, HTTP_STATUS.OK);
      } else {
        sendError(res, 'Database connection failed.', [payload], HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }
    } catch (error) {
      next(error);
    }
  }
}
