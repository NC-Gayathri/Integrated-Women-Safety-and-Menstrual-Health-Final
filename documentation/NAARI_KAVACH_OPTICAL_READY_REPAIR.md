# Optical sensor identified but not READY — repair and acceptance

## Status and scope

This continues PR #3 (`fix/naari-kavach-optical-ready`). The repository's default
branch is named **master**, not main. After verified integration and cleanup,
use that default branch as the source of truth. Renaming a default branch needs
repository administration permission; the connected account has push access.

The code/CI closure and the physical-board closure are separate evidence gates.
No physical-board Serial log or new flash result was supplied for this repair.
Therefore physical acceptance remains **PENDING** until the checks below are
observed. READY means initialization was reset/configured/read back successfully;
it does not assert that valid HR/SpO2 readings have already been acquired.

## Confirmed software defects and changes

- The inherited PR failed the actual ESP32 compile: Arduino generated prototypes
  before the `OpticalChip` enum. Explicit declarations fix that ordering.
- The old mainline aborted register access on one failure with a 5 ms timeout.
  Initialization now uses a 50 ms transaction timeout and two bounded attempts.
- On ESP32, repeated-start I/O is deferred to `requestFrom()`. The inherited PR
  only switched to STOP when `endTransmission(false)` failed. A deferred read
  failure therefore repeated the same failing transaction. The second attempt
  now uses STOP for failures at either stage.
- Initialization performs a bounded software reset, writes the chip-specific
  configuration, and reads back mode, sample settings and LED settings before
  READY. Mode validation includes **shutdown**, reset and operating-mode bits.
- SOS polling happens before/after bus operations, including initialization.
  The 50 ms debounce accepts equality so a 50 ms polling boundary cannot hide
  an otherwise debounced click. Three-click/1.8-second behaviour is preserved.
- FIFO reads use STOP on the first attempt and are never immediately retried.
  The SDK can report zero after a partially consumed transfer. Every failed FIFO
  transfer invalidates readings and schedules a full reset before more sampling.
- Serial output identifies the chip before configuration and names the failed
  register/write or mismatched read-back value, plus the reset/write/read stage.

The exact cause on the sister's physical board is not proven by the sentence
“identified but not ready.” The above are reproducible software defects. Power,
pull-ups, module identity, wiring and clock tolerance still require observation.
The standalone identification sketch uses 10 kHz; this integration retains the
agreed **100 kHz** bus. Success in that scanner alone does not validate 100 kHz
configuration/sampling.

## Automated evidence

Run from repository root:

```sh
python3 scripts/test_naari_optical_readiness.py
python3 scripts/test_naari_optical_behavior.py
python3 scripts/test_naari_branch_cleanup.py
```

The behaviour runner compiles the actual integration sketch with a deterministic
hardware boundary and UndefinedBehaviorSanitizer. The original inherited code
passed 16/22 cases and failed deferred register read recovery, shutdown rejection
for both chips, deferred FIFO read recovery, partial FIFO rejection, and SOS
during initialization. A second review reproduced two additional FIFO cases where the hardware pointer
advanced but the SDK reported zero bytes. The final suite passes **24/24** cases,
including reinitialization after those errors.

Other cases cover both chip identities, transient writes, missing/unknown or
unreadable sensors, stuck reset, persistent configuration/read-back failures,
wrong register values, disconnect/reconnect recovery and no-finger validity.
The hardware boundary is a model; it does not reproduce electrical signalling,
RTOS scheduling or a real BLE radio.

The `NAARI KAVACH Closure Gate` also builds the real sketch for
`esp32:esp32:esp32doit-devkit-v1` using ESP32 Arduino core **3.3.12**, checks the
app's BLE TypeScript/lint contract, and builds the native Android debug APK.
Its push run repeats validation after merge. Only after all four jobs succeed,
the **Delete merged repair branch** job verifies PR #3's merged SHA, default
branch, branch ownership, unchanged repair head and ancestry before deletion.
It refuses cleanup if the inspected default branch has moved. A Git expected-head
lease atomically rejects deletion if the repair branch changes, including changes
after the guard check. Three local Git integration checks prove changed-head
preservation, exact-head deletion and rejection of a missing verified SHA.

PR checks and run artifacts are the authoritative remote build evidence. The
firmware artifact contains `SOURCE_COMMIT.txt`, `BOARD.txt` and `SHA256SUMS` so
the downloaded binary can be traced to the build. A debug APK is a test build.

## Flash exactly this sketch

1. Download/pull the current default branch after PR #3 is merged.
2. Open `esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino`.
3. In Arduino IDE select **DOIT ESP32 DEVKIT V1**, ESP32 core **3.3.12**, and
   the board's USB port. Compile, then upload. No extra sensor library is needed.
4. Open Serial Monitor at **115200 baud**, press the board's reset button and
   save the complete boot log. It must include:

```text
[FIRMWARE] optical-ready-v2-20260930
```

If that line is absent, the repaired sketch is not running. Updating GitHub or
installing the phone app does not flash the ESP32.

5. Keep the existing approved wiring: SDA21/SCL22, common ground, GPIO4 button
   to ground, GPIO2 LED. Check the actual breakout board's supply specification;
   a breakout VIN pin is not the same as a bare sensor's 1.8 V VDD pin.
6. Look for **both** the identification line and the chip-specific READY event:

```text
[OPTICAL] Identified MAX30100 PART_ID=0x11 ...
[EVENT] SENSOR:MAX30100:READY
```

or MAX30102 with PART_ID `0x15`. `[READY] BLE + SOS active` by itself only
confirms BLE/SOS startup and must not be used to pass this sensor gate.

## Physical acceptance still required

| Check | Required observation | Current evidence |
|---|---|---|
| Flashed version | Exact firmware marker and commit recorded | Pending |
| Initialization | Identification, completed reset/configuration, optical READY | Pending |
| Sampling | Sustained samples; no recurring stalled-FIFO/reconfiguration loop | Pending |
| Finger/no finger | Real HR/SpO2 events; invalid/acquiring state without signal | Pending |
| BLE/mobile | Exact name/UUID subscription and correct displayed status | Pending |
| SOS | Three clicks work during acquisition, absent sensor and disconnect | Pending |
| MPU6050 | Detection and safe motion test under the existing test plan | Pending |

Use the [full physical test plan](NAARI_KAVACH_DUAL_SENSOR_BLE_TEST_PLAN.md) for
Tests A/B/C. Do not mark these rows passed from a simulator or CI result.

If it still fails, retain the complete log from boot through two retry attempts,
including the firmware marker, PART_ID/REV, failed register and exact stage.
A write/read-back failure calls for checking wiring, supply and bus integrity;
a reset timeout or unknown PART_ID must not be bypassed by forcing READY true.

## Primary implementation references

- [ESP32 Wire implementation](https://github.com/espressif/arduino-esp32/blob/3.3.12/libraries/Wire/src/Wire.cpp): deferred repeated-start transaction and requestFrom result.
- [ESP32 I2C HAL](https://github.com/espressif/arduino-esp32/blob/3.3.12/cores/esp32/esp32-hal-i2c-ng.c): zero read count on transfer errors.
- [Arduino build process](https://docs.arduino.cc/arduino-cli/sketch-build-process/): generated function prototypes.
- [MAX30100 data sheet](https://www.analog.com/media/en/technical-documentation/data-sheets/max30100.pdf), Mode Configuration 0x06.
- [MAX30102 data sheet](https://www.analog.com/media/en/technical-documentation/data-sheets/max30102.pdf), Mode Configuration 0x09 and FIFO semantics.
