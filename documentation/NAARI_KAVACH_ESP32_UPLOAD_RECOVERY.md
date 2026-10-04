# ESP32 physical upload recovery — `No serial data received`

## Current evidence — 4 October 2026

The submitted Windows/Arduino log proves the **current dual-sensor sketch compiled and linked successfully** for `esp32:esp32:esp32doit-devkit-v1` using ESP32 Arduino core **3.3.12**. Image generation also completed and a 4 MB merged image was produced.

The attempt then failed at the serial-loader boundary on the selected Windows port with:

```text
Serial port ...
Connecting......................................
A fatal error occurred: Failed to connect to ESP32: No serial data received.
Failed uploading: uploading error: exit status 2
```

That failure happens **before the new application firmware can run**. It does not show an MPU6500, MAX3010x, BLE or SOS firmware failure. It also does not prove that the repaired firmware reached the physical ESP32.

The current acceptance marker is:

```text
[FIRMWARE] mpu6500-ready-v3-20261004
```

Any older firmware marker is stale and must not be used as physical acceptance evidence.

## Why the repository flash helper was repaired

The previous `ble-bridge/flash_ble.ps1` was unsafe for this repair because it fixed the port and high upload rate in the script and pointed to a **legacy BLE firmware binary**, not the verified `naari_kavach_dual_sensor_ble_test` sketch.

The repaired helper is fail-closed:

1. The caller must explicitly select the Windows COM port.
2. It verifies that the port currently exists.
3. It compiles exactly `esp32-firmware/naari_kavach_dual_sensor_ble_test` for the DOIT ESP32 DEVKIT V1 target.
4. It requires manual ROM-download-mode entry.
5. It runs a non-writing `read-mac` preflight at **115200 baud**.
6. **No flash write is attempted if that preflight fails.**
7. Only after the ROM loader responds does it write the freshly compiled merged image.
8. Physical acceptance still requires the current firmware marker after reset.

## Canonical recovery procedure

### 1. Identify the actual port

Close Arduino Serial Monitor, Serial Plotter and any other terminal using the ESP32.

In **Windows Device Manager > Ports (COM & LPT)**:

- note the visible ports;
- unplug the ESP32 and identify which port disappears;
- reconnect it and identify which port returns.

Use that port. The number can change after reconnecting the board, changing the USB socket, changing a cable, or reinstalling a USB-serial driver.

A power LED does **not** prove that the USB cable carries data.

### 2. First run the verified helper

From the repository root, substitute the port identified above:

```powershell
powershell -ExecutionPolicy Bypass -File .\ble-bridge\flash_ble.ps1 -Port COM5
```

`COM5` above is only an example argument. The script itself does not assume that port.

The helper uses **115200 baud** by default for recovery. Do not increase the rate while diagnosing `No serial data received`.

### 3. Enter ROM download mode when prompted

When the helper asks:

1. Locate the ESP32 board's **BOOT** (sometimes FLASH) button and **EN/RESET** button.
2. **BOOT is GPIO0**, not the project's external GPIO4 SOS button.
3. Press and hold **BOOT**.
4. While holding BOOT, briefly press and release **EN/RESET**.
5. Keep BOOT held.
6. Press Enter in the PowerShell helper.

The helper now executes a non-writing loader check equivalent to:

```text
esptool --chip esp32 --port <selected-port> --baud 115200 --before no-reset --after no-reset read-mac
```

If the chip identity/MAC cannot be read, the script terminates and states that **no flash was written**.

### 4. If `read-mac` still receives no serial data

Do these in order, changing wiring only while all power is disconnected:

1. **Port:** repeat the unplug/replug Device Manager test. Do not assume a previously used port number is still correct.
2. **Port ownership:** close Arduino Serial Monitor/Plotter, VS Code serial terminals, Python serial readers and other processes that may own the port.
3. **USB cable:** use a known-good USB **data** cable.
4. **USB path:** connect directly to the computer rather than through an unpowered or unreliable hub.
5. **Power:** verify the ESP32 is stably powered.
6. **External wiring isolation:** disconnect sensor/button wiring temporarily and retry with only ESP32 + USB. External circuits can disturb boot straps, reset or supply rails.
7. **Manual BOOT/EN sequence:** repeat it carefully. Automatic DTR/RTS reset is not treated as proof that the board actually entered the ROM loader.
8. **USB-serial driver:** if Windows shows an unknown device or no port, install/repair the driver appropriate to the board's USB-to-serial chip.
9. **Diagnostic baud only:** if the path remains noisy, a one-off `read-mac` diagnostic at 9600 can help distinguish link-quality issues. It is not a firmware fix.

If a known-good data cable, direct USB port, correct Windows port, manual BOOT/EN sequence and isolated board still cannot return a ROM-loader identity, the remaining problem is local to the physical USB/serial/reset/power/board path. Repository code cannot make a host receive bytes from a board that is not entering or exposing its ROM loader.

## After a successful flash

Release BOOT. If the application does not start automatically, tap EN/RESET once.

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ble-bridge\read_com5.ps1 -Port COM5
```

Again, substitute the actual verified port. The historical filename is retained for compatibility; the script itself is now port-parameterized.

With BOOT released, tap EN/RESET. Physical boot acceptance requires:

```text
[FIRMWARE] mpu6500-ready-v3-20261004
```

For the reported motion device, MPU acceptance then requires the current firmware to identify and configure the part, for example:

```text
[MPU] MPU6500 ready at 0x68 (WHO_AM_I=0x70, accel=+/-2g).
[EVENT] SENSOR:MPU6500:READY
```

The optical device is a **separate gate**. Do not convert `SENSOR:MAX3010X:NOT_READY` into a motion-sensor failure or claim the optical sensor passed because BLE/SOS started.

## Formal acceptance matrix

| Gate | Required evidence | Current status from the supplied 4 Oct log |
|---|---|---|
| Correct target/core selected | DOIT ESP32 DEVKIT V1 / core 3.3.12 | **PASS** |
| Compile/link/image generation | Successful ESP32 image + merged image | **PASS** |
| Program/RAM fit | Build completes within configured limits | **PASS** |
| ROM loader connection | ESP32 responds to verified-port `read-mac` | **FAIL / not established** |
| Flash write | esptool write completes successfully | **NOT REACHED** |
| Correct firmware boot | Current firmware marker after reset | **NOT ESTABLISHED** |
| MPU6500 physical readiness | `WHO_AM_I=0x70`, verified config, READY event | **NOT ESTABLISHED on this upload attempt** |
| MAX3010x physical readiness | chip-specific optical READY | **SEPARATE / NOT ESTABLISHED here** |
| SOS physical behavior | three-click SOS observed on real board | **NOT ESTABLISHED here** |

Repository CI can prove source-level contracts, host regressions and compilation. It cannot press the board's BOOT/EN buttons, replace a USB cable, select a Windows device, or observe the physical sensor bus. **Do not mark physical hardware closed until the upload, current boot marker and required real-board sensor/SOS evidence have been captured.**

## Primary references

- Espressif esptool troubleshooting — `No serial data received`, port, power, bootloader and lower-baud diagnostics.
- Espressif ESP32 boot-mode selection — GPIO0 / BOOT and reset behaviour.
- Espressif esptool basic commands — non-writing `read-mac` and flash operations.
