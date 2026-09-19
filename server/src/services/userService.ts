import { pool } from '../config/db';

export class UserService {
  static async getUserProfile(userId: number) {
    const [userRows]: any = await pool.query(
      'SELECT id, name, email, phone, created_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [userId]
    );

    if (userRows.length === 0) {
      throw { statusCode: 404, message: 'User not found.' };
    }

    const [profileRows]: any = await pool.query(
      'SELECT date_of_birth, height, weight, blood_group, emergency_enabled FROM user_profiles WHERE user_id = ? LIMIT 1',
      [userId]
    );

    return {
      ...userRows[0],
      profile: profileRows.length > 0 ? profileRows[0] : null,
    };
  }

  static async updateUserProfile(userId: number, data: any) {
    if (data.name || data.phone) {
      await pool.query(
        'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?',
        [data.name || null, data.phone || null, userId]
      );
    }

    const [profileExists]: any = await pool.query(
      'SELECT id FROM user_profiles WHERE user_id = ?',
      [userId]
    );

    if (profileExists.length === 0) {
      await pool.query(
        'INSERT INTO user_profiles (user_id, date_of_birth, height, weight, blood_group, emergency_enabled) VALUES (?, ?, ?, ?, ?, ?)',
        [
          userId,
          data.date_of_birth || null,
          data.height || null,
          data.weight || null,
          data.blood_group || null,
          data.emergency_enabled !== undefined ? data.emergency_enabled : true,
        ]
      );
    } else {
      await pool.query(
        `UPDATE user_profiles SET 
          date_of_birth = COALESCE(?, date_of_birth),
          height = COALESCE(?, height),
          weight = COALESCE(?, weight),
          blood_group = COALESCE(?, blood_group),
          emergency_enabled = COALESCE(?, emergency_enabled)
        WHERE user_id = ?`,
        [
          data.date_of_birth || null,
          data.height || null,
          data.weight || null,
          data.blood_group || null,
          data.emergency_enabled !== undefined ? data.emergency_enabled : null,
          userId,
        ]
      );
    }

    return await this.getUserProfile(userId);
  }
}
