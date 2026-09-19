import { pool } from '../config/db';

export class NotificationService {
  static async getNotifications(userId: number) {
    const [rows]: any = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  static async createNotification(userId: number, title: string, body: string, type: string) {
    const [result]: any = await pool.query(
      'INSERT INTO notifications (user_id, title, body, type, is_read) VALUES (?, ?, ?, ?, FALSE)',
      [userId, title, body, type]
    );
    return { id: result.insertId, user_id: userId, title, body, type, is_read: false };
  }

  static async markAsRead(userId: number, notificationId: number) {
    const [result]: any = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    if (result.affectedRows === 0) {
      throw { statusCode: 404, message: 'Notification not found.' };
    }
    return true;
  }
}
