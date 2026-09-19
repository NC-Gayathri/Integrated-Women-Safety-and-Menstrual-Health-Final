import { Response, NextFunction, Request } from 'express';
import { IoTService } from '../services/iotService';
import { sendSuccess } from '../utils/apiResponse';
import { HTTP_STATUS } from '../constants/status';
import { AuthenticatedRequest } from '../models/types';

export class IoTController {
  /**
   * ESP32 Device Ingest Endpoint: Ingests telemetry or emergency event.
   */
  static async ingestEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await IoTService.ingestEvent(req.body);
      const message = result.isDuplicate
        ? 'Event already processed (deduplicated).'
        : 'Event processed successfully.';
      sendSuccess(res, message, result, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated Mobile Endpoint: Get paired device status & live sensor values.
   */
  static async getDeviceStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = await IoTService.getDeviceStatus(req.user!.id);
      sendSuccess(res, 'Device status retrieved successfully.', status, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated Mobile Endpoint: Poll active unacknowledged emergencies.
   */
  static async pollActiveEmergencies(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const emergencies = await IoTService.pollActiveEmergencies(req.user!.id);
      sendSuccess(res, 'Active emergency events retrieved.', emergencies, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated Mobile Endpoint: Acknowledge an emergency event.
   */
  static async acknowledgeEvent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const eventId = String(req.params.id);
      const updated = await IoTService.acknowledgeEvent(req.user!.id, eventId);
      sendSuccess(res, 'Emergency event acknowledged.', updated, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated Mobile Endpoint: Pair ESP32 device with user account.
   */
  static async pairDevice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const device = await IoTService.pairDevice(req.user!.id, req.body);
      sendSuccess(res, 'Device paired successfully.', device, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated Mobile Endpoint: Unpair ESP32 device.
   */
  static async unpairDevice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const deviceId = String(req.params.deviceId);
      const result = await IoTService.unpairDevice(req.user!.id, deviceId);
      sendSuccess(res, result.message, null, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
