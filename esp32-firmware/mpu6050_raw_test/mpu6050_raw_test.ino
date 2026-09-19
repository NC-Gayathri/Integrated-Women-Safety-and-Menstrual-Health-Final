/**
 * =========================================================================================
 * TEMPORARY STANDALONE MPU6050 RAW REGISTER & MOVEMENT TEST
 * =========================================================================================
 * Hardware Configuration:
 *   - Microcontroller : ESP32 DevKit V1
 *   - I2C SDA         : GPIO 21
 *   - I2C SCL         : GPIO 22
 *   - I2C Clock       : 100 kHz
 *   - MPU6050 Address : 0x68
 * =========================================================================================
 */

#include <Wire.h>
#include <math.h>

#define I2C_SDA 21
#define I2C_SCL 22
#define I2C_FREQ 100000
#define MPU6050_ADDR 0x68

#define REG_ACCEL_XOUT_H 0x3B
#define REG_PWR_MGMT_1   0x6B
#define REG_WHO_AM_I     0x75

bool sensorReady = false;
uint8_t activeAddr = 0x68;

void recoverBus() {
  Wire.end();
  delay(20);
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_FREQ);
  Wire.setTimeOut(100);
}

bool readRawBlock(uint8_t reg, uint8_t *buffer, size_t length) {
  Wire.beginTransmission(activeAddr);
  Wire.write(reg);
  byte err = Wire.endTransmission(false);
  if (err != 0) {
    recoverBus();
    return false;
  }

  size_t bytesRead = Wire.requestFrom((int)activeAddr, (int)length, (int)true);
  if (bytesRead != length) {
    recoverBus();
    return false;
  }

  for (size_t i = 0; i < length; i++) {
    buffer[i] = Wire.read();
  }
  return true;
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("     MPU6050 RAW REGISTER & MOVEMENT DIAGNOSTIC TEST   ");
  Serial.printf("  Hardware  : ESP32 | SDA: GPIO %d | SCL: GPIO %d\n", I2C_SDA, I2C_SCL);
  Serial.printf("  I2C Clock : 100 kHz | Target Address: 0x%02X\n", MPU6050_ADDR);
  Serial.println("=======================================================");

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_FREQ);
  Wire.setTimeOut(100);

  // 1. Probe addresses 0x68 and 0x69 (MPU6050 with AD0 LOW or HIGH)
  uint8_t targetAddr = 0;
  Wire.beginTransmission(0x68);
  if (Wire.endTransmission() == 0) {
    targetAddr = 0x68;
    Serial.println("[PROBE] MPU6050 responded at address 0x68 (AD0 = GND/LOW).");
  } else {
    Wire.beginTransmission(0x69);
    if (Wire.endTransmission() == 0) {
      targetAddr = 0x69;
      Serial.println("[PROBE] MPU6050 responded at address 0x69 (AD0 = 3.3V/HIGH).");
    } else {
      Serial.println("[PROBE] Neither 0x68 nor 0x69 responded! Scanning bus for any active device...");
      int foundCount = 0;
      for (uint8_t a = 1; a < 127; a++) {
        Wire.beginTransmission(a);
        if (Wire.endTransmission() == 0) {
          Serial.printf("  -> Found device at 0x%02X\n", a);
          foundCount++;
        }
      }
      if (foundCount == 0) {
        Serial.println("  -> [BUS ERROR] Zero devices responded. Check VCC, GND, SDA (21), SCL (22) jumper wires!");
      }
    }
  }

  if (targetAddr == 0) {
    targetAddr = MPU6050_ADDR; // Default fallback to 0x68
  }
  activeAddr = targetAddr;

  // 2. Read WHO_AM_I register (0x75)
  uint8_t whoAmI = 0;
  Wire.beginTransmission(targetAddr);
  Wire.write(REG_WHO_AM_I);
  if (Wire.endTransmission(false) == 0 && Wire.requestFrom((int)targetAddr, 1) == 1) {
    whoAmI = Wire.read();
    Serial.printf("[WHO_AM_I] Register 0x75 = 0x%02X\n", whoAmI);
    if (whoAmI == 0x68 || whoAmI == 0x70 || whoAmI == 0x72 || whoAmI == 0x98) {
      Serial.println("[WHO_AM_I] Confirmed valid MPU6000/6050/6500 series device!");
    } else {
      Serial.printf("[WHO_AM_I] Device returned 0x%02X (expected 0x68).\n", whoAmI);
    }
  } else {
    Serial.println("[WHO_AM_I] Error: Failed to read register 0x75.");
  }

  // 3. Wake up MPU6050: write 0x00 to PWR_MGMT_1 (0x6B)
  Wire.beginTransmission(targetAddr);
  Wire.write(REG_PWR_MGMT_1);
  Wire.write(0x00);
  if (Wire.endTransmission() == 0) {
    Serial.printf("[PWR_MGMT] Wrote 0x00 to register 0x6B at 0x%02X (MPU6050 awakened).\n", targetAddr);
    sensorReady = true;
  } else {
    Serial.printf("[PWR_MGMT] Error: Failed to write 0x00 to register 0x6B at 0x%02X.\n", targetAddr);
  }

  Serial.println("=======================================================");
  Serial.println("Starting continuous 14-byte raw sensor reads (every 1s)...");
  Serial.println("Test: Keep still, rotate, tilt 90 deg, turn upside down.");
  Serial.println("=======================================================\n");
}

