import { body, param } from 'express-validator';

export const emergencyContactValidator = [
  body('name').trim().notEmpty().withMessage('Contact name is required.'),
  body('phone').trim().notEmpty().withMessage('Contact phone number is required.'),
  body('relationship').optional().trim(),
  body('is_primary').optional().isBoolean(),
];

export const emergencyIdParamValidator = [
  param('id').isInt({ min: 1 }).withMessage('Valid emergency contact ID is required.'),
];
