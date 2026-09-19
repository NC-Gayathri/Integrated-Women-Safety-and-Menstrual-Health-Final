import { pool, withTransaction } from '../config/db';
import { comparePassword, hashPassword } from '../utils/passwordUtils';
import { logger } from '../utils/logger';
import {
  IoTDevice,
  IoTEvent,
  IoTEventIngestRequest,
  IoTPairDeviceRequest,
  IoTDeviceStatusResponse,
} from '../models/types';
import { IoTEventType, IoTEventStatus, NotificationType, SOSStatus } from '../constants/enums';

export class IoTService {
  /**
   * Ingests telemetry or emergency event from ESP32 with device authentication and deduplication.
   */
  static async ingestEvent(payload: IoTEventIngestRequest) {
    const { deviceId, apiKey, eventId, eventType, heartRate, fallDetected, batteryLevel, timestamp } = payload;

    // 1. Verify device exists in database
    const [deviceRows]: any = await pool.query(
      'SELECT * FROM iot_devices WHERE device_id = ? LIMIT 1',
      [deviceId]
    );

    if (deviceRows.length === 0) {
      throw { statusCode: 404, message: `Device '${deviceId}' is not registered in the system.` };
    }

    const device: IoTDevice = deviceRows[0];

    // 2. Authenticate device API key
    let isKeyValid = false;
    if (device.api_key_hash) {
      isKeyValid = await comparePassword(apiKey, device.api_key_hash);
    } else {
      // Fallback check against default development key if hash was not initialized
      const devKey = process.env.IOT_DEFAULT_DEVICE_API_KEY;
      if (devKey && apiKey === devKey) {
        isKeyValid = true;
      }
    }

    if (!isKeyValid) {
      throw { statusCode: 401, message: 'Invalid device credentials / API key.' };
    }

    // 3. Ensure device is explicitly paired to an authenticated application user
    if (!device.user_id) {
      throw {
        statusCode: 403,
        message: `Device '${deviceId}' is not currently paired with any user account. Please pair the device in the mobile app first.`,
      };
    }

    const userId = device.user_id;

    // 4. Idempotency & Deduplication Check using eventId
    const [existingEventRows]: any = await pool.query(
      'SELECT * FROM iot_events WHERE event_id = ? LIMIT 1',
      [eventId]
    );

    if (existingEventRows.length > 0) {
      logger.info(`[IoT Ingest] Deduplicated event '${eventId}' already exists. Returning stored record.`);
      // Update last seen heartbeat even if duplicate event was retried
      await pool.query('UPDATE iot_devices SET last_seen = NOW() WHERE id = ?', [device.id]);
      return {
        event: existingEventRows[0],
        isDuplicate: true,
        user_id: userId,
      };
    }

    // 5. Determine if event is an emergency condition
    const isEmergency =
      eventType === IoTEventType.BUTTON_SOS ||
      eventType === IoTEventType.FALL_DETECTED ||
      eventType === IoTEventType.HEART_RATE_EMERGENCY;

    return await withTransaction(async (connection) => {
      // Update device state and last seen
      await connection.query(
        `UPDATE iot_devices 
         SET last_seen = NOW(),
             last_heart_rate = COALESCE(?, last_heart_rate),
             last_fall_detected = ?,
             battery_level = COALESCE(?, battery_level)
         WHERE id = ?`,
        [heartRate ?? null, !!fallDetected, batteryLevel ?? null, device.id]
      );

      // Insert the IoT event record
      const [insertResult]: any = await connection.query(
        `INSERT INTO iot_events 
         (event_id, device_id, user_id, event_type, heart_rate, fall_detected, battery_level, is_emergency, status, raw_payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          deviceId,
          userId,
          eventType,
          heartRate ?? null,
          !!fallDetected,
          batteryLevel ?? null,
          isEmergency,
          isEmergency ? IoTEventStatus.TRIGGERED : IoTEventStatus.RESOLVED,
          JSON.stringify(payload),
        ]
      );

      const insertedId = insertResult.insertId;

      // If emergency, record in sos_logs and create in-app notification
      if (isEmergency) {
        let alertTitle = 'IoT Emergency Alert';
        let alertBody = `Emergency alert received from IoT device ${deviceId}.`;

        if (eventType === IoTEventType.BUTTON_SOS) {
          alertTitle = '🚨 Hardware SOS Triggered';
          alertBody = 'Emergency button on your wearable was pressed 3 times.';
        } else if (eventType === IoTEventType.FALL_DETECTED) {
          alertTitle = '⚠ Fall Detected';
          alertBody = 'A hard fall was detected by your wearable sensor.';
        } else if (eventType === IoTEventType.HEART_RATE_EMERGENCY) {
          alertTitle = '💓 Abnormal Heart Rate Alert';
          alertBody = `Your wearable detected an abnormal pulse reading (${heartRate || 'N/A'} BPM).`;
        }

        // Insert into sos_logs
        await connection.query(
          `INSERT INTO sos_logs (user_id, latitude, longitude, accuracy, battery_level, status)
           VALUES (?, 0.0, 0.0, 0, ?, ?)`,
          [userId, batteryLevel ?? 100, SOSStatus.SENT]
        );

        // Insert into notifications
        await connection.query(
          `INSERT INTO notifications (user_id, title, body, type, is_read)
           VALUES (?, ?, ?, ?, FALSE)`,
          [userId, alertTitle, alertBody, NotificationType.IOT_EMERGENCY]
        );

        logger.warn(`[IoT EMERGENCY] Triggered for User #${userId} from Device ${deviceId} [Type: ${eventType}]`);
      }

      const [createdEventRows]: any = await connection.query(
        'SELECT * FROM iot_events WHERE id = ? LIMIT 1',
        [insertedId]
      );

      return {
        event: createdEventRows[0],
        isDuplicate: false,
        user_id: userId,
      };
    });
  }

