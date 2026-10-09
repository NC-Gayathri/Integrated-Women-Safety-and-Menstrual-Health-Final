# ESP32 firmware

## Current NAARI KAVACH dual-sensor BLE firmware — 5 October 2026

For the current BLE/SOS + motion + optical integration, flash:

[`naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino`](naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino)

from the repository's current default branch, `master`.

The current Serial boot marker is:

```text
[FIRMWARE] single-axis-fall-v10-20261009
```

Idle optical reporting is event-driven in v9: with no finger present the firmware keeps sampling for health/recovery but does not print periodic LOW_LIGHT/NO_VALID_READING lines. Finger placement/removal, numeric vitals, SOS/fall, BLE transitions, and genuine sensor faults remain visible.

This firmware keeps BLE and SOS available even when a sensor is unavailable, supports both MPU6050 (`WHO_AM_I=0x68`) and MPU6500 (`WHO_AM_I=0x70`) at I2C address `0x68` or `0x69`, and only reports the motion sensor READY after wake-state and ±2 g accelerometer configuration have been read back successfully.

**Readings disappear after large signal changes?** The [v6 settling repair](../documentation/NAARI_KAVACH_SIGNAL_SETTLING.md) immediately discards estimates across a large optical baseline change, rebases the signal, and waits for stable samples before detecting fresh beats. `SETTLING` distinguishes that phase from pulse acquisition. The new guide records the latest capture's accepted readings and remaining limits.

**Repeated `[I2C] Read failed` or sensor dropouts?** The [v5 I2C recovery repair](../documentation/NAARI_KAVACH_I2C_RECOVERY.md) stops the optical retry storm, immediately clears invalid readings, waits two seconds before verified recovery, and cancels motion sequences interrupted by a bus failure. The guide records the actual failed capture and the physical acceptance requirements.

The regression suite exercises **51 sensor/SOS cases and 30 signal-acquisition cases**, plus the phone's validity/SOS parser. CI also compiles the real sketch for **DOIT ESP32 DEVKIT V1** with ESP32 Arduino core **3.3.12**. These software gates do not certify a physical USB cable, ROM-loader connection, flash operation, real sensor bus or measurement accuracy.

**Both sensors READY but `VITALS:NO_VALID_READING`?** Follow the [vitals acquisition guide](../documentation/NAARI_KAVACH_VITALS_ACQUISITION.md). This version preserves pulse history between beats, uses sample timing for buffered data, clears stale values, and prints `[SIGNAL]` raw red/IR values and the acquisition reason once per reporting interval. Update the phone app as well so `VITALS:ACQUIRING` clears old displayed readings.

**Upload stuck at `Connecting...` / `No serial data received`?** Follow the [Windows/Arduino ESP32 upload recovery guide](../documentation/NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md). The verified helper is `../ble-bridge/flash_ble.ps1`; it requires an explicit port and proves ROM-loader communication with non-writing `read-mac` before it is allowed to write flash.

After a successful physical flash, the current marker above must be captured from the board at 115200 baud before claiming that this firmware is actually running.

For optical acceptance, continue with the [optical READY repair and acceptance guide](../documentation/NAARI_KAVACH_OPTICAL_READY_REPAIR.md). Motion-sensor READY, optical READY and SOS operation are separate physical evidence gates.

## Other firmware variants

The repository also contains older or purpose-specific firmware variants. They are **not substitutes for the current dual-sensor acceptance sketch** above.

- **`esp32_wifi_firmware/esp32_wifi_firmware.ino`** — Wi-Fi based SOS firmware that sends backend events over HTTP.
- **`esp32_firmware/esp32_firmware.ino`** — legacy BLE GATT firmware.
- diagnostic/scanner sketches — intentionally narrow hardware-diagnostic programs.

Do not flash a legacy binary when validating `single-axis-fall-v10-20261009`.

---

## Wi-Fi SOS variant reference

The following wiring applies to the separate Wi-Fi SOS firmware, not to the dual-sensor acceptance claim.

| Component | Component Pin | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- | :--- |
| Physical Push Button | Terminal 1 | GPIO 4 | Configured with internal pull-up (`INPUT_PULLUP`) |
| Physical Push Button | Terminal 2 | GND | Connects to GND when pressed |
| Built-in Status LED | Internal | GPIO 2 | Status indication |

To use the Wi-Fi variant, configure its Wi-Fi/backend/device credentials in that sketch, choose the correct ESP32 board and actual COM port, upload it, and inspect its own Serial output. Its runtime/network behaviour is outside the current dual-sensor BLE acceptance gate.

## Single-axis fall detection (v10)

Both WHO_AM_I=0x68 (MPU6050) and WHO_AM_I=0x70 (MPU6500) are
verified at +/-8g, 4096 LSB/g. Sampling is requested every 10ms.
A fall alert needs sustained <0.5g free fall (60-600ms), a sampled
>2.5g impact, then 600ms of continuous near-1g stillness within 2s.
These are prototype heuristics, not a clinical fall detector. A brief
impact may be missed between samples; disconnected MPU/I2C or ESP32
brownout cannot generate reliable fall evidence. Run drop demonstrations
with the **device secured in a padded fixture**, not a loose wired
sensor PCB. Never physically drop an ESP32 connected to USB or a phone.
