import { Router } from 'express';
import { AssistantController } from '../controllers/assistantController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { assistantChatValidator, assistantIdParamValidator } from '../validators/assistantValidator';

const router = Router();

router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/assistant/chat:
 *   post:
 *     summary: Send/Save AI assistant message
 *     description: Stores an AI conversation message exchange.
 *     tags:
 *       - Assistant
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_message
 *             properties:
 *               user_message:
 *                 type: string
 *                 example: "What helps with period cramps?"
 *               bot_response:
 *                 type: string
 *                 example: "Applying a warm heating pad and staying hydrated can help reduce menstrual cramps."
 *               intent:
 *                 type: string
 *                 example: "HEALTH_ADVICE"
 *     responses:
 *       201:
 *         description: Chat message saved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/chat', assistantChatValidator, validateRequest, AssistantController.saveChat);

/**
 * @openapi
 * /api/v1/assistant/history:
 *   get:
 *     summary: Get AI assistant chat history
 *     description: Retrieves recent chat history messages with the AI assistant.
 *     tags:
 *       - Assistant
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chat history retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/history', AssistantController.getHistory);

/**
 * @openapi
 * /api/v1/assistant/chat/{id}:
 *   delete:
 *     summary: Delete a single chat message
 *     description: Removes a specific AI chat message entry by ID.
 *     tags:
 *       - Assistant
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Chat Message ID
 *     responses:
 *       200:
 *         description: Chat message deleted successfully.
 *       404:
 *         description: Message not found.
 */
router.delete('/chat/:id', assistantIdParamValidator, validateRequest, AssistantController.deleteMessage);

/**
 * @openapi
 * /api/v1/assistant/history:
 *   delete:
 *     summary: Clear entire chat history
 *     description: Permanently deletes all AI assistant chat history for the user.
 *     tags:
 *       - Assistant
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chat history cleared successfully.
 */
router.delete('/history', AssistantController.clearHistory);

export default router;

