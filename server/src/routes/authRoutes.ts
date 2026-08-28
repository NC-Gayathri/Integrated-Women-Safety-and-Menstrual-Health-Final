import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import {
  registerValidator,
  loginValidator,
  firebaseVerifyValidator,
} from '../validators/authValidator';

const router = Router();

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user (Local)
 *     description: Creates a new user account and returns an authentication JWT token.
 *     tags:
 *       - Auth
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Password123!
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *     responses:
 *       201:
 *         description: User registered successfully.
 */
router.post('/register', registerValidator, validateRequest, AuthController.register);

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user (Local)
 *     description: Authenticates user credentials and returns an authentication JWT token.
 *     tags:
 *       - Auth
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Password123!
 *     responses:
 *       200:
 *         description: Login successful.
 */
router.post('/login', loginValidator, validateRequest, AuthController.login);

/**
 * @openapi
 * /api/v1/auth/firebase-verify:
 *   post:
 *     summary: Verify Firebase Authentication Token & Issue Naari Kavach JWT
 *     description: Verifies Firebase ID token server-side, maps/creates MySQL user, and returns 7-day Naari Kavach JWT.
 *     tags:
 *       - Auth
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Firebase verification successful.
 *       401:
 *         description: Invalid or expired Firebase token.
 */
router.post('/firebase-verify', firebaseVerifyValidator, validateRequest, AuthController.firebaseVerify);

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Clears session and returns success.
 *     tags:
 *       - Auth
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful.
 */
router.post('/logout', authenticateToken, AuthController.logout);

/**
 * @openapi
 * /api/v1/auth/profile:
 *   get:
 *     summary: Get current authenticated user profile
 *     description: Returns the user profile of the currently logged-in user.
 *     tags:
 *       - Auth
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved.
 */
router.get('/profile', authenticateToken, AuthController.getProfile);

export default router;
