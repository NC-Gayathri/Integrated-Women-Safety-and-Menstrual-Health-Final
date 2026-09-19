import { body, param } from 'express-validator';

export const menstrualCycleValidator = [
  body('last_period_date').isISO8601().withMessage('Valid last_period_date (YYYY-MM-DD) is required.'),
  body('cycle_length').optional().isInt({ min: 15, max: 60 }),
  body('period_length').optional().isInt({ min: 1, max: 15 }),
];

export const menstrualIdParamValidator = [
  param('id').isInt({ min: 1 }).withMessage('Valid cycle ID is required.'),
];
