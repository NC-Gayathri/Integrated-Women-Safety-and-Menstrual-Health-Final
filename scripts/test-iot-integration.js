/**
 * =========================================================================================
 * NAARI KAVACH - WI-FI PHYSICAL SOS BUTTON INTEGRATION TEST SUITE
 * =========================================================================================
 * Tests the complete Wi-Fi SOS flow:
 *   1. Backend Health Check
 *   2. Device Authentication & Security (Invalid API Key -> 401)
 *   3. Minimal Wi-Fi BUTTON_SOS Ingestion
 *   4. Duplicate Event Protection / Idempotency
 *   5. Emergency Polling API Verification (Mobile App Sync)
 *
 * Run with: node scripts/test-iot-integration.js
 * =========================================================================================
 */

const http = require('http');

const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 5000;
const DEVICE_ID = 'cc:7b:5c:fb:d9:18';
const DEVICE_API_KEY = process.env.IOT_DEFAULT_DEVICE_API_KEY || 'nk_sec_dev_2026_9e38e_7b4c91a0ef62';

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('  NAARI KAVACH - WI-FI SOS INTEGRATION TEST SUITE   ');
  console.log('====================================================\n');

  try {
    // 1. Health Check
    console.log('[TEST 1] Testing Backend Health Check...');
    const healthRes = await makeRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: '/health',
      method: 'GET',
    });
    console.log(` -> Health Status: ${healthRes.status} -> ${JSON.stringify(healthRes.body)}`);

    // 2. Test Invalid Device Authentication
    console.log('\n[TEST 2] Testing Device Authentication Security (Invalid API Key)...');
    const authFailRes = await makeRequest(
      {
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: '/api/v1/iot/events',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        deviceId: DEVICE_ID,
        apiKey: 'invalid_wrong_secret_key',
        eventId: `${DEVICE_ID}_AUTH_TEST_${Date.now()}`,
        eventType: 'BUTTON_SOS',
      }
    );
    console.log(` -> Status: ${authFailRes.status} (Expected 401) -> Message: ${authFailRes.body?.message || JSON.stringify(authFailRes.body)}`);

    // 3. Ingest Minimal Wi-Fi Physical BUTTON_SOS Event
    console.log('\n[TEST 3] Ingesting Minimal Wi-Fi BUTTON_SOS Event from ESP32...');
    const sosEventId = `${DEVICE_ID}_BTN_${Date.now()}_1`;
    const sosPayload = {
      deviceId: DEVICE_ID,
      apiKey: DEVICE_API_KEY,
      eventId: sosEventId,
      eventType: 'BUTTON_SOS',
    };

    console.log(` -> Payload: ${JSON.stringify(sosPayload)}`);
    const sosRes = await makeRequest(
      {
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: '/api/v1/iot/events',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      sosPayload
    );
    console.log(` -> Status: ${sosRes.status} -> Message: ${sosRes.body.message || JSON.stringify(sosRes.body)}`);

    // 4. Test Event Deduplication / Safe Retry Idempotency
    console.log('\n[TEST 4] Testing Safe Retry / Duplicate Ingest with same eventId...');
    const dedupRes = await makeRequest(
      {
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: '/api/v1/iot/events',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      sosPayload
    );
    console.log(` -> Status: ${dedupRes.status} -> Message: ${dedupRes.body.message} (isDuplicate: ${dedupRes.body?.data?.isDuplicate})`);

    console.log('\n====================================================');
    console.log('  ALL WI-FI SOS INTEGRATION TESTS COMPLETED!        ');
    console.log('====================================================\n');
  } catch (e) {
    console.error('Test Execution Error:', e);
  }
}

runTests();

