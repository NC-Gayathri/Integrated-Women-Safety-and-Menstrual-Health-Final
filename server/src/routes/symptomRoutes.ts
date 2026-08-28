import { Router } from 'express';
import { SymptomController } from '../controllers/symptomController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { symptomValidator, symptomIdParamValidator } from '../validators/symptomValidator';

const router = Router();

router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/symptoms:
 *   post:
 *     summary: Log a symptom
 *     description: Creates a new symptom log entry for a given date.
 *     tags:
 *       - Symptoms
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - symptom
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-07-29"
 *               symptom:
 *                 type: string
 *                 example: "Cramps"
 *               severity:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 3
 *               mood:
 *                 type: string
 *                 example: "Fatigued"
 *               notes:
 *                 type: string
 *                 example: "Mild pain in lower abdomen"
 *     responses:
 *       201:
 *         description: Symptom logged successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error.
 */
router.post('/', symptomValidator, validateRequest, SymptomController.addSymptom);

/**
 * @openapi
 * /api/v1/symptoms:
 *   get:
 *     summary: Get symptom logs
 *     description: Retrieves logged symptoms for the authenticated user.
 *     tags:
 *       - Symptoms
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Symptoms retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/', SymptomController.getSymptoms);

/**
 * @openapi
 * /api/v1/symptoms/{id}:
 *   put:
 *     summary: Update symptom log
 *     description: Updates an existing symptom record by ID.
 *     tags:
 *       - Symptoms
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Symptom ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               symptom:
 *                 type: string
 *               severity:
 *                 type: integer
 *               mood:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Symptom updated successfully.
 *       404:
 *         description: Symptom not found.
 */
router.put('/:id', symptomIdParamValidator, validateRequest, SymptomController.updateSymptom);

/**
 * @openapi
 * /api/v1/symptoms/{id}:
 *   delete:
 *     summary: Delete symptom log
 *     description: Deletes a logged symptom record by ID.
 *     tags:
 *       - Symptoms
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Symptom ID
 *     responses:
 *       200:
 *         description: Symptom deleted successfully.
 *       404:
 *         description: Symptom not found.
 */
router.delete('/:id', symptomIdParamValidator, validateRequest, SymptomController.deleteSymptom);

export default router;

