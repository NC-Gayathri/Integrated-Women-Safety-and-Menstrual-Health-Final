import jwt from 'jsonwebtoken';
import { pool, withTransaction } from '../config/db';
import { hashPassword, comparePassword } from '../utils/passwordUtils';
import { firebaseAuth } from '../config/firebaseAdmin';
import { User } from '../models/types';
import { logger } from '../utils/logger';

export class AuthService {
  /**
   * Registers a user in MySQL with local email/password (preserving existing behavior).
   */
  static async registerUser(data: { name: string; email: string; password: string; phone?: string }) {
    const existing = await this.findUserByEmail(data.email);
    if (existing) {
      throw { statusCode: 409, message: 'Email address is already registered.' };
    }

    const password_hash = await hashPassword(data.password);

    return await withTransaction(async (connection) => {
      const [userResult]: any = await connection.query(
        'INSERT INTO users (name, email, password_hash, phone, auth_provider) VALUES (?, ?, ?, ?, ?)',
        [data.name, data.email, password_hash, data.phone || null, 'local']
      );
      const userId = userResult.insertId;

      await connection.query(
        'INSERT INTO user_profiles (user_id, emergency_enabled) VALUES (?, TRUE)',
        [userId]
      );

      const token = this.generateJwtToken(userId, data.email);

      return {
        user: {
          id: userId,
          name: data.name,
          email: data.email,
          phone: data.phone || null,
        },
        token,
      };
    });
  }

  /**
   * Logs in a user with local email/password (preserving existing behavior).
   */
  static async loginUser(data: { email: string; password: string }) {
    const user = await this.findUserByEmail(data.email);
    if (!user) {
      throw { statusCode: 401, message: 'Invalid email or password.' };
    }

    if (!user.password_hash) {
      throw {
        statusCode: 400,
        message: 'This account uses Firebase/Social authentication. Please sign in with your provider.',
      };
    }

    const isValid = await comparePassword(data.password, user.password_hash);
    if (!isValid) {
      throw { statusCode: 401, message: 'Invalid email or password.' };
    }

    const token = this.generateJwtToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      token,
    };
  }

  /**
   * Verifies a Firebase ID token using Firebase Admin SDK and synchronizes the MySQL user.
   * Maps existing accounts by firebase_uid or email, or registers new accounts without duplication.
   * Issues the standard 7-day Naari Kavach JWT for protected application APIs.
   */
  static async verifyFirebaseTokenAndSyncUser(idToken: string, rawName?: string) {
    if (!idToken || typeof idToken !== 'string') {
      throw { statusCode: 400, message: 'Firebase ID token is required.' };
    }

    if (!firebaseAuth) {
      logger.error('Firebase Auth is not initialized on server.');
      throw { statusCode: 500, message: 'Firebase authentication service is not configured on the backend.' };
    }

    let decodedToken;
    try {
      decodedToken = await firebaseAuth.verifyIdToken(idToken);
    } catch (err: any) {
      logger.warn('Firebase ID token verification failed:', err?.message || err);
      throw {
        statusCode: 401,
        message: 'Invalid, expired, or revoked Firebase authentication token.',
      };
    }

    const uid = decodedToken.uid;
    const email = (decodedToken.email || '').toLowerCase().trim();
    const verifiedName = decodedToken.name || rawName || 'User';
    const authProvider = decodedToken.firebase?.sign_in_provider || 'firebase';

    if (!email) {
      throw {
        statusCode: 400,
        message: 'Firebase identity token must contain an email address.',
      };
    }

    // 1. Search existing user by firebase_uid
    const [existingUidRows]: any = await pool.query(
      'SELECT * FROM users WHERE firebase_uid = ? AND deleted_at IS NULL LIMIT 1',
      [uid]
    );

    if (existingUidRows.length > 0) {
      const user = existingUidRows[0];
      // If user has a generic name and a real name was provided, update it
      if (verifiedName && verifiedName !== 'User' && (!user.name || user.name === 'User')) {
        await pool.query('UPDATE users SET name = ? WHERE id = ?', [verifiedName, user.id]);
        user.name = verifiedName;
      }
      const token = this.generateJwtToken(user.id, user.email);
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone || null,
        },
        token,
      };
    }

    // 2. Search existing user by verified email (account linking)
    const existingEmailUser = await this.findUserByEmail(email);
    if (existingEmailUser) {
      await pool.query(
        'UPDATE users SET firebase_uid = ?, auth_provider = ?, provider_id = ? WHERE id = ?',
        [uid, authProvider, uid, existingEmailUser.id]
      );
      const token = this.generateJwtToken(existingEmailUser.id, existingEmailUser.email);
      return {
        user: {
          id: existingEmailUser.id,
          name: existingEmailUser.name,
          email: existingEmailUser.email,
          phone: existingEmailUser.phone || null,
        },
        token,
      };
    }

    // 3. Register new MySQL user & initialize profile
    return await withTransaction(async (connection) => {
      const [userResult]: any = await connection.query(
        'INSERT INTO users (name, email, password_hash, firebase_uid, auth_provider, provider_id) VALUES (?, ?, NULL, ?, ?, ?)',
        [verifiedName, email, uid, authProvider, uid]
      );
      const userId = userResult.insertId;

      await connection.query(
        'INSERT INTO user_profiles (user_id, emergency_enabled) VALUES (?, TRUE)',
        [userId]
      );

      const token = this.generateJwtToken(userId, email);

      return {
        user: {
          id: userId,
          name: verifiedName,
          email: email,
          phone: null,
        },
        token,
      };
    });
  }

  static async findUserByEmail(email: string): Promise<User | null> {
    const [rows]: any = await pool.query(
      'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
      [email]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async findUserById(id: number): Promise<User | null> {
    const [rows]: any = await pool.query(
      'SELECT id, name, email, phone, auth_provider, firebase_uid, created_at, updated_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static generateJwtToken(id: number, email: string): string {
    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_womensafety_2026';
    const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as any;
    return jwt.sign({ id, email }, secret, { expiresIn });
  }
}
