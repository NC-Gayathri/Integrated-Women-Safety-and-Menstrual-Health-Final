import { Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { HTTP_MESSAGES } from '../constants/messages';
import { AuthenticatedRequest } from '../models/types';

export class AuthController {
  static async register(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.registerUser(req.body);
      sendSuccess(res, HTTP_MESSAGES.REGISTER_SUCCESS, result, HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  static async login(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.loginUser(req.body);
      sendSuccess(res, HTTP_MESSAGES.LOGIN_SUCCESS, result, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async firebaseVerify(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { idToken, name } = req.body;
      const result = await AuthService.verifyFirebaseTokenAndSyncUser(idToken, name);
      sendSuccess(res, 'Firebase authentication verified successfully.', result, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async logout(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      sendSuccess(res, 'Logout successful.', null, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  static async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.findUserById(req.user!.id);
      sendSuccess(res, 'User profile fetched successfully.', user, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
