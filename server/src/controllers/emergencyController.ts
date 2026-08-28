import { Response, NextFunction } from 'express';
import { EmergencyService } from '../services/emergencyService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { HTTP_MESSAGES } from '../constants/messages';
import { AuthenticatedRequest } from '../models/types';

export class EmergencyController {
  static async addContact(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const contact = await EmergencyService.addContact(req.user!.id, req.body);
      sendSuccess(res, HTTP_MESSAGES.CREATED, contact, HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  static async getContacts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await EmergencyService.getContacts(req.user!.id);
      sendSuccess(res, 'Emergency contacts retrieved.', data, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async updateContact(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const updated = await EmergencyService.updateContact(req.user!.id, id, req.body);
      sendSuccess(res, HTTP_MESSAGES.UPDATED, updated, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async deleteContact(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await EmergencyService.deleteContact(req.user!.id, id);
      sendSuccess(res, HTTP_MESSAGES.DELETED, null, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
