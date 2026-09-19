# Naari Kavach: Wi-Fi IoT Emergency SOS Integration Guide

This guide describes how to run and test the complete system—**Node.js/Express Backend**, **MySQL Database**, **React Native Expo Application (Expo Go)**, and **ESP32 Wi-Fi Wearable Device**—on a local Wi-Fi network or single laptop workspace.

---

## 1. System Architecture

```
+-----------------------------------------------------------------------------------+
|                            LOCAL WI-FI / LAN WORKSPACE                            |
|                                                                                   |
|  [ MySQL Database ]          [ Node.js/Express API (Port 5000) ]                  |
|    - users                     - /api/v1/auth/*                                   |
|    - emergency_contacts        - /api/v1/sos/*                                    |
|    - iot_devices               - /api/v1/iot/events (Wi-Fi Ingestion)             |
|    - iot_events                - /api/v1/iot/devices/status (Live App Status)     |
|    - notifications             - /api/v1/iot/events/emergency-poll (3s Polling)  |
|                                        ^                                          |
|                                        | HTTP POST /api/v1/iot/events             |
|                                        | (Wi-Fi Direct)                           |
|  [ Expo Dev Server (Port 8081) ]       |                                          |
|    - React Native Expo App             |                                          |
+----------------------------------------+------------------------------------------+
             ^                                           ^
             | Wi-Fi (HTTP Polling)                      | Wi-Fi (HTTP Direct)
             |                                           |
+----------------------------+             +----------------------------+
|   Physical Android Phone   |             |   ESP32 Wearable Device    |
|   - Expo Go App            |             |   Device ID:               |
|   - Global Emergency Modal |             |   cc:7b:5c:fb:d9:18        |
|   - Contact 1-Tap Dialer   |             |   - Physical Push Button   |
|   - 10s Emergency Countdown|             |     (GPIO 4 Active-LOW)    |
+----------------------------+             +----------------------------+
```

---

## 2. Hardware-to-Backend Flow

```
[ Physical SOS Button Pressed ]
            │
            ▼
[ ESP32 Hardware Debounce & Multi-Click ]
            │
            ▼
[ Wi-Fi HTTP POST /api/v1/iot/events ]
  Payload: { deviceId, apiKey, eventId, eventType: "BUTTON_SOS" }
            │
            ▼
[ Backend Ingest Controller & Service ]
  ├── 1. Authenticate Device ID & API Key
  ├── 2. Verify User Pairing
  ├── 3. Deduplicate via Event ID
  ├── 4. Store in `iot_events` Table
  ├── 5. Insert Record in `sos_logs` Table
  └── 6. Create Record in `notifications` Table
            │
            ▼
[ Mobile App 3s Polling /api/v1/iot/events/emergency-poll ]
            │
            ▼
[ In-App Global Emergency Alert Modal Displayed ]
  - Plays alert haptics
  - Displays 10s countdown timer
  - Provides 1-tap call to Emergency Contacts
  - Allows user acknowledgment / "I Am Safe"
```

---

## 3. Setup & Configuration

### Step 1: Find Your Laptop's Local LAN IP
1. Open PowerShell on your laptop:
   ```powershell
   ipconfig
   ```
2. Locate your active **IPv4 Address** (e.g. `192.168.1.100` or `192.168.43.174`).

### Step 2: Configure Environment Variables
1. **Backend (`server/.env`)**:
   ```env
   PORT=5000
   NODE_ENV=development
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_NAME=women_safety_db
   DB_USER=root
   DB_PASSWORD=
   IOT_DEFAULT_DEVICE_API_KEY=nk_sec_dev_2026_9e38e_7b4c91a0ef62
   ```

