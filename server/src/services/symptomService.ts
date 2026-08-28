import { pool } from '../config/db';

export class SymptomService {
  static async addSymptom(userId: number, data: { date: string; symptom: string; severity?: number; mood?: string; notes?: string }) {
    const [result]: any = await pool.query(
      'INSERT INTO symptoms (user_id, date, symptom, severity, mood, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, data.date, data.symptom, data.severity || 1, data.mood || null, data.notes || null]
    );

    return {
      id: result.insertId,
      user_id: userId,
      ...data,
    };
  }

  static async getSymptoms(userId: number, date?: string) {
    let query = 'SELECT * FROM symptoms WHERE user_id = ?';
    const params: any[] = [userId];

    if (date) {
      query += ' AND date = ?';
      params.push(date);
    }

    query += ' ORDER BY date DESC, id DESC';

    const [rows]: any = await pool.query(query, params);
    return rows;
  }

  static async updateSymptom(userId: number, symptomId: number, data: any) {
    const [result]: any = await pool.query(
      `UPDATE symptoms SET 
        date = COALESCE(?, date),
        symptom = COALESCE(?, symptom),
        severity = COALESCE(?, severity),
        mood = COALESCE(?, mood),
        notes = COALESCE(?, notes)
      WHERE id = ? AND user_id = ?`,
      [data.date || null, data.symptom || null, data.severity || null, data.mood || null, data.notes || null, symptomId, userId]
    );

    if (result.affectedRows === 0) {
      throw { statusCode: 404, message: 'Symptom entry not found.' };
    }

    return { id: symptomId, ...data };
  }

  static async deleteSymptom(userId: number, symptomId: number) {
    const [result]: any = await pool.query(
      'DELETE FROM symptoms WHERE id = ? AND user_id = ?',
      [symptomId, userId]
    );

    if (result.affectedRows === 0) {
      throw { statusCode: 404, message: 'Symptom entry not found.' };
    }

    return true;
  }
}
