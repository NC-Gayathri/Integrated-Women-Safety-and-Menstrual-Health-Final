import { Response } from 'express';
import { HTTP_STATUS } from '../constants/status';
import { ApiResponse } from '../models/types';

export function sendSuccess<T>(
  res: Response,
  message: string,
  data?: T,
  statusCode: number = HTTP_STATUS.OK
): Response {
  const payload: ApiResponse<T> = {
    success: true,
    message,
    data,
  };
  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  message: string,
  errors: any[] = [],
  statusCode: number = HTTP_STATUS.BAD_REQUEST
): Response {
  const payload: ApiResponse = {
    success: false,
    message,
    errors,
  };
  return res.status(statusCode).json(payload);
}