2. **Frontend (`.env`)**:
   Ensure `EXPO_PUBLIC_API_URL` points to your laptop's LAN IP:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.100:5000/api/v1
   ```

3. **ESP32 Firmware (`esp32-firmware/esp32_wifi_firmware/esp32_wifi_firmware.ino`)**:
   ```cpp
   const char* WIFI_SSID          = "Your_WiFi_SSID";
   const char* WIFI_PASSWORD      = "Your_WiFi_Password";
   const char* BACKEND_SERVER_URL = "http://192.168.1.100:5000/api/v1/iot/events";
   const char* DEVICE_ID          = "cc:7b:5c:fb:d9:18";
   const char* DEVICE_API_KEY     = "nk_sec_dev_2026_9e38e_7b4c91a0ef62";
   ```

---

## 4. Startup Sequence

### Step 1: Start MySQL Database
Ensure your local MySQL service is running (e.g., via XAMPP, WAMP, or Windows Services).

### Step 2: Build & Start Express Backend
In terminal 1:
```powershell
cd server
npm run build
npm start
```
*Expected Output:*
```
Server running on port 5000 (0.0.0.0) in development mode.
MySQL Database connected successfully.
Database migrations completed successfully.
```

### Step 3: Start React Native Mobile App
In terminal 2:
```powershell
npx expo start -c
```
- Open **Expo Go** on your physical phone (connected to the same Wi-Fi) and scan the QR code.
- Log into your account. The device `cc:7b:5c:fb:d9:18` is already paired to your account.

### Step 4: Flash & Power ESP32 Wearable
1. Open `esp32-firmware/esp32_wifi_firmware/esp32_wifi_firmware.ino` in Arduino IDE.
2. Select your board (**DOIT ESP32 DEVKIT V1**) and COM Port.
3. Click **Upload**.
4. Open the **Serial Monitor** at **115200 baud**.
5. The ESP32 prints `[Wi-Fi] >>> SUCCESS: Connected to Wi-Fi! <<<` and shows its local IP.

---

## 5. End-to-End Testing Procedures

### TEST 1: Automated Integration Test Script
Run the automated integration test script:
```powershell
node scripts/test-iot-integration.js
```
*Expected Output:*
```
[TEST 1] Testing Backend Health Check... -> Health Status: 200
[TEST 2] Testing Device Authentication Security... -> Status: 401 (Expected 401)
[TEST 3] Ingesting Minimal Wi-Fi BUTTON_SOS Event... -> Status: 200 -> Message: Event processed successfully.
[TEST 4] Testing Safe Retry / Duplicate Ingest... -> Status: 200 -> isDuplicate: true
```

### TEST 2: Physical Hardware Button SOS
1. Ensure the mobile app is open on your phone.
2. Press the physical push button on **GPIO 4** of the ESP32 **3 times within 1.8 seconds**.
3. **Hardware Result**:
   - ESP32 Serial Monitor prints `[SOS TRIGGERED] 🚨 Physical button pressed 3 times!`
   - Sends `POST /api/v1/iot/events` with minimal JSON payload.
   - ESP32 prints `[SUCCESS] >>> 🚨 SOS ALERT DELIVERED TO BACKEND! <<<`.
4. **Backend Result**:
   - Event stored in `iot_events`.
   - Record created in `sos_logs`.
   - Emergency notification created in `notifications`.
5. **Mobile App Result**:
   - Within 3 seconds, the phone screen displays the **🚨 Hardware SOS Triggered** modal.
   - Vibration/Haptics trigger.
   - 10-second emergency countdown begins with 1-tap call to emergency contacts or "I Am Safe" dismiss.

### TEST 3: Offline / Wi-Fi Disconnect Resilience
1. Turn off your Wi-Fi router / hotspot temporarily.
2. Press the SOS button on the ESP32.
3. ESP32 notices Wi-Fi is down and prints `[RETRY QUEUE] SOS event queued for automatic background retry.`
4. Turn the Wi-Fi back on.
5. ESP32 auto-reconnects and dispatches the queued event with the original `eventId`.
6. Backend processes it idempotently without duplicate alert records.

