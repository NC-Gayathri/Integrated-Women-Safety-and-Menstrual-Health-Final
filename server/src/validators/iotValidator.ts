import { body, param } from 'express-validator';
import { IoTEventType } from '../constants/enums';

export const iotEventIngestValidator = [
  body('deviceId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Device identifier (deviceId) is required.'),
  body('apiKey')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Device API key is required.'),
  body('eventId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Unique event identifier (eventId) is required.'),
  body('eventType')
    .isIn([
      IoTEventType.BUTTON_SOS,
      IoTEventType.FALL_DETECTED,
      IoTEventType.HEART_RATE_EMERGENCY,
      IoTEventType.STATUS_HEARTBEAT,
    ])
    .withMessage(
      'Valid eventType is required (BUTTON_SOS, FALL_DETECTED, HEART_RATE_EMERGENCY, STATUS_HEARTBEAT).'
    ),
  body('heartRate')
    .optional({ nullable: true })
    .isInt({ min: 20, max: 250 })
    .withMessage('Heart rate must be an integer between 20 and 250 BPM.'),
  body('fallDetected')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('fallDetected must be a boolean.'),
  body('batteryLevel')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 100 })
    .withMessage('Battery level must be an integer between 0 and 100.'),
];

export const iotPairValidator = [
  body('deviceId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Device identifier (deviceId) is required.'),
  body('deviceName')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 }),
  body('deviceApiKey')
    .optional()
    .isString()
    .trim(),
];

export const iotEventIdParamValidator = [
  param('id')
    .notEmpty()
    .withMessage('Event ID parameter is required.'),
];