  /**
   * Returns current paired device info, sensor readings, and online status for the user.
   */
  static async getDeviceStatus(userId: number): Promise<IoTDeviceStatusResponse> {
    const [deviceRows]: any = await pool.query(
      'SELECT * FROM iot_devices WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (deviceRows.length === 0) {
      return {
        isConfigured: false,
        isOnline: false,
        device: null,
        activeEmergenciesCount: 0,
      };
    }

    const device: IoTDevice = deviceRows[0];

    // Compute online status: true if device sent a heartbeat/event in the last 60 seconds
    let isOnline = false;
    if (device.last_seen) {
      const lastSeenTime = new Date(device.last_seen).getTime();
      const now = Date.now();
      isOnline = now - lastSeenTime <= 60 * 1000; // 60s timeout
    }

    // Check count of active unacknowledged emergencies
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) as count 
       FROM iot_events 
       WHERE user_id = ? AND is_emergency = TRUE AND status = 'TRIGGERED'`,
      [userId]
    );

    const activeEmergenciesCount = countRows[0]?.count || 0;

    return {
      isConfigured: true,
      isOnline,
      device: {
        id: device.id,
        deviceId: device.device_id,
        deviceName: device.device_name,
        batteryLevel: device.battery_level,
        status: device.status,
        lastHeartRate: device.last_heart_rate,
        lastFallDetected: device.last_fall_detected,
        lastSeen: device.last_seen,
      },
      activeEmergenciesCount,
    };
  }

  /**
   * Polls latest unacknowledged emergency events for the authenticated mobile app.
   */
  static async pollActiveEmergencies(userId: number): Promise<IoTEvent[]> {
    const [rows]: any = await pool.query(
      `SELECT * 
       FROM iot_events 
       WHERE user_id = ? AND is_emergency = TRUE AND status = 'TRIGGERED' 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [userId]
    );
    return rows;
  }

  /**
   * Marks an emergency event as acknowledged/dismissed by the user.
   */
  static async acknowledgeEvent(userId: number, eventId: number | string) {
    const isNumeric = !isNaN(Number(eventId));
    const condition = isNumeric ? 'id = ?' : 'event_id = ?';

    const [result]: any = await pool.query(
      `UPDATE iot_events 
       SET status = 'ACKNOWLEDGED' 
       WHERE ${condition} AND user_id = ?`,
      [eventId, userId]
    );

    if (result.affectedRows === 0) {
      throw { statusCode: 404, message: 'Emergency event not found or unauthorized.' };
    }

    const [rows]: any = await pool.query(
      `SELECT * FROM iot_events WHERE ${condition} AND user_id = ? LIMIT 1`,
      [eventId, userId]
    );

    return rows[0];
  }

  /**
   * Pairs an ESP32 IoT device with the authenticated user account.
   */
  static async pairDevice(userId: number, data: IoTPairDeviceRequest) {
    const { deviceId, deviceName, deviceApiKey } = data;

    if (!deviceId || typeof deviceId !== 'string') {
      throw { statusCode: 400, message: 'Device ID is required.' };
    }

    const trimmedId = deviceId.trim();

    // Check if device already exists
    const [existingRows]: any = await pool.query(
      'SELECT * FROM iot_devices WHERE device_id = ? LIMIT 1',
      [trimmedId]
    );

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      // If paired to another user, prevent collision
      if (existing.user_id && existing.user_id !== userId) {
        throw {
          statusCode: 409,
          message: `Device '${trimmedId}' is already paired with another user account. Please unpair it from the previous account first.`,
        };
      }

      // Verify API key if provided
      if (deviceApiKey && existing.api_key_hash) {
        const isKeyValid = await comparePassword(deviceApiKey, existing.api_key_hash);
        if (!isKeyValid) {
          throw { statusCode: 401, message: 'Invalid device API key for pairing.' };
        }
      }

      // Update mapping
      await pool.query(
        'UPDATE iot_devices SET user_id = ?, device_name = COALESCE(?, device_name) WHERE id = ?',
        [userId, deviceName || null, existing.id]
      );

      const [updatedRows]: any = await pool.query('SELECT * FROM iot_devices WHERE id = ?', [existing.id]);
      return updatedRows[0];
    }

    // If device doesn't exist yet, register and pair it
    const defaultKey = deviceApiKey || process.env.IOT_DEFAULT_DEVICE_API_KEY || 'naari_iot_dev_key_2026';
    const keyHash = await hashPassword(defaultKey);

    const [insertResult]: any = await pool.query(
      'INSERT INTO iot_devices (user_id, device_id, device_name, api_key_hash, status) VALUES (?, ?, ?, ?, ?)',
      [userId, trimmedId, deviceName || 'ESP32 Wearable Device', keyHash, 'ACTIVE']
    );

    const [newDeviceRows]: any = await pool.query('SELECT * FROM iot_devices WHERE id = ?', [insertResult.insertId]);
    return newDeviceRows[0];
  }

  /**
   * Unpairs an IoT device from the authenticated user.
   */
  static async unpairDevice(userId: number, deviceId: string) {
    const [result]: any = await pool.query(
      'UPDATE iot_devices SET user_id = NULL WHERE device_id = ? AND user_id = ?',
      [deviceId, userId]
    );

    if (result.affectedRows === 0) {
      throw { statusCode: 404, message: 'Device not found or not paired with this user.' };
    }

    return { message: `Device '${deviceId}' has been unpaired successfully.` };
  }
}
