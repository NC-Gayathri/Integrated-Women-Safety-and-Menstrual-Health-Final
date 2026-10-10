# ESP32 firmware

## Current NAARI KAVACH dual-sensor BLE firmware — 9 October 2026

For the current BLE/SOS + motion + optical integration, flash:

[`naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino`](naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino)

from the repository's current default branch, `master`.

The current Serial boot marker is:

```text
[FIRMWARE] shared-bus-diagnostic-v13-20261010
```

Idle optical reporting is event-driven in v9: with no finger present the firmware keeps sampling for health/recovery but does not print periodic LOW_LIGHT/NO_VALID_READING lines. Finger placement/removal, numeric vitals, SOS/fall, BLE transitions, and genuine sensor faults remain visible.

This firmware keeps BLE and SOS available even when a sensor is unavailable, supports both MPU6050 (`WHO_AM_I=0x68`) and MPU6500 (`WHO_AM_I=0x70`) at I2C address `0x68` or `0x69`, and only reports the motion sensor READY after wake-state and ±8 g accelerometer configuration have been read back successfully.

**Readings disappear after large signal changes?** The [v6 settling repair](../documentation/NAARI_KAVACH_SIGNAL_SETTLING.md) immediately discards estimates across a large optical baseline change, rebases the signal, and waits for stable samples before detecting fresh beats. `SETTLING` distinguishes that phase from pulse acquisition. The new guide records the latest capture's accepted readings and remaining limits.

**Repeated `[I2C] Read failed` or sensor dropouts?** The [v5 I2C recovery repair](../documentation/NAARI_KAVACH_I2C_RECOVERY.md) stops the optical retry storm, immediately clears invalid readings, waits two seconds before verified recovery, and cancels motion sequences interrupted by a bus failure. The guide records the actual failed capture and the physical acceptance requirements.

The regression suite exercises **58 sensor/SOS/fall cases and 33 signal-acquisition cases**, plus the phone's validity/SOS parser. CI also compiles the real sketch for **DOIT ESP32 DEVKIT V1** with ESP32 Arduino core **3.3.12**. These software gates do not certify a physical USB cable, ROM-loader connection, flash operation, real sensor bus or measurement accuracy.

**Both sensors READY but `VITALS:NO_VALID_READING`?** Follow the [vitals acquisition guide](../documentation/NAARI_KAVACH_VITALS_ACQUISITION.md). This version preserves pulse history between beats, uses sample timing for buffered data, clears stale values, and prints `[SIGNAL]` raw red/IR values and the acquisition reason once per reporting interval. Update the phone app as well so `VITALS:ACQUIRING` clears old displayed readings.

**Upload stuck at `Connecting...` / `No serial data received`?** Follow the [Windows/Arduino ESP32 upload recovery guide](../documentation/NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md). The verified helper is `../ble-bridge/flash_ble.ps1`; it requires an explicit port and proves ROM-loader communication with non-writing `read-mac` before it is allowed to write flash.

After a successful physical flash, the current marker above must be captured from the board at 115200 baud before claiming that this firmware is actually running.

For optical acceptance, continue with the [optical READY repair and acceptance guide](../documentation/NAARI_KAVACH_OPTICAL_READY_REPAIR.md). Motion-sensor READY, optical READY and SOS operation are separate physical evidence gates.

## Other firmware variants

The repository also contains older or purpose-specific firmware variants. They are **not substitutes for the current dual-sensor acceptance sketch** above.

- **`esp32_wifi_firmware/esp32_wifi_firmware.ino`** — Wi-Fi based SOS firmware that sends backend events over HTTP.
- **`esp32_firmware/esp32_firmware.ino`** — legacy BLE GATT firmware.
- diagnostic/scanner sketches — intentionally narrow hardware-diagnostic programs.

Do not flash a legacy binary when validating `shared-bus-diagnostic-v13-20261010`.

---

## Wi-Fi SOS variant reference

