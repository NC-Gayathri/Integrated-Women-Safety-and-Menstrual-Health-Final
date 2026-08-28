import { pool } from './db';
import { logger } from '../utils/logger';

/**
 * Runs non-destructive, idempotent schema migrations on server startup.
 * Preserves all existing users, password hashes, and relational data.
 */
export async function runDatabaseMigrations(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    // 1. Check existing columns in `users` table
    const [columns]: any = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users'
    `);

    const columnNames = new Set(columns.map((col: any) => col.COLUMN_NAME.toLowerCase()));

    // Add firebase_uid column if missing
    if (!columnNames.has('firebase_uid')) {
      logger.info('Migration: Adding `firebase_uid` column to `users` table.');
      await connection.query(`
        ALTER TABLE \`users\` 
        ADD COLUMN \`firebase_uid\` VARCHAR(128) NULL DEFAULT NULL,
        ADD UNIQUE INDEX \`idx_users_firebase_uid\` (\`firebase_uid\`)
      `);
    }

    // Add auth_provider column if missing
    if (!columnNames.has('auth_provider')) {
      logger.info('Migration: Adding `auth_provider` column to `users` table.');
      await connection.query(`
        ALTER TABLE \`users\` 
        ADD COLUMN \`auth_provider\` VARCHAR(50) NOT NULL DEFAULT 'local'
      `);
    }

    // Add provider_id column if missing
    if (!columnNames.has('provider_id')) {
      logger.info('Migration: Adding `provider_id` column to `users` table.');
      await connection.query(`
        ALTER TABLE \`users\` 
        ADD COLUMN \`provider_id\` VARCHAR(255) NULL DEFAULT NULL
      `);
    }

    // Modify password_hash to allow NULL for social/firebase auth users while preserving existing hashes
    await connection.query(`
      ALTER TABLE \`users\` 
      MODIFY COLUMN \`password_hash\` VARCHAR(255) NULL DEFAULT NULL
    `);

    // Check if idx_users_provider index exists
    const [indexes]: any = await connection.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND INDEX_NAME = 'idx_users_provider'
    `);

    if (indexes.length === 0) {
      logger.info('Migration: Adding `idx_users_provider` index to `users` table.');
      await connection.query(`
        ALTER TABLE \`users\` 
        ADD INDEX \`idx_users_provider\` (\`auth_provider\`, \`provider_id\`)
      `);
    }

    // 2. Create password_resets table if missing
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`password_resets\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`token_hash\` VARCHAR(255) NOT NULL,
        \`expires_at\` DATETIME NOT NULL,
        \`used_at\` DATETIME NULL DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
        INDEX \`idx_resets_token_hash\` (\`token_hash\`),
        INDEX \`idx_resets_user\` (\`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    logger.info('Database migrations completed successfully.');
  } catch (error) {
    logger.error('Error running database migrations:', { error });
    // Do not crash server, log warning for investigation
  } finally {
    connection.release();
  }
}
