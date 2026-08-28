import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { HTTP_STATUS } from '../constants/status';
import { sendError } from '../utils/apiResponse';

export function validateRequest(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err: any) => ({
      field: err.path || err.param,
      message: err.msg,
    }));
    sendError(res, 'Validation failed', formattedErrors, HTTP_STATUS.UNPROCESSABLE_ENTITY);
    return;
  }
  next();
}
