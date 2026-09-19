import { Response, NextFunction } from 'express';
import { FitnessService } from '../services/fitnessService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { HTTP_MESSAGES } from '../constants/messages';
import { AuthenticatedRequest } from '../models/types';

export class FitnessController {
  static async getToday(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await FitnessService.getTodayLog(req.user!.id);
      sendSuccess(res, 'Today fitness log retrieved.', data, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async getWeekTrend(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await FitnessService.getWeekTrend(req.user!.id);
      sendSuccess(res, 'Weekly fitness trend retrieved.', data, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async saveDailyLog(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await FitnessService.saveDailyLog(req.user!.id, req.body);
      sendSuccess(res, HTTP_MESSAGES.UPDATED, data, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
