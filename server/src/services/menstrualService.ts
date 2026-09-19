import { pool, withTransaction } from '../config/db';

export class MenstrualService {
  static async addCycle(userId: number, data: { last_period_date: string; cycle_length?: number; period_length?: number }) {
    const cycleLength = data.cycle_length || 28;
    const periodLength = data.period_length || 5;

    return await withTransaction(async (connection) => {
      const [result]: any = await connection.query(
        'INSERT INTO menstrual_cycles (user_id, last_period_date, cycle_length, period_length) VALUES (?, ?, ?, ?)',
        [userId, data.last_period_date, cycleLength, periodLength]
      );

      const cycleId = result.insertId;

      // Calculate cycle predictions
      const lastDate = new Date(data.last_period_date);

      const nextPeriod = new Date(lastDate);
      nextPeriod.setDate(nextPeriod.getDate() + cycleLength);

      const ovulation = new Date(lastDate);
      ovulation.setDate(ovulation.getDate() + (cycleLength - 14));

      const fertileStart = new Date(ovulation);
      fertileStart.setDate(fertileStart.getDate() - 5);

      const fertileEnd = new Date(ovulation);
      fertileEnd.setDate(fertileEnd.getDate() + 1);

      const formatDate = (d: Date) => d.toISOString().split('T')[0];

      await connection.query(
        `INSERT INTO cycle_predictions 
          (user_id, predicted_period_date, fertile_window_start, fertile_window_end, ovulation_day) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          formatDate(nextPeriod),
          formatDate(fertileStart),
          formatDate(fertileEnd),
          formatDate(ovulation),
        ]
      );

      return {
        id: cycleId,
        user_id: userId,
        last_period_date: data.last_period_date,
        cycle_length: cycleLength,
        period_length: periodLength,
        prediction: {
          predicted_period_date: formatDate(nextPeriod),
          fertile_window_start: formatDate(fertileStart),
          fertile_window_end: formatDate(fertileEnd),
          ovulation_day: formatDate(ovulation),
        },
      };
    });
  }

  static async getCycles(userId: number) {
    const [cycles]: any = await pool.query(
      'SELECT * FROM menstrual_cycles WHERE user_id = ? AND deleted_at IS NULL ORDER BY last_period_date DESC',
      [userId]
    );

    const [predictions]: any = await pool.query(
      'SELECT * FROM cycle_predictions WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [userId]
    );

    return {
      cycles,
      latest_prediction: predictions.length > 0 ? predictions[0] : null,
    };
  }

  static async updateCycle(userId: number, cycleId: number, data: any) {
    const [existing]: any = await pool.query(
      'SELECT id FROM menstrual_cycles WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [cycleId, userId]
    );

    if (existing.length === 0) {
      throw { statusCode: 404, message: 'Menstrual cycle entry not found.' };
    }

    await pool.query(
      `UPDATE menstrual_cycles SET 
        last_period_date = COALESCE(?, last_period_date),
        cycle_length = COALESCE(?, cycle_length),
        period_length = COALESCE(?, period_length)
      WHERE id = ? AND user_id = ?`,
      [data.last_period_date || null, data.cycle_length || null, data.period_length || null, cycleId, userId]
    );

    return { id: cycleId, ...data };
  }

  static async deleteCycle(userId: number, cycleId: number) {
    const [result]: any = await pool.query(
      'UPDATE menstrual_cycles SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [cycleId, userId]
    );

    if (result.affectedRows === 0) {
      throw { statusCode: 404, message: 'Menstrual cycle entry not found.' };
    }

    return true;
  }
}
