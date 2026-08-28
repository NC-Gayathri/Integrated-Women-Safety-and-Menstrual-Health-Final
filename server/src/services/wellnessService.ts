import { pool } from '../config/db';
import { WellnessStatus } from '../constants/enums';

export class WellnessService {
  static async getChallenges(userId: number) {
    const [rows]: any = await pool.query(
      'SELECT * FROM wellness_challenges WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC',
      [userId]
    );
    return rows;
  }

  static async createChallenge(userId: number, title: string, status: WellnessStatus = WellnessStatus.NOT_STARTED) {
    const [result]: any = await pool.query(
      'INSERT INTO wellness_challenges (user_id, title, status) VALUES (?, ?, ?)',
      [userId, title, status]
    );
    return { id: result.insertId, user_id: userId, title, status };
  }

  static async updateChallenge(userId: number, id: number, status: WellnessStatus) {
    const [result]: any = await pool.query(
      'UPDATE wellness_challenges SET status = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [status, id, userId]
    );

    if (result.affectedRows === 0) {
      throw { statusCode: 404, message: 'Wellness challenge not found.' };
    }
    return { id, status };
  }
}
