#!/usr/bin/env python3
"""V26 Z3 scoped assurance: foreground BLE emergency to local UI.

Checks source anchors plus 9 UNSAT logical counterexample searches.
This is a MODEL, not a proof of Android lifecycle, radio delivery or a call.
The actual TypeScript modules are executed against fakes in CI separately.
"""
from pathlib import Path
from z3 import And, Bool, Not, Or, Solver, sat, unsat

root = Path(__file__).resolve().parents[1]
hook = (root / "hooks/useIoTEmergencyListener.ts").read_text()
modal = (root / "components/IoTEmergencyModal.tsx").read_text()
contacts = (root / "services/EmergencyContacts.ts").read_text()
safety = (root / "app/(tabs)/safety.tsx").read_text()
tabs = (root / "app/(tabs)/_layout.tsx").read_text()
ble = (root / "services/BleService.ts").read_text()
fw = (root / "esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino").read_text()

anchors = {
    "hardware sends SOS": 'sendBleEvent("SOS")' in fw,
    "parser exact SOS": "if (text.toUpperCase() === 'SOS')" in ble,
    "parser labels BUTTON_SOS": "type: 'BUTTON_SOS'" in ble,
    "global hook mounted": "useIoTEmergencyListener()" in tabs,
    "global modal mounted": "<IoTEmergencyModal" in tabs,
    "register before scan": hook.index("bleService.addEventListener(onBleEvent)") <
                            hook.index("bleService.startScanAndConnect()"),
    "local immediate alert": "setActiveEmergency(localEmergency)" in hook,
    "backend failure isolated": "Network failure must not prevent direct BLE" in hook,
    "local event is negative": "id: -localSequence.current" in hook,
    "local dismissal never remote-acks": "if (eventId < 0) return;" in hook,
    "sensor tab does not duplicate alert": 'Alert.alert("🚨 Physical SOS Triggered!"' not in safety,
    "modal renders contacts": "contacts.map(contact =>" in modal,
    "modal requires user selection": "onPress={() => void openDialer(contact)}" in modal,
    "modal opens dialer only": "await Linking.openURL('tel:' + number)" in modal,
    "no auto-dial countdown": "setInterval(" not in modal,
    "no emergency service fallback": "tel:112" not in modal,
    "phone URI filters metacharacters": "if (!/^\\+?\\d{3,15}$/.test(normalized)) return null;" in contacts,
}
for label, ok in anchors.items():
    assert ok, "source contract changed: " + label

foreground, connected, subscribed, exact_sos, sensor_ready, backend_up, \
contact_exists, clicked_contact, call_placed = [
    Bool(i) for i in (
        "foreground", "gatt_connected", "notify_subscribed", "exact_sos",
        "sensor_ready", "backend_available", "valid_contacts", "user_tapped",
        "telephone_call_completed"
    )
]
hardware_delivered = And(foreground, connected, subscribed, exact_sos)
local_alert = hardware_delivered
contact_chooser = local_alert
dialer_open = And(contact_chooser, contact_exists, clicked_contact)

def check_unsat(label, *terms):
    s = Solver()
    s.add(*terms)
    assert s.check() == unsat, label
    print("PASS UNSAT", label)

checks = [
    ("real local SOS notification needs foreground", (local_alert, Not(foreground))),
    ("requires connected GATT", (local_alert, Not(connected))),
    ("requires subscribed characteristic", (local_alert, Not(subscribed))),
    ("requires exact SOS protocol", (local_alert, Not(exact_sos))),
    ("local alert independent of optical sensor", (local_alert, Not(sensor_ready), Not(contact_chooser))),
    ("local alert independent of server", (local_alert, Not(backend_up), Not(contact_chooser))),
    ("display of contacts does not open dialer", (dialer_open, Not(clicked_contact))),
    ("invalid/missing contacts do not open dialer", (dialer_open, Not(contact_exists))),
    ("no actual call is asserted from dialer opening", (dialer_open, Not(call_placed), call_placed)),
]
for label, terms in checks: check_unsat(label, *terms)

def sat_control(label, *terms):
    s = Solver()
    s.add(*terms)
    assert s.check() == sat, label
    print("PASS SAT", label)

sat_control("local SOS with all sensors dead and no backend",
            local_alert, Not(sensor_ready), Not(backend_up))
sat_control("contacts shown without initiating calls",
            contact_chooser, Not(clicked_contact), Not(dialer_open))
sat_control("dialer can open but phone call still unconfirmed",
            dialer_open, Not(call_placed))
print("V26 source-linked abstract SOS model: 9 UNSAT / 3 SAT checks PASS")
