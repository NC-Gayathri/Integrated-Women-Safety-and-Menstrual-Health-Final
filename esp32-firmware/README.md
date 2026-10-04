# ESP32 firmware

## Current NAARI KAVACH dual-sensor BLE firmware — 4 October 2026

For the current BLE/SOS + motion + optical integration, flash:

[`naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino`](naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino)

from the repository's current default branch, `master`.

The current Serial boot marker is:

```text
[FIRMWARE] vitals-acquisition-v4-20261004
```

This firmware keeps BLE and SOS available even when a sensor is unavailable, supports both MPU6050 (`WHO_AM_I=0x68`) and MPU6500 (`WHO_AM_I=0x70`) at I2C address `0x68` or `0x69`, and only reports the motion sensor READY after wake-state and ±2 g accelerometer configuration have been read back successfully.

The regression suite exercises **33 sensor/SOS cases and 18 signal-acquisition cases**, plus the phone's validity/SOS parser. CI also compiles the real sketch for **DOIT ESP32 DEVKIT V1** with ESP32 Arduino core **3.3.12**. These software gates do not certify a physical USB cable, ROM-loader connection, flash operation, real sensor bus or measurement accuracy.

**Both sensors READY but `VITALS:NO_VALID_READING`?** Follow the [vitals acquisition guide](../documentation/NAARI_KAVACH_VITALS_ACQUISITION.md). This version preserves pulse history between beats, uses sample timing for buffered data, clears stale values, and prints `[SIGNAL]` raw red/IR values and the acquisition reason once per reporting interval. Update the phone app as well so `VITALS:ACQUIRING` clears old displayed readings.

**Upload stuck at `Connecting...` / `No serial data received`?** Follow the [Windows/Arduino ESP32 upload recovery guide](../documentation/NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md). The verified helper is `../ble-bridge/flash_ble.ps1`; it requires an explicit port and proves ROM-loader communication with non-writing `read-mac` before it is allowed to write flash.

After a successful physical flash, the current marker above must be captured from the board at 115200 baud before claiming that this firmware is actually running.

For optical acceptance, continue with the [optical READY repair and acceptance guide](../documentation/NAARI_KAVACH_OPTICAL_READY_REPAIR.md). Motion-sensor READY, optical READY and SOS operation are separate physical evidence gates.

## Other firmware variants

The repository also contains older or purpose-specific firmware variants. They are **not substitutes for the current dual-sensor acceptance sketch** above.

- **`esp32_wifi_firmware/esp32_wifi_firmware.ino`** — Wi-Fi based SOS firmware that sends backend events over HTTP.
- **`esp32_firmware/esp32_firmware.ino`** — legacy BLE GATT firmware.
- diagnostic/scanner sketches — intentionally narrow hardware-diagnostic programs.

Do not flash a legacy binary when validating `vitals-acquisition-v4-20261004`.

---

## Wi-Fi SOS variant reference

The following wiring applies to the separate Wi-Fi SOS firmware, not to the dual-sensor acceptance claim.

| Component | Component Pin | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- | :--- |
| Physical Push Button | Terminal 1 | GPIO 4 | Configured with internal pull-up (`INPUT_PULLUP`) |
| Physical Push Button | Terminal 2 | GND | Connects to GND when pressed |
| Built-in Status LED | Internal | GPIO 2 | Status indication |

To use the Wi-Fi variant, configure its Wi-Fi/backend/device credentials in that sketch, choose the correct ESP32 board and actual COM port, upload it, and inspect its own Serial output. Its runtime/network behaviour is outside the current dual-sensor BLE acceptance gate.
