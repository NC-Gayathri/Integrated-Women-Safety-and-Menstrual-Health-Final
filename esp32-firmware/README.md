# ESP32 IoT Emergency SOS Wearable Firmware

This directory contains the production-grade Arduino C++ firmware for the **Naari Kavach** Wi-Fi IoT emergency safety wearable.

---

## 1. Directory Structure

- **`esp32_wifi_firmware/esp32_wifi_firmware.ino`**: **(Recommended)** Wi-Fi-based physical SOS button firmware that sends emergency alerts directly to the backend API (`POST /api/v1/iot/events`) over Wi-Fi with automatic reconnection and safe retry deduplication.
- **`esp32_firmware/esp32_firmware.ino`**: Legacy BLE GATT server firmware.

---

## 2. Hardware Wiring (Wi-Fi SOS Button)

| Component | Component Pin | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- | :--- |
| **Physical Push Button** | Terminal 1 | **GPIO 4** | Configured with internal pull-up (`INPUT_PULLUP`). |
| **Physical Push Button** | Terminal 2 | **GND** | Connects to GND when pressed. |
| **Built-in Status LED** | Internal | **GPIO 2** | Indicates Wi-Fi connection and SOS transmission. |

---

## 3. Configuration Before Flashing

Open `esp32_wifi_firmware/esp32_wifi_firmware.ino` in Arduino IDE and update the configuration:

```cpp
// 1. Wi-Fi Credentials (or Mobile Hotspot)
const char* WIFI_SSID     = "Your_WiFi_SSID";
const char* WIFI_PASSWORD = "Your_WiFi_Password";

// 2. Laptop Local LAN Backend URL (Port 5000)
// Replace with your laptop's IPv4 address from 'ipconfig' (e.g., "192.168.1.100")
const char* BACKEND_SERVER_URL = "http://192.168.1.100:5000/api/v1/iot/events";

// 3. Device Credentials (matches IOT_DEFAULT_DEVICE_API_KEY in server/.env)
const char* DEVICE_ID     = "cc:7b:5c:fb:d9:18";
const char* DEVICE_API_KEY= "nk_sec_dev_2026_9e38e_7b4c91a0ef62";
```

---

## 4. Flashing to ESP32

1. Connect the ESP32 to your computer via USB data cable.
2. In Arduino IDE:
   - Select **Tools > Board > ESP32 Arduino > DOIT ESP32 DEVKIT V1** (or your ESP32 board).
   - Select **Tools > Port** and choose your ESP32 COM port (e.g. `COM3`, `COM4`).
3. Click **Upload**.
4. Open the **Serial Monitor** at baud rate **115200** to view Wi-Fi connection logs and SOS transmission events.

---

## 5. Wi-Fi SOS Button Logic & Diagnostics

1. **Wi-Fi Connection & Auto-Reconnect**:
   - ESP32 connects to the configured Wi-Fi network and displays assigned IP and signal strength (RSSI).
   - If Wi-Fi link drops, the firmware automatically initiates reconnection every 5 seconds.
2. **Debounced SOS Button Detection**:
   - Monitors GPIO 4 with a 50ms hardware debounce.
   - Detects 3 quick button clicks within 1.8 seconds (prevents accidental pocket triggers). Can be set to 1 click if desired via `REQUIRED_CLICKS`.
3. **Direct HTTP POST Ingestion**:
   - Sends HTTP POST directly to `http://<LAN_IP>:5000/api/v1/iot/events`.
   - Minimal payload:
     ```json
     {
       "deviceId": "cc:7b:5c:fb:d9:18",
       "apiKey": "nk_sec_dev_2026_9e38e_7b4c91a0ef62",
       "eventId": "cc:7b:5c:fb:d9:18_BTN_1725000000_1",
       "eventType": "BUTTON_SOS"
     }
     ```
4. **Safe Retry & Idempotency**:
   - If the server is temporarily unreachable or the network drops, the event is saved in a retry queue with its original `eventId`.
   - Once reconnected, the event is sent with the exact same `eventId`, ensuring the backend deduplicates it without creating duplicate database records.
5. **Serial Monitor Diagnostics**:
   - Logs HTTP status codes: `200` (Success / Deduplicated), `401` (Unauthorized API Key), `403` (Unpaired Device), `404` (Unregistered Device), and network errors.

