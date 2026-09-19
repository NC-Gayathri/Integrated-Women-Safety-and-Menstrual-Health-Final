import { pool } from '../config/db';

export class AssistantService {
  static async saveChatMessage(userId: number, role: 'user' | 'assistant', message: string, timestamp?: number) {
    const ts = timestamp || Date.now();
    const [result]: any = await pool.query(
      'INSERT INTO assistant_chat (user_id, role, message, timestamp) VALUES (?, ?, ?, ?)',
      [userId, role, message, ts]
    );

    return {
      id: result.insertId,
      user_id: userId,
      role,
      message,
      timestamp: ts,
    };
  }

  static async getChatHistory(userId: number, limit: number = 50) {
    const [rows]: any = await pool.query(
      'SELECT id, role, message, timestamp, created_at FROM assistant_chat WHERE user_id = ? ORDER BY timestamp ASC LIMIT ?',
      [userId, Number(limit)]
    );
    return rows;
  }

  static async deleteChatMessage(userId: number, messageId: number) {
    const [result]: any = await pool.query(
      'DELETE FROM assistant_chat WHERE id = ? AND user_id = ?',
      [messageId, userId]
    );

    if (result.affectedRows === 0) {
      throw { statusCode: 404, message: 'Chat message not found.' };
    }

    return true;
  }

  static async clearChatHistory(userId: number) {
    await pool.query('DELETE FROM assistant_chat WHERE user_id = ?', [userId]);
    return true;
  }
}
