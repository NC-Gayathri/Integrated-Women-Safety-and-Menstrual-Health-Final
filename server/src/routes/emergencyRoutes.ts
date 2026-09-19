import { Router } from 'express';
import { EmergencyController } from '../controllers/emergencyController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { emergencyContactValidator, emergencyIdParamValidator } from '../validators/emergencyValidator';

const router = Router();

router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/emergency:
 *   post:
 *     summary: Add emergency contact
 *     description: Creates a new trusted emergency contact for the user.
 *     tags:
 *       - Emergency Contacts
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Sarah Mom"
 *               phone:
 *                 type: string
 *                 example: "+19876543210"
 *               relationship:
 *                 type: string
 *                 example: "Mother"
 *               is_primary:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Emergency contact created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error.
 */
router.post('/', emergencyContactValidator, validateRequest, EmergencyController.addContact);

/**
 * @openapi
 * /api/v1/emergency:
 *   get:
 *     summary: Get emergency contacts
 *     description: Retrieves list of emergency contacts for the user.
 *     tags:
 *       - Emergency Contacts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contacts retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/', EmergencyController.getContacts);

/**
 * @openapi
 * /api/v1/emergency/{id}:
 *   put:
 *     summary: Update emergency contact
 *     description: Updates an existing emergency contact by ID.
 *     tags:
 *       - Emergency Contacts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contact ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               relationship:
 *                 type: string
 *               is_primary:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Contact updated successfully.
 *       404:
 *         description: Contact not found.
 */
router.put('/:id', emergencyIdParamValidator, validateRequest, EmergencyController.updateContact);

/**
 * @openapi
 * /api/v1/emergency/{id}:
 *   delete:
 *     summary: Delete emergency contact
 *     description: Deletes an emergency contact entry by ID.
 *     tags:
 *       - Emergency Contacts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: Contact deleted successfully.
 *       404:
 *         description: Contact not found.
 */
router.delete('/:id', emergencyIdParamValidator, validateRequest, EmergencyController.deleteContact);

export default router;

