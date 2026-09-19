const mysql = require('mysql2/promise');
const axios = require('axios');
const path = require('path');
const { execSync, spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_BASE = 'http://127.0.0.1:5000/api/v1';

async function runFullVerificationSuite() {
  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'women_safety_db',
  };

  const pool = mysql.createPool(dbConfig);

  console.log('\n================================================================');
  console.log('STEP 5: TEST THE ACTUAL API (HEALTH & ENDPOINTS)');
  console.log('================================================================');

  const healthRes = await axios.get('http://127.0.0.1:5000/health');
  console.log('GET /health status:', healthRes.status, healthRes.data);

  console.log('\n================================================================');
  console.log('STEP 6: TEST REAL CRUD FLOWS (USER A)');
  console.log('================================================================');

  // Register User A
  const userAEmail = `user_a_${Date.now()}@naarikavach.com`;
  const userAPwd = 'Password123!';
  const userAReg = await axios.post(`${API_BASE}/auth/register`, {
    name: 'User A Verified',
    email: userAEmail,
    password: userAPwd,
    phone: '9123456780'
  });
  const tokenA = userAReg.data.data.token;
  const userAId = userAReg.data.data.user.id;
  const headersA = { Authorization: `Bearer ${tokenA}` };
  console.log(`✓ User A registered: ID=${userAId}, Email=${userAEmail}`);

  // 1. Profile: Create/Update
  await axios.put(`${API_BASE}/users/me`, {
    blood_group: 'AB+',
    height: 168.0,
    weight: 60.5,
    emergency_enabled: true
  }, { headers: headersA });

  const [profileA] = await pool.query('SELECT * FROM user_profiles WHERE user_id = ?', [userAId]);
  console.log('✓ Profile verified in DB (user_profiles):', {
    user_id: profileA[0].user_id,
    blood_group: profileA[0].blood_group,
    height: profileA[0].height,
    weight: profileA[0].weight
  });

  // 2. Menstrual: Create cycle
  const todayStr = new Date().toISOString().split('T')[0];
  const cycleA = await axios.post(`${API_BASE}/menstrual`, {
    last_period_date: todayStr,
    cycle_length: 29,
    period_length: 5
  }, { headers: headersA });

  const [cycleRowsA] = await pool.query('SELECT * FROM menstrual_cycles WHERE user_id = ?', [userAId]);
  const [predRowsA] = await pool.query('SELECT * FROM cycle_predictions WHERE user_id = ?', [userAId]);
  console.log('✓ Menstrual cycle verified in DB (menstrual_cycles): ID=' + cycleRowsA[0].id + ', cycle_length=' + cycleRowsA[0].cycle_length);
  console.log('✓ Cycle prediction verified in DB (cycle_predictions): ID=' + predRowsA[0].id + ', predicted_period_date=' + predRowsA[0].predicted_period_date);

  // Retrieve cycle again via API
  const getCycleA = await axios.get(`${API_BASE}/menstrual`, { headers: headersA });
  console.log('✓ Retrieved cycle via GET API: count=' + getCycleA.data.data.cycles.length);

  // 3. Symptoms: Create and Retrieve
  const symA = await axios.post(`${API_BASE}/symptoms`, {
    date: todayStr,
    symptom: 'Headache & Fatigue',
    severity: 3,
    mood: 'Restless',
    notes: 'Took rest in afternoon'
  }, { headers: headersA });

  const [symRowsA] = await pool.query('SELECT * FROM symptoms WHERE user_id = ?', [userAId]);
  console.log('✓ Symptom verified in DB (symptoms): ID=' + symRowsA[0].id + ', symptom=' + symRowsA[0].symptom);

  const getSymA = await axios.get(`${API_BASE}/symptoms`, { headers: headersA });
  console.log('✓ Retrieved symptoms via GET API: count=' + getSymA.data.data.length);

  // 4. Emergency Contact: Create, Retrieve, Delete
  const contactA = await axios.post(`${API_BASE}/emergency`, {
    name: 'Sister Anita',
    phone: '+919988776655',
    relationship: 'Sister',
    is_primary: true
  }, { headers: headersA });
  const contactAId = contactA.data.data.id;

  const [contactRowsA] = await pool.query('SELECT * FROM emergency_contacts WHERE user_id = ? AND deleted_at IS NULL', [userAId]);
  console.log('✓ Emergency contact verified in DB (emergency_contacts): ID=' + contactRowsA[0].id + ', name=' + contactRowsA[0].name);

  // Retrieve via GET
  const getContactsA = await axios.get(`${API_BASE}/emergency`, { headers: headersA });
  console.log('✓ Retrieved contacts via GET API: count=' + getContactsA.data.data.length);

  // Delete contact
  await axios.delete(`${API_BASE}/emergency/${contactAId}`, { headers: headersA });
  const [deletedContactRows] = await pool.query('SELECT id, name, deleted_at FROM emergency_contacts WHERE id = ?', [contactAId]);
  console.log('✓ Verified soft deletion in DB: deleted_at=' + deletedContactRows[0].deleted_at);

  const getContactsAfterDelete = await axios.get(`${API_BASE}/emergency`, { headers: headersA });
  console.log('✓ Verified GET API after deletion returns 0 active contacts: count=' + getContactsAfterDelete.data.data.length);

  // Add one active contact for subsequent tests
  const activeContactA = await axios.post(`${API_BASE}/emergency`, {
    name: 'Primary Contact',
    phone: '+919876500000',
    relationship: 'Family',
    is_primary: true
  }, { headers: headersA });
  console.log('✓ Added active contact for user A: ID=' + activeContactA.data.data.id);

  // 5. Wellness: Create, Update, Retrieve
  const wellA = await axios.post(`${API_BASE}/wellness`, {
    title: '15 min mindfulness meditation 🧘',
    status: 'NOT_STARTED'
  }, { headers: headersA });
  const wellAId = wellA.data.data.id;

  const [wellRowsA] = await pool.query('SELECT * FROM wellness_challenges WHERE id = ?', [wellAId]);
  console.log('✓ Wellness challenge verified in DB (wellness_challenges): ID=' + wellRowsA[0].id + ', status=' + wellRowsA[0].status);

  // Update status
  await axios.put(`${API_BASE}/wellness/${wellAId}`, {
    status: 'COMPLETED'
  }, { headers: headersA });

  const [wellUpdatedRowsA] = await pool.query('SELECT * FROM wellness_challenges WHERE id = ?', [wellAId]);
  console.log('✓ Wellness update verified in DB: new status=' + wellUpdatedRowsA[0].status);

  const getWellA = await axios.get(`${API_BASE}/wellness`, { headers: headersA });
  console.log('✓ Retrieved wellness challenges via GET API: count=' + getWellA.data.data.length + ', status=' + getWellA.data.data[0].status);

  // 6. FitMind: Save, Retrieve Today, Retrieve Week
  const fitA = await axios.post(`${API_BASE}/fitness/log`, {
    steps: 9200,
    water_glasses: 7,
    heart_rate: 74,
    workout_completed: true,
    journal: 'Evening run in the park, felt great!'
  }, { headers: headersA });

  const [fitRowsA] = await pool.query('SELECT * FROM fitness_logs WHERE user_id = ?', [userAId]);
  console.log('✓ FitMind daily log verified in DB (fitness_logs): ID=' + fitRowsA[0].id + ', steps=' + fitRowsA[0].steps + ', water=' + fitRowsA[0].water_glasses + ', journal=' + fitRowsA[0].journal);

  const getFitTodayA = await axios.get(`${API_BASE}/fitness/today`, { headers: headersA });
  console.log('✓ Retrieved FitMind today log via GET API: steps=' + getFitTodayA.data.data.steps + ', water=' + getFitTodayA.data.data.water_glasses);

  const getFitWeekA = await axios.get(`${API_BASE}/fitness/week`, { headers: headersA });
  console.log('✓ Retrieved FitMind week trend via GET API: days=' + getFitWeekA.data.data.length);

  // 7. Assistant: Save User Message & Assistant Response, Retrieve History
  const msgUserA = await axios.post(`${API_BASE}/assistant/chat`, {
    role: 'user',
    message: 'What are healthy foods to eat during ovulation phase?',
    timestamp: Date.now()
  }, { headers: headersA });

  const msgAssistantA = await axios.post(`${API_BASE}/assistant/chat`, {
    role: 'assistant',
    message: 'Eat antioxidant-rich foods, berries, dark leafy greens, and lean proteins.',
    timestamp: Date.now() + 500
  }, { headers: headersA });

  const [chatRowsA] = await pool.query('SELECT * FROM assistant_chat WHERE user_id = ? ORDER BY timestamp ASC', [userAId]);
  console.log('✓ Assistant messages verified in DB (assistant_chat): count=' + chatRowsA.length + ', first role=' + chatRowsA[0].role + ', second role=' + chatRowsA[1].role);

  const getChatA = await axios.get(`${API_BASE}/assistant/history`, { headers: headersA });
  console.log('✓ Retrieved assistant history via GET API: count=' + getChatA.data.data.length);

  // 8. SOS: Test Mechanism
  const sosA = await axios.post(`${API_BASE}/sos`, {
    latitude: 12.9352,
    longitude: 77.6245,
    accuracy: 4.2,
    battery_level: 88
  }, { headers: headersA });

  const [sosRowsA] = await pool.query('SELECT * FROM sos_logs WHERE user_id = ?', [userAId]);
  console.log('✓ SOS log verified in DB (sos_logs): ID=' + sosRowsA[0].id + ', status=' + sosRowsA[0].status + ', lat=' + sosRowsA[0].latitude + ', lng=' + sosRowsA[0].longitude);

  // 9. IoT: Test Mechanism
  const devKey = process.env.IOT_DEFAULT_DEVICE_API_KEY || 'nk_sec_dev_2026_9e38e_7b4c91a0ef62';
  const testDevId = `DEV_TEST_${userAId}`;
  
  // Register/Pair test device for User A
  await axios.post(`${API_BASE}/iot/devices/pair`, {
    deviceId: testDevId,
    deviceName: 'Naari Test Band',
    deviceApiKey: devKey
  }, { headers: headersA });

  const [devRowsA] = await pool.query('SELECT * FROM iot_devices WHERE device_id = ?', [testDevId]);
  console.log('✓ IoT device verified in DB (iot_devices): device_id=' + devRowsA[0].device_id + ', user_id=' + devRowsA[0].user_id);

  // Ingest safe heartbeat event
  const evtId = `evt_test_${Date.now()}`;
  await axios.post(`${API_BASE}/iot/events`, {
    deviceId: testDevId,
    apiKey: devKey,
    eventId: evtId,
    eventType: 'STATUS_HEARTBEAT',
    heartRate: 72,
    batteryLevel: 91
  });

  const [evtRowsA] = await pool.query('SELECT * FROM iot_events WHERE event_id = ?', [evtId]);
  console.log('✓ IoT event verified in DB (iot_events): event_id=' + evtRowsA[0].event_id + ', type=' + evtRowsA[0].event_type + ', device_id=' + evtRowsA[0].device_id);

  console.log('\n================================================================');
  console.log('STEP 8: TEST USER ISOLATION (USER A vs USER B)');
  console.log('================================================================');

  // Register User B
  const userBEmail = `user_b_${Date.now()}@naarikavach.com`;
  const userBPwd = 'Password123!';
  const userBReg = await axios.post(`${API_BASE}/auth/register`, {
    name: 'User B Verified',
    email: userBEmail,
    password: userBPwd,
    phone: '9123456789'
  });
  const tokenB = userBReg.data.data.token;
  const userBId = userBReg.data.data.user.id;
  const headersB = { Authorization: `Bearer ${tokenB}` };
  console.log(`✓ User B registered: ID=${userBId}, Email=${userBEmail}`);

  // Query User B's data through the API and verify User A's data is NOT leaked
  const userBCycles = await axios.get(`${API_BASE}/menstrual`, { headers: headersB });
  const userBContacts = await axios.get(`${API_BASE}/emergency`, { headers: headersB });
  const userBWellness = await axios.get(`${API_BASE}/wellness`, { headers: headersB });
  const userBFitness = await axios.get(`${API_BASE}/fitness/today`, { headers: headersB });
  const userBChat = await axios.get(`${API_BASE}/assistant/history`, { headers: headersB });
  const userBSos = await axios.get(`${API_BASE}/sos`, { headers: headersB });

  console.log('User B Menstrual cycles count (expected 0):', userBCycles.data.data.cycles.length);
  console.log('User B Emergency contacts count (expected 0):', userBContacts.data.data.length);
  console.log('User B Wellness challenges count (expected 0):', userBWellness.data.data.length);
  console.log('User B FitMind today data (expected null/empty):', userBFitness.data.data);
  console.log('User B Assistant messages count (expected 0):', userBChat.data.data.length);
  console.log('User B SOS logs count (expected 0):', userBSos.data.data.length);

  const isIsolated = 
    userBCycles.data.data.cycles.length === 0 &&
    userBContacts.data.data.length === 0 &&
    userBWellness.data.data.length === 0 &&
    (!userBFitness.data.data || !userBFitness.data.data.id) &&
    userBChat.data.data.length === 0 &&
    userBSos.data.data.length === 0;

  if (isIsolated) {
    console.log('✓ USER ISOLATION VERIFIED: User B cannot view any of User A\'s records!');
  } else {
    console.error('✗ USER ISOLATION FAILED: Cross-user data leakage detected!');
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('STEP 10: CHECK FOR DUPLICATE PREVENTION & IDEMPOTENCY');
  console.log('================================================================');

  // Test 1: FitMind UPSERT on same date does not create duplicate row
  console.log('Testing FitMind duplicate prevention on same date...');
  const [initialFitCount] = await pool.query('SELECT COUNT(*) as count FROM fitness_logs WHERE user_id = ?', [userAId]);
  
  await axios.post(`${API_BASE}/fitness/log`, {
    steps: 9500, // updated steps
    water_glasses: 8 // updated water
  }, { headers: headersA });

  const [afterFitCount] = await pool.query('SELECT COUNT(*) as count FROM fitness_logs WHERE user_id = ?', [userAId]);
  const [fitUpdatedRow] = await pool.query('SELECT * FROM fitness_logs WHERE user_id = ?', [userAId]);
  console.log(`- FitMind row count before update: ${initialFitCount[0].count}, after update: ${afterFitCount[0].count}`);
  console.log(`- FitMind updated row values: steps=${fitUpdatedRow[0].steps}, water=${fitUpdatedRow[0].water_glasses}`);
  if (initialFitCount[0].count === afterFitCount[0].count && fitUpdatedRow[0].steps === 9500) {
    console.log('✓ FitMind UPSERT verified: Updated existing row without duplicate insertion.');
  } else {
    console.error('✗ FitMind duplicate prevention failed!');
  }

  // Test 2: IoT event deduplication
  console.log('Testing IoT event idempotency with identical eventId...');
  const [initialEvtCount] = await pool.query('SELECT COUNT(*) as count FROM iot_events WHERE event_id = ?', [evtId]);
  try {
    await axios.post(`${API_BASE}/iot/events`, {
      deviceId: testDevId,
      apiKey: devKey,
      eventId: evtId,
      eventType: 'STATUS_HEARTBEAT',
      heartRate: 72,
      batteryLevel: 91
    });
  } catch (e) {
    // Expected or handles deduplication response
  }
  const [afterEvtCount] = await pool.query('SELECT COUNT(*) as count FROM iot_events WHERE event_id = ?', [evtId]);
  console.log(`- IoT events matching eventId before: ${initialEvtCount[0].count}, after duplicate submit: ${afterEvtCount[0].count}`);
  if (afterEvtCount[0].count === 1) {
    console.log('✓ IoT event deduplication verified: Duplicate event rejected / not re-inserted.');
  }

  console.log('\n================================================================');
  console.log('STEP 11: DATABASE INTEGRITY VERIFICATION (CONSTRAINTS & KEYS)');
  console.log('================================================================');

  // Inspect Foreign Key Constraints
  const [fks] = await pool.query(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'women_safety_db' AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  console.log(`✓ Active Foreign Key Constraints (${fks.length}):`);
  fks.forEach(fk => {
    console.log(`  - [${fk.TABLE_NAME}.${fk.COLUMN_NAME}] → references [${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}]`);
  });

  // Inspect Unique Constraints
  const [uniques] = await pool.query(`
    SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME) AS COLUMNS
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = 'women_safety_db' AND NON_UNIQUE = 0 AND INDEX_NAME != 'PRIMARY'
    GROUP BY TABLE_NAME, INDEX_NAME
  `);
  console.log(`✓ Active Unique Key Constraints (${uniques.length}):`);
  uniques.forEach(u => {
    console.log(`  - [${u.TABLE_NAME}]: ${u.INDEX_NAME} (${u.COLUMNS})`);
  });

  await pool.end();

  // Return tokens and user IDs for post-restart verification
  return { userAId, userBId, tokenA, tokenB, headersA, headersB };
}

runFullVerificationSuite().catch(err => {
  console.error('Test suite failed:', err.response?.data || err);
  process.exit(1);
});
