import { Response, NextFunction } from 'express';
import { UserService } from '../services/userService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { AuthenticatedRequest } from '../models/types';

export class UserController {
  static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await UserService.getUserProfile(req.user!.id);
      sendSuccess(res, 'User details retrieved.', data, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async updateMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await UserService.updateUserProfile(req.user!.id, req.body);
      sendSuccess(res, 'User profile updated successfully.', updated, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
