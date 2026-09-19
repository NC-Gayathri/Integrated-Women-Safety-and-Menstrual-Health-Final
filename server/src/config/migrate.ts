import { pool } from './db';
import { logger } from '../utils/logger';

/**
 * Helper to check if a column exists in a given table.
 */
async function hasColumn(connection: any, tableName: string, columnName: string): Promise<boolean> {
  const [rows]: any = await connection.query(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = ? 
      AND COLUMN_NAME = ?
  `, [tableName, columnName]);
  return rows.length > 0;
}

/**
 * Helper to check if an index exists in a given table.
 */
async function hasIndex(connection: any, tableName: string, indexName: string): Promise<boolean> {
  const [rows]: any = await connection.query(`
    SELECT INDEX_NAME 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = ? 
      AND INDEX_NAME = ?
  `, [tableName, indexName]);
  return rows.length > 0;
}

/**
 * Runs non-destructive, idempotent schema migrations on server startup.
 * Automatically provisions all required tables, foreign keys, indexes, and initial seeds
 * for both completely empty databases and existing installations.
 */
export async function runDatabaseMigrations(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    logger.info('Migration: Initializing database schema setup...');

    // =========================================================================
    // 1. BASE TABLE: users
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(150) NOT NULL,
        \`email\` VARCHAR(255) NOT NULL,
        \`password_hash\` VARCHAR(255) NULL DEFAULT NULL,
        \`phone\` VARCHAR(30) NULL DEFAULT NULL,
        \`firebase_uid\` VARCHAR(128) NULL DEFAULT NULL,
        \`auth_provider\` VARCHAR(50) NOT NULL DEFAULT 'local',
        \`provider_id\` VARCHAR(255) NULL DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deleted_at\` TIMESTAMP NULL DEFAULT NULL,
        UNIQUE KEY \`idx_users_email\` (\`email\`),
        UNIQUE KEY \`idx_users_firebase_uid\` (\`firebase_uid\`),
        INDEX \`idx_users_provider\` (\`auth_provider\`, \`provider_id\`),
        INDEX \`idx_users_deleted\` (\`deleted_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure users columns for backward compatibility if table existed prior
    if (!(await hasColumn(connection, 'users', 'firebase_uid'))) {
      logger.info('Migration: Adding `firebase_uid` column to `users`.');
      await connection.query(`ALTER TABLE \`users\` ADD COLUMN \`firebase_uid\` VARCHAR(128) NULL DEFAULT NULL`);
    }
    if (!(await hasIndex(connection, 'users', 'idx_users_firebase_uid'))) {
      logger.info('Migration: Adding `idx_users_firebase_uid` unique index.');
      await connection.query(`ALTER TABLE \`users\` ADD UNIQUE INDEX \`idx_users_firebase_uid\` (\`firebase_uid\`)`);
    }
    if (!(await hasColumn(connection, 'users', 'auth_provider'))) {
      logger.info('Migration: Adding `auth_provider` column to `users`.');
      await connection.query(`ALTER TABLE \`users\` ADD COLUMN \`auth_provider\` VARCHAR(50) NOT NULL DEFAULT 'local'`);
    }
    if (!(await hasColumn(connection, 'users', 'provider_id'))) {
      logger.info('Migration: Adding `provider_id` column to `users`.');
      await connection.query(`ALTER TABLE \`users\` ADD COLUMN \`provider_id\` VARCHAR(255) NULL DEFAULT NULL`);
    }
    if (!(await hasColumn(connection, 'users', 'deleted_at'))) {
      await connection.query(`ALTER TABLE \`users\` ADD COLUMN \`deleted_at\` TIMESTAMP NULL DEFAULT NULL`);
    }
    if (!(await hasIndex(connection, 'users', 'idx_users_provider'))) {
      await connection.query(`ALTER TABLE \`users\` ADD INDEX \`idx_users_provider\` (\`auth_provider\`, \`provider_id\`)`);
    }
    if (!(await hasIndex(connection, 'users', 'idx_users_deleted'))) {
      await connection.query(`ALTER TABLE \`users\` ADD INDEX \`idx_users_deleted\` (\`deleted_at\`)`);
    }

    // Ensure password_hash is nullable for Firebase/social logins
    await connection.query(`ALTER TABLE \`users\` MODIFY COLUMN \`password_hash\` VARCHAR(255) NULL DEFAULT NULL`);

    // =========================================================================
    // 2. DEPENDENT TABLE: user_profiles
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`user_profiles\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`date_of_birth\` DATE NULL DEFAULT NULL,
        \`height\` DECIMAL(5,2) NULL DEFAULT NULL,
        \`weight\` DECIMAL(5,2) NULL DEFAULT NULL,
        \`blood_group\` VARCHAR(10) NULL DEFAULT NULL,
        \`emergency_enabled\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`idx_user_profiles_user\` (\`user_id\`),
        CONSTRAINT \`fk_user_profiles_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 3. DEPENDENT TABLE: password_resets
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`password_resets\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`token_hash\` VARCHAR(255) NOT NULL,
        \`expires_at\` DATETIME NOT NULL,
        \`used_at\` DATETIME NULL DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_resets_token_hash\` (\`token_hash\`),
        INDEX \`idx_resets_user\` (\`user_id\`),
        CONSTRAINT \`fk_password_resets_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 4. DEPENDENT TABLE: emergency_contacts
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`emergency_contacts\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`name\` VARCHAR(150) NOT NULL,
        \`phone\` VARCHAR(30) NOT NULL,
        \`relationship\` VARCHAR(100) NULL DEFAULT NULL,
        \`is_primary\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deleted_at\` TIMESTAMP NULL DEFAULT NULL,
        INDEX \`idx_emergency_contacts_user\` (\`user_id\`),
        INDEX \`idx_emergency_contacts_deleted\` (\`deleted_at\`),
        CONSTRAINT \`fk_emergency_contacts_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 5. DEPENDENT TABLE: sos_logs
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`sos_logs\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`latitude\` DECIMAL(10, 7) NOT NULL DEFAULT 0.0000000,
        \`longitude\` DECIMAL(10, 7) NOT NULL DEFAULT 0.0000000,
        \`accuracy\` FLOAT NULL DEFAULT 0,
        \`battery_level\` INT NULL DEFAULT 100,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'SENT',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_sos_logs_user\` (\`user_id\`),
        INDEX \`idx_sos_logs_created\` (\`created_at\`),
        CONSTRAINT \`fk_sos_logs_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 6. DEPENDENT TABLE: menstrual_cycles
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`menstrual_cycles\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`last_period_date\` DATE NOT NULL,
        \`cycle_length\` INT NOT NULL DEFAULT 28,
        \`period_length\` INT NOT NULL DEFAULT 5,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deleted_at\` TIMESTAMP NULL DEFAULT NULL,
        INDEX \`idx_menstrual_cycles_user\` (\`user_id\`),
        INDEX \`idx_menstrual_cycles_date\` (\`last_period_date\`),
        CONSTRAINT \`fk_menstrual_cycles_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 7. DEPENDENT TABLE: cycle_predictions
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`cycle_predictions\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`predicted_period_date\` DATE NOT NULL,
        \`fertile_window_start\` DATE NOT NULL,
        \`fertile_window_end\` DATE NOT NULL,
        \`ovulation_day\` DATE NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_cycle_predictions_user\` (\`user_id\`),
        CONSTRAINT \`fk_cycle_predictions_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 8. DEPENDENT TABLE: symptoms
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`symptoms\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`date\` DATE NOT NULL,
        \`symptom\` VARCHAR(150) NOT NULL,
        \`severity\` INT NOT NULL DEFAULT 1,
        \`mood\` VARCHAR(100) NULL DEFAULT NULL,
        \`notes\` TEXT NULL DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_symptoms_user\` (\`user_id\`),
        INDEX \`idx_symptoms_date\` (\`date\`),
        CONSTRAINT \`fk_symptoms_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 9. DEPENDENT TABLE: wellness_challenges
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`wellness_challenges\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deleted_at\` TIMESTAMP NULL DEFAULT NULL,
        INDEX \`idx_wellness_challenges_user\` (\`user_id\`),
        INDEX \`idx_wellness_challenges_deleted\` (\`deleted_at\`),
        CONSTRAINT \`fk_wellness_challenges_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 10. DEPENDENT TABLE: assistant_chat
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`assistant_chat\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`role\` VARCHAR(20) NOT NULL,
        \`message\` TEXT NOT NULL,
        \`timestamp\` BIGINT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_assistant_chat_user\` (\`user_id\`),
        INDEX \`idx_assistant_chat_timestamp\` (\`timestamp\`),
        CONSTRAINT \`fk_assistant_chat_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 11. DEPENDENT TABLE: notifications
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`notifications\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`body\` TEXT NOT NULL,
        \`type\` VARCHAR(50) NOT NULL,
        \`is_read\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_notifications_user\` (\`user_id\`),
        INDEX \`idx_notifications_created\` (\`created_at\`),
        CONSTRAINT \`fk_notifications_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 12. DEPENDENT TABLE: iot_devices
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`iot_devices\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NULL DEFAULT NULL,
        \`device_id\` VARCHAR(100) NOT NULL UNIQUE,
        \`device_name\` VARCHAR(150) NOT NULL DEFAULT 'NAARI_KAVACH',
        \`api_key_hash\` VARCHAR(255) NULL DEFAULT NULL,
        \`battery_level\` INT NULL DEFAULT NULL,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        \`last_heart_rate\` INT NULL DEFAULT NULL,
        \`last_fall_detected\` BOOLEAN DEFAULT FALSE,
        \`last_seen\` TIMESTAMP NULL DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_iot_devices_user\` (\`user_id\`),
        UNIQUE KEY \`idx_iot_devices_devid\` (\`device_id\`),
        CONSTRAINT \`fk_iot_devices_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure iot_devices columns for backward compatibility if table existed prior
    if (!(await hasColumn(connection, 'iot_devices', 'device_id'))) {
      await connection.query(`ALTER TABLE \`iot_devices\` ADD COLUMN \`device_id\` VARCHAR(100) NOT NULL UNIQUE`);
    }
    if (!(await hasColumn(connection, 'iot_devices', 'device_name'))) {
      await connection.query(`ALTER TABLE \`iot_devices\` ADD COLUMN \`device_name\` VARCHAR(150) NOT NULL DEFAULT 'NAARI_KAVACH'`);
    }
    if (!(await hasColumn(connection, 'iot_devices', 'user_id'))) {
      await connection.query(`ALTER TABLE \`iot_devices\` ADD COLUMN \`user_id\` INT NULL DEFAULT NULL`);
    }
    if (!(await hasColumn(connection, 'iot_devices', 'api_key_hash'))) {
      await connection.query(`ALTER TABLE \`iot_devices\` ADD COLUMN \`api_key_hash\` VARCHAR(255) NULL DEFAULT NULL`);
    }
    if (!(await hasColumn(connection, 'iot_devices', 'battery_level'))) {
      await connection.query(`ALTER TABLE \`iot_devices\` ADD COLUMN \`battery_level\` INT NULL DEFAULT NULL`);
    }
    if (!(await hasColumn(connection, 'iot_devices', 'status'))) {
      await connection.query(`ALTER TABLE \`iot_devices\` ADD COLUMN \`status\` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'`);
    }
    if (!(await hasColumn(connection, 'iot_devices', 'last_heart_rate'))) {
      await connection.query(`ALTER TABLE \`iot_devices\` ADD COLUMN \`last_heart_rate\` INT NULL DEFAULT NULL`);
    }
    if (!(await hasColumn(connection, 'iot_devices', 'last_fall_detected'))) {
      await connection.query(`ALTER TABLE \`iot_devices\` ADD COLUMN \`last_fall_detected\` BOOLEAN DEFAULT FALSE`);
    }
    if (!(await hasColumn(connection, 'iot_devices', 'last_seen'))) {
      await connection.query(`ALTER TABLE \`iot_devices\` ADD COLUMN \`last_seen\` TIMESTAMP NULL DEFAULT NULL`);
    }

    // =========================================================================
    // 13. DEPENDENT TABLE: iot_events
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`iot_events\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`event_id\` VARCHAR(150) NOT NULL UNIQUE,
        \`device_id\` VARCHAR(100) NOT NULL,
        \`user_id\` INT NOT NULL,
        \`event_type\` VARCHAR(50) NOT NULL,
        \`heart_rate\` INT NULL DEFAULT NULL,
        \`fall_detected\` BOOLEAN DEFAULT FALSE,
        \`battery_level\` INT NULL DEFAULT NULL,
        \`is_emergency\` BOOLEAN DEFAULT FALSE,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'TRIGGERED',
        \`raw_payload\` TEXT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_iot_events_user\` (\`user_id\`),
        INDEX \`idx_iot_events_device\` (\`device_id\`),
        INDEX \`idx_iot_events_created\` (\`created_at\`),
        INDEX \`idx_iot_events_status\` (\`status\`),
        CONSTRAINT \`fk_iot_events_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)\
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure iot_events columns for backward compatibility if table existed prior
    if (!(await hasColumn(connection, 'iot_events', 'event_id'))) {
      await connection.query(`ALTER TABLE \`iot_events\` ADD COLUMN \`event_id\` VARCHAR(150) NOT NULL UNIQUE`);
    }
    if (!(await hasColumn(connection, 'iot_events', 'device_id'))) {
      await connection.query(`ALTER TABLE \`iot_events\` ADD COLUMN \`device_id\` VARCHAR(100) NOT NULL`);
    }
    if (!(await hasColumn(connection, 'iot_events', 'user_id'))) {
      await connection.query(`ALTER TABLE \`iot_events\` ADD COLUMN \`user_id\` INT NOT NULL`);
    }
    if (!(await hasColumn(connection, 'iot_events', 'event_type'))) {
      await connection.query(`ALTER TABLE \`iot_events\` ADD COLUMN \`event_type\` VARCHAR(50) NOT NULL`);
    }
    if (!(await hasColumn(connection, 'iot_events', 'heart_rate'))) {
      await connection.query(`ALTER TABLE \`iot_events\` ADD COLUMN \`heart_rate\` INT NULL DEFAULT NULL`);
    }
    if (!(await hasColumn(connection, 'iot_events', 'fall_detected'))) {
      await connection.query(`ALTER TABLE \`iot_events\` ADD COLUMN \`fall_detected\` BOOLEAN DEFAULT FALSE`);
    }
    if (!(await hasColumn(connection, 'iot_events', 'battery_level'))) {
      await connection.query(`ALTER TABLE \`iot_events\` ADD COLUMN \`battery_level\` INT NULL DEFAULT NULL`);
    }
    if (!(await hasColumn(connection, 'iot_events', 'is_emergency'))) {
      await connection.query(`ALTER TABLE \`iot_events\` ADD COLUMN \`is_emergency\` BOOLEAN DEFAULT FALSE`);
    }
    if (!(await hasColumn(connection, 'iot_events', 'status'))) {
      await connection.query(`ALTER TABLE \`iot_events\` ADD COLUMN \`status\` VARCHAR(50) NOT NULL DEFAULT 'TRIGGERED'`);
    }

    // =========================================================================
    // 14. DEPENDENT TABLE: fitness_logs
    // =========================================================================
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`fitness_logs\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT NOT NULL,
        \`date\` DATE NOT NULL,
        \`steps\` INT NOT NULL DEFAULT 0,
        \`water_glasses\` INT NOT NULL DEFAULT 0,
        \`heart_rate\` INT NULL DEFAULT NULL,
        \`workout_completed\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`journal\` TEXT NULL DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`idx_fitness_user_date\` (\`user_id\`, \`date\`),
        INDEX \`idx_fitness_user\` (\`user_id\`),
        CONSTRAINT \`fk_fitness_logs_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // =========================================================================
    // 15. SEED HARDWARE IOT DEVICE CREDENTIALS (cc:7b:5c:fb:d9:18)
    // =========================================================================
    const ACTUAL_DEVICE_ID = 'cc:7b:5c:fb:d9:18';
    const ACTUAL_DEVICE_NAME = 'NAARI_KAVACH';
    const defaultDevKey = process.env.IOT_DEFAULT_DEVICE_API_KEY || 'nk_sec_dev_2026_9e38e_7b4c91a0ef62';

    if (defaultDevKey) {
      const { hashPassword } = await import('../utils/passwordUtils');
      const keyHash = await hashPassword(defaultDevKey);

      const [existingDev]: any = await connection.query(
        'SELECT id, user_id FROM iot_devices WHERE device_id = ? LIMIT 1',
        [ACTUAL_DEVICE_ID]
      );

      if (existingDev.length === 0) {
        logger.info(`Migration: Seeding IoT device '${ACTUAL_DEVICE_ID}' (${ACTUAL_DEVICE_NAME}).`);
        await connection.query(
          'INSERT INTO iot_devices (user_id, device_id, device_name, api_key_hash, status) VALUES (NULL, ?, ?, ?, ?)',
          [ACTUAL_DEVICE_ID, ACTUAL_DEVICE_NAME, keyHash, 'ACTIVE']
        );
      } else {
        // Keep api_key_hash and device_name updated while preserving existing user_id pairing
        await connection.query(
          'UPDATE iot_devices SET api_key_hash = ?, device_name = ? WHERE device_id = ?',
          [keyHash, ACTUAL_DEVICE_NAME, ACTUAL_DEVICE_ID]
        );
      }
    }

    logger.info('Database migrations completed successfully.');
  } catch (error) {
    logger.error('Error running database migrations:', { error });
    throw error;
  } finally {
    connection.release();
  }
}