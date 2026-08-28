import { pool, withTransaction } from '../config/db';

export class EmergencyService {
  static async addContact(userId: number, data: { name: string; phone: string; relationship?: string; is_primary?: boolean }) {
    const isPrimary = data.is_primary !== undefined ? data.is_primary : true;

    return await withTransaction(async (connection) => {
      if (isPrimary) {
        await connection.query(
          'UPDATE emergency_contacts SET is_primary = FALSE WHERE user_id = ?',
          [userId]
        );
      }

      const [result]: any = await connection.query(
        'INSERT INTO emergency_contacts (user_id, name, phone, relationship, is_primary) VALUES (?, ?, ?, ?, ?)',
        [userId, data.name, data.phone, data.relationship || null, isPrimary]
      );

      return {
        id: result.insertId,
        user_id: userId,
        name: data.name,
        phone: data.phone,
        relationship: data.relationship || null,
        is_primary: isPrimary,
      };
    });
  }

  static async getContacts(userId: number) {
    const [rows]: any = await pool.query(
      'SELECT * FROM emergency_contacts WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_primary DESC, id ASC',
      [userId]
    );
    return rows;
  }

  static async updateContact(userId: number, contactId: number, data: any) {
    const [existing]: any = await pool.query(
      'SELECT id FROM emergency_contacts WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [contactId, userId]
    );

    if (existing.length === 0) {
      throw { statusCode: 404, message: 'Emergency contact not found.' };
    }

    if (data.is_primary) {
      await pool.query(
        'UPDATE emergency_contacts SET is_primary = FALSE WHERE user_id = ?',
        [userId]
      );
    }

    await pool.query(
      `UPDATE emergency_contacts SET 
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        relationship = COALESCE(?, relationship),
        is_primary = COALESCE(?, is_primary)
      WHERE id = ? AND user_id = ?`,
      [data.name || null, data.phone || null, data.relationship || null, data.is_primary !== undefined ? data.is_primary : null, contactId, userId]
    );

    return { id: contactId, ...data };
  }

  static async deleteContact(userId: number, contactId: number) {
    const [result]: any = await pool.query(
      'UPDATE emergency_contacts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [contactId, userId]
    );

    if (result.affectedRows === 0) {
      throw { statusCode: 404, message: 'Emergency contact not found.' };
    }

    return true;
  }
}
