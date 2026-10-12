# Naari Kavach BLE-to-HTTP Gateway Bridge

This service runs on the development Windows laptop. It connects to the **ESP32 BLE Wearable** (`NAARI_KAVACH` / `cc:7b:5c:fb:d9:18`) over Bluetooth Low Energy, receives real-time GATT notifications, and forwards them as HTTP requests to the Express backend at `POST /api/v1/iot/events`.

---

## 1. Why is this Bridge Needed?

The ESP32 firmware operates strictly via **Bluetooth Low Energy (BLE)** and does not have a Wi-Fi stack. To allow the React Native mobile application (running on Expo Go) to receive emergency notifications and display real-time sensor status (`ONLINE` and Heart Rate BPM), the laptop acts as the BLE gateway bridge forwarding events to the Express backend on port 5000.

---

## 2. Notification Mapping

| ESP32 BLE Notification String | Backend Ingested `eventType` | Action in Mobile App |
| :--- | :--- | :--- |
| `"SOS"` | `BUTTON_SOS` | Triggers high-priority **🚨 Hardware SOS Triggered** modal with 10s countdown & 1-tap dialer. |
| `"FALL_DETECTED"` | `FALL_DETECTED` | Triggers **⚠ Fall Detected!** alert modal with 1-tap dialer. |
| `"HEART_RATE:<BPM>"` (e.g. `"HEART_RATE:82"`) | `STATUS_HEARTBEAT` / `HEART_RATE_EMERGENCY` | Updates live BPM on Safety Hub / Home cards. If abnormal, triggers alert modal. |
| *(Routine 15s Heartbeat)* | `STATUS_HEARTBEAT` | Updates `last_seen` timestamp so status card displays `ONLINE`. |

---

## 3. Quick Start (Windows)

### Option A: Double-Click Batch File
Double-click [`run_bridge.bat`](file:///c:/Users/arif/Integrated-Women-Safety-and-Menstrual-Health/WomenSafetyApp/ble-bridge/run_bridge.bat).

### Option B: Run via PowerShell / Terminal
```powershell
cd ble-bridge
python -m pip install -r requirements.txt
python ble_bridge.py
```

---

## 4. Troubleshooting
- Ensure **Bluetooth is turned ON** in Windows Settings.
- Ensure the ESP32 is powered ON and advertising as `NAARI_KAVACH`.
- The bridge will automatically auto-discover and reconnect if the ESP32 restarts.

---

## Fail-closed BLE gateway and physical serial verification (12 October 2026)

**The official ESP32 firmware remains v19.** This gateway-side repair does
**not** claim a newer binary was flashed or that unreliable physical I²C wiring
can be repaired with software.

The BLE gateway only subscribes to the exact NAARI service UUID and
notification-characteristic UUID. Without a successful subscription, it does
not send misleading periodic ONLINE heartbeats. Only exact `SOS` and
`FALL_DETECTED` notifications dispatch emergency events; arbitrary text that
contains those words is not accepted. Optical `VITALS:ACQUIRING`,
`VITALS:NO_VALID_READING` and `SENSOR:MAX...:I2C_ERROR`, etc., clear the
cached BPM. Even without an explicit invalidity message, an old BPM expires
after ten seconds, and a BLE reconnect/disconnect clears it. This prevents
stale optical estimates from being attached to new gateway event payloads.
It does not, by itself, delete an older value already stored by the backend.

For a physical test, first flash `master` with the guarded helper (replace
`COM5` with the **real** port). Close Serial Monitor before launching the
capture, and release BOOT and tap EN/RESET to capture the real boot header:

```powershell
git checkout master
git pull origin master
.\ble-bridge\flash_ble.ps1 -Port COM5
.\ble-bridge\read_com5.ps1 -Port COM5 -Seconds 300 -OutputPath .\naari-serial-test.txt -RequireTransportStable
```

The last command requires the physical v19 marker, both sensor READY
transitions and **zero observed I²C/sensor faults** throughout its five-minute
capture. It returns an error code if a fault occurs, the boot marker is
missing, or either sensor never becomes ready. It never overwrites an existing
log file. This is only a serial transport-stability check; it is not a medical
sensor accuracy test, a calibrated fall test, or proof of Android notification
delivery.

Switch OFF board power before any wiring changes. Isolate the ESP32 alone,
then MPU6500 alone, MAX30102 alone, and then both together. Verify the
particular breakout boards' power-rail and pull-up requirements. During a
separate **test-mode** SOS exercise, ensure that external emergency side
effects are disabled; inspect the bridge console for BLE receipt and a
successful backend response, and inspect the phone separately. Merely seeing
`[EVENT] SOS` on the ESP32 never proves an alert reached the phone.
