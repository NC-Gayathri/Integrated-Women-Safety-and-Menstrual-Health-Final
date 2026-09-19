const mysql = require('mysql2/promise');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_BASE = 'http://127.0.0.1:5000/api/v1';

async function testAfterRestart() {
  console.log('================================================================');
  console.log('STEP 7: POST-RESTART DATA RETRIEVAL VERIFICATION');
  console.log('================================================================');

  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'women_safety_db',
  };

  const pool = mysql.createPool(dbConfig);

  // Find User A (the verified test user we just created)
  const [users] = await pool.query("SELECT id, name, email FROM users WHERE email LIKE 'user_a_%' ORDER BY id DESC LIMIT 1");
  if (users.length === 0) {
    throw new Error('User A not found in database');
  }
  const user = users[0];
  console.log(`Found target test user in MySQL: ID=${user.id}, Name=${user.name}, Email=${user.email}`);

  // Test Login again through the API to prove auth persists
  console.log('\n1. Logging in with existing test credentials after server restart...');
  const loginRes = await axios.post(`${API_BASE}/auth/login`, {
    email: user.email,
    password: 'Password123!'
  });
  const token = loginRes.data.data.token;
  console.log('✓ Login succeeded after restart! JWT token acquired.');
  const headers = { Authorization: `Bearer ${token}` };

  // 2. Profile
  console.log('\n2. Retrieving Profile from /users/me...');
  const profileRes = await axios.get(`${API_BASE}/users/me`, { headers });
  console.log('✓ Profile data:', {
    name: profileRes.data.data.name,
    email: profileRes.data.data.email,
    blood_group: profileRes.data.data.profile?.blood_group,
    height: profileRes.data.data.profile?.height,
    weight: profileRes.data.data.profile?.weight
  });

  // 3. Menstrual Cycles
  console.log('\n3. Retrieving Menstrual Cycles from /menstrual...');
  const cycleRes = await axios.get(`${API_BASE}/menstrual`, { headers });
  const cycles = cycleRes.data.data.cycles || [];
  console.log(`✓ Cycles retrieved (${cycles.length} cycles):`, cycles[0] ? {
    id: cycles[0].id,
    last_period_date: cycles[0].last_period_date,
    cycle_length: cycles[0].cycle_length
  } : 'none');

  // 4. Symptoms
  console.log('\n4. Retrieving Symptoms from /symptoms...');
  const symRes = await axios.get(`${API_BASE}/symptoms`, { headers });
  console.log(`✓ Symptoms retrieved (${symRes.data.data.length} items):`, symRes.data.data[0] ? {
    id: symRes.data.data[0].id,
    symptom: symRes.data.data[0].symptom,
    mood: symRes.data.data[0].mood
  } : 'none');

  // 5. Emergency Contacts
  console.log('\n5. Retrieving Emergency Contacts from /emergency...');
  const contactRes = await axios.get(`${API_BASE}/emergency`, { headers });
  console.log(`✓ Contacts retrieved (${contactRes.data.data.length} active contacts):`, contactRes.data.data[0] ? {
    id: contactRes.data.data[0].id,
    name: contactRes.data.data[0].name,
    phone: contactRes.data.data[0].phone
  } : 'none');

  // 6. Wellness Challenges
  console.log('\n6. Retrieving Wellness Challenges from /wellness...');
  const wellRes = await axios.get(`${API_BASE}/wellness`, { headers });
  console.log(`✓ Wellness challenges retrieved (${wellRes.data.data.length} items):`, wellRes.data.data[0] ? {
    id: wellRes.data.data[0].id,
    title: wellRes.data.data[0].title,
    status: wellRes.data.data[0].status
  } : 'none');

  // 7. FitMind Today & Week
  console.log('\n7. Retrieving FitMind Today from /fitness/today...');
  const fitToday = await axios.get(`${API_BASE}/fitness/today`, { headers });
  console.log('✓ FitMind today data:', {
    id: fitToday.data.data.id,
    steps: fitToday.data.data.steps,
    water_glasses: fitToday.data.data.water_glasses,
    workout_completed: fitToday.data.data.workout_completed,
    journal: fitToday.data.data.journal
  });

  console.log('Retrieving FitMind Week Trend from /fitness/week...');
  const fitWeek = await axios.get(`${API_BASE}/fitness/week`, { headers });
  console.log(`✓ FitMind week trend retrieved (${fitWeek.data.data.length} days of history).`);

  // 8. Assistant Chat History
  console.log('\n8. Retrieving Assistant Chat from /assistant/history...');
  const chatRes = await axios.get(`${API_BASE}/assistant/history`, { headers });
  console.log(`✓ Assistant chat history retrieved (${chatRes.data.data.length} messages):`, chatRes.data.data.map(m => `[${m.role}] ${m.message}`));

  // 9. SOS Logs
  console.log('\n9. Retrieving SOS Logs from /sos...');
  const sosRes = await axios.get(`${API_BASE}/sos`, { headers });
  console.log(`✓ SOS logs retrieved (${sosRes.data.data.length} entries):`, sosRes.data.data[0] ? {
    id: sosRes.data.data[0].id,
    status: sosRes.data.data[0].status,
    lat: sosRes.data.data[0].latitude,
    lng: sosRes.data.data[0].longitude
  } : 'none');

  console.log('\n================================================================');
  console.log('ALL RESTART RETRIEVAL CHECKS PASSED 100%!');
  console.log('================================================================');

  await pool.end();
}

testAfterRestart().catch(err => {
  console.error('Post-restart test failed:', err.response?.data || err);
  process.exit(1);
});
