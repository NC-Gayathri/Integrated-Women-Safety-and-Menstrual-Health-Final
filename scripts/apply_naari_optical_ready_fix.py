#!/usr/bin/env python3
"""Apply the bounded MAX3010x readiness repair to the integration sketch.

This helper is used once on the repair branch so the source edit is exact and
auditable. It refuses to run if the expected pre-fix source no longer matches.
"""
from pathlib import Path

path = Path("esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino")
src = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global src
    count = src.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, found {count}")
    src = src.replace(old, new, 1)


replace_once(
    "#define I2C_CLOCK_HZ 100000\n#define I2C_TIMEOUT_MS 5",
    "#define I2C_CLOCK_HZ 100000\n#define I2C_TIMEOUT_MS 50\n#define I2C_TRANSACTION_ATTEMPTS 2",
    "I2C timing constants",
)

replace_once(
    "#define OPTICAL_RETRY_INTERVAL_MS 2000\n#define MPU_RETRY_INTERVAL_MS 2000",
    "#define OPTICAL_RETRY_INTERVAL_MS 2000\n#define OPTICAL_RESET_TIMEOUT_MS 150\n#define OPTICAL_RESET_POLL_MS 5\n#define MPU_RETRY_INTERVAL_MS 2000",
    "optical reset timing constants",
)

replace_once(
'''bool probeAddress(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission(true) == 0;
}

bool readRegister8(uint8_t addr, uint8_t reg, uint8_t& value) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;

  int received = Wire.requestFrom((int)addr, 1, (int)true);
  if (received != 1) return false;

  value = Wire.read();
  return true;
}

bool writeRegister8(uint8_t addr, uint8_t reg, uint8_t value) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission(true) == 0;
}

bool readBytes(uint8_t addr, uint8_t reg, uint8_t* buffer, uint8_t length) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;

  int received = Wire.requestFrom((int)addr, (int)length, (int)true);
  if (received != length) {
    while (Wire.available()) (void)Wire.read();
    return false;
  }

  for (uint8_t i = 0; i < length; ++i) {
    buffer[i] = Wire.read();
  }
  return true;
}''',
'''bool probeAddress(uint8_t addr) {
  for (uint8_t attempt = 0; attempt < I2C_TRANSACTION_ATTEMPTS; ++attempt) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission(true) == 0) return true;
    delay(1);
  }
  return false;
}

bool readRegister8(uint8_t addr, uint8_t reg, uint8_t& value) {
  for (uint8_t attempt = 0; attempt < I2C_TRANSACTION_ATTEMPTS; ++attempt) {
    Wire.beginTransmission(addr);
    Wire.write(reg);

    // Some MAX3010x breakout variants ACK identification but are unreliable
    // with repeated-start register-pointer writes. Mirror the proven standalone
    // diagnostic: if repeated-start fails, retry the pointer write with STOP.
    uint8_t txError = Wire.endTransmission(false);
    if (txError != 0) {
      Wire.beginTransmission(addr);
      Wire.write(reg);
      txError = Wire.endTransmission(true);
      if (txError != 0) {
        delay(1);
        continue;
      }
    }

    int received = Wire.requestFrom((int)addr, 1, (int)true);
    if (received == 1) {
      value = Wire.read();
      return true;
    }

    while (Wire.available()) (void)Wire.read();
    delay(1);
  }
  return false;
}

bool writeRegister8(uint8_t addr, uint8_t reg, uint8_t value) {
  for (uint8_t attempt = 0; attempt < I2C_TRANSACTION_ATTEMPTS; ++attempt) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.write(value);
    if (Wire.endTransmission(true) == 0) return true;
    delay(1);
  }
  return false;
}

bool readBytes(uint8_t addr, uint8_t reg, uint8_t* buffer, uint8_t length) {
  for (uint8_t attempt = 0; attempt < I2C_TRANSACTION_ATTEMPTS; ++attempt) {
    Wire.beginTransmission(addr);
    Wire.write(reg);

    uint8_t txError = Wire.endTransmission(false);
    if (txError != 0) {
      Wire.beginTransmission(addr);
      Wire.write(reg);
      txError = Wire.endTransmission(true);
      if (txError != 0) {
        delay(1);
        continue;
      }
    }

    int received = Wire.requestFrom((int)addr, (int)length, (int)true);
    if (received == length) {
      for (uint8_t i = 0; i < length; ++i) {
        buffer[i] = Wire.read();
      }
      return true;
    }

    while (Wire.available()) (void)Wire.read();
    delay(1);
  }
  return false;
}''',
    "bounded I2C helpers",
)

replace_once(
'''bool identifyAndConfigureOptical() {''',
'''bool resetOpticalSensor(OpticalChip chip) {
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

bool verifyOpticalConfiguration(OpticalChip chip) {
  if (chip == OPTICAL_MAX30100) {
    uint8_t mode = 0;
    uint8_t spo2 = 0;
    uint8_t led = 0;

    if (!readRegister8(MAX3010X_ADDR, 0x06, mode) ||
        !readRegister8(MAX3010X_ADDR, 0x07, spo2) ||
        !readRegister8(MAX3010X_ADDR, 0x09, led)) {
      return false;
    }

    return (mode & 0x47) == 0x03 && spo2 == 0x47 && led == 0x55;
  }

  if (chip == OPTICAL_MAX30102) {
    uint8_t mode = 0;
    uint8_t spo2 = 0;
    uint8_t redLed = 0;
    uint8_t irLed = 0;

    if (!readRegister8(MAX3010X_ADDR, 0x09, mode) ||
        !readRegister8(MAX3010X_ADDR, 0x0A, spo2) ||
        !readRegister8(MAX3010X_ADDR, 0x0C, redLed) ||
        !readRegister8(MAX3010X_ADDR, 0x0D, irLed)) {
      return false;
    }

    return (mode & 0x47) == 0x03 &&
           spo2 == 0x27 && redLed == 0x3F && irLed == 0x3F;
  }

  return false;
}

bool identifyAndConfigureOptical() {''',
    "optical reset/read-back helpers",
)

replace_once(
'''  bool configured =
      opticalChip == OPTICAL_MAX30100 ? configureMax30100() :
      opticalChip == OPTICAL_MAX30102 ? configureMax30102() :
      false;

  if (!configured) {
    opticalReady = false;
    Serial.printf("[OPTICAL] %s detected but configuration failed.\\n", opticalChipName());
    sendBleEvent(String("SENSOR:") + opticalChipName() + ":CONFIG_ERROR");
    return false;
  }

  opticalReady = true;''',
'''  if (!resetOpticalSensor(opticalChip)) {
    opticalReady = false;
    Serial.printf("[OPTICAL] %s identified but software reset did not complete.\\n",
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
    Serial.printf("[OPTICAL] %s identified but configuration write failed.\\n",
                  opticalChipName());
    sendBleEvent(String("SENSOR:") + opticalChipName() + ":CONFIG_ERROR");
    return false;
  }

  if (!verifyOpticalConfiguration(opticalChip)) {
    opticalReady = false;
    Serial.printf("[OPTICAL] %s identified but configuration read-back failed.\\n",
                  opticalChipName());
    sendBleEvent(String("SENSOR:") + opticalChipName() + ":CONFIG_ERROR");
    return false;
  }

  opticalReady = true;''',
    "READY gating",
)

path.write_text(src, encoding="utf-8")
print("Applied bounded NAARI optical READY repair")
