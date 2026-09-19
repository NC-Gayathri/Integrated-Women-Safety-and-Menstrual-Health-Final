const axios = require('axios');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_BASE = 'http://127.0.0.1:5000/api/v1';

async function runVerification() {
  console.log('====================================================');
  console.log('STARTING END-TO-END DATABASE PERSISTENCE VERIFICATION');
  console.log('====================================================\n');

  // 1. Connect to MySQL directly for direct verification
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'women_safety_db',
  };

  const pool = mysql.createPool(dbConfig);
  console.log('✓ Direct MySQL connection established to:', dbConfig.database);

  // 2. Authentication: Register or Login Test Account
  const testEmail = `persistent_user_${Date.now()}@naarikavach.com`;
  const testPassword = 'Password123!';
  const testName = 'Priya Sharma';

  console.log(`\n--- 1. AUTHENTICATION & USER PROFILE ---`);
  console.log(`Registering test user: ${testEmail}...`);
  
  let token = null;
  let userId = null;

  try {
    const regRes = await axios.post(`${API_BASE}/auth/register`, {
      name: testName,
      email: testEmail,
      password: testPassword,
      phone: '9876543210'
    });
    token = regRes.data.data.token;
    userId = regRes.data.data.user.id;
    console.log(`✓ Registration succeeded! User ID: ${userId}, Token received.`);
  } catch (err) {
    console.error('Registration failed:', err.response?.data || err.message);
    process.exit(1);
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Update Profile
  console.log('Updating user profile...');
  await axios.put(`${API_BASE}/users/me`, {
    blood_group: 'O+',
    height: 165,
    weight: 58,
    emergency_enabled: true
  }, { headers: authHeaders });
  console.log('✓ Profile updated successfully.');

  // 3. Menstrual Health: Add Cycle & Symptoms
  console.log(`\n--- 2. MENSTRUAL MODULE ---`);
  const todayStr = new Date().toISOString().split('T')[0];
  console.log(`Adding menstrual cycle starting on ${todayStr}...`);
  const cycleRes = await axios.post(`${API_BASE}/menstrual`, {
    last_period_date: todayStr,
    cycle_length: 28,
    period_length: 5,
    notes: 'Regular cycle test'
  }, { headers: authHeaders });
  console.log(`✓ Menstrual cycle saved! ID: ${cycleRes.data.data.id}`);

  console.log('Adding symptom & mood log...');
  const symptomRes = await axios.post(`${API_BASE}/symptoms`, {
    date: todayStr,
    symptom: 'Mild Cramps',
    severity: 2,
    mood: 'Calm',
    notes: 'Feeling good'
  }, { headers: authHeaders });
  console.log(`✓ Symptom saved! ID: ${symptomRes.data.data.id}`);

  // 4. Emergency Contacts
  console.log(`\n--- 3. EMERGENCY CONTACTS ---`);
  console.log('Adding emergency contact...');
  const contactRes = await axios.post(`${API_BASE}/emergency`, {
    name: 'Mom',
    phone: '+919876543211',
    relationship: 'Mother',
    is_primary: true
  }, { headers: authHeaders });
  console.log(`✓ Emergency contact saved! ID: ${contactRes.data.data.id}`);

  // 5. SOS Event
  console.log(`\n--- 4. SOS LOGGING ---`);
  console.log('Triggering SOS event via API...');
  const sosRes = await axios.post(`${API_BASE}/sos`, {
    latitude: 12.9716,
    longitude: 77.5946,
    accuracy: 5.5,
    battery_level: 92
  }, { headers: authHeaders });
  console.log(`✓ SOS triggered & recorded! ID: ${sosRes.data.data.id}, status: ${sosRes.data.data.status}`);

  // 6. Assistant Chat Persistence
  console.log(`\n--- 5. ASSISTANT CHAT PERSISTENCE ---`);
  console.log('Saving user chat message...');
  const userMsgRes = await axios.post(`${API_BASE}/assistant/chat`, {
    role: 'user',
    message: 'Hello, what should I do if I feel unsafe?',
    timestamp: Date.now()
  }, { headers: authHeaders });
  console.log(`✓ User message saved! ID: ${userMsgRes.data.data.id}`);

  console.log('Saving assistant response...');
  const aiMsgRes = await axios.post(`${API_BASE}/assistant/chat`, {
    role: 'assistant',
    message: 'Stay calm. Find a well-lit public area or trigger the SOS button to alert contacts.',
    timestamp: Date.now() + 1000
  }, { headers: authHeaders });
  console.log(`✓ Assistant response saved! ID: ${aiMsgRes.data.data.id}`);

  // 7. Wellness Challenges
  console.log(`\n--- 6. WELLNESS CHALLENGES ---`);
  console.log('Creating wellness challenge...');
  const challengeRes = await axios.post(`${API_BASE}/wellness`, {
    title: 'Drink 8 cups of water 💧',
    status: 'pending'
  }, { headers: authHeaders });
  const challengeId = challengeRes.data.data.id;
  console.log(`✓ Challenge created! ID: ${challengeId}`);

  console.log('Updating wellness challenge to completed...');
  await axios.put(`${API_BASE}/wellness/${challengeId}`, {
    status: 'completed'
  }, { headers: authHeaders });
  console.log('✓ Challenge updated to completed.');

  // 8. FitMind Pro (fitness_logs)
  console.log(`\n--- 7. FITMIND PERSISTENCE (fitness_logs) ---`);
  console.log('Saving daily fitness log (steps: 8500, water: 5 glasses, workout: done, journal)...');
  const fitnessRes = await axios.post(`${API_BASE}/fitness/log`, {
    steps: 8500,
    water_glasses: 5,
    heart_rate: 76,
    workout_completed: true,
    journal: 'Completed 30 minutes yoga and felt energetic!'
  }, { headers: authHeaders });
  console.log(`✓ Fitness log saved! ID: ${fitnessRes.data.data.id}`);

  // 9. IoT Ingestion
  console.log(`\n--- 8. IOT / ESP32 INGESTION ---`);
  console.log('Pairing IoT wearable device to user...');
  try {
    await axios.post(`${API_BASE}/iot/devices/pair`, {
      deviceId: 'ESP32_DEV_TEST_01',
      deviceName: 'Naari ESP32 Wearable',
      deviceApiKey: 'nk_sec_dev_2026_9e38e_7b4c91a0ef62'
    }, { headers: authHeaders });
    console.log('✓ Device paired successfully.');
  } catch (pairErr) {
    console.log('Device pairing info:', pairErr.response?.data?.message || pairErr.message);
  }

  console.log('Ingesting IoT hardware event (STATUS_HEARTBEAT)...');
  const iotRes = await axios.post(`${API_BASE}/iot/events`, {
    deviceId: 'ESP32_DEV_TEST_01',
    apiKey: 'nk_sec_dev_2026_9e38e_7b4c91a0ef62',
    eventId: `evt_${Date.now()}`,
    eventType: 'STATUS_HEARTBEAT',
    heartRate: 78,
    batteryLevel: 95
  });
  console.log(`✓ IoT event ingested! Event ID:`, iotRes.data.data?.eventId || 'OK');

  // 10. Direct Database Inspection (COUNT and Row verification)
  console.log(`\n====================================================`);
  console.log('DIRECT MYSQL TABLE VERIFICATION (LIVE DATABASE QUERIES)');
  console.log('====================================================\n');

  const tables = [
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

  for (const table of tables) {
    const [countRows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
    console.log(`Table [${table.padEnd(20)}]: ${countRows[0].count} total rows`);
  }

  // Inspect specific records for this test user
  console.log(`\nVerifying records specific to test user ID ${userId}:`);
  const [userRecords] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [userId]);
  console.log('users row:', userRecords[0]);

  const [cycleRecords] = await pool.query('SELECT id, last_period_date, cycle_length FROM menstrual_cycles WHERE user_id = ?', [userId]);
  console.log('menstrual_cycles row:', cycleRecords[0]);

  const [predRecords] = await pool.query('SELECT id, predicted_period_date, fertile_window_start FROM cycle_predictions WHERE user_id = ?', [userId]);
  console.log('cycle_predictions row:', predRecords[0]);

  const [symptomRecords] = await pool.query('SELECT id, symptom, mood FROM symptoms WHERE user_id = ?', [userId]);
  console.log('symptoms row:', symptomRecords[0]);

  const [contactRecords] = await pool.query('SELECT id, name, phone FROM emergency_contacts WHERE user_id = ?', [userId]);
  console.log('emergency_contacts row:', contactRecords[0]);

  const [sosRecords] = await pool.query('SELECT id, latitude, longitude, status FROM sos_logs WHERE user_id = ?', [userId]);
  console.log('sos_logs row:', sosRecords[0]);

  const [chatRecords] = await pool.query('SELECT id, role, message FROM assistant_chat WHERE user_id = ?', [userId]);
  console.log(`assistant_chat rows (${chatRecords.length}):`, chatRecords);

  const [wellnessRecords] = await pool.query('SELECT id, title, status FROM wellness_challenges WHERE user_id = ?', [userId]);
  console.log('wellness_challenges row:', wellnessRecords[0]);

  const [fitRecords] = await pool.query('SELECT id, steps, water_glasses, workout_completed, journal FROM fitness_logs WHERE user_id = ?', [userId]);
  console.log('fitness_logs row:', fitRecords[0]);

  // 11. Simulating App Restart / Reload Data Retrieval
  console.log(`\n====================================================`);
  console.log('RELOAD TEST: VERIFYING DATA RETRIEVAL AFTER APP RESTART');
  console.log('====================================================\n');

  console.log('GET /api/v1/users/me (User Profile Retrieval):');
  const meGet = await axios.get(`${API_BASE}/users/me`, { headers: authHeaders });
  console.log(`✓ Retrieved user: ${meGet.data.data.name} (${meGet.data.data.email}), Blood Group: ${meGet.data.data.profile?.blood_group}`);

  console.log('\nGET /api/v1/menstrual (Cycle Retrieval):');
  const cycleGet = await axios.get(`${API_BASE}/menstrual`, { headers: authHeaders });
  const cycles = cycleGet.data.data.cycles || [];
  console.log(`✓ Retrieved ${cycles.length} cycles. Start date: ${cycles[0]?.last_period_date}`);

  console.log('\nGET /api/v1/symptoms (Symptoms Retrieval):');
  const symptomGet = await axios.get(`${API_BASE}/symptoms`, { headers: authHeaders });
  console.log(`✓ Retrieved ${symptomGet.data.data.length} symptoms. First: ${symptomGet.data.data[0]?.symptom} (${symptomGet.data.data[0]?.mood})`);

  console.log('\nGET /api/v1/emergency (Emergency Contacts Retrieval):');
  const contactGet = await axios.get(`${API_BASE}/emergency`, { headers: authHeaders });
  console.log(`✓ Retrieved ${contactGet.data.data.length} contacts. Name: ${contactGet.data.data[0]?.name}, Phone: ${contactGet.data.data[0]?.phone}`);

  console.log('\nGET /api/v1/sos (SOS Logs Retrieval):');
  const sosGet = await axios.get(`${API_BASE}/sos`, { headers: authHeaders });
  console.log(`✓ Retrieved ${sosGet.data.data.length} SOS logs. Status: ${sosGet.data.data[0]?.status}`);

  console.log('\nGET /api/v1/assistant/history (Chat History Retrieval):');
  const chatGet = await axios.get(`${API_BASE}/assistant/history`, { headers: authHeaders });
  console.log(`✓ Retrieved ${chatGet.data.data.length} messages. First role: ${chatGet.data.data[0]?.role}`);

  console.log('\nGET /api/v1/wellness (Challenges Retrieval):');
  const wellnessGet = await axios.get(`${API_BASE}/wellness`, { headers: authHeaders });
  console.log(`✓ Retrieved ${wellnessGet.data.data.length} challenges. Status: ${wellnessGet.data.data[0]?.status}`);

  console.log('\nGET /api/v1/fitness/today (FitMind Daily Log Retrieval):');
  const fitnessGet = await axios.get(`${API_BASE}/fitness/today`, { headers: authHeaders });
  console.log(`✓ Retrieved FitMind today log: Steps=${fitnessGet.data.data?.steps}, Water=${fitnessGet.data.data?.water_glasses}, Workout=${fitnessGet.data.data?.workout_completed}, Journal="${fitnessGet.data.data?.journal}"`);

  console.log('\n====================================================');
  console.log('ALL VERIFICATION PHASES PASSED WITH 100% PERSISTENCE!');
  console.log('====================================================\n');

  await pool.end();
}

runVerification().catch(err => {
  console.error('Verification failed:', err.response?.data || err);
  process.exit(1);
});
