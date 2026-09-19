/**
 * =========================================================================================
 * STANDALONE MAX30100 / MAX30102 I2C REGISTER IDENTIFICATION
 * =========================================================================================
 * Hardware Configuration:
 *   - Microcontroller : ESP32 DevKit V1
 *   - SDA Pin         : GPIO 21 (Configured as INPUT_PULLUP)
 *   - SCL Pin         : GPIO 22 (Configured as INPUT_PULLUP)
 *   - I2C Clock       : 10 kHz
 *   - Target Address  : 0x57
 *
 * Targeted Registers:
 *   - 0xFF : PART_ID
 *   - 0xFE : REVISION_ID
 *   - 0x00 : INT_STATUS_1
 *   - 0x06 : MODE_CONFIG
 * =========================================================================================
 */

#include <Wire.h>

#define I2C_SDA 21
#define I2C_SCL 22
#define I2C_CLOCK 10000
#define MAX3010X_ADDR 0x57

#define REG_INT_STATUS_1 0x00
#define REG_MODE_CONFIG  0x06
#define REG_REVISION_ID  0xFE
#define REG_PART_ID      0xFF

int checkCount = 0;

bool readRegister(uint8_t reg, uint8_t &val, String &errMsg) {
  Wire.beginTransmission(MAX3010X_ADDR);
  Wire.write(reg);
  byte err = Wire.endTransmission(false);
  
  if (err != 0) {
    // Fallback: Try with STOP bit before restart
    Wire.beginTransmission(MAX3010X_ADDR);
    Wire.write(reg);
    err = Wire.endTransmission(true);
    if (err != 0) {
      errMsg = "I2C TX Error code " + String(err);
      return false;
    }
  }

  uint8_t count = Wire.requestFrom((int)MAX3010X_ADDR, 1, (int)true);
  if (count != 1) {
    errMsg = "I2C RX Timeout (0 bytes received)";
    return false;
  }

  val = Wire.read();
  return true;
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("  MAX30100 / MAX30102 REGISTER IDENTIFICATION DIAGNOSTIC");
  Serial.printf("  Hardware: ESP32 | SDA: GPIO %d | SCL: GPIO %d\n", I2C_SDA, I2C_SCL);
  Serial.printf("  I2C Clock: 10 kHz | Target Address: 0x%02X\n", MAX3010X_ADDR);
  Serial.println("  Pull-up Mode: GPIO 21 & 22 set to INPUT_PULLUP");
  Serial.println("=======================================================");

  // 1. Explicitly configure SDA and SCL as INPUT_PULLUP before initializing I2C
  pinMode(I2C_SDA, INPUT_PULLUP);
  pinMode(I2C_SCL, INPUT_PULLUP);
  delay(20);

  // 2. Initialize Wire
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_CLOCK);
  Wire.setTimeOut(100);
}

void loop() {
  checkCount++;
  Serial.printf("\n--- [Cycle #%d] Reading Registers from Address 0x%02X ---\n", checkCount, MAX3010X_ADDR);

  // 1. Probe Device Address 0x57
  Wire.beginTransmission(MAX3010X_ADDR);
  byte probeErr = Wire.endTransmission();
  if (probeErr != 0) {
    Serial.printf("[PROBE ERROR] Device at 0x%02X failed probe (error code: %d).\n", MAX3010X_ADDR, probeErr);
    Serial.println("  Possible causes: Wire contact loose or rail unpowered.");
    delay(2000);
    return;
  }
  Serial.printf("[PROBE] Address 0x%02X responded with ACK.\n", MAX3010X_ADDR);

  // 2. Read Registers
  uint8_t partId = 0, revId = 0, intStatus = 0, modeConfig = 0;
  String errPart = "", errRev = "", errInt = "", errMode = "";

  bool partOk = readRegister(REG_PART_ID, partId, errPart);
  bool revOk  = readRegister(REG_REVISION_ID, revId, errRev);
  bool intOk  = readRegister(REG_INT_STATUS_1, intStatus, errInt);
  bool modeOk = readRegister(REG_MODE_CONFIG, modeConfig, errMode);

  // 3. Print Register Table
  Serial.println("+-------------------+---------------+-----------------+-------------------------+");
  Serial.println("| Register Name     | Address (Hex) | Read Value(Hex) | Status / Error Details  |");
  Serial.println("+-------------------+---------------+-----------------+-------------------------+");

  if (partOk) {
    Serial.printf("| PART_ID           | 0x%02X          | 0x%02X            | SUCCESS                 |\n", REG_PART_ID, partId);
  } else {
    Serial.printf("| PART_ID           | 0x%02X          | --              | FAILED: %s |\n", REG_PART_ID, errPart.c_str());
  }

  if (revOk) {
    Serial.printf("| REVISION_ID       | 0x%02X          | 0x%02X            | SUCCESS                 |\n", REG_REVISION_ID, revId);
  } else {
    Serial.printf("| REVISION_ID       | 0x%02X          | --              | FAILED: %s |\n", REG_REVISION_ID, errRev.c_str());
  }

  if (intOk) {
    Serial.printf("| INT_STATUS_1      | 0x%02X          | 0x%02X            | SUCCESS                 |\n", REG_INT_STATUS_1, intStatus);
  } else {
    Serial.printf("| INT_STATUS_1      | 0x%02X          | --              | FAILED: %s |\n", REG_INT_STATUS_1, errInt.c_str());
  }

  if (modeOk) {
    Serial.printf("| MODE_CONFIG       | 0x%02X          | 0x%02X            | SUCCESS                 |\n", REG_MODE_CONFIG, modeConfig);
  } else {
    Serial.printf("| MODE_CONFIG       | 0x%02X          | --              | FAILED: %s |\n", REG_MODE_CONFIG, errMode.c_str());
  }
  Serial.println("+-------------------+---------------+-----------------+-------------------------+");

  // 4. Analysis
  Serial.println("ANALYSIS:");
  if (partOk) {
    if (partId == 0x15) {
      Serial.printf("  -> PART_ID 0x15 corresponds to MAX30102 (Revision: 0x%02X).\n", revId);
    } else if (partId == 0x11) {
      Serial.printf("  -> PART_ID 0x11 corresponds to MAX30100 (Revision: 0x%02X).\n", revId);
    } else {
      Serial.printf("  -> Unknown PART_ID value: 0x%02X (does not match 0x15 or 0x11).\n", partId);
    }
  } else {
    Serial.println("  -> Register reads unconfirmed due to bus error/timeout.");
  }
  Serial.println("-------------------------------------------------------------------------");

  delay(2000);
}
