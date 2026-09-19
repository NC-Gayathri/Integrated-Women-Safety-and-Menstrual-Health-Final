import { body, param } from 'express-validator';
import { WellnessStatus } from '../constants/enums';

export const wellnessValidator = [
  body('title').trim().notEmpty().withMessage('Challenge title is required.'),
  body('status')
    .optional()
    .customSanitizer((val) => {
      if (typeof val === 'string') {
        const upper = val.toUpperCase();
        if (upper === 'PENDING' || upper === 'NOT_STARTED') return WellnessStatus.NOT_STARTED;
        if (upper === 'COMPLETED') return WellnessStatus.COMPLETED;
        if (upper === 'IN_PROGRESS') return WellnessStatus.IN_PROGRESS;
      }
      return val;
    })
    .isIn([WellnessStatus.NOT_STARTED, WellnessStatus.IN_PROGRESS, WellnessStatus.COMPLETED]),
];

export const wellnessIdParamValidator = [
  param('id').isInt({ min: 1 }).withMessage('Valid challenge ID is required.'),
];
