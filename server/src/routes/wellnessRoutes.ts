import { Router } from 'express';
import { WellnessController } from '../controllers/wellnessController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { wellnessValidator, wellnessIdParamValidator } from '../validators/wellnessValidator';

const router = Router();

router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/wellness:
 *   get:
 *     summary: Get wellness challenges
 *     description: Retrieves active or joined wellness challenges for the user.
 *     tags:
 *       - Wellness
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wellness challenges retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/', WellnessController.getChallenges);

/**
 * @openapi
 * /api/v1/wellness:
 *   post:
 *     summary: Create wellness challenge
 *     description: Creates a new wellness challenge goal for the user.
 *     tags:
 *       - Wellness
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Daily Hydration Goal"
 *               description:
 *                 type: string
 *                 example: "Drink 8 glasses of water every day"
 *               target_days:
 *                 type: integer
 *                 example: 7
 *     responses:
 *       201:
 *         description: Wellness challenge created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/', wellnessValidator, validateRequest, WellnessController.createChallenge);

/**
 * @openapi
 * /api/v1/wellness/{id}:
 *   put:
 *     summary: Update wellness challenge progress
 *     description: Updates challenge details or completed days.
 *     tags:
 *       - Wellness
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Challenge ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               completed_days:
 *                 type: integer
 *               is_completed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Challenge updated successfully.
 *       404:
 *         description: Challenge not found.
 */
router.put('/:id', wellnessIdParamValidator, validateRequest, WellnessController.updateChallenge);
router.delete('/:id', wellnessIdParamValidator, validateRequest, WellnessController.deleteChallenge);

export default router;

