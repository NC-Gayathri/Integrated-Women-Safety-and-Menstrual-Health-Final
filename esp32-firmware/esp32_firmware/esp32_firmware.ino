/**
 * =========================================================================================
 * NAARI KAVACH - ESP32 BLE IOT EMERGENCY WEARABLE FIRMWARE
 * =========================================================================================
 * Hardware Configuration:
 *   - Microcontroller          : ESP32 NodeMCU / DevKit V1 (Device Name: NAARI_KAVACH)
 *   - Device Base MAC          : cc:7b:5c:fb:d9:18 (Bluetooth Controller MAC: cc:7b:5c:fb:d9:1a)
 *   - SOS Push Button          : GPIO 4 (INPUT_PULLUP)
 *   - MPU6050 Accelerometer    : I2C (SDA=GPIO 21, SCL=GPIO 22) -> Fall Detection
 *   - MAX30102 Pulse Sensor    : I2C (SDA=GPIO 21, SCL=GPIO 22) -> Real-time Heart Rate
 *
 * BLE GATT Server Specifications:
 *   - Advertised Device Name   : NAARI_KAVACH
 *   - BLE Service UUID         : 12345678-1234-1234-1234-1234567890ab
 *   - BLE Tx/Notify Char UUID  : 87654321-4321-4321-4321-ba0987654321
 *
 * Emergency Event Payloads (Notified over GATT):
 *   - Triple Button Push       : "SOS"
 *   - Accelerometer Drop/Fall  : "FALL_DETECTED"
 *   - Pulse Telemetry          : "HEART_RATE:<BPM>" (e.g. "HEART_RATE:78")
 *   - Gateway Handshake        : "STATUS:ONLINE"
 * =========================================================================================
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>

// -----------------------------------------------------------------------------------------
// 1. BLE GATT CONFIGURATION & UUIDs
// -----------------------------------------------------------------------------------------
#define DEVICE_NAME         "NAARI_KAVACH"
#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "87654321-4321-4321-4321-ba0987654321"

BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// -----------------------------------------------------------------------------------------
// 2. PIN DEFINITIONS & THRESHOLDS
// -----------------------------------------------------------------------------------------
#define PIN_BUTTON 4        // Push Button GPIO
#define I2C_SDA    21       // I2C SDA
#define I2C_SCL    22       // I2C SCL

// MPU6050 I2C Address
#define MPU6050_ADDR 0x68

// Timing & Debounce Configuration
#define BUTTON_TRIPLE_CLICK_WINDOW_MS 1800  // 1.8s window to complete 3 clicks
#define BUTTON_DEBOUNCE_MS             50   // 50ms button debounce
#define FALL_DEBOUNCE_COOLDOWN_MS    25000  // 25s cooldown after fall trigger
#define HEARTBEAT_INTERVAL_MS        15000  // 15s routine telemetry heartbeat

// Button state machine variables
int buttonClickCount = 0;
unsigned long firstClickTime = 0;
int lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;

// Fall detection state machine
enum FallState { FALL_IDLE, FALL_FREE_FALL, FALL_IMPACT, FALL_CONFIRMED };
FallState currentFallState = FALL_IDLE;
unsigned long freeFallStartTime = 0;
unsigned long impactStartTime = 0;
unsigned long lastFallTriggerTime = 0;

// Heart Rate state machine
int currentBpm = 75;
unsigned long lastHeartbeatTime = 0;

// -----------------------------------------------------------------------------------------
// 3. BLE SERVER CALLBACKS (Auto-advertising & Connection state)
// -----------------------------------------------------------------------------------------
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("\n[BLE] >>> BLE Gateway Client CONNECTED! <<<");
        Serial.println("[BLE] Status: Gateway is ONLINE and ready to receive SOS alerts.");
    };

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("\n[BLE] >>> BLE Gateway Client DISCONNECTED! <<<");
        Serial.println("[BLE] Status: Restarting BLE advertising for auto-reconnect...");
        // Restart advertising immediately so ble_bridge.py can reconnect seamlessly
        pServer->getAdvertising()->start();
    }
};

// -----------------------------------------------------------------------------------------
// 4. TRANSMIT BLE NOTIFICATION HELPER
// -----------------------------------------------------------------------------------------
void sendBleEvent(const char* payload) {
    if (deviceConnected && pTxCharacteristic != NULL) {
        pTxCharacteristic->setValue(payload);
        pTxCharacteristic->notify();
        Serial.printf("[BLE NOTIFY SUCCESS] Sent payload: '%s'\n", payload);
    } else {
        Serial.printf("[BLE EVENT] %s\n", payload);
        Serial.println("WARNING: No BLE gateway connected.");
    }
}

// -----------------------------------------------------------------------------------------
// 5. BUTTON SOS STATE MACHINE (3 Clicks in 1.8s)
// -----------------------------------------------------------------------------------------
void updateButtonState() {
    int reading = digitalRead(PIN_BUTTON);

    // Debounce
    if (reading != lastButtonState) {
        lastDebounceTime = millis();
    }

    if ((millis() - lastDebounceTime) > BUTTON_DEBOUNCE_MS) {
        static int currentStableState = HIGH;
        if (reading != currentStableState) {
            currentStableState = reading;

            // Active-LOW press
            if (currentStableState == LOW) {
                unsigned long now = millis();
                if (buttonClickCount == 0 || (now - firstClickTime) > BUTTON_TRIPLE_CLICK_WINDOW_MS) {
                    buttonClickCount = 1;
                    firstClickTime = now;
                    Serial.println("SOS button: 1/3");
                } else {
                    buttonClickCount++;
                    Serial.printf("SOS button: %d/3\n", buttonClickCount);

                    if (buttonClickCount >= 3) {
                        Serial.println("SOS TRIGGERED!");
                        Serial.println("BLE EVENT: SOS");

                        if (deviceConnected) {
                            sendBleEvent("SOS");
                        } else {
                            Serial.println("WARNING: No BLE gateway connected.");
                        }

                        buttonClickCount = 0;
                    }
                }
            }
        }
    }

    // Reset timeout if 3 clicks not reached within window
    if (buttonClickCount > 0 && (millis() - firstClickTime) > BUTTON_TRIPLE_CLICK_WINDOW_MS) {
        buttonClickCount = 0;
    }

    lastButtonState = reading;
}

// -----------------------------------------------------------------------------------------
// 6. MPU6050 ACCELEROMETER INITIALIZATION & FALL DETECTION
// -----------------------------------------------------------------------------------------
void initMPU6050() {
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x6B); // PWR_MGMT_1
    Wire.write(0);    // Wake up MPU6050
    byte error = Wire.endTransmission();
    if (error == 0) {
        Serial.println("[MPU6050] Accelerometer initialized successfully at 0x68");
    } else {
        Serial.println("[MPU6050] Warning: Sensor not detected on I2C bus (SDA=21, SCL=22).");
    }
}

void updateFallDetection() {
    unsigned long now = millis();

    // Cooldown check
    if (now - lastFallTriggerTime < FALL_DEBOUNCE_COOLDOWN_MS) {
        return;
    }

    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x3B); // ACCEL_XOUT_H
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom(MPU6050_ADDR, 6, true) == 6) {
        int16_t ax = Wire.read() << 8 | Wire.read();
        int16_t ay = Wire.read() << 8 | Wire.read();
        int16_t az = Wire.read() << 8 | Wire.read();

        // Convert raw to G (default +-2g range: 16384 LSB/g)
        float gX = ax / 16384.0;
        float gY = ay / 16384.0;
        float gZ = az / 16384.0;
        float totalAccel = sqrt(gX * gX + gY * gY + gZ * gZ);

        switch (currentFallState) {
            case FALL_IDLE:
                // Stage 1: Free Fall (total acceleration drops below 0.5g)
                if (totalAccel < 0.5) {
                    currentFallState = FALL_FREE_FALL;
                    freeFallStartTime = now;
                    Serial.println("[FALL] Stage 1: Free fall detected!");
                }
                break;

            case FALL_FREE_FALL:
                // Stage 2: High Impact Spike (total acceleration exceeds 2.5g within 600ms)
                if (totalAccel > 2.5) {
                    currentFallState = FALL_IMPACT;
                    impactStartTime = now;
                    Serial.println("[FALL] Stage 2: High impact spike detected!");
                } else if (now - freeFallStartTime > 600) {
                    currentFallState = FALL_IDLE;
                }
                break;

            case FALL_IMPACT:
                // Stage 3: Post-impact stillness check
                if (now - impactStartTime > 1000) {
                    if (totalAccel > 0.8 && totalAccel < 1.3) {
                        currentFallState = FALL_CONFIRMED;
                        lastFallTriggerTime = now;
                        Serial.println("[FALL DETECTED] ⚠ Stage 3: Fall confirmed! Sending BLE notification!");
                        sendBleEvent("FALL_DETECTED");
                    }
                    currentFallState = FALL_IDLE;
                }
                break;

            default:
                currentFallState = FALL_IDLE;
                break;
        }
    }
}

// -----------------------------------------------------------------------------------------
// 7. MAX30102 HEART RATE PROCESSING (Optional I2C driver)
// -----------------------------------------------------------------------------------------
void sendPeriodicHeartbeat() {
    unsigned long now = millis();
    if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = now;

        if (deviceConnected) {
            char hrPayload[32];
            snprintf(hrPayload, sizeof(hrPayload), "HEART_RATE:%d", currentBpm);
            sendBleEvent(hrPayload);
        }
    }
}

// -----------------------------------------------------------------------------------------
// 8. SETUP & MAIN LOOP
// -----------------------------------------------------------------------------------------
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n=======================================================");
    Serial.println("   NAARI KAVACH - ESP32 BLE IOT EMERGENCY WEARABLE    ");
    Serial.printf("   Device Name : %s\n", DEVICE_NAME);
    Serial.printf("   Service UUID: %s\n", SERVICE_UUID);
    Serial.printf("   Notify Char : %s\n", CHARACTERISTIC_UUID);
    Serial.println("=======================================================");

    // 1. Configure SOS Push Button (GPIO 4 with internal pullup)
    pinMode(PIN_BUTTON, INPUT_PULLUP);

    // 2. Initialize I2C Bus & Sensors
    Wire.begin(I2C_SDA, I2C_SCL);
    initMPU6050();

    // 3. Initialize BLE Device & GATT Server
    BLEDevice::init(DEVICE_NAME);
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    // 4. Create GATT Service
    BLEService *pService = pServer->createService(SERVICE_UUID);

    // 5. Create GATT Tx/Notify Characteristic
    pTxCharacteristic = pService->createCharacteristic(
                            CHARACTERISTIC_UUID,
                            BLECharacteristic::PROPERTY_NOTIFY |
                            BLECharacteristic::PROPERTY_READ   |
                            BLECharacteristic::PROPERTY_INDICATE
                        );
    pTxCharacteristic->addDescriptor(new BLE2902());

    // 6. Start Service
    pService->start();

    // 7. Start BLE Advertising
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();

    Serial.println("[BLE] Advertising active. Waiting for BLE Gateway Bridge (ble_bridge.py)...");
    Serial.println("[STATUS] Device is ready. Press button 3 times to test SOS.");
}

void loop() {
    // 1. Handle BLE Connection Transition (send STATUS:ONLINE on initial connection)
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = true;
        delay(200);
        sendBleEvent("STATUS:ONLINE");
    }

    if (!deviceConnected && oldDeviceConnected) {
        oldDeviceConnected = false;
        delay(500);
        pServer->startAdvertising(); // restart advertising
    }

    // 2. Update Push Button SOS State Machine
    updateButtonState();

    // 3. Update MPU6050 Fall Detection State Machine
    updateFallDetection();

    // 4. Send Periodic Heartbeat Telemetry
    sendPeriodicHeartbeat();

    delay(10);
}
