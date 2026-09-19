import { Router } from 'express';
import { MenstrualController } from '../controllers/menstrualController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { menstrualCycleValidator, menstrualIdParamValidator } from '../validators/menstrualValidator';

const router = Router();

router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/menstrual:
 *   post:
 *     summary: Log a menstrual cycle
 *     description: Creates a new menstrual cycle record and generates predictions.
 *     tags:
 *       - Menstrual Cycles
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - last_period_date
 *             properties:
 *               last_period_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-07-01"
 *               cycle_length:
 *                 type: integer
 *                 example: 28
 *               period_length:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       201:
 *         description: Cycle logged successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized.
 */
router.post('/', menstrualCycleValidator, validateRequest, MenstrualController.addCycle);

/**
 * @openapi
 * /api/v1/menstrual:
 *   get:
 *     summary: Get all menstrual cycles
 *     description: Retrieves list of logged menstrual cycles for the authenticated user.
 *     tags:
 *       - Menstrual Cycles
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Menstrual cycles retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized.
 */
router.get('/', MenstrualController.getCycles);

/**
 * @openapi
 * /api/v1/menstrual/{id}:
 *   put:
 *     summary: Update a menstrual cycle
 *     description: Updates an existing menstrual cycle entry by ID.
 *     tags:
 *       - Menstrual Cycles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Cycle ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               last_period_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-07-01"
 *               cycle_length:
 *                 type: integer
 *                 example: 28
 *               period_length:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       200:
 *         description: Cycle updated successfully.
 *       404:
 *         description: Cycle not found.
 */
router.put('/:id', menstrualIdParamValidator, validateRequest, MenstrualController.updateCycle);

/**
 * @openapi
 * /api/v1/menstrual/{id}:
 *   delete:
 *     summary: Delete a menstrual cycle
 *     description: Removes a menstrual cycle record by ID.
 *     tags:
 *       - Menstrual Cycles
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Cycle ID
 *     responses:
 *       200:
 *         description: Cycle deleted successfully.
 *       404:
 *         description: Cycle not found.
 */
router.delete('/:id', menstrualIdParamValidator, validateRequest, MenstrualController.deleteCycle);

export default router;

