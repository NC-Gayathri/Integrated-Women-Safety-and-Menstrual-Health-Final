import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { updateProfileValidator } from '../validators/userValidator';

const router = Router();

router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/users/me:
 *   get:
 *     summary: Get user profile
 *     description: Returns current logged-in user profile details.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized.
 */
router.get('/me', UserController.getMe);

/**
 * @openapi
 * /api/v1/users/me:
 *   put:
 *     summary: Update user profile
 *     description: Updates profile fields like date of birth, height, weight, blood group, and emergency settings.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date_of_birth:
 *                 type: string
 *                 format: date
 *                 example: "1998-05-15"
 *               height:
 *                 type: number
 *                 example: 165.5
 *               weight:
 *                 type: number
 *                 example: 58.0
 *               blood_group:
 *                 type: string
 *                 example: "O+"
 *               emergency_enabled:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: User profile updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized.
 */
router.put('/me', updateProfileValidator, validateRequest, UserController.updateMe);

export default router;

