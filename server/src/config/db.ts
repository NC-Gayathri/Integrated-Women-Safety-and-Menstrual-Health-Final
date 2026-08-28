import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'women_safety_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function withTransaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    logger.error('Transaction rolled back due to error:', { error });
    throw error;
  } finally {
    connection.release();
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return true;
  } catch (error) {
    logger.error('Database connection failed:', { error });
    return false;
  }
}
