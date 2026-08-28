import { Response, NextFunction } from 'express';
import { MenstrualService } from '../services/menstrualService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { HTTP_MESSAGES } from '../constants/messages';
import { AuthenticatedRequest } from '../models/types';

export class MenstrualController {
  static async addCycle(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cycle = await MenstrualService.addCycle(req.user!.id, req.body);
      sendSuccess(res, HTTP_MESSAGES.CREATED, cycle, HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  static async getCycles(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await MenstrualService.getCycles(req.user!.id);
      sendSuccess(res, 'Menstrual cycles and predictions retrieved.', data, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async updateCycle(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const updated = await MenstrualService.updateCycle(req.user!.id, id, req.body);
      sendSuccess(res, HTTP_MESSAGES.UPDATED, updated, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async deleteCycle(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await MenstrualService.deleteCycle(req.user!.id, id);
      sendSuccess(res, HTTP_MESSAGES.DELETED, null, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
