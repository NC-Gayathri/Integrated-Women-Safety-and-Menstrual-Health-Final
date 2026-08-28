import { Response, NextFunction } from 'express';
import { AssistantService } from '../services/assistantService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { HTTP_MESSAGES } from '../constants/messages';
import { AuthenticatedRequest } from '../models/types';

export class AssistantController {
  static async saveChat(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { role, message, timestamp } = req.body;
      const saved = await AssistantService.saveChatMessage(req.user!.id, role || 'user', message, timestamp);
      sendSuccess(res, HTTP_MESSAGES.CREATED, saved, HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  static async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = Number(req.query.limit) || 50;
      const history = await AssistantService.getChatHistory(req.user!.id, limit);
      sendSuccess(res, 'Chat history retrieved.', history, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async deleteMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      await AssistantService.deleteChatMessage(req.user!.id, id);
      sendSuccess(res, HTTP_MESSAGES.DELETED, null, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async clearHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await AssistantService.clearChatHistory(req.user!.id);
      sendSuccess(res, 'Chat history cleared.', null, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
