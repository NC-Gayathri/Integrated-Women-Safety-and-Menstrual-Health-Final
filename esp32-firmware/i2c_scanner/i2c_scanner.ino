#include <Wire.h>

#define I2C_SDA 21
#define I2C_SCL 22

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("         ESP32 I2C HARDWARE DIAGNOSTIC SCANNER         ");
  Serial.printf("  SDA Pin: GPIO %d | SCL Pin: GPIO %d\n", I2C_SDA, I2C_SCL);
  Serial.println("  Scanning addresses 0x01 to 0x7F...");
  Serial.println("=======================================================");

  Wire.begin(I2C_SDA, I2C_SCL);
}

void loop() {
  byte error, address;
  int nDevices = 0;

  Serial.println("\n--- Starting I2C Bus Scan ---");

  for (address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();

    if (error == 0) {
      Serial.printf("[FOUND] I2C device detected at address 0x%02X", address);

      if (address == 0x57) {
        Serial.print("  <-- *** MAX30102 / MAX30100 Pulse Oximeter & Heart Rate Sensor ***");
      } else if (address == 0x68) {
        Serial.print("  <-- *** MPU6050 / MPU6500 Accelerometer & Gyroscope ***");
      } else if (address == 0x3C || address == 0x3D) {
        Serial.print("  <-- *** SSD1306 OLED Display ***");
      }

      Serial.println();
      nDevices++;
    } else if (error == 4) {
      Serial.printf("[ERROR] Unknown error at address 0x%02X\n", address);
    }
  }

  if (nDevices == 0) {
    Serial.println("[WARNING] No I2C devices found on SDA=21, SCL=22.");
    Serial.println("Check: 1. Sensor VCC/GND wiring (3.3V or 5V)");
    Serial.println("       2. SDA -> GPIO 21 and SCL -> GPIO 22 connections");
    Serial.println("       3. Sensor pull-up resistors or loose jumper wires");
  } else {
    Serial.printf("[SUMMARY] Scan complete. Found %d I2C device(s).\n", nDevices);
  }

  Serial.println("Waiting 3 seconds for next scan...\n");
  delay(3000);
}
