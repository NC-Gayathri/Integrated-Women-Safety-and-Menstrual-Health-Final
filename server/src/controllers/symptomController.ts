import { Response, NextFunction } from 'express';
import { SymptomService } from '../services/symptomService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { HTTP_MESSAGES } from '../constants/messages';
import { AuthenticatedRequest } from '../models/types';

export class SymptomController {
  static async addSymptom(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await SymptomService.addSymptom(req.user!.id, req.body);
      sendSuccess(res, HTTP_MESSAGES.CREATED, result, HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  static async getSymptoms(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const date = req.query.date as string | undefined;
      const data = await SymptomService.getSymptoms(req.user!.id, date);
      sendSuccess(res, 'Symptoms retrieved.', data, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async updateSymptom(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const updated = await SymptomService.updateSymptom(req.user!.id, id, req.body);
      sendSuccess(res, HTTP_MESSAGES.UPDATED, updated, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async deleteSymptom(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await SymptomService.deleteSymptom(req.user!.id, id);
      sendSuccess(res, HTTP_MESSAGES.DELETED, null, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
