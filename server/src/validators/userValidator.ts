import { body } from 'express-validator';

export const updateProfileValidator = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional().trim(),
  body('date_of_birth').optional().isISO8601().withMessage('Invalid date format (YYYY-MM-DD).'),
  body('height').optional().isFloat({ min: 0, max: 300 }),
  body('weight').optional().isFloat({ min: 0, max: 500 }),
  body('blood_group').optional().isString().trim(),
  body('emergency_enabled').optional().isBoolean(),
];
