import { Response, NextFunction } from 'express';
import { SOSService } from '../services/sosService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { AuthenticatedRequest } from '../models/types';

export class SOSController {
  static async triggerSOS(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const log = await SOSService.triggerSOS(req.user!.id, req.body);
      sendSuccess(res, 'SOS Alert triggered successfully.', log, HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  static async getSOSLogs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const logs = await SOSService.getSOSLogs(req.user!.id);
      sendSuccess(res, 'SOS history logs retrieved.', logs, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
