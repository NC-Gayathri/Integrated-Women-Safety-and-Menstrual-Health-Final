const mysql = require('mysql2/promise');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_BASE = 'http://127.0.0.1:5000/api/v1';

async function step1_verifyDbAndTables() {
  console.log('================================================================');
  console.log('STEP 1 & 2: VERIFY DATABASE CONNECTION & TABLES');
  console.log('================================================================');

  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'women_safety_db',
  };

  const connection = await mysql.createConnection(dbConfig);
  console.log('✓ Successfully connected to MySQL at ' + dbConfig.host + ':' + dbConfig.port + ' DB: ' + dbConfig.database);

  const [tables] = await connection.query('SHOW TABLES');
  console.log('Tables present in database:');
  const tableNames = tables.map(r => Object.values(r)[0]);
  console.log(tableNames.join(', '));

  console.log('\n================================================================');
  console.log('STEP 3: VERIFY CURRENT ROW COUNTS');
  console.log('================================================================');

  const requiredTables = [
    'users',
    'user_profiles',
    'menstrual_cycles',
    'cycle_predictions',
    'symptoms',
    'emergency_contacts',
    'sos_logs',
    'assistant_chat',
    'wellness_challenges',
    'fitness_logs',
    'iot_devices',
    'iot_events',
    'notifications'
  ];

  const rowCounts = {};
  for (const t of requiredTables) {
    if (tableNames.includes(t)) {
      const [res] = await connection.query(`SELECT COUNT(*) as count FROM \`${t}\``);
      rowCounts[t] = res[0].count;
      console.log(`- ${t.padEnd(22)}: ${res[0].count} rows`);
    } else {
      console.log(`- ${t.padEnd(22)}: MISSING TABLE`);
      rowCounts[t] = -1;
    }
  }

  console.log('\n================================================================');
  console.log('STEP 4: DISTINGUISH TEST DATA FROM REAL APP DATA');
  console.log('================================================================');

  const [users] = await connection.query('SELECT id, name, email, auth_provider, created_at FROM users');
  console.log('All users in database:');
  console.table(users);

  const [fitnessRows] = await connection.query('SELECT id, user_id, date, steps, water_glasses, workout_completed, journal FROM fitness_logs');
  console.log('All fitness_logs rows:');
  console.table(fitnessRows);

  await connection.end();
  return rowCounts;
}

step1_verifyDbAndTables().catch(err => {
  console.error('Error in Step 1-4:', err);
  process.exit(1);
});
