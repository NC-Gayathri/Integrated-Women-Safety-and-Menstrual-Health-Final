#!/usr/bin/env node
// Execute the actual React Native emergency modal under a fake JSX renderer.
// This is a HOST UI contract test, not Android hardware/runtime verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../components/IoTEmergencyModal.tsx'), 'utf8');
const contactsSource = fs.readFileSync(path.join(__dirname, '../services/EmergencyContacts.ts'), 'utf8');
const compile = (value, fileName) => ts.transpileModule(value, {
  fileName, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const parserExports = {};
vm.runInNewContext(compile(contactsSource, 'EmergencyContacts.ts'),
  { exports: parserExports });
const contacts = parserExports;
const opened = [];
const alerts = [];
const dismissed = [];
const navigation = [];
const savedContacts = [
  { name: 'Mom', phone: '+358 40 123 4567', is_primary: true },
  { name: 'Friend', phone: '040-1234567' },
  { name: 'Untrusted URI', phone: '112?auto=1' },
];
const effects = [];
const slots = [];
let slot = 0, collectEffects = true;
const react = {
  useState(initial) {
    const i = slot++;
    if (!(i in slots)) slots[i] = initial;
    return [slots[i], value => {
      slots[i] = typeof value === 'function' ? value(slots[i]) : value;
    }];
  },
  useEffect(effect) {
    slot++;
    if (collectEffects) effects.push(effect);
  },
};
const jsx = (type, props) => ({ type, props: props || {} });
const exports = {};
const context = {
  exports,
  console: { warn() {} },
  require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return {
      Alert: { alert: (...args) => alerts.push(args) },
      Modal: 'Modal', ScrollView: 'ScrollView', Text: 'Text',
      TouchableOpacity: 'TouchableOpacity', View: 'View',
      StyleSheet: { create: styles => styles },
    };
    if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (name === 'expo-linking') return { openURL: async url => opened.push(url) };
    if (name === '@react-native-async-storage/async-storage') return {
      default: { getItem: async () => JSON.stringify(savedContacts) },
    };
    if (name === 'expo-router') return {
      router: { push: route => navigation.push(route) },
    };
    if (name === '../services/EmergencyContacts') return contacts;
    throw Error('Unexpected dependency ' + name);
  },
};
vm.runInNewContext(compile(src, 'IoTEmergencyModal.tsx'), context);

function flatten(node, results = []) {
  if (!node || typeof node !== 'object') return results;
  if (Array.isArray(node)) {
    for (const value of node) flatten(value, results);
    return results;
  }
  results.push(node);
  flatten(node.props?.children, results);
  return results;
}
function render() {
  slot = 0;
  return context.exports.IoTEmergencyModal({
    emergency: {
      id: -1, event_id: 'LOCAL_BLE_1', event_type: 'BUTTON_SOS',
      device_id: 'NAARI_KAVACH', is_emergency: true,
      status: 'TRIGGERED',
    },
    onDismiss: () => dismissed.push(true),
  });
}
async function main() {
  const initial = render();
  assert.equal(initial.type, 'Modal');
  assert.equal(opened.length, 0, 'opening an SOS must not dial or call automatically');
  for (const effect of effects) effect();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  collectEffects = false;

  const visible = flatten(render());
  const contactButtons = visible.filter(n =>
    n.type === 'TouchableOpacity' &&
    String(n.props.accessibilityLabel || '').startsWith('Open dialer for '));
  assert.equal(contactButtons.length, 2, 'all valid stored contacts must render, reject injection');
  assert.equal(opened.length, 0, 'rendering contacts may not launch tel intents');
  const mom = contactButtons.find(n => n.props.accessibilityLabel === 'Open dialer for Mom');
  assert.ok(mom, 'primary contact must be selectable');
  mom.props.onPress();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.deepEqual(opened, ['tel:+358401234567'],
    'only the explicitly chosen phone number may be passed to dialer');
  assert.equal(opened.some(value => value === 'tel:112'), false);
  const manage = visible.find(n => n.props?.children?.props?.children === 'Manage emergency contacts');
  assert.ok(manage && manage.type === 'TouchableOpacity');
  manage.props.onPress();
  assert.deepEqual(navigation, ['/(tabs)/safety']);
  assert.equal(dismissed.length, 1, 'managing contacts dismisses present alert');
  assert.equal(alerts.length, 0);
  console.log('PASS real emergency modal: no auto-call, two correct contact buttons, one tap -> one dialer, manage navigation');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
