import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../models/types';
import { logger } from '../utils/logger';
import { sendError } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { HTTP_MESSAGES } from '../constants/messages';

export function errorHandler(
  err: any,
  req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled Server Error:', {
    message: err.message,
    stack: err.stack,
    requestId: req.requestId,
    userId: req.user?.id,
    url: req.originalUrl,
    method: req.method,
  });

  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const message = err.message || HTTP_MESSAGES.INTERNAL_ERROR;

  sendError(res, message, err.errors || [], statusCode);
}
