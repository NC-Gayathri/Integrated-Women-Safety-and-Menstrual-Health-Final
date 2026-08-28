import { Router } from 'express';
import { SOSController } from '../controllers/sosController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { sosLogValidator } from '../validators/sosValidator';

const router = Router();

router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/sos:
 *   post:
 *     summary: Trigger SOS alert
 *     description: Triggers emergency SOS alert with current GPS location coordinates and battery level.
 *     tags:
 *       - SOS
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *                 example: 37.7749
 *               longitude:
 *                 type: number
 *                 example: -122.4194
 *               accuracy:
 *                 type: number
 *                 example: 10.5
 *               battery_level:
 *                 type: integer
 *                 example: 85
 *     responses:
 *       201:
 *         description: SOS alert triggered and contacts notified.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error.
 */
router.post('/', sosLogValidator, validateRequest, SOSController.triggerSOS);

/**
 * @openapi
 * /api/v1/sos:
 *   get:
 *     summary: Get SOS alert history
 *     description: Retrieves past SOS emergency alert logs for the user.
 *     tags:
 *       - SOS
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SOS logs retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/', SOSController.getSOSLogs);

export default router;