The following wiring applies to the separate Wi-Fi SOS firmware, not to the dual-sensor acceptance claim.

| Component | Component Pin | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- | :--- |
| Physical Push Button | Terminal 1 | GPIO 4 | Configured with internal pull-up (`INPUT_PULLUP`) |
| Physical Push Button | Terminal 2 | GND | Connects to GND when pressed |
| Built-in Status LED | Internal | GPIO 2 | Status indication |

To use the Wi-Fi variant, configure its Wi-Fi/backend/device credentials in that sketch, choose the correct ESP32 board and actual COM port, upload it, and inspect its own Serial output. Its runtime/network behaviour is outside the current dual-sensor BLE acceptance gate.

## Single-axis fall detection (v11)

Both WHO_AM_I=0x68 (MPU6050) and WHO_AM_I=0x70 (MPU6500) are
verified at +/-8g, 4096 LSB/g. Sampling is requested every 10ms.
A fall alert needs sustained <0.5g free fall (60-600ms), a sampled
>2.5g impact, then 600ms of continuous near-1g stillness within 2s.
These are prototype heuristics, not a clinical fall detector. A brief
impact may be missed between samples; disconnected MPU/I2C or ESP32
brownout cannot generate reliable fall evidence. Run drop demonstrations
with the **device secured in a padded fixture**, not a loose wired
sensor PCB. Never physically drop an ESP32 connected to USB or a phone.

## v11 timing safety repair

The initial 25-second period following boot is no longer incorrectly treated as a cooldown: cooldown starts only after a real fall alert. The detector also cancels a pending fall when successive successful accelerometer observations have a gap greater than 150 ms; missing samples cannot establish continuous stillness. Regression coverage includes the first fall after startup, a 700-ms motion evidence gap and a genuine post-alert cooldown. This does not fix real electrical faults or medically validate fall detection.

See the [9 October independent audit and physical acceptance ledger](../documentation/NAARI_KAVACH_FORMAL_AUDIT_2026-10-09.md).

## Mathematical safety abstraction (v12, 10 October 2026)

The v12 fix treats a zero-valued previous accelerometer timestamp as valid, preserving gap rejection across a 32-bit millisecond-counter rollover. Android BLE parsing also requires exact `SOS`/`STATUS:ONLINE` strings and complete decimal HR/SpO2 payloads. The proof runner and precise limitations are described in [formal verification assurance](../formal-verification-and-mathematical-proofs/README.md). A successful SMT query proves the described model property under its explicit assumptions, not every firmware, radio, clinical, or hardware behavior.

## Repeated two-sensor I²C failure mitigation (v13, 10 October 2026)

The newest device log shows optical MAX30102 register-read failures followed by MPU6500 I²C failures; both later report READY and fail again. This is **not** accepted physical stability. v13 logs TX/RX failure detail and current SDA/SCL pin levels, correlates two sensor errors within 3 seconds, and conditionally reinitializes the ESP32's Wire controller at most once per 10 seconds **only when both devices are down and both lines sample HIGH**. LOW bus lines are diagnosed without pulsing them. The I²C controller restart always requires independent sensor revalidation; it never manufactures an optical reading or authorizes a physical acceptance claim.

See the [v13 root-cause and physical acceptance guide](../documentation/NAARI_KAVACH_SHARED_BUS_DIAGNOSIS_V13.md) and the [machine-checked safety model](../formal-verification-and-mathematical-proofs/README.md). The actual board's firmware version is only known once its live startup log displays `[FIRMWARE] shared-bus-diagnostic-v13-20261010`.

**Complete mathematical record:** [24 numbered GitHub-rendered LaTeX formulas](../formal-verification-and-mathematical-proofs/EXACT_THEOREMS.md), [SOS counter induction](../formal-verification-and-mathematical-proofs/SOS_COUNTER_INDUCTION.md), and [executable solver setup](../formal-verification-and-mathematical-proofs/PROOF_SCOPE_AND_REPRODUCTION.md).
