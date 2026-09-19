import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../models/types';
import { HTTP_STATUS } from '../constants/status';
import { HTTP_MESSAGES } from '../constants/messages';
import { sendError } from '../utils/apiResponse';

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    sendError(res, HTTP_MESSAGES.UNAUTHORIZED, [], HTTP_STATUS.UNAUTHORIZED);
    return;
  }

  const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_womensafety_2026';

  jwt.verify(token, secret, (err: any, decoded: any) => {
    if (err || !decoded) {
      sendError(res, HTTP_MESSAGES.UNAUTHORIZED, [], HTTP_STATUS.UNAUTHORIZED);
      return;
    }
    req.user = {
      id: decoded.id,
      email: decoded.email,
    };
    next();
  });
}
