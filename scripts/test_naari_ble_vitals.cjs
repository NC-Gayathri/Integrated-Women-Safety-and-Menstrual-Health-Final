#!/usr/bin/env node
// Execute the actual BLE parser with native/cloud boundaries stubbed. No radio,
// network, or synthetic readings are added to the application itself.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../services/BleService.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const backendEvents = [];
const context = {
  exports: {}, console: { log() {}, warn() {}, error() {} },
  require(name) {
    if (name === 'react-native') return { Platform: { OS: 'android' }, NativeModules: {} };
    if (name === 'expo-constants') return {
      default: { executionEnvironment: 'storeClient' },
      ExecutionEnvironment: { StoreClient: 'storeClient' },
    };
    if (name === './IoTService') return {
      IoTService: { async ingestEvent(event) { backendEvents.push(event); } },
    };
    throw new Error(`Unexpected dependency: ${name}`);
  },
};
vm.runInNewContext(javascript, context, { filename: 'BleService.js' });
const service = context.exports.bleService;
const events = [];
service.addEventListener(event => events.push(event));
const receive = text => service.handleIncomingMessage(text);
function acquire() { receive('HEART_RATE:72'); receive('SPO2:96'); }
function assertCleared() {
  assert.equal(service.latestBpm, null, 'cached BPM must clear');
  assert.equal(service.latestSpO2, null, 'cached SpO2 must clear');
  assert.equal(service.diagnostics.lastHeartbeat, null, 'diagnostic BPM must clear');
  assert.equal(service.diagnostics.lastSpO2, null, 'diagnostic SpO2 must clear');
}

for (const status of ['VITALS:NO_VALID_READING', 'VITALS:ACQUIRING']) {
  acquire();
  const backendCount = backendEvents.length;
  receive(status);
  assertCleared();
  assert.equal(events.at(-1).type, 'VITALS_STATUS');
  assert.equal(backendEvents.length, backendCount, 'status must not become numeric cloud telemetry');
}
// Partial acquisition clears the old pair first, then restores only fresh HR.
acquire(); receive('VITALS:ACQUIRING'); receive('HEART_RATE:75');
assert.equal(service.latestBpm, 75);
assert.equal(service.latestSpO2, null, 'partial acquisition must not reuse old SpO2');
receive('VITALS:ACQUIRING'); receive('SOS');
assert.equal(events.at(-1).type, 'BUTTON_SOS', 'SOS must still dispatch while acquiring');
assert.equal(backendEvents.at(-1).heartRate, undefined, 'SOS must not attach stale BPM');
// The real firmware emits exactly FALL_DETECTED. The app must turn that
// packet into a visible safety-screen event and a tagged backend event.
receive('FALL_DETECTED');
assert.equal(events.at(-1).type, 'FALL_DETECTED', 'fall notification must reach app listeners');
assert.equal(events.at(-1).fallDetected, true, 'fall notification must carry a true fall flag');
assert.equal(service.lastFallDetected, true, 'app fall state must be updated');
assert.equal(backendEvents.at(-1).eventType, 'FALL_DETECTED', 'backend event type must be fall');
assert.equal(backendEvents.at(-1).fallDetected, true, 'backend fall flag must be true');
for (const status of ['SENSOR:MAX30102:NOT_READY', 'SENSOR:MAX30100:I2C_ERROR']) {
  acquire(); receive(status); assertCleared();
}
// Mock the actual connection registration boundary: monitor() can throw, or
// return no subscription, even when a device and exact GATT UUIDs were found.
// Neither outcome may be advertised to the user as subscribed/ready.
(async () => {
  const char = {
    uuid: service.targetCharUUID,
    isNotifiable: true,
    monitor() { throw new Error('simulated native subscription failure'); },
  };
  const fakeService = {
    uuid: service.targetServiceUUID,
    characteristics: async () => [char],
  };
  let cancellations = 0;
  const connection = {
    requestMTU: async () => 64,
    onDisconnected() {},
    discoverAllServicesAndCharacteristics: async () => ({
      services: async () => [fakeService],
    }),
    cancelConnection: async () => { cancellations++; },
  };
  const device = { name: 'NAARI_KAVACH', connect: async () => connection };

  await service.connectToDevice(device);
  assert.equal(service.diagnostics.notificationsSubscribed, false,
    'native monitor exception must not be misreported as subscribed');
  assert.equal(service.getConnectionState(), 'ERROR',
    'native monitor exception must be surfaced as a connection failure');
  assert.equal(cancellations, 1, 'failed GATT subscription must tear down the connection');

  char.monitor = () => undefined;
  await service.connectToDevice(device);
  assert.equal(service.diagnostics.notificationsSubscribed, false,
    'missing native monitor handle must fail closed');

  char.monitor = () => ({ remove() {} });
  await service.connectToDevice(device);
  assert.equal(service.diagnostics.notificationsSubscribed, true,
    'registered native monitor permits subscribed state');
  assert.equal(service.getConnectionState(), 'SUBSCRIBED TO SENSOR NOTIFICATIONS',
    'registered notification handle must preserve original successful flow');

  console.log('BLE vitals, SOS, fall parser and subscription-error state PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
