import { body, param } from 'express-validator';

export const symptomValidator = [
  body('date').isISO8601().withMessage('Valid date (YYYY-MM-DD) is required.'),
  body('symptom').trim().notEmpty().withMessage('Symptom description is required.'),
  body('severity').optional().isInt({ min: 1, max: 5 }),
  body('mood').optional().trim(),
  body('notes').optional().trim(),
];

export const symptomIdParamValidator = [
  param('id').isInt({ min: 1 }).withMessage('Valid symptom ID is required.'),
];
