#!/usr/bin/env node
// Executes the EXACT Android BLE TypeScript source inside a controlled fake
// native GATT environment; never claims physical radio or phone proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../services/BleService.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
}}).outputText;
let permissionResolve;
let permissionCalls = 0, nativeScanCalls = 0, stopCalls = 0, cancelCalls = 0;
let scanCallback, monitorCallback, onDisconnect;
const timers = new Map();
let nextTimer = 0;
const observed = [];
const diagnostics = [];
const fakes = { ingest: [] };

const characteristic = {
  uuid: '87654321-4321-4321-4321-ba0987654321',
  isNotifiable: true,
  monitor(fn) {
    monitorCallback = fn;
    return { remove() {} };
  },
};
const service = {
  uuid: '12345678-1234-1234-1234-1234567890ab',
  async characteristics() { return [characteristic]; },
};
const connection = {
  id: 'esp32-virtual-id',
  async requestMTU() { return 64; },
  onDisconnected(fn) { onDisconnect = fn; },
  async discoverAllServicesAndCharacteristics() {
    return { async services() { return [service]; } };
  },
  async cancelConnection() { cancelCalls++; },
};
const device = {
  name: 'NAARI_KAVACH', id: 'esp32-virtual-id', rssi: -60,
  async connect() { return connection; },
};
class MockManager {
  startDeviceScan(_, options, cb) {
    nativeScanCalls++;
    scanCallback = cb;
  }
  stopDeviceScan() { stopCalls++; }
}

const m = { exports: {} };
vm.runInNewContext(js, {
  module: m, exports: m.exports, console: { log(){}, warn(){}, error(){} },
  Date, Promise,
  setTimeout(cb, ms) { const id=++nextTimer; timers.set(id,{cb,ms}); return id; },
  clearTimeout(id) { timers.delete(id); },
  require(name) {
    if (name === 'react-native') return {
      Platform: { OS: 'android', Version: 33 },
      NativeModules: { BleClientManager: {} },
      PermissionsAndroid: {
        PERMISSIONS: {
          BLUETOOTH_SCAN: 'scan', BLUETOOTH_CONNECT: 'connect', ACCESS_FINE_LOCATION: 'location',
        },
        RESULTS: { GRANTED: 'granted' },
        requestMultiple() {
          permissionCalls++;
          return new Promise(resolve => { permissionResolve = resolve; });
        },
      },
    };
    if (name === 'expo-constants') return {
      default: { executionEnvironment: 'standalone', appOwnership: 'standalone' },
      ExecutionEnvironment: { StoreClient: 'storeClient' },
    };
    if (name === 'react-native-ble-plx') return { BleManager: MockManager };
    if (name === './IoTService') return { IoTService: {
      async ingestEvent(event) { fakes.ingest.push(event); },
    } };
    throw Error('Unexpected dependency '+name);
  },
}, { filename: 'BleService.js' });

const ble = m.exports.bleService;
ble.addEventListener(e=>observed.push(e));
ble.addDiagnosticListener(d=>diagnostics.push({ ...d }));
async function flush() { for(let i=0;i<6;i++) await Promise.resolve(); }
async function main() {
  assert.equal(ble.isAvailable(), true, 'native APK should instantiate real BLE manager');
  const first=ble.startScanAndConnect();
  const duplicate=ble.startScanAndConnect();
  assert.equal(permissionCalls,1,'one permission prompt while scans race');
  permissionResolve({scan:'granted',connect:'granted',location:'granted'});
  await Promise.all([first,duplicate]);
  assert.equal(nativeScanCalls,1,'no duplicate GATT scans');
  assert.equal(ble.getConnectionState(),'SCANNING FOR ESP32');
  const cb = scanCallback;
  await cb(null,device);
  assert.equal(ble.getConnectionState(),'SUBSCRIBED TO SENSOR NOTIFICATIONS');
  assert.equal(ble.diagnostics.notificationsSubscribed,true);
  cb(null,device); // Stale callback after stop must be ignored.
  assert.equal(nativeScanCalls,1);
  assert.equal(ble.getConnectionState(),'SUBSCRIBED TO SENSOR NOTIFICATIONS');
  assert.ok(stopCalls>=1);

  // Native GATT base64 notification must be decoded by the ACTUAL parser.
  monitorCallback(null,{ value:'U09T' });
  assert.equal(observed.at(-1).type,'BUTTON_SOS');
  assert.equal(ble.diagnostics.lastSensorEvent,'PHYSICAL SOS BUTTON');
  assert.equal(ble.getConnectionState(),'RECEIVING SENSOR DATA');
  const before=observed.filter(e=>e.type==='BUTTON_SOS').length;
  monitorCallback(null,{ value:'U09TX0ZBS0U=' }); // "SOS_FAKE"
  assert.equal(observed.filter(e=>e.type==='BUTTON_SOS').length,before,
    'non-exact SOS must never dispatch a hardware emergency');

  monitorCallback(new Error('GATT notification stream lost'),null);
  await flush();
  assert.equal(ble.diagnostics.notificationsSubscribed,false,
    'native stream error must invalidate subscription');
  assert.equal(ble.getConnectionState(),'ERROR',
    'native notification loss must be visible and recoverable');
  assert.ok(cancelCalls>=1,'failed native connection should be cancelled');
  assert.ok([...timers.values()].some(t=>t.ms===4000),
    'error must schedule bounded reconnect');

  // Old native disconnect must not corrupt a new connect state.
  ble.updateStatus('SCANNING FOR ESP32');
  onDisconnect(null,connection);
  assert.equal(ble.getConnectionState(),'SCANNING FOR ESP32');
  console.log('PASS native BLE: one scan, exact GATT, base64 SOS, malformed rejection, stream-loss reconnect and stale callback');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
