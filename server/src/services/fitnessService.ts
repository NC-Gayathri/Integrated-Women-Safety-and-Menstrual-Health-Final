import { pool } from '../config/db';

export class FitnessService {
  static async getTodayLog(userId: number) {
    const today = new Date().toISOString().split('T')[0];
    const [rows]: any = await pool.query(
      'SELECT id, user_id, date, steps, water_glasses, heart_rate, workout_completed, journal, created_at, updated_at FROM fitness_logs WHERE user_id = ? AND date = ? LIMIT 1',
      [userId, today]
    );

    if (rows.length > 0) {
      return rows[0];
    }

    return {
      id: null,
      user_id: userId,
      date: today,
      steps: 0,
      water_glasses: 0,
      heart_rate: null,
      workout_completed: false,
      journal: '',
    };
  }

  static async getWeekTrend(userId: number) {
    const [rows]: any = await pool.query(
      `SELECT date, steps, water_glasses, workout_completed 
       FROM fitness_logs 
       WHERE user_id = ? AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
       ORDER BY date ASC`,
      [userId]
    );
    return rows;
  }

  static async saveDailyLog(userId: number, data: {
    date?: string;
    steps?: number;
    water_glasses?: number;
    heart_rate?: number;
    workout_completed?: boolean;
    journal?: string;
  }) {
    const targetDate = data.date || new Date().toISOString().split('T')[0];

    await pool.query(
      `INSERT INTO fitness_logs (user_id, date, steps, water_glasses, heart_rate, workout_completed, journal)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         steps = COALESCE(VALUES(steps), steps),
         water_glasses = COALESCE(VALUES(water_glasses), water_glasses),
         heart_rate = COALESCE(VALUES(heart_rate), heart_rate),
         workout_completed = COALESCE(VALUES(workout_completed), workout_completed),
         journal = COALESCE(VALUES(journal), journal),
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        targetDate,
        data.steps !== undefined ? data.steps : 0,
        data.water_glasses !== undefined ? data.water_glasses : 0,
        data.heart_rate !== undefined ? data.heart_rate : null,
        data.workout_completed !== undefined ? (data.workout_completed ? 1 : 0) : 0,
        data.journal !== undefined ? data.journal : null,
      ]
    );

    const [rows]: any = await pool.query(
      'SELECT id, user_id, date, steps, water_glasses, heart_rate, workout_completed, journal, created_at, updated_at FROM fitness_logs WHERE user_id = ? AND date = ? LIMIT 1',
      [userId, targetDate]
    );

    return rows[0];
  }
}
