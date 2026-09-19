import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { notificationIdParamValidator } from '../validators/notificationValidator';

const router = Router();

router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/notifications:
 *   get:
 *     summary: Get notifications
 *     description: Retrieves notifications list for the logged-in user.
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/', NotificationController.getNotifications);

/**
 * @openapi
 * /api/v1/notifications/{id}/read:
 *   put:
 *     summary: Mark notification as read
 *     description: Updates the status of a specific notification to read.
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read successfully.
 *       404:
 *         description: Notification not found.
 */
router.put('/:id/read', notificationIdParamValidator, validateRequest, NotificationController.markAsRead);

export default router;

