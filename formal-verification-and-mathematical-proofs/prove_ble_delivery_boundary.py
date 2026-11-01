#!/usr/bin/env python3
"""Source-linked scoped SMT model of hardware SOS -> BLE -> foreground UI.

Z3 cannot observe radio packets, photons, actual calls or contact delivery;
its UNSAT results describe only the declared Boolean abstraction. Native
BLE and actual Android app code are independently exercised by VM tests.
"""
from pathlib import Path
from z3 import And, Bool, Not, Solver, sat, unsat

root = Path(__file__).resolve().parents[1]
fw = (root / "esp32-firmware/naari_kavach_dual_sensor_ble_test/"
      "naari_kavach_dual_sensor_ble_test.ino").read_text()
ble = (root / "services/BleService.ts").read_text()
hook = (root / "hooks/useIoTEmergencyListener.ts").read_text()
contacts = (root / "services/EmergencyContacts.ts").read_text()
modal = (root / "components/IoTEmergencyModal.tsx").read_text()
safety = (root / "app/(tabs)/safety.tsx").read_text()

required = {
    "hardware exact SOS": 'sendBleEvent("SOS")' in fw,
    "BLE request distinct from confirmed receipt":
        "[BLE_TX] %s NOTIFY_REQUESTED; APP_RECEIPT_UNCONFIRMED" in fw,
    "disconnected SOS not sent":
        "[BLE_TX] %s NO_CONNECTED_CLIENT; NOT_SENT" in fw,
    "BLE monitor error drops subscription":
        "this.cleanupConnection();" in ble
        and "BLE notifications lost; reconnecting for SOS." in ble,
    "stale scan callbacks ignored":
        "this.connectionState !== 'SCANNING FOR ESP32'" in ble,
    "scan permission race locked":
        "this.scanStartPending = true;" in ble
        and "this.scanStartPending = false;" in ble,
    "SOS remains exact":
        "if (text.toUpperCase() === 'SOS')" in ble,
    "foreground hook owns local SOS":
        "setActiveEmergency(localEmergency)" in hook,
    "local contact available without backend":
        "local_only: true" in safety,
    "all offline contacts correctly represented":
        "normalizeEmergencyContacts(stored)" in modal,
    "contact requires tap":
        "onPress={() => void openDialer(contact)}" in modal,
    "dialer URI validated":
        "safeDialNumber(contact.phone)" in modal
        and r"/^\+?\d{3,15}$/" in contacts,
    "no automatic emergency services calling":
        "tel:112" not in modal,
}
for label, valid in required.items():
    assert valid, "source contract changed: " + label

button, link, tx_characteristic, subscribed, over_air, native, foreground, \
exact_sos, valid_contact, user_tap, call_completed = [
    Bool(name) for name in (
        "button", "ble_link", "tx_characteristic", "notify_subscribed",
        "over_the_air_delivery", "native_ble_module", "foreground_app",
        "exact_sos", "valid_contact", "user_tap", "phone_call_completed"
    )
]
notify_request = And(button, link, tx_characteristic)
app_receipt = And(notify_request, subscribed, over_air, native, exact_sos)
modal_visible = And(app_receipt, foreground)
dialer_requested = And(modal_visible, valid_contact, user_tap)


def prove(label, *clauses):
    s = Solver()
    s.add(*clauses)
    assert s.check() == unsat, label
    print("PASS UNSAT", label)


for label, condition in [
    ("button activation", button),
    ("connected GATT client", link),
    ("known notification characteristic", tx_characteristic),
]:
    prove("notify request needs " + label, notify_request, Not(condition))
for label, condition in [
    ("notification request", notify_request),
    ("subscribed CCCD", subscribed),
    ("real radio delivery", over_air),
    ("native BLE module", native),
    ("exact SOS", exact_sos),
]:
    prove("app receipt needs " + label, app_receipt, Not(condition))
prove("modal cannot appear while app backgrounded", modal_visible, Not(foreground))
prove("dialer cannot open without valid contact", dialer_requested, Not(valid_contact))
prove("dialer cannot open without user tap", dialer_requested, Not(user_tap))
prove("dialer requires observed foreground app SOS", dialer_requested, Not(modal_visible))


def witness(label, *clauses):
    s = Solver()
    s.add(*clauses)
    assert s.check() == sat, label
    print("PASS SAT", label)

witness("serial BLE notify request with no phone receipt",
        notify_request, Not(subscribed), Not(app_receipt))
witness("connected ESP32 with no usable radio delivery",
        notify_request, subscribed, Not(over_air), Not(app_receipt))
witness("healthy local SOS with failed optical sensor [outside model]",
        modal_visible)
witness("contact selection opens dialer but no phone call confirmed",
        dialer_requested, Not(call_completed))
print("V27 source-linked model: 12 UNSAT, 4 SAT controls PASS")
