import { param } from 'express-validator';

export const notificationIdParamValidator = [
  param('id').isInt({ min: 1 }).withMessage('Valid notification ID is required.'),
];
