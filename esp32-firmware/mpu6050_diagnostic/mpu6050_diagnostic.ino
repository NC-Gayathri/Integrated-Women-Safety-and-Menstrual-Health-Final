/**
 * =========================================================================================
 * TEMPORARY STANDALONE MPU6050 HARDWARE DIAGNOSTIC SKETCH
 * =========================================================================================
 * Hardware Configuration:
 *   - Board : ESP32 DevKit V1
 *   - SDA   : GPIO 21
 *   - SCL   : GPIO 22
 *   - I2C   : 0x68 (MPU6050 default address)
 * =========================================================================================
 */

#include <Wire.h>
#include <math.h>

#define I2C_SDA 21
#define I2C_SCL 22
#define MPU6050_ADDR 0x68

#define REG_WHO_AM_I   0x75
#define REG_PWR_MGMT_1 0x6B
#define REG_ACCEL_XOUT 0x3B

bool mpuInitialized = false;

// Helper to read single 8-bit register
bool readRegister8(uint8_t devAddr, uint8_t regAddr, uint8_t &val) {
  Wire.beginTransmission(devAddr);
  Wire.write(regAddr);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }
  if (Wire.requestFrom((int)devAddr, 1) != 1) {
    return false;
  }
  val = Wire.read();
  return true;
}

// Helper to write single 8-bit register
bool writeRegister8(uint8_t devAddr, uint8_t regAddr, uint8_t val) {
  Wire.beginTransmission(devAddr);
  Wire.write(regAddr);
  Wire.write(val);
  return (Wire.endTransmission() == 0);
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("       ESP32 MPU6050 HARDWARE DIAGNOSTIC TEST         ");
  Serial.printf("  SDA Pin: GPIO %d | SCL Pin: GPIO %d\n", I2C_SDA, I2C_SCL);
  Serial.printf("  Target I2C Address: 0x%02X\n", MPU6050_ADDR);
  Serial.println("=======================================================");

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000); // 100 kHz standard I2C clock
  Wire.setTimeOut(50);   // 50ms timeout to prevent hardware FIFO locks

  // Step 1: Check if address responds
  Wire.beginTransmission(MPU6050_ADDR);
  byte error = Wire.endTransmission();

  if (error == 0) {
    Serial.println("[MPU6050] FOUND at 0x68");

    // Step 2: Read WHO_AM_I register (0x75)
    uint8_t whoAmI = 0;
    if (readRegister8(MPU6050_ADDR, REG_WHO_AM_I, whoAmI)) {
      Serial.printf("[MPU6050] WHO_AM_I = 0x%02X\n", whoAmI);
      if (whoAmI == 0x68 || whoAmI == 0x70 || whoAmI == 0x72 || whoAmI == 0x98) {
        Serial.println("[MPU6050] WHO_AM_I register matches valid MPU-6000/6050/6500 device.");
      } else {
        Serial.printf("[MPU6050] Note: WHO_AM_I returned 0x%02X (expected 0x68 for MPU6050).\n", whoAmI);
      }
    } else {
      Serial.println("[MPU6050] Warning: Failed to read WHO_AM_I register (0x75).");
    }

    // Step 3: Wake up MPU6050 (write 0x00 to PWR_MGMT_1 register 0x6B)
    if (writeRegister8(MPU6050_ADDR, REG_PWR_MGMT_1, 0x00)) {
      Serial.println("[MPU6050] Woke up sensor via PWR_MGMT_1 (0x6B = 0x00).");
      mpuInitialized = true;
      Serial.println("[MPU6050] Reading sensor data...");
    } else {
      Serial.println("[MPU6050] Error: Failed to write to PWR_MGMT_1 (0x6B). Sensor may be in sleep mode.");
    }
  } else {
    Serial.printf("[MPU6050] Error: Device did not respond at 0x68 (error code: %d).\n", error);
    Serial.println("[MPU6050] Please check VCC (3.3V/5V), GND, SDA (GPIO 21), and SCL (GPIO 22).");
  }
}

void loop() {
  if (!mpuInitialized) {
    // Retry probe every 2 seconds if initial probe failed
    Wire.beginTransmission(MPU6050_ADDR);
    if (Wire.endTransmission() == 0) {
      Serial.println("[MPU6050] Device detected on retry! Initializing...");
      uint8_t whoAmI = 0;
      if (readRegister8(MPU6050_ADDR, REG_WHO_AM_I, whoAmI)) {
        Serial.printf("[MPU6050] WHO_AM_I = 0x%02X\n", whoAmI);
      }
      if (writeRegister8(MPU6050_ADDR, REG_PWR_MGMT_1, 0x00)) {
        mpuInitialized = true;
        Serial.println("[MPU6050] Reading sensor data...");
      }
    } else {
      Serial.println("[MPU6050] Waiting for sensor connection at 0x68...");
    }
    delay(2000);
    return;
  }

  // Step 4: Read 14 bytes starting at REG_ACCEL_XOUT (0x3B)
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(REG_ACCEL_XOUT);
  byte txErr = Wire.endTransmission(false);
  if (txErr != 0) {
    Serial.printf("[MPU6050] Error: I2C write failed (code: %d). Recovering bus...\n", txErr);
    Wire.end();
    delay(50);
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setTimeOut(50);
    delay(500);
    return;
  }

  uint8_t count = Wire.requestFrom(MPU6050_ADDR, 14, true);
  if (count != 14) {
    Serial.printf("[MPU6050] Error: Expected 14 bytes, received %d. Recovering bus...\n", count);
    Wire.end();
    delay(50);
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setTimeOut(50);
    delay(500);
    return;
  }

  int16_t rawAx = (int16_t)(Wire.read() << 8 | Wire.read());
  int16_t rawAy = (int16_t)(Wire.read() << 8 | Wire.read());
  int16_t rawAz = (int16_t)(Wire.read() << 8 | Wire.read());
  int16_t rawTemp = (int16_t)(Wire.read() << 8 | Wire.read());
  int16_t rawGx = (int16_t)(Wire.read() << 8 | Wire.read());
  int16_t rawGy = (int16_t)(Wire.read() << 8 | Wire.read());
  int16_t rawGz = (int16_t)(Wire.read() << 8 | Wire.read());

  // Convert raw readings to physical units:
  // Default +-2g scale: 16384 LSB/g
  float ax = rawAx / 16384.0f;
  float ay = rawAy / 16384.0f;
  float az = rawAz / 16384.0f;

  // Default +-250 deg/s scale: 131.0 LSB/(deg/s)
  float gx = rawGx / 131.0f;
  float gy = rawGy / 131.0f;
  float gz = rawGz / 131.0f;

  // Calculate approximate total acceleration magnitude
  float accelMagnitude = sqrt(ax * ax + ay * ay + az * az);

  // Print formatted telemetry once every 500ms
  Serial.printf("[MPU6050] ACCEL: [X: %+6.2fg, Y: %+6.2fg, Z: %+6.2fg] | MAG: %5.2fg | GYRO: [X: %+7.1f, Y: %+7.1f, Z: %+7.1f dps]\n",
                ax, ay, az, accelMagnitude, gx, gy, gz);

  delay(500);
}