void loop() {
  uint8_t raw[14];

  if (!readRawBlock(REG_ACCEL_XOUT_H, raw, 14)) {
    Serial.println("[ERROR] Failed to read 14-byte block from 0x3B. Retrying in 1s...");
    delay(1000);
    return;
  }

  // 1. Print all 14 raw bytes in hexadecimal
  Serial.print("RAW: ");
  for (int i = 0; i < 14; i++) {
    Serial.printf("%02X ", raw[i]);
  }
  Serial.println();

  // 2. Decode raw 16-bit signed integers (Big-Endian)
  int16_t rawAx   = (int16_t)((raw[0]  << 8) | raw[1]);
  int16_t rawAy   = (int16_t)((raw[2]  << 8) | raw[3]);
  int16_t rawAz   = (int16_t)((raw[4]  << 8) | raw[5]);
  int16_t rawTemp = (int16_t)((raw[6]  << 8) | raw[7]);
  int16_t rawGx   = (int16_t)((raw[8]  << 8) | raw[9]);
  int16_t rawGy   = (int16_t)((raw[10] << 8) | raw[11]);
  int16_t rawGz   = (int16_t)((raw[12] << 8) | raw[13]);

  // 3. Convert to physical units:
  // Default range +-2g: 16384 LSB/g
  float ax = rawAx / 16384.0f;
  float ay = rawAy / 16384.0f;
  float az = rawAz / 16384.0f;
  float mag = sqrt(ax * ax + ay * ay + az * az);

  // MPU6050 datasheet temperature formula: (TEMP_OUT / 340.0) + 36.53 °C
  float tempC = (rawTemp / 340.0f) + 36.53f;

  // Default range +-250 deg/s: 131.0 LSB/(deg/s)
  float gx = rawGx / 131.0f;
  float gy = rawGy / 131.0f;
  float gz = rawGz / 131.0f;

  // 4. Print raw integers
  Serial.printf("  [RAW INT]   Ax: %6d | Ay: %6d | Az: %6d | Temp: %5d | Gx: %6d | Gy: %6d | Gz: %6d\n",
                rawAx, rawAy, rawAz, rawTemp, rawGx, rawGy, rawGz);

  // 5. Print converted units
  Serial.printf("  [ACCEL]     X: %+6.2fg  | Y: %+6.2fg  | Z: %+6.2fg  | MAG: %5.2fg\n", ax, ay, az, mag);
  Serial.printf("  [GYRO]      X: %+7.1f dps | Y: %+7.1f dps | Z: %+7.1f dps\n", gx, gy, gz);
  Serial.printf("  [TEMP]      %5.1f °C\n", tempC);
  Serial.println("--------------------------------------------------------------------------------");

  delay(1000);
}
