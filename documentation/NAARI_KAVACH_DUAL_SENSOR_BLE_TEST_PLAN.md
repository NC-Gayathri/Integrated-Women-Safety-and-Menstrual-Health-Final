# NAARI KAVACH Dual-Sensor BLE — Formal Hardware Test Plan

The original integration branch was merged into `master` in PR #2. Run these
physical acceptance checks against the current default branch (`master`) and
record the exact commit flashed. See the current
[READY guide](NAARI_KAVACH_OPTICAL_READY_REPAIR.md) and
[vitals acquisition guide](NAARI_KAVACH_VITALS_ACQUISITION.md).

These remain physical acceptance gates. A code merge or passing CI does not
mark any unobserved hardware check as passed.

## 1. Locked hardware

### ESP32
- Board: DOIT ESP32 DEVKIT V1
- Built-in LED: GPIO 2

### SOS button
- One terminal: GPIO 4
- Other terminal: GND
- Software mode: `INPUT_PULLUP`
- Required behavior: three presses within 1.8 seconds

### Motion module: MPU6050 or MPU6500
- VCC: 3.3V
- GND: GND
- SDA: GPIO 21
- SCL: GPIO 22
- AD0: leave at board default unless intentionally changed
- Expected I2C address: 0x68; firmware also checks 0x69
- WHO_AM_I: 0x68 for MPU6050, 0x70 for MPU6500; the reported board identifies as MPU6500
- INT/XDA/XCL: not required for this integration

### MAX3010x optical board
The photographed listing describes the board as "MAX30102 Upgraded MAX30100".
Do not assume the silicon type from the listing.

- VIN: 3.3V
- GND: GND
- SDA: GPIO 21
- SCL: GPIO 22
- INT/IRD/RD: unconnected for this polling firmware
- I2C address: 0x57
- PART_ID 0x11: MAX30100
- PART_ID 0x15: MAX30102

The firmware refuses to invent a sensor type when PART_ID is unknown.

## 2. Locked BLE contract

- Device name: `NAARI_KAVACH`
- Service UUID: `12345678-1234-1234-1234-1234567890ab`
- Notify characteristic UUID: `87654321-4321-4321-4321-ba0987654321`

No Wi-Fi and no HTTP are allowed in the test firmware.

## 3. Firmware to flash

`esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino`

Arduino IDE:
1. Select DOIT ESP32 DEVKIT V1.
2. Select the ESP32 COM port.
3. Compile first.
4. Flash only if compilation succeeds.
5. Open Serial Monitor at 115200 baud.

## 4. Boot acceptance

Expected boot evidence must include:
- BLE name `NAARI_KAVACH`
- I2C SDA=21, SCL=22, 100000 Hz
- Wi-Fi disabled
- HTTP disabled
- MPU6050/MPU6500 ready at 0x68 or 0x69, OR a non-fatal "not detected" message (a missing sensor does not pass its physical gate)
- Optical sensor identified as MAX30100 or MAX30102 from PART_ID, OR a non-fatal explicit error
- Final BLE/SOS startup message; this alone does **not** prove optical readiness
- Separate `SENSOR:MAX30100:READY` or `SENSOR:MAX30102:READY` after verified configuration

Failure of either sensor must never prevent BLE/SOS startup.

## 5. Sensor identity gate

Record the exact line:

`[OPTICAL] <chip> ready. PART_ID=0x.. REV=0x..`

Pass:
- 0x11 identifies MAX30100, or
- 0x15 identifies MAX30102.

Do not pass this gate based only on the product listing.

## 6. Real optical-data gate

With a finger placed steadily over the optical window:

Expected BLE/Serial messages eventually include:
- `HEART_RATE:<BPM>`
- `SPO2:<percent>`

With no finger:
- `VITALS:NO_VALID_READING` or `VITALS:ACQUIRING`
- no fabricated fixed/random BPM or SpO2 values

SpO2 is a prototype estimate from real red/IR samples and is not a medical diagnosis.

Capture the v4 `[SIGNAL]` lines during five seconds without contact, 30 seconds
of steady finger coverage, then five seconds after removal. The phone must
clear both old readings on `VITALS:NO_VALID_READING` or `VITALS:ACQUIRING`;
subsequent valid numeric packets restore only their corresponding readings.

## 7. SOS priority tests

### Test A — optical sensor absent at boot
1. Disconnect MAX3010x.
2. Boot ESP32.
3. Press SOS button three times inside 1.8 seconds.

PASS only if:
- firmware remains alive,
- BLE remains available,
- `SOS` is emitted.

### Test B — optical sensor disconnected while running
1. Boot with MAX3010x working.
2. Confirm sensor READY.
3. Disconnect MAX3010x.
4. Trigger three-click SOS.

PASS only if:
- firmware reports sensor I2C error/not-ready,
- firmware does not freeze,
- no fake vitals appear,
- `SOS` still emits.

### Test C — SOS while optical sampling is active
1. Place finger on optical sensor.
2. Wait for real vital telemetry.
3. While samples are being processed, press SOS three times.

PASS only if SOS is detected normally and without a long sensor-induced delay.

## 8. MPU6050 / MPU6500 fall path

With the motion module connected:
- boot/retry must identify the actual MPU6050 or MPU6500 and reach chip-specific READY,
- motion reads must not interfere with SOS,
- sensor I2C failure must be non-fatal.

A deliberate fall-detection test should be performed on the electronics safely without dropping or damaging the hardware.

## 9. BLE/mobile gate

The mobile app must:
- discover `NAARI_KAVACH`,
- subscribe to the preserved characteristic,
- display real HR when `HEART_RATE:<BPM>` arrives,
- display real SpO2 estimate when `SPO2:<percent>` arrives,
- clear stale vitals on `VITALS:NO_VALID_READING`,
- show sensor unavailable state for `SENSOR:*:I2C_ERROR`, `NOT_READY`, `CONFIG_ERROR`, or `UNKNOWN_PART`,
- preserve BUTTON_SOS and FALL_DETECTED handling.

## 10. Formal closure evidence

The code has an independently auditable merge/CI record. Do not declare the
physical integration closed until all mandatory evidence below is captured:

- Arduino compile success
- boot Serial log
- optical PART_ID line
- real HR notification
- real SpO2 notification
- no-finger invalid-reading state
- Test A PASS
- Test B PASS
- Test C PASS
- MPU6050 detection PASS
- exact-name BLE discovery PASS
- exact service UUID discovery PASS
- exact characteristic UUID subscription PASS
- sensor-health packet reception after subscription PASS
- mobile HR display PASS
- mobile SpO2 display PASS
- no Wi-Fi/HTTP in test firmware

Final closure status must be based on observed evidence, not on code inspection alone.
