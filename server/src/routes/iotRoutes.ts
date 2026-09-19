import { Router } from 'express';
import { IoTController } from '../controllers/iotController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import {
  iotEventIngestValidator,
  iotPairValidator,
  iotEventIdParamValidator,
} from '../validators/iotValidator';

const router = Router();

/**
 * @openapi
 * /api/v1/iot/events:
 *   post:
 *     summary: Ingest IoT sensor event or emergency alert (ESP32)
 *     description: Authenticates ESP32 via deviceId and apiKey, deduplicates via eventId, updates telemetry, and triggers emergency flows.
 *     tags:
 *       - IoT
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceId
 *               - apiKey
 *               - eventId
 *               - eventType
 *             properties:
 *               deviceId:
 *                 type: string
 *                 example: "cc:7b:5c:fb:d9:18"
 *               apiKey:
 *                 type: string
 *                 example: "your_device_api_key"
 *               eventId:
 *                 type: string
 *                 example: "cc:7b:5c:fb:d9:18_BTN_A7F2_000001"
 *               eventType:
 *                 type: string
 *                 enum: [BUTTON_SOS, FALL_DETECTED, HEART_RATE_EMERGENCY, STATUS_HEARTBEAT]
 *                 example: "BUTTON_SOS"
 *               heartRate:
 *                 type: integer
 *                 example: 85
 *               fallDetected:
 *                 type: boolean
 *                 example: false
 *               batteryLevel:
 *                 type: integer
 *                 example: 92
 *     responses:
 *       200:
 *         description: Event processed or deduplicated successfully.
 */
router.post('/events', iotEventIngestValidator, validateRequest, IoTController.ingestEvent);

/**
 * @openapi
 * /api/v1/iot/devices/status:
 *   get:
 *     summary: Get live IoT device connection and telemetry status
 *     description: Returns the user's paired IoT device, online status (heartbeat <= 60s), live BPM, and active emergencies.
 *     tags:
 *       - IoT
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Device status retrieved.
 */
router.get('/devices/status', authenticateToken, IoTController.getDeviceStatus);

/**
 * @openapi
 * /api/v1/iot/events/emergency-poll:
 *   get:
 *     summary: Poll active unacknowledged IoT emergency alerts
 *     description: Retrieves unacknowledged emergency events for active in-app alerts.
 *     tags:
 *       - IoT
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active emergency events.
 */
router.get('/events/emergency-poll', authenticateToken, IoTController.pollActiveEmergencies);

/**
 * @openapi
 * /api/v1/iot/events/{id}/ack:
 *   post:
 *     summary: Acknowledge / dismiss an IoT emergency event
 *     description: Marks the emergency event as acknowledged so it no longer triggers alerts.
 *     tags:
 *       - IoT
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Event acknowledged.
 */
router.post('/events/:id/ack', authenticateToken, iotEventIdParamValidator, validateRequest, IoTController.acknowledgeEvent);

/**
 * @openapi
 * /api/v1/iot/devices/pair:
 *   post:
 *     summary: Pair an ESP32 wearable device with the authenticated user
 *     description: Associates a device ID with the current user account.
 *     tags:
 *       - IoT
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceId
 *             properties:
 *               deviceId:
 *                 type: string
 *                 example: "cc:7b:5c:fb:d9:18"
 *               deviceName:
 *                 type: string
 *                 example: "NAARI_KAVACH"
 *               deviceApiKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Device paired successfully.
 */
router.post('/devices/pair', authenticateToken, iotPairValidator, validateRequest, IoTController.pairDevice);

/**
 * @openapi
 * /api/v1/iot/devices/{deviceId}:
 *   delete:
 *     summary: Unpair an IoT device from user account
 *     tags:
 *       - IoT
 *     security:
 *       - bearerAuth: []
 */
router.delete('/devices/:deviceId', authenticateToken, IoTController.unpairDevice);

export default router;
