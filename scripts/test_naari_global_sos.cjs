#!/usr/bin/env node
// Real source execution with fake BLE, AppState, backend and React hook scheduler.
// It proves foreground app logic, NEVER physical RF range/background delivery.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const js = (source, file) => ts.transpileModule(source, {
  fileName: file, compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const logging = { log(){}, warn(){}, error(){} };

// Execute the exact saved-contact normalization code.
const contactsModule = { exports: {} };
vm.runInNewContext(js(read('services/EmergencyContacts.ts'), 'EmergencyContacts.ts'),
  { module: contactsModule, exports: contactsModule.exports });
const { safeDialNumber, normalizeEmergencyContacts } = contactsModule.exports;
assert.equal(safeDialNumber('+358 40 123 4567'), '+358401234567');
for (const malicious of ['tel:112', '123;456', '123#', '123?x=5', '1', '', null, {}, '+']) {
  assert.equal(safeDialNumber(malicious), null, 'reject unsafe dialer URI components');
}
const saved = normalizeEmergencyContacts([
  { name: 'Mom', phone: '+358 40 123 4567', is_primary: true },
  '040-1234567', { name: 'duplicate', phone: '+358401234567' },
  { phone: '123;456' }, {}, null,
]);
assert.equal(saved.length, 2);
assert.equal(saved[0].name, 'Mom');
assert.equal(saved[0].phone, '+358401234567');
assert.equal(saved[1].phone, '0401234567');
assert.equal(normalizeEmergencyContacts('bad-json-as-string').length, 0);
console.log('PASS saved-contact records, legacy numbers, dedup and safe tel: URI validation');

// Simple deterministic React hook harness: rerenders reuse refs/state.
const hooks = [];
let index = 0, effects = [], cleanups = [];
const reactHooks = {
  useState(initial) {
    const slot = index++;
    if (!(slot in hooks)) hooks[slot] = initial;
    return [hooks[slot], val => {
      hooks[slot] = typeof val === 'function' ? val(hooks[slot]) : val;
    }];
  },
  useRef(initial) {
    const slot = index++;
    if (!(slot in hooks)) hooks[slot] = { current: initial };
    return hooks[slot];
  },
  useCallback(fn) { index++; return fn; },
  useEffect(fn) { index++; effects.push(fn); },
};
const connected = { listener: null, addCalls: 0, scanCalls: 0, states: [] };
const fakeBle = {
  targetDeviceName: 'NAARI_KAVACH',
  addEventListener(fn) {
    connected.addCalls++;
    connected.listener = fn;
    connected.states.push('subscribe');
    return () => { connected.listener = null; };
  },
  async startScanAndConnect() {
    connected.scanCalls++;
    connected.states.push('scan');
  },
};
const remote = {
  isLoggedIn: true, pollError: false, emergencies: [], acknowledgements: [],
};
const backend = {
  async pollEmergencies() {
    if (remote.pollError) throw Error('offline');
    return remote.emergencies;
  },
  async acknowledgeEvent(id) { remote.acknowledgements.push(id); },
};
const appListeners = [];
const appState = {
  currentState: 'active',
  addEventListener(event, fn) {
    assert.equal(event, 'change');
    appListeners.push(fn);
    return { remove() { appListeners.splice(appListeners.indexOf(fn), 1); } };
  },
};
let intervalCount = 0;
let vibCount = 0;
const module = { exports: {} };
const ctx = {
  module, exports: module.exports, console: logging, Date, Promise,
  setInterval(fn, ms) { assert.equal(ms, 5000); intervalCount++; return intervalCount; },
  clearInterval(){},
  require(name) {
    if (name === 'react') return reactHooks;
    if (name === 'react-native') return { AppState: appState };
    if (name === 'expo-haptics') return {
      NotificationFeedbackType: { Error: 'Error' },
      notificationAsync: async () => { vibCount++; },
    };
    if (name === '../services/IoTService') return { IoTService: backend };
    if (name === '../services/AuthService') return {
      AuthService: { isLoggedIn: async () => remote.isLoggedIn },
    };
    if (name === '../services/BleService') return { bleService: fakeBle };
    throw Error('Unexpected dependency: ' + name);
  },
};
vm.runInNewContext(js(read('hooks/useIoTEmergencyListener.ts'),
  'useIoTEmergencyListener.ts'), ctx);
const render = () => { index = 0; effects = []; return module.exports.useIoTEmergencyListener(); };
const flushEffects = () => { for (const effect of effects) cleanups.push(effect()); };

async function test() {
  let app = render();
  flushEffects();
  assert.equal(connected.states.join(','), 'subscribe,scan',
    'global BLE listener MUST register before scan');
  assert.equal(connected.addCalls, 1);
  assert.equal(app.activeEmergency, null);

  // A direct BLE SOS must be visible immediately even with no backend.
  remote.pollError = true;
  connected.listener({ type: 'BUTTON_SOS', rawPayload: 'SOS', timestamp: Date.now() });
  app = render();
  assert.equal(app.activeEmergency.event_type, 'BUTTON_SOS');
  assert.ok(app.activeEmergency.id < 0, 'local event must not impersonate backend ID');
  assert.match(app.activeEmergency.event_id, /^LOCAL_BLE_/);
  assert.equal(remote.acknowledgements.length, 0);
  assert.equal(vibCount, 1);
  const firstEventId = app.activeEmergency.id;
  connected.listener({ type: 'BUTTON_SOS', rawPayload: 'SOS', timestamp: Date.now() });
  assert.equal(render().activeEmergency.id, firstEventId, 'duplicate burst must be suppressed');

  await app.acknowledgeActiveEmergency();
  assert.equal(render().activeEmergency, null);
  assert.equal(remote.acknowledgements.length, 0,
    'local negative ID must never be acknowledged on server');

  // Same app-layout hook is present irrespective of active Safety tab.
  appListeners[0]('background');
  appListeners[0]('active');
  assert.equal(connected.addCalls, 1,
    'navigation/app state must not register duplicate BLE listeners');
  assert.ok(connected.scanCalls >= 2,
    'foreground reentry should request a fresh BLE connection');

  connected.listener({ type: 'FALL_DETECTED', rawPayload: 'FALL_DETECTED', timestamp: Date.now() });
  app = render();
  assert.equal(app.activeEmergency.event_type, 'FALL_DETECTED');
  await app.acknowledgeActiveEmergency();

  // Authenticated remote poll remains independently supported.
  remote.pollError = false;
  remote.emergencies = [{
    id: 42, event_id: 'REMOTE_42', device_id: 'test-device', user_id: 1,
    event_type: 'BUTTON_SOS', is_emergency: true, status: 'TRIGGERED',
    created_at: '2020-01-01T00:00:00Z',
  }];
  app = render();
  await app.checkEmergencies();
  app = render();
  assert.equal(app.activeEmergency.id, 42);
  await app.acknowledgeActiveEmergency();
  assert.equal(remote.acknowledgements.join(','), '42');
  assert.equal(render().activeEmergency, null);

  // No service is mounted twice on different tabs.
  assert.equal(connected.addCalls, 1);
  for (const clean of cleanups) clean();
  assert.equal(connected.listener, null, 'listener unregistered on tab layout logout/unmount');
  assert.equal(appListeners.length, 0);
  console.log('PASS direct foreground SOS/fall, offline alert, remote fallback, dedup, lifecycle');
}
test().catch(e => { console.error(e); process.exitCode = 1; });
