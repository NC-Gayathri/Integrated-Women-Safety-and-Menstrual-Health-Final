import { Router } from 'express';
import { HealthController } from '../controllers/healthController';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: System health check
 *     description: Returns operational status, environment, uptime, and current timestamp of the server.
 *     tags:
 *       - Health
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy and running.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Server is healthy
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: OK
 *                     uptime:
 *                       type: number
 *                       example: 123.45
 *                     timestamp:
 *                       type: string
 *                       example: 2026-07-29T09:20:00.000Z
 */
router.get('/', HealthController.checkHealth);

export default router;

