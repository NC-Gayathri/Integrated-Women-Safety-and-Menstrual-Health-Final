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
