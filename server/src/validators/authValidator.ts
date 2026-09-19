import { body } from 'express-validator';

export const registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ min: 2, max: 100 }),
  body('email').trim().isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'),
  body('phone').optional().trim().isMobilePhone('any').withMessage('Invalid phone number format.'),
];

export const loginValidator = [
  body('email').trim().isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

export const firebaseVerifyValidator = [
  body('idToken').trim().notEmpty().withMessage('Firebase ID token is required.'),
  body('name').optional().trim(),
];
