/**
 * NAARI KAVACH - DUAL SENSOR BLE INTEGRATION TEST
 *
 * SAFE TEST FIRMWARE ONLY - production firmware is intentionally untouched.
 *
 * Hardware:
 *   ESP32 DOIT ESP32 DEVKIT V1
 *   SOS button: GPIO 4 -> GND, INPUT_PULLUP
 *   Built-in LED: GPIO 2
 *   I2C: SDA GPIO 21, SCL GPIO 22, 100 kHz
 *   GY-521 / MPU6050 or MPU6500: normally 0x68 (0x69 if AD0 is HIGH)
 *   MAX3010x optical sensor: 0x57
 *
 * Optical sensor identification:
 *   PART_ID 0x11 -> MAX30100
 *   PART_ID 0x15 -> MAX30102
 *
 * BLE contract (preserved from existing project):
 *   Name: NAARI_KAVACH
 *   Service UUID: 12345678-1234-1234-1234-1234567890ab
 *   Notify UUID:  87654321-4321-4321-4321-ba0987654321
 *
 * No Wi-Fi. No HTTP. No simulated vital values.
 *
 * IMPORTANT:
 * Heart-rate and SpO2 values are derived from real optical samples, but this
 * prototype is not a medical device and the simple ratio-of-ratios SpO2
 * estimate is not clinically calibrated.
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <math.h>

// -----------------------------------------------------------------------------
// BLE
// -----------------------------------------------------------------------------
#define DEVICE_NAME         "NAARI_KAVACH"
#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "87654321-4321-4321-4321-ba0987654321"
#define BLE_MTU             64

BLEServer* pServer = nullptr;
BLECharacteristic* pTxCharacteristic = nullptr;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// -----------------------------------------------------------------------------
// Hardware
// -----------------------------------------------------------------------------
#define PIN_BUTTON 4
#define PIN_LED    2

#define I2C_SDA 21
#define I2C_SCL 22
#define I2C_CLOCK_HZ 100000
#define I2C_TIMEOUT_MS 50
#define I2C_TRANSACTION_ATTEMPTS 2

#define MAX3010X_ADDR 0x57
#define MPU6050_ADDR_LOW  0x68
#define MPU6050_ADDR_HIGH 0x69

#define MPU_REG_ACCEL_XOUT_H 0x3B
#define MPU_REG_ACCEL_CONFIG 0x1C
#define MPU_REG_PWR_MGMT_1   0x6B
#define MPU_REG_WHO_AM_I     0x75
#define MPU6050_WHO_AM_I     0x68
#define MPU6500_WHO_AM_I     0x70
#define MPU_PWR_SLEEP_BIT    0x40
#define MPU_ACCEL_FS_MASK    0x18
#define MPU_ACCEL_FS_2G      0x00

// -----------------------------------------------------------------------------
// Timing
// -----------------------------------------------------------------------------
#define BUTTON_TRIPLE_CLICK_WINDOW_MS 1800
#define BUTTON_DEBOUNCE_MS 50
#define FALL_COOLDOWN_MS 25000
#define FALL_FREE_FALL_MIN_MS 80
#define FALL_FREE_FALL_MAX_MS 600
#define FALL_POST_IMPACT_TIMEOUT_MS 2000
#define FALL_STATIONARY_MIN_MS 600
#define MPU_SAMPLE_INTERVAL_MS 20
#define OPTICAL_RETRY_INTERVAL_MS 2000
#define OPTICAL_RESET_TIMEOUT_MS 150
#define OPTICAL_RESET_POLL_MS 5
#define MPU_RETRY_INTERVAL_MS 2000
#define VITALS_REPORT_INTERVAL_MS 1000
#define OPTICAL_SAMPLE_PERIOD_MS 10 // Both verified configurations: 100 samples/s.
#define OPTICAL_SAMPLE_MAX_AGE_MS 500
#define OPTICAL_SETTLE_SAMPLES 100 // One second of samples at the verified 100 Hz.
// Numeric vitals need a stronger optical level than the permissive contact gate.
// These prototype floors remain below the existing validated low-amplitude fixture
// (RED ~= 10k, IR ~= 20k) while rejecting the physical 3-5k weak-contact region.
#define OPTICAL_VITAL_MIN_RED_DC 5000.0
#define OPTICAL_VITAL_MIN_IR_DC 10000.0
#define SENSOR_STATUS_INTERVAL_MS 5000
#define LED_PULSE_MS 180

// -----------------------------------------------------------------------------
// Button state - intentionally preserves the existing 3-click behavior.
// -----------------------------------------------------------------------------
int buttonClickCount = 0;
unsigned long firstClickTime = 0;
int lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;

// -----------------------------------------------------------------------------
// LED state
// -----------------------------------------------------------------------------
unsigned long ledOffAt = 0;

void pulseLed(unsigned long durationMs = LED_PULSE_MS) {
  digitalWrite(PIN_LED, HIGH);
  ledOffAt = millis() + durationMs;
}

void updateLed() {
  if (ledOffAt != 0 && (long)(millis() - ledOffAt) >= 0) {
    digitalWrite(PIN_LED, LOW);
    ledOffAt = 0;
  }
}

// -----------------------------------------------------------------------------
// BLE helpers
// -----------------------------------------------------------------------------
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    deviceConnected = true;
    Serial.println("[BLE] Client connected.");
  }

  void onDisconnect(BLEServer* server) override {
    deviceConnected = false;
    Serial.println("[BLE] Client disconnected; advertising restarted.");
    server->getAdvertising()->start();
  }
};

void sendBleEvent(const String& payload) {
  if (deviceConnected && pTxCharacteristic != nullptr) {
    pTxCharacteristic->setValue(payload.c_str());
    pTxCharacteristic->notify();
  }
  Serial.printf("[EVENT] %s\n", payload.c_str());
}

// -----------------------------------------------------------------------------
// Bounded I2C helpers.
// -----------------------------------------------------------------------------
// Explicit declaration also keeps SOS servicing available inside I2C helpers.
void updateButtonState();

bool probeAddress(uint8_t addr) {
  for (uint8_t attempt = 0; attempt < I2C_TRANSACTION_ATTEMPTS; ++attempt) {
    updateButtonState();
    Wire.beginTransmission(addr);
    uint8_t error = Wire.endTransmission(true);
    updateButtonState();
    if (error == 0) return true;
    delay(1);
  }
  return false;
}

bool readRegister8(uint8_t addr, uint8_t reg, uint8_t& value) {
  for (uint8_t attempt = 0; attempt < I2C_TRANSACTION_ATTEMPTS; ++attempt) {
    updateButtonState();
    Wire.beginTransmission(addr);
    Wire.write(reg);

    // ESP32 defers the repeated-start transaction until requestFrom(). A zero
    // return from endTransmission(false) alone does NOT prove the read worked.
    // Retry the entire failed read with a STOP, including deferred RX failures.
    uint8_t txError = attempt == 0 ? Wire.endTransmission(false) :
                                    Wire.endTransmission(true);
    updateButtonState();
    if (txError == 0) {
      int received = Wire.requestFrom((int)addr, 1, (int)true);
      updateButtonState();
      if (received == 1) {
        value = Wire.read();
        return true;
      }
      while (Wire.available()) (void)Wire.read();
    }
    delay(1);
  }
  Serial.printf("[I2C] Read failed addr=0x%02X reg=0x%02X.\n", addr, reg);
  return false;
}

bool writeRegister8(uint8_t addr, uint8_t reg, uint8_t value) {
  uint8_t error = 0;
  for (uint8_t attempt = 0; attempt < I2C_TRANSACTION_ATTEMPTS; ++attempt) {
    updateButtonState();
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.write(value);
    error = Wire.endTransmission(true);
    updateButtonState();
    if (error == 0) return true;
    delay(1);
  }
  Serial.printf("[I2C] Write failed addr=0x%02X reg=0x%02X value=0x%02X error=%u.\n",
                addr, reg, value, error);
  return false;
}

bool readBytes(uint8_t addr, uint8_t reg, uint8_t* buffer, uint8_t length,
               bool retrySafe = true) {
  const uint8_t attempts = retrySafe ? I2C_TRANSACTION_ATTEMPTS : 1;
  for (uint8_t attempt = 0; attempt < attempts; ++attempt) {
    updateButtonState();
    Wire.beginTransmission(addr);
    Wire.write(reg);
    uint8_t txError = retrySafe && attempt == 0 ? Wire.endTransmission(false) :
                                    Wire.endTransmission(true);
    updateButtonState();
    if (txError == 0) {
      int received = Wire.requestFrom((int)addr, (int)length, (int)true);
      updateButtonState();
      if (received == length) {
        for (uint8_t i = 0; i < length; ++i) buffer[i] = Wire.read();
        return true;
      }
      while (Wire.available()) (void)Wire.read();
      // A partial FIFO read can advance the hardware pointer. Discard it;
      // never turn the remainder plus a retry into an apparently valid sample.
      if (!retrySafe || received > 0) return false;
    }
    delay(1);
  }
  return false;
}

// -----------------------------------------------------------------------------
// SOS button
// -----------------------------------------------------------------------------
void updateButtonState() {
  int reading = digitalRead(PIN_BUTTON);

  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  // Accept the 50 ms boundary too when I2C sampling lands exactly on it.
  if ((millis() - lastDebounceTime) >= BUTTON_DEBOUNCE_MS) {
    static int currentStableState = HIGH;

    if (reading != currentStableState) {
      currentStableState = reading;

      if (currentStableState == LOW) {
        unsigned long now = millis();

        if (buttonClickCount == 0 ||
            (now - firstClickTime) > BUTTON_TRIPLE_CLICK_WINDOW_MS) {
          buttonClickCount = 1;
          firstClickTime = now;
          Serial.println("[SOS] Button 1/3");
        } else {
          buttonClickCount++;
          Serial.printf("[SOS] Button %d/3\n", buttonClickCount);

          if (buttonClickCount >= 3) {
            Serial.println("[SOS] TRIGGERED");
            sendBleEvent("SOS");
            pulseLed(500);
            buttonClickCount = 0;
          }
        }
      }
    }
  }

  if (buttonClickCount > 0 &&
      (millis() - firstClickTime) > BUTTON_TRIPLE_CLICK_WINDOW_MS) {
    buttonClickCount = 0;
  }

  lastButtonState = reading;
}

// -----------------------------------------------------------------------------
// MPU6050 / MPU6500 motion sensor
// -----------------------------------------------------------------------------
uint8_t mpuAddr = 0;
uint8_t mpuWhoAmI = 0;
bool mpuReady = false;
unsigned long lastMpuSample = 0;
unsigned long lastMpuRetry = 0;
uint8_t mpuConsecutiveErrors = 0;

const char* mpuChipNameForIdentity(uint8_t whoAmI) {
  if (whoAmI == MPU6050_WHO_AM_I) return "MPU6050";
  if (whoAmI == MPU6500_WHO_AM_I) return "MPU6500";
  return "MPU";
}

const char* mpuChipName() {
  return mpuChipNameForIdentity(mpuWhoAmI);
}

bool isSupportedMpuIdentity(uint8_t whoAmI) {
  return whoAmI == MPU6050_WHO_AM_I || whoAmI == MPU6500_WHO_AM_I;
}

enum FallState {
  FALL_IDLE,
  FALL_FREE_FALL,
  FALL_IMPACT
};

FallState fallState = FALL_IDLE;
unsigned long freeFallStartedAt = 0;
unsigned long impactStartedAt = 0;
unsigned long stationaryStartedAt = 0;
unsigned long lastFallTriggeredAt = 0;

bool initializeMpuAt(uint8_t addr) {
  // READY is fail-closed: every attempt must re-prove identity and configuration.
  mpuReady = false;
  mpuAddr = 0;
  mpuWhoAmI = 0;

  if (!probeAddress(addr)) return false;

  uint8_t whoAmI = 0;
  if (!readRegister8(addr, MPU_REG_WHO_AM_I, whoAmI)) return false;

  if (!isSupportedMpuIdentity(whoAmI)) {
    Serial.printf("[MPU] Address 0x%02X responded but unsupported WHO_AM_I=0x%02X.\n",
                  addr, whoAmI);
    return false;
  }

  const char* chipName = mpuChipNameForIdentity(whoAmI);

  // Wake the device, then prove that the SLEEP bit actually cleared.
  if (!writeRegister8(addr, MPU_REG_PWR_MGMT_1, 0x00)) {
    Serial.printf("[MPU] %s wake write failed at 0x%02X.\n", chipName, addr);
    return false;
  }

  uint8_t powerManagement = 0xFF;
  if (!readRegister8(addr, MPU_REG_PWR_MGMT_1, powerManagement) ||
      (powerManagement & MPU_PWR_SLEEP_BIT) != 0) {
    Serial.printf("[MPU] %s wake read-back failed at 0x%02X (PWR_MGMT_1=0x%02X).\n",
                  chipName, addr, powerManagement);
    return false;
  }

  // Fall detection converts raw acceleration using 16384 LSB/g, which is valid
  // for the +/-2 g setting. Force that range and verify it before READY.
  if (!writeRegister8(addr, MPU_REG_ACCEL_CONFIG, MPU_ACCEL_FS_2G)) {
    Serial.printf("[MPU] %s accelerometer configuration write failed at 0x%02X.\n",
                  chipName, addr);
    return false;
  }

  uint8_t accelConfig = 0xFF;
  if (!readRegister8(addr, MPU_REG_ACCEL_CONFIG, accelConfig) ||
      (accelConfig & MPU_ACCEL_FS_MASK) != MPU_ACCEL_FS_2G) {
    Serial.printf("[MPU] %s accelerometer read-back failed at 0x%02X (ACCEL_CONFIG=0x%02X).\n",
                  chipName, addr, accelConfig);
    return false;
  }

  mpuAddr = addr;
  mpuWhoAmI = whoAmI;
  mpuReady = true;
  mpuConsecutiveErrors = 0;
  fallState = FALL_IDLE;
  stationaryStartedAt = 0;

  Serial.printf("[MPU] %s ready at 0x%02X (WHO_AM_I=0x%02X, accel=+/-2g).\n",
                chipName, addr, whoAmI);
  sendBleEvent(String("SENSOR:") + chipName + ":READY");
  return true;
}

void tryInitializeMpu() {
  if (initializeMpuAt(MPU6050_ADDR_LOW)) return;
  if (initializeMpuAt(MPU6050_ADDR_HIGH)) return;

  mpuReady = false;
  mpuAddr = 0;
  mpuWhoAmI = 0;
  Serial.println("[MPU] Supported MPU6050/MPU6500 not detected at 0x68 or 0x69.");
}

void updateMpuFallDetection() {
  unsigned long now = millis();

  if (!mpuReady) {
    if (now - lastMpuRetry >= MPU_RETRY_INTERVAL_MS) {
      tryInitializeMpu();
      lastMpuRetry = millis(); // Give a failed attempt a full quiet interval.
    }
    return;
  }

  if (now - lastMpuSample < MPU_SAMPLE_INTERVAL_MS) return;
  lastMpuSample = now;

  uint8_t raw[6];
  if (!readBytes(mpuAddr, MPU_REG_ACCEL_XOUT_H, raw, sizeof(raw))) {
    // Missing motion samples break the free-fall/impact/stationary sequence.
    // Never finish a pre-fault sequence with post-recovery acceleration.
    fallState = FALL_IDLE;
    stationaryStartedAt = 0;
    if (++mpuConsecutiveErrors >= 3) {
      const char* failedChip = mpuChipName();
      mpuReady = false;
      mpuConsecutiveErrors = 0;
      lastMpuRetry = millis();
      Serial.printf("[MPU] %s I2C failures; sensor marked unavailable.\n", failedChip);
      sendBleEvent(String("SENSOR:") + failedChip + ":I2C_ERROR");
    }
    return;
  }

  mpuConsecutiveErrors = 0;

  int16_t axRaw = (int16_t)((raw[0] << 8) | raw[1]);
  int16_t ayRaw = (int16_t)((raw[2] << 8) | raw[3]);
  int16_t azRaw = (int16_t)((raw[4] << 8) | raw[5]);

  const float ax = axRaw / 16384.0f;
  const float ay = ayRaw / 16384.0f;
  const float az = azRaw / 16384.0f;
  const float magnitude = sqrtf(ax * ax + ay * ay + az * az);

  if (now - lastFallTriggeredAt < FALL_COOLDOWN_MS) {
    fallState = FALL_IDLE;
    stationaryStartedAt = 0;
    return;
  }

  switch (fallState) {
    case FALL_IDLE:
      if (magnitude < 0.50f) {
        fallState = FALL_FREE_FALL;
        freeFallStartedAt = now;
      }
      break;

    case FALL_FREE_FALL: {
      const unsigned long freeFallMs = now - freeFallStartedAt;
      if (magnitude < 0.50f) {
        if (freeFallMs > FALL_FREE_FALL_MAX_MS) {
          fallState = FALL_IDLE;
        }
      } else if (freeFallMs >= FALL_FREE_FALL_MIN_MS &&
                 freeFallMs <= FALL_FREE_FALL_MAX_MS &&
                 magnitude > 2.50f) {
        fallState = FALL_IMPACT;
        impactStartedAt = now;
        stationaryStartedAt = 0;
      } else {
        // A single low-g sample followed by ordinary handling is not a fall.
        fallState = FALL_IDLE;
      }
      break;
    }

    case FALL_IMPACT:
      if (now - impactStartedAt > FALL_POST_IMPACT_TIMEOUT_MS) {
        fallState = FALL_IDLE;
        stationaryStartedAt = 0;
        break;
      }

      if (magnitude > 0.80f && magnitude < 1.30f) {
        if (stationaryStartedAt == 0) stationaryStartedAt = now;
        if (now - stationaryStartedAt >= FALL_STATIONARY_MIN_MS) {
          lastFallTriggeredAt = now;
          sendBleEvent("FALL_DETECTED");
          pulseLed(500);
          fallState = FALL_IDLE;
          stationaryStartedAt = 0;
        }
      } else {
        // Require a continuous post-impact near-1g interval, not one sample.
        stationaryStartedAt = 0;
      }
      break;
  }
}

// -----------------------------------------------------------------------------
// MAX30100 / MAX30102
// -----------------------------------------------------------------------------
enum OpticalChip {
  OPTICAL_NONE,
  OPTICAL_MAX30100,
  OPTICAL_MAX30102,
  OPTICAL_UNKNOWN
};

// Arduino's auto-prototyper cannot infer this enum before its declaration.
// Explicit prototypes prevent generated declarations preceding OpticalChip.
bool resetOpticalSensor(OpticalChip chip);
bool verifyOpticalConfiguration(OpticalChip chip);

OpticalChip opticalChip = OPTICAL_NONE;
bool opticalReady = false;
uint8_t opticalPartId = 0;
uint8_t opticalRevisionId = 0;
unsigned long lastOpticalRetry = 0;
unsigned long lastVitalsReport = 0;
unsigned long lastSensorStatusReport = 0;
unsigned long lastOpticalSampleAt = 0;

// Real-signal processing state.
double irDc = 0.0;
double redDc = 0.0;
double irEnvelope = 0.0;
double previousIrAc = 0.0;
bool previousSlopePositive = false;
unsigned long lastPeakAt = 0;
float filteredBpm = 0.0f;
bool heartRateValid = false;

static const int SPO2_WINDOW = 100;
int spo2Samples = 0;
double redSum = 0.0;
double irSum = 0.0;
double redSqSum = 0.0;
double irSqSum = 0.0;
float latestSpo2 = 0.0f;
bool spo2Valid = false;
bool fingerPresent = false;
bool peakArmed = false;
bool opticalSampleSeen = false;
bool opticalClipped = false;
uint32_t lastRedRaw = 0;
uint32_t lastIrRaw = 0;
unsigned long opticalSampleTimeMs = 0;
unsigned long opticalSampleCount = 0;
uint16_t opticalSettlingSamples = 0;

const char* opticalChipName() {
  switch (opticalChip) {
    case OPTICAL_MAX30100: return "MAX30100";
    case OPTICAL_MAX30102: return "MAX30102";
    case OPTICAL_UNKNOWN:  return "MAX3010X_UNKNOWN";
    default:               return "NONE";
  }
}

void invalidateVitalEstimates() {
  lastPeakAt = 0;
  peakArmed = false;
  filteredBpm = 0.0f;
  heartRateValid = false;

  spo2Samples = 0;
  redSum = 0.0;
  irSum = 0.0;
  redSqSum = 0.0;
  irSqSum = 0.0;
  latestSpo2 = 0.0f;
  spo2Valid = false;
}

void resetVitalsState() {
  invalidateVitalEstimates();
  irDc = 0.0;
  redDc = 0.0;
  irEnvelope = 0.0;
  previousIrAc = 0.0;
  previousSlopePositive = false;
  fingerPresent = false;
  opticalSampleSeen = false;
  opticalClipped = false;
  lastRedRaw = lastIrRaw = 0;
  opticalSampleTimeMs = opticalSampleCount = 0;
  opticalSettlingSamples = 0;
}

bool configureMax30100() {
  // Clear 16-sample FIFO.
  if (!writeRegister8(MAX3010X_ADDR, 0x02, 0x00)) return false;
  if (!writeRegister8(MAX3010X_ADDR, 0x03, 0x00)) return false;
  if (!writeRegister8(MAX3010X_ADDR, 0x04, 0x00)) return false;

  // 100 sps, high-resolution, 1600 us pulse width.
  if (!writeRegister8(MAX3010X_ADDR, 0x07, 0x47)) return false;

  // Red 17.4 mA, IR 17.4 mA.
  if (!writeRegister8(MAX3010X_ADDR, 0x09, 0x55)) return false;

  // SpO2 mode: red + IR.
  if (!writeRegister8(MAX3010X_ADDR, 0x06, 0x03)) return false;
  return true;
}

bool configureMax30102() {
  // Clear 32-word FIFO.
  if (!writeRegister8(MAX3010X_ADDR, 0x04, 0x00)) return false;
  if (!writeRegister8(MAX3010X_ADDR, 0x05, 0x00)) return false;
  if (!writeRegister8(MAX3010X_ADDR, 0x06, 0x00)) return false;

  // No sample averaging; no rollover. We poll frequently and keep latency bounded.
  if (!writeRegister8(MAX3010X_ADDR, 0x08, 0x00)) return false;

  // ADC range 4096 nA, 100 sps, 411 us pulse width, 18-bit.
  if (!writeRegister8(MAX3010X_ADDR, 0x0A, 0x27)) return false;

  // Moderate LED current (~12.6 mA each).
  if (!writeRegister8(MAX3010X_ADDR, 0x0C, 0x3F)) return false; // Red.
  if (!writeRegister8(MAX3010X_ADDR, 0x0D, 0x3F)) return false; // IR.

  // SpO2 mode: Red + IR.
  if (!writeRegister8(MAX3010X_ADDR, 0x09, 0x03)) return false;
  return true;
}

bool resetOpticalSensor(OpticalChip chip) {
  uint8_t modeRegister = 0;
  if (chip == OPTICAL_MAX30100) {
    modeRegister = 0x06;
  } else if (chip == OPTICAL_MAX30102) {
    modeRegister = 0x09;
  } else {
    return false;
  }

  // Both MAX30100 and MAX30102 use bit 6 of MODE_CONFIG for software reset.
  if (!writeRegister8(MAX3010X_ADDR, modeRegister, 0x40)) return false;

  const unsigned long startedAt = millis();
  while (millis() - startedAt < OPTICAL_RESET_TIMEOUT_MS) {
    updateButtonState();

    uint8_t mode = 0x40;
    if (readRegister8(MAX3010X_ADDR, modeRegister, mode) &&
        (mode & 0x40) == 0) {
      return true;
    }

    delay(OPTICAL_RESET_POLL_MS);
  }

  return false;
}

bool verifyOpticalRegister(uint8_t reg, uint8_t expected, uint8_t mask) {
  uint8_t actual = 0;
  if (!readRegister8(MAX3010X_ADDR, reg, actual)) return false;
  if ((actual & mask) == expected) return true;
  Serial.printf("[OPTICAL] Read-back mismatch reg=0x%02X expected=0x%02X actual=0x%02X mask=0x%02X.\n",
                reg, expected, actual, mask);
  return false;
}

bool verifyOpticalConfiguration(OpticalChip chip) {
  // Mask checks SHDN (bit 7), RESET (bit 6), and operating mode (bits 2:0).
  // A powered-down sensor can still ACK and retain correct LED/SPO2 registers.
  if (chip == OPTICAL_MAX30100) {
    return verifyOpticalRegister(0x06, 0x03, 0xC7) &&
           verifyOpticalRegister(0x07, 0x47, 0xFF) &&
           verifyOpticalRegister(0x09, 0x55, 0xFF);
  }
  if (chip == OPTICAL_MAX30102) {
    return verifyOpticalRegister(0x09, 0x03, 0xC7) &&
           verifyOpticalRegister(0x08, 0x00, 0xFF) &&
           verifyOpticalRegister(0x0A, 0x27, 0xFF) &&
           verifyOpticalRegister(0x0C, 0x3F, 0xFF) &&
           verifyOpticalRegister(0x0D, 0x3F, 0xFF);
  }
  return false;
}

bool identifyAndConfigureOptical() {
  if (!probeAddress(MAX3010X_ADDR)) {
    opticalChip = OPTICAL_NONE;
    opticalReady = false;
    return false;
  }

  uint8_t part = 0;
  uint8_t rev = 0;

  if (!readRegister8(MAX3010X_ADDR, 0xFF, part) ||
      !readRegister8(MAX3010X_ADDR, 0xFE, rev)) {
    opticalChip = OPTICAL_UNKNOWN;
    opticalReady = false;
    return false;
  }

  opticalPartId = part;
  opticalRevisionId = rev;

  if (part == 0x11) {
    opticalChip = OPTICAL_MAX30100;
  } else if (part == 0x15) {
    opticalChip = OPTICAL_MAX30102;
  } else {
    opticalChip = OPTICAL_UNKNOWN;
    opticalReady = false;

    Serial.printf("[OPTICAL] 0x57 responded, unknown PART_ID=0x%02X REV=0x%02X.\n", part, rev);
    sendBleEvent("SENSOR:MAX3010X:UNKNOWN_PART");
    return false;
  }

  Serial.printf("[OPTICAL] Identified %s PART_ID=0x%02X REV=0x%02X; resetting and verifying.\n",
                opticalChipName(), opticalPartId, opticalRevisionId);
  if (!resetOpticalSensor(opticalChip)) {
    opticalReady = false;
    Serial.printf("[OPTICAL] %s identified but software reset did not complete.\n",
                  opticalChipName());
    sendBleEvent(String("SENSOR:") + opticalChipName() + ":CONFIG_ERROR");
    return false;
  }

  bool configured =
      opticalChip == OPTICAL_MAX30100 ? configureMax30100() :
      opticalChip == OPTICAL_MAX30102 ? configureMax30102() :
      false;

  if (!configured) {
    opticalReady = false;
    Serial.printf("[OPTICAL] %s identified but configuration write failed.\n",
                  opticalChipName());
    sendBleEvent(String("SENSOR:") + opticalChipName() + ":CONFIG_ERROR");
    return false;
  }

  if (!verifyOpticalConfiguration(opticalChip)) {
    opticalReady = false;
    Serial.printf("[OPTICAL] %s identified but configuration read-back failed.\n",
                  opticalChipName());
    sendBleEvent(String("SENSOR:") + opticalChipName() + ":CONFIG_ERROR");
    return false;
  }

  opticalReady = true;
  lastOpticalSampleAt = millis();
  resetVitalsState();

  Serial.printf("[OPTICAL] %s ready. PART_ID=0x%02X REV=0x%02X.\n",
                opticalChipName(), opticalPartId, opticalRevisionId);

  sendBleEvent(String("SENSOR:") + opticalChipName() + ":READY");
  return true;
}

void markOpticalI2cFailure(const char* operation) {
  opticalReady = false;
  resetVitalsState();
  lastOpticalRetry = millis();
  Serial.printf("[OPTICAL] %s failed; discarding samples; retry in %lu ms.\n",
                operation, (unsigned long)OPTICAL_RETRY_INTERVAL_MS);
  sendBleEvent(String("SENSOR:") + opticalChipName() + ":I2C_ERROR");
}

bool readOpticalFifo(uint8_t reg, uint8_t* buffer, uint8_t length) {
  // FIFO reads consume samples. ESP32 reports zero on a bus error even when
  // some bytes reached the sensor, so zero is NOT proof that retry is safe.
  // Use STOP immediately and require one complete transfer. On any failure,
  // invalidate the old readings and reset/reconfigure before consuming again.
  if (readBytes(MAX3010X_ADDR, reg, buffer, length, false)) return true;
  markOpticalI2cFailure("FIFO transfer");
  return false;
}

bool readMax30100Sample(uint32_t& red, uint32_t& ir) {
  uint8_t wr = 0;
  uint8_t rd = 0;
  uint8_t overflow = 0;
  if (!readRegister8(MAX3010X_ADDR, 0x02, wr) ||
      !readRegister8(MAX3010X_ADDR, 0x04, rd) ||
      !readRegister8(MAX3010X_ADDR, 0x03, overflow)) {
    // Exhausted register retries are a transport fault, not an empty FIFO.
    markOpticalI2cFailure("FIFO metadata read");
    return false;
  }
  if ((overflow & 0x0F) != 0) {
    opticalReady = false;
    resetVitalsState();
    lastOpticalRetry = millis();
    Serial.println("[OPTICAL] FIFO_OVERFLOW: samples lost; resetting acquisition.");
    sendBleEvent("SENSOR:MAX30100:NOT_READY");
    return false;
  }

  wr &= 0x0F;
  rd &= 0x0F;
  if (wr == rd) return false; // No unread sample.

  uint8_t raw[4];
  if (!readOpticalFifo(0x05, raw, sizeof(raw))) return false;

  // MAX30100 FIFO order in SpO2 mode is IR then RED.
  ir  = ((uint32_t)raw[0] << 8) | raw[1];
  red = ((uint32_t)raw[2] << 8) | raw[3];
  return true;
}

bool readMax30102Sample(uint32_t& red, uint32_t& ir) {
  uint8_t wr = 0;
  uint8_t rd = 0;
  uint8_t overflow = 0;
  // Check before popping: MAX30102 clears overflow when a sample is read.
  if (!readRegister8(MAX3010X_ADDR, 0x04, wr) ||
      !readRegister8(MAX3010X_ADDR, 0x06, rd) ||
      !readRegister8(MAX3010X_ADDR, 0x05, overflow)) {
    markOpticalI2cFailure("FIFO metadata read");
    return false;
  }
  if ((overflow & 0x1F) != 0) {
    opticalReady = false;
    resetVitalsState();
    lastOpticalRetry = millis();
    Serial.println("[OPTICAL] FIFO_OVERFLOW: samples lost; resetting acquisition.");
    sendBleEvent("SENSOR:MAX30102:NOT_READY");
    return false;
  }

  wr &= 0x1F;
  rd &= 0x1F;
  if (wr == rd) return false; // No unread sample.

  uint8_t raw[6];
  if (!readOpticalFifo(0x07, raw, sizeof(raw))) return false;

  // MAX30102 SpO2 mode FIFO order is Red then IR; each sample is 18-bit.
  red = ((((uint32_t)raw[0] << 16) |
          ((uint32_t)raw[1] << 8) |
          raw[2]) & 0x03FFFF);

  ir = ((((uint32_t)raw[3] << 16) |
         ((uint32_t)raw[4] << 8) |
         raw[5]) & 0x03FFFF);

  return true;
}

void processOpticalSample(uint32_t redRaw, uint32_t irRaw) {
  const unsigned long receivedAt = millis();
  if (opticalSampleSeen && receivedAt - lastOpticalSampleAt > OPTICAL_SAMPLE_MAX_AGE_MS) {
    invalidateVitalEstimates();
    fingerPresent = false;
  }
  lastOpticalSampleAt = receivedAt;
  opticalSampleSeen = true;
  lastRedRaw = redRaw;
  lastIrRaw = irRaw;
  ++opticalSampleCount;
  opticalSampleTimeMs += OPTICAL_SAMPLE_PERIOD_MS;

  const uint32_t fullScale = opticalChip == OPTICAL_MAX30100 ? 0xFFFF : 0x3FFFF;
  opticalClipped = redRaw >= fullScale || irRaw >= fullScale;
  const bool hadContact = fingerPresent;
  // Light level is a contact heuristic, not proof of a pulse. An AC trough
  // between beats must not erase beat history. Raw light detects removal
  // immediately instead of waiting for the slow DC baseline to decay.
  fingerPresent = !opticalClipped && irRaw > 3000 && redRaw > 1000;
  if (!fingerPresent) {
    invalidateVitalEstimates();
    opticalSettlingSamples = 0;
    irDc = redDc = irEnvelope = previousIrAc = 0.0;
    previousSlopePositive = false;

    // Idle/no-finger sampling is intentionally silent. Only announce the
    // transition once so Serial/BLE do not emit one message every second.
    if (hadContact) {
      Serial.println("[FINGER] REMOVED");
      sendBleEvent("VITALS:NO_VALID_READING");
    }
    return;
  }

  if (!hadContact) {
    Serial.println("[FINGER] DETECTED");
    sendBleEvent("VITALS:ACQUIRING");
  }
  // A gross baseline change can be placement, light, or motion rather than a
  // pulse. This 10% quality heuristic is not motion cancellation/calibration.
  // Rebase immediately instead of letting the slow DC tail mimic pulse energy.
  const bool levelChanged = hadContact &&
      (fabs((double)redRaw - redDc) > redDc * 0.10 ||
       fabs((double)irRaw - irDc) > irDc * 0.10);
  if (!hadContact || levelChanged) {
    const bool hadValidEstimate = heartRateValid || spo2Valid;
    invalidateVitalEstimates();
    irDc = irRaw;
    redDc = redRaw;
    irEnvelope = previousIrAc = 0.0;
    previousSlopePositive = false;
    opticalSettlingSamples = OPTICAL_SETTLE_SAMPLES;
    // A new finger already emitted ACQUIRING above. For an established
    // contact, only clear a previously valid reading when a real level jump
    // invalidates it; do not repeat ACQUIRING for ordinary startup settling.
    if (levelChanged && hadValidEstimate) sendBleEvent("VITALS:ACQUIRING");
    return;
  }

  // Slow DC tracking; AC carries the pulsatile component.
  const double alpha = 0.99;
  irDc = alpha * irDc + (1.0 - alpha) * (double)irRaw;
  redDc = alpha * redDc + (1.0 - alpha) * (double)redRaw;

  const double irAc = (double)irRaw - irDc;

  irEnvelope = 0.95 * irEnvelope + 0.05 * fabs(irAc);

  if (opticalSettlingSamples > 0) {
    --opticalSettlingSamples;
    previousIrAc = irAc;
    previousSlopePositive = false;
    return; // No beat or ratio history may straddle the settling interval.
  }

  // The permissive raw contact gate keeps acquisition responsive, but a signal
  // only barely above that gate is not strong enough to trust as a numeric vital.
  // Reject it before peak timing or ratio windows can mature.
  if (redDc < OPTICAL_VITAL_MIN_RED_DC || irDc < OPTICAL_VITAL_MIN_IR_DC) {
    const bool hadValidEstimate = heartRateValid || spo2Valid;
    invalidateVitalEstimates();
    previousIrAc = irAc;
    previousSlopePositive = false;
    if (hadValidEstimate) sendBleEvent("VITALS:NO_VALID_READING");
    return;
  }

  // Heart-rate peak detection from the real IR AC waveform.
  bool slopePositive = irAc > previousIrAc;
  double peakThreshold = fmax(15.0, irEnvelope * 0.55);
  // FIFO batches retain their 100 sps sample spacing despite host I2C delays.
  const unsigned long now = opticalSampleTimeMs;
  if (lastPeakAt != 0 && now - lastPeakAt > 2000) invalidateVitalEstimates();
  if (irAc < 0.0) peakArmed = true;

  if (peakArmed &&
      previousSlopePositive &&
      !slopePositive &&
      previousIrAc > peakThreshold) {
    peakArmed = false; // At most one candidate per positive half-wave.

    if (lastPeakAt == 0) {
      lastPeakAt = now;
    } else {
      const unsigned long interval = now - lastPeakAt;

      // A candidate above the supported 200 BPM ceiling is evidence that the
      // current timing chain is invalid. Do not retain the older timestamp:
      // doing so lets every second fast peak alias into a slower valid rate.
      if (interval < 300) {
        invalidateVitalEstimates();
      } else {
        // 30-200 BPM sanity range for prototype filtering. Intervals above
        // 2000 ms are already expired by the check immediately above.
        float bpm = 60000.0f / (float)interval;

        if (filteredBpm <= 0.0f) {
          filteredBpm = bpm;
        } else {
          filteredBpm = 0.75f * filteredBpm + 0.25f * bpm;
        }

        heartRateValid = filteredBpm >= 30.0f && filteredBpm <= 200.0f;
        lastPeakAt = now;
      }
    }
  }

  previousSlopePositive = slopePositive;
  previousIrAc = irAc;

  // Ratio-of-ratios window; the no-contact path already returned above.
  redSum += redRaw;
  irSum += irRaw;
  redSqSum += (double)redRaw * (double)redRaw;
  irSqSum += (double)irRaw * (double)irRaw;
  spo2Samples++;

  if (spo2Samples >= SPO2_WINDOW) {
    const double n = (double)spo2Samples;
    const double redMean = redSum / n;
    const double irMean = irSum / n;

    double redVariance = (redSqSum / n) - (redMean * redMean);
    double irVariance = (irSqSum / n) - (irMean * irMean);

    if (redVariance < 0.0) redVariance = 0.0;
    if (irVariance < 0.0) irVariance = 0.0;

    const double redRms = sqrt(redVariance);
    const double irRms = sqrt(irVariance);

    if (heartRateValid && redMean > 0.0 && irMean > 0.0 && redRms > 0.0 && irRms > 0.0) {
      const double ratio = (redRms / redMean) / (irRms / irMean);

      // Common prototype approximation. It is derived from real samples,
      // but it is NOT a medical calibration curve.
      double estimate = 110.0 - 25.0 * ratio;

      if (estimate >= 70.0 && estimate <= 100.0 && ratio > 0.1 && ratio < 2.0) {
        latestSpo2 = (float)estimate;
        spo2Valid = true;
      } else {
        spo2Valid = false;
      }
    } else {
      spo2Valid = false;
    }

    spo2Samples = 0;
    redSum = 0.0;
    irSum = 0.0;
    redSqSum = 0.0;
    irSqSum = 0.0;
  }
}

const char* opticalSignalReason() {
  if (!opticalSampleSeen || millis() - lastOpticalSampleAt > OPTICAL_SAMPLE_MAX_AGE_MS) return "NO_SAMPLES";
  if (opticalClipped) return "SATURATED";
  if (!fingerPresent) return "LOW_LIGHT";
  if (opticalSettlingSamples > 0) return "SETTLING";
  if (redDc < OPTICAL_VITAL_MIN_RED_DC || irDc < OPTICAL_VITAL_MIN_IR_DC) return "WEAK_CONTACT";
  if (heartRateValid && spo2Valid) return "VALID";
  if (heartRateValid) return "SPO2_ACQUIRING";
  if (irEnvelope <= 10.0) return "WEAK_PULSE";
  return "ACQUIRING";
}

void reportOpticalSignal() {
  Serial.printf("[SIGNAL] samples=%lu red=%lu ir=%lu red_dc=%.1f ir_dc=%.1f ir_ac=%.1f age_ms=%lu reason=%s\n",
                opticalSampleCount, (unsigned long)lastRedRaw, (unsigned long)lastIrRaw,
                redDc, irDc, irEnvelope, millis() - lastOpticalSampleAt, opticalSignalReason());
}

void updateOpticalSensor() {
  unsigned long now = millis();

  if (!opticalReady) {
    if (now - lastOpticalRetry >= OPTICAL_RETRY_INTERVAL_MS) {
      const bool initialized = identifyAndConfigureOptical();
      lastOpticalRetry = millis();
      now = millis();
      if (!initialized) {
        if (now - lastSensorStatusReport >= SENSOR_STATUS_INTERVAL_MS) {
          lastSensorStatusReport = now;
          sendBleEvent("SENSOR:MAX3010X:NOT_READY");
        }
      }
    }
    return;
  }

  // Bound the amount of sensor work performed per loop so SOS remains responsive.
  int samplesReadThisLoop = 0;

  for (int attempt = 0; attempt < 2; ++attempt) {
    updateButtonState();

    uint32_t red = 0;
    uint32_t ir = 0;
    bool gotSample = false;

    if (opticalChip == OPTICAL_MAX30100) {
      gotSample = readMax30100Sample(red, ir);
    } else if (opticalChip == OPTICAL_MAX30102) {
      gotSample = readMax30102Sample(red, ir);
    }

    if (!gotSample) break;

    samplesReadThisLoop++;
    processOpticalSample(red, ir);
  }

  if (!opticalReady) return; // Any FIFO/metadata fault requires reset before reads.
  now = millis(); // I2C work advances time after the sample's receipt timestamp.
  if (!opticalSampleSeen || now - lastOpticalSampleAt > OPTICAL_SAMPLE_MAX_AGE_MS) {
    const bool contactTimedOut = fingerPresent;
    const bool hadValidEstimate = heartRateValid || spo2Valid;
    invalidateVitalEstimates();
    fingerPresent = false;
    opticalSettlingSamples = 0;

    // A sample stream disappearing while a finger was present is a real
    // transition, not an idle heartbeat. Announce it once and clear the phone.
    if (contactTimedOut) {
      Serial.println("[FINGER] REMOVED (sample timeout)");
      reportOpticalSignal();
    }
    if (contactTimedOut || hadValidEstimate) {
      sendBleEvent("VITALS:NO_VALID_READING");
    }
  }

  // A configured optical sensor should keep producing FIFO samples even with
  // no finger present. If samples stop, distinguish an unplugged bus from a
  // sensor that still ACKs but needs reconfiguration. This check is infrequent
  // and each I2C operation is bounded by I2C_TIMEOUT_MS.
  if (samplesReadThisLoop == 0 && now - lastOpticalSampleAt > 1500) {
    uint8_t livePartId = 0;
    bool busAlive = probeAddress(MAX3010X_ADDR) &&
                    readRegister8(MAX3010X_ADDR, 0xFF, livePartId);

    if (!busAlive || livePartId != opticalPartId) {
      markOpticalI2cFailure("Sensor identity check");
      return;
    }

    Serial.println("[OPTICAL] Device responds but FIFO stalled; reconfiguring.");
    if (!identifyAndConfigureOptical()) {
      opticalReady = false;
      lastOpticalRetry = millis();
      return;
    }
  }

  if (now - lastVitalsReport >= VITALS_REPORT_INTERVAL_MS) {
    lastVitalsReport = now;

    // The optical sensor keeps sampling while uncovered so disconnects can
    // still be detected, but idle/no-finger data is not user-facing output.
    if (!fingerPresent) return;

    reportOpticalSignal();

    // DETECTED emitted one ACQUIRING event. Do not repeat it every second while
    // the same finger is merely settling or while contact quality is weak.
    if (opticalSettlingSamples > 0) return;

    if (redDc < OPTICAL_VITAL_MIN_RED_DC ||
        irDc < OPTICAL_VITAL_MIN_IR_DC ||
        (!heartRateValid && irEnvelope <= 10.0)) {
      return;
    }

    // Clear the phone's old pair before restoring whichever estimates are
    // currently valid. A lost SpO2 window must not leave an old value visible.
    if (!heartRateValid || !spo2Valid) {
      sendBleEvent("VITALS:ACQUIRING");
    }

    if (heartRateValid) {
      sendBleEvent(String("HEART_RATE:") + String((int)lroundf(filteredBpm)));
    }

    if (spo2Valid) {
      sendBleEvent(String("SPO2:") + String((int)lroundf(latestSpo2)));
    }
  }
}

void sendSensorHealthSnapshot() {
  if (mpuReady) {
    sendBleEvent(String("SENSOR:") + mpuChipName() + ":READY");
  } else if (isSupportedMpuIdentity(mpuWhoAmI)) {
    sendBleEvent(String("SENSOR:") + mpuChipName() + ":NOT_READY");
  } else {
    sendBleEvent("SENSOR:MPU:NOT_READY");
  }

  if (opticalReady) {
    sendBleEvent(String("SENSOR:") + opticalChipName() + ":READY");
  } else if (opticalChip == OPTICAL_UNKNOWN) {
    sendBleEvent("SENSOR:MAX3010X:UNKNOWN_PART");
  } else {
    sendBleEvent("SENSOR:MAX3010X:NOT_READY");
  }
}

// -----------------------------------------------------------------------------
// Setup / loop
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(I2C_CLOCK_HZ);
  Wire.setTimeOut(I2C_TIMEOUT_MS);

  Serial.println();
  Serial.println("=======================================================");
  Serial.println(" NAARI KAVACH - DUAL SENSOR BLE TEST");
  Serial.println("=======================================================");
  Serial.println("[FIRMWARE] quiet-events-v9-20261008");
  Serial.printf("BLE Name: %s\n", DEVICE_NAME);
  Serial.printf("I2C: SDA=%d SCL=%d @ %d Hz, timeout=%d ms\n",
                I2C_SDA, I2C_SCL, I2C_CLOCK_HZ, I2C_TIMEOUT_MS);
  Serial.println("Wi-Fi: DISABLED");
  Serial.println("HTTP: DISABLED");

  // BLE starts regardless of sensor health. A 64-byte MTU keeps every
  // diagnostic/status payload intact on clients that negotiate above the
  // legacy 20-byte notification payload limit.
  BLEDevice::init(DEVICE_NAME);
  BLEDevice::setMTU(BLE_MTU);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_READ |
      BLECharacteristic::PROPERTY_NOTIFY |
      BLECharacteristic::PROPERTY_INDICATE);
  pTxCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  // Probe both sensors once; failure never prevents SOS/BLE startup.
  tryInitializeMpu();
  lastMpuRetry = millis();
  identifyAndConfigureOptical();
  lastOpticalRetry = millis();

  Serial.println("[READY] BLE + SOS active. Sensor failures are non-fatal.");
  Serial.println("[READY] Quiet mode: idle no-finger vitals are suppressed.");
  Serial.println("[READY] Press GPIO4 button three times within 1.8s for SOS.");
}

void loop() {
  // SOS is intentionally first.
  updateButtonState();
  updateLed();

  // Connection transition notification; no blocking delays.
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = true;
    sendBleEvent("STATUS:ONLINE");
    // Health is announced once on subscription; subsequent READY/ERROR changes
    // are already event-driven by the sensor state machines.
    sendSensorHealthSnapshot();
  } else if (!deviceConnected && oldDeviceConnected) {
    oldDeviceConnected = false;
    pServer->startAdvertising();
  }

  // Sensor work is bounded and each path has a short I2C timeout.
  updateMpuFallDetection();
  updateButtonState();

  updateOpticalSensor();
  updateButtonState();

  updateLed();

  // Yield to the ESP32 RTOS without a long blocking delay.
  delay(1);
}
