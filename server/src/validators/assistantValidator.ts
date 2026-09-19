import { body, param } from 'express-validator';

export const assistantChatValidator = [
  body('message').trim().notEmpty().withMessage('Message text is required.'),
  body('role').optional().isIn(['user', 'assistant']).withMessage('Role must be user or assistant.'),
];

export const assistantIdParamValidator = [
  param('id').isInt({ min: 1 }).withMessage('Valid message ID is required.'),
];
