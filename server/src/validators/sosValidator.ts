import { body } from 'express-validator';

export const sosLogValidator = [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required.'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required.'),
  body('accuracy').optional().isFloat({ min: 0 }),
  body('battery_level').optional().isInt({ min: 0, max: 100 }),
];
