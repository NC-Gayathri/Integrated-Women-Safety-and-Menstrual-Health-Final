# NAARI KAVACH optical READY — current repair and physical acceptance

## Current status and scope — 4 October 2026

The repository default branch is **master**. The authoritative integration sketch is:

`esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino`

The required boot marker is:

```text
[FIRMWARE] mpu6500-ready-v3-20261004
```

Software/CI closure and physical-board closure are separate evidence gates. The repository now has bounded software evidence for MPU6050/MPU6500 compatibility, optical initialization/error recovery, BLE/SOS continuity and cleanup safety. A successful CI run does **not** prove that a particular MAX3010x module, USB cable or flashed ESP32 works physically.

## Optical READY meaning

Optical READY means all of the following succeeded for the identified device:

1. I2C address `0x57` responded.
2. PART_ID/revision could be read.
3. The PART_ID was supported (`0x11` MAX30100 or `0x15` MAX30102).
4. Software reset completed within the bounded timeout.
5. Chip-specific FIFO/mode/sample/LED configuration writes succeeded.
6. Critical configuration was read back and matched, including shutdown/reset/mode state.

READY does **not** claim that a finger is present, that HR/SpO2 is clinically valid, or that the prototype is a medical device.

## Confirmed software protections

- Bounded I2C timeout and retry behaviour prevent a missing sensor from blocking BLE/SOS indefinitely.
- Deferred repeated-start failures are retried using a STOP where it is safe to repeat the transaction.
- FIFO reads are treated differently because a failed transfer can already have consumed hardware FIFO bytes; ambiguous/partial FIFO failures invalidate readings and schedule full reinitialization instead of stitching together a fake sample.
- Shutdown, reset, mode, sample and LED configuration are verified by read-back before READY.
- Disconnects invalidate stale vital readings and schedule reinitialization.
- No-finger conditions do not invent heart-rate or SpO2 values.
- SOS button polling remains serviced around bounded sensor transactions.
- Motion-sensor failure and optical-sensor failure remain non-fatal to BLE/SOS startup.

## Current automated evidence

From repository root:

```sh
python3 scripts/test_naari_optical_readiness.py
python3 scripts/test_naari_optical_behavior.py
python3 scripts/test_naari_branch_cleanup.py
python3 scripts/test_naari_upload_recovery.py
```

The current sensor behaviour runner executes **33/33** deterministic cases around the real integration sketch through a controlled hardware boundary. Coverage includes the existing optical cases plus MPU6050 compatibility, MPU6500 `WHO_AM_I=0x70`, address `0x69`, unsupported identity rejection, wake/configuration read-back failures, reconnect recovery and SOS service during motion-sensor initialization.

The `NAARI KAVACH Closure Gate` also compiles the real sketch for `esp32:esp32:esp32doit-devkit-v1` using ESP32 Arduino core **3.3.12**, checks the BLE application TypeScript/lint contract, and builds the native Android debug APK. These are software/build gates only.

## Flash the correct sketch

If upload reports `Failed to connect to ESP32: No serial data received`, stop evaluating sensor READY. That error occurs before the new application runs. Follow [`NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md`](NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md) first.

The canonical physical recovery helper is:

```powershell
powershell -ExecutionPolicy Bypass -File .\ble-bridge\flash_ble.ps1 -Port COM5
```

Replace the example port with the port proven by unplug/replug in Windows Device Manager. The helper compiles the current dual-sensor sketch, performs a non-writing ROM-loader `read-mac` preflight, and refuses to write flash if the loader cannot be reached.

After successful flash, release BOOT, reset the board and capture Serial at **115200 baud**. The log must contain:

```text
[FIRMWARE] mpu6500-ready-v3-20261004
```

If that exact line is absent, do not use the subsequent sensor output as evidence for the current repair.

## Optical physical acceptance

Keep the approved integration wiring: SDA GPIO21, SCL GPIO22, common ground, SOS button GPIO4-to-GND, and the module's approved supply voltage. With the current firmware running, require one of:

```text
[OPTICAL] Identified MAX30100 PART_ID=0x11 ...
[EVENT] SENSOR:MAX30100:READY
```

or:

```text
[OPTICAL] Identified MAX30102 PART_ID=0x15 ...
[EVENT] SENSOR:MAX30102:READY
```

`[READY] BLE + SOS active` by itself is **not** optical acceptance.

If the result remains:

```text
[EVENT] SENSOR:MAX3010X:NOT_READY
```

capture the complete boot/retry log. The remaining diagnosis must distinguish absence/unreadable identity, unsupported part, reset timeout, configuration write failure, read-back mismatch, disconnect or electrical/wiring/power problems. Do not change the verified MPU6500 logic merely to make an unrelated optical fault disappear.

## Separate motion and SOS physical gates

For the reported motion device, a current-firmware success path is expected to include:

```text
[MPU] MPU6500 ready at 0x68 (WHO_AM_I=0x70, accel=+/-2g).
[EVENT] SENSOR:MPU6500:READY
```

The real GPIO4 three-click SOS path must also be exercised separately and observed as an SOS event. Motion READY, optical READY and SOS are three independent physical acceptance claims.

## Closure policy

Physical closure requires all evidence relevant to the claim being closed:

| Claim | Minimum physical evidence |
|---|---|
| Correct firmware installed | current `mpu6500-ready-v3-20261004` boot marker |
| MPU6500 fixed | real `WHO_AM_I=0x70` device reaches chip-specific READY after verified ±2 g configuration |
| Optical sensor fixed | real MAX30100/MAX30102 identification + chip-specific READY |
| SOS works | real three-click GPIO4 action produces SOS event |

Repository merge status, CI success or branch deletion cannot substitute for these observations.
