import { Response, NextFunction } from 'express';
import { NotificationService } from '../services/notificationService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { AuthenticatedRequest } from '../models/types';

export class NotificationController {
  static async getNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await NotificationService.getNotifications(req.user!.id);
      sendSuccess(res, 'Notifications retrieved.', data, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async markAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await NotificationService.markAsRead(req.user!.id, id);
      sendSuccess(res, 'Notification marked as read.', null, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
