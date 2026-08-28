import { Response, NextFunction } from 'express';
import { WellnessService } from '../services/wellnessService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { HTTP_MESSAGES } from '../constants/messages';
import { AuthenticatedRequest } from '../models/types';

export class WellnessController {
  static async getChallenges(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await WellnessService.getChallenges(req.user!.id);
      sendSuccess(res, 'Wellness challenges retrieved.', data, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async createChallenge(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, status } = req.body;
      const created = await WellnessService.createChallenge(req.user!.id, title, status);
      sendSuccess(res, HTTP_MESSAGES.CREATED, created, HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  static async updateChallenge(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      const updated = await WellnessService.updateChallenge(req.user!.id, id, status);
      sendSuccess(res, HTTP_MESSAGES.UPDATED, updated, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
