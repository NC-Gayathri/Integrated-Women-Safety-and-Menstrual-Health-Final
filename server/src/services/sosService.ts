import { pool } from '../config/db';
import { SOSStatus } from '../constants/enums';

export class SOSService {
  static async triggerSOS(userId: number, data: { latitude: number; longitude: number; accuracy?: number; battery_level?: number }) {
    const [result]: any = await pool.query(
      'INSERT INTO sos_logs (user_id, latitude, longitude, accuracy, battery_level, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, data.latitude, data.longitude, data.accuracy || 0, data.battery_level || 100, SOSStatus.SENT]
    );

    const logId = result.insertId;

    // Fetch user emergency contacts
    const [contacts]: any = await pool.query(
      'SELECT name, phone, relationship, is_primary FROM emergency_contacts WHERE user_id = ? AND deleted_at IS NULL',
      [userId]
    );

    return {
      id: logId,
      user_id: userId,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy || 0,
      battery_level: data.battery_level || 100,
      status: SOSStatus.SENT,
      notified_contacts: contacts,
    };
  }

  static async getSOSLogs(userId: number) {
    const [rows]: any = await pool.query(
      'SELECT * FROM sos_logs WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }
}
