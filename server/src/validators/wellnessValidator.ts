import { body, param } from 'express-validator';
import { WellnessStatus } from '../constants/enums';

export const wellnessValidator = [
  body('title').trim().notEmpty().withMessage('Challenge title is required.'),
  body('status').optional().isIn([WellnessStatus.NOT_STARTED, WellnessStatus.IN_PROGRESS, WellnessStatus.COMPLETED]),
];

export const wellnessIdParamValidator = [
  param('id').isInt({ min: 1 }).withMessage('Valid challenge ID is required.'),
];
