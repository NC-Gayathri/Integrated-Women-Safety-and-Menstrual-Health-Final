/**
 * =========================================================================================
 * NAARI KAVACH - MAX30100 BLE DIAGNOSTIC FIRMWARE
 * =========================================================================================
 * Hardware Configuration:
 *   - Microcontroller : ESP32 DevKit V1
 *   - Advertised Name : NAARI_KAVACH
 *   - SOS Button      : GPIO 4 (INPUT_PULLUP)
 *   - MAX30100 VIN    : 3.3V
 *   - MAX30100 GND    : GND
 *   - MAX30100 SDA    : GPIO 19 (INPUT_PULLUP)
 *   - MAX30100 SCL    : GPIO 18 (INPUT_PULLUP)
 *   - INT, IRD, RD    : Disconnected
 *   - Target Address  : 0x57
 *   - I2C Clock       : 100 kHz (100000 Hz)
 *   - I2C Timeout     : 1000 ms
 *
 * Networking:
 *   - Wi-Fi           : DISABLED (No WiFi.h / HTTPClient)
 *   - BLE             : ACTIVE (GATT Server + NOTIFY)
 * =========================================================================================
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>

// BLE GATT Configuration
#define DEVICE_NAME         "NAARI_KAVACH"
#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "87654321-4321-4321-4321-ba0987654321"

// Hardware Pin Definitions
#define PIN_BUTTON 4
#define I2C_SDA    19
#define I2C_SCL    18
#define I2C_CLOCK  100000
#define I2C_TIMEOUT_MS 1000
#define MAX30100_ADDR 0x57
#define TOTAL_PROBES 10

BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
  }
};

void sendBleNotification(const String& message) {
  if (pTxCharacteristic != NULL) {
    pTxCharacteristic->setValue(message.c_str());
    pTxCharacteristic->notify();
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  delay(1000);

  // Configure SOS Button
  pinMode(PIN_BUTTON, INPUT_PULLUP);

  // Print Header
  Serial.println("\n==============================================");
  Serial.println("=== NAARI KAVACH BLE + MAX30100 DIAGNOSTIC ===");
  Serial.println("==============================================");
  Serial.println("Wi-Fi: DISABLED");
  Serial.println("BLE: ACTIVE");
  Serial.printf("BLE Name: %s\n", DEVICE_NAME);
  Serial.printf("SDA: GPIO %d\n", I2C_SDA);
  Serial.printf("SCL: GPIO %d\n", I2C_SCL);
  Serial.printf("MAX30100 Address: 0x%02X\n", MAX30100_ADDR);
  Serial.println("----------------------------------------------");

  // 1. Initialize BLE GATT Server
  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("BLE advertising started.");

  // Allow BLE advertising to settle
  delay(1000);

  // 2. Initialize I2C Bus on GPIO 19 & GPIO 18
  pinMode(I2C_SDA, INPUT_PULLUP);
  pinMode(I2C_SCL, INPUT_PULLUP);
  delay(10);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_CLOCK);
  Wire.setTimeOut(I2C_TIMEOUT_MS);

  Serial.println("MAX30100 diagnostic started.\n");

  // 3. Perform 10 Consecutive Probes to 0x57
  int ackCount = 0;
  int nackCount = 0;

  for (int i = 1; i <= TOTAL_PROBES; i++) {
    Wire.beginTransmission(MAX30100_ADDR);
    byte err = Wire.endTransmission();

    String probeResultMsg = "";

    if (err == 0) {
      ackCount++;
      Serial.printf("MAX30100 PROBE %d: ACK\n", i);
      probeResultMsg = "MAX30100 PROBE " + String(i) + ": ACK";
    } else {
      nackCount++;
      Serial.printf("MAX30100 PROBE %d: NACK ERROR %d\n", i, err);
      probeResultMsg = "MAX30100 PROBE " + String(i) + ": NACK ERROR " + String(err);
    }

    // Send BLE notification for each probe
    sendBleNotification(probeResultMsg);

    if (i < TOTAL_PROBES) {
      delay(300);
    }
  }

  // 4. Summary Output
  Serial.println("\n----------------------------------------------");
  Serial.println("DIAGNOSTIC SUMMARY:");
  Serial.printf("ACK count: %d/%d\n", ackCount, TOTAL_PROBES);
  Serial.printf("NACK count: %d/%d\n", nackCount, TOTAL_PROBES);
  Serial.println("----------------------------------------------");

  // Send final BLE notification with summary
  String summaryMsg = "MAX30100 SUMMARY: ACK " + String(ackCount) + "/" + String(TOTAL_PROBES) + 
                      ", NACK " + String(nackCount) + "/" + String(TOTAL_PROBES);
  sendBleNotification(summaryMsg);

  Serial.println("Diagnostic sequence completed. BLE advertising remains active.");
}

void loop() {
  // Disconnection handling for BLE re-advertising
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  delay(1000);
}
