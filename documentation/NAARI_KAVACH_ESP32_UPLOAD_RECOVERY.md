# ESP32 upload recovery: no serial data received

## What the 3 October 2026 log proves

The DOIT ESP32 DEVKIT V1 sketch compiled successfully with ESP32 core 3.3.12.
The failure is at the serial connection stage, before this attempt writes firmware.

| Log evidence | Meaning |
|---|---|
| Sketch uses 1,129,287 / 1,310,720 bytes (86%) | Program fits the selected partition |
| Global variables use 42,892 / 327,680 bytes (13%) | Static RAM allocation fits |
| ESP32 images created successfully | Compile/link/image generation completed |
| COM5, Connecting..., no serial data received, exit status 2 | esptool could not communicate with the ROM download loader |

Cached compile messages are informational. This log does not show a sensor
initialization failure and does not prove the new firmware reached the board.
It cannot distinguish a reset/download-mode problem from an incorrect port,
USB/serial connection, or power problem.

## First recovery attempt in Arduino IDE

1. Close Serial Monitor, Serial Plotter and any other terminal using this board.
2. Select **DOIT ESP32 DEVKIT V1** and keep ESP32 core **3.3.12**. In
   **Tools > Port**, select the port belonging to this physical ESP32. The
   reported attempt used **COM5**, but the number can change after reconnection.
3. If the board menu exposes **Upload Speed**, select **115200** for this retry.
   Leave the partition scheme unchanged: the supplied image already fits.
4. Locate the ESP32 board's **BOOT** (sometimes FLASH) and **EN/RESET** buttons.
   BOOT is the onboard GPIO0 button, not the project's external GPIO4 SOS button.
5. Press and hold **BOOT**. While holding it, briefly press and release
   **EN/RESET**. Keep BOOT held.
6. Click **Upload**. Keep holding BOOT through compilation and the
   `Connecting...` phase. Release BOOT once esptool identifies the ESP32 and
   writing progress starts.
7. Wait for the upload to finish successfully. With BOOT released, tap
   **EN/RESET** to start the application if it does not start automatically.
8. Open Serial Monitor at **115200 baud**. With BOOT released, tap **EN/RESET**
   and capture the boot output from this reset. Confirm:

```text
[FIRMWARE] optical-ready-v2-20260930
```

Then check for the separate optical sensor READY event in the
[optical acceptance guide](NAARI_KAVACH_OPTICAL_READY_REPAIR.md).
The BLE/SOS startup message alone is not optical acceptance.

Holding GPIO0 low during reset selects the ROM serial download loader. This
manual sequence addresses failed automatic bootloader entry; it cannot repair
a broken cable, unpowered board or failed USB-to-serial interface.

## If there is still no response

Follow these checks in order. Change wiring only with USB and other power removed.

1. **Confirm the port.** In Windows Device Manager, expand **Ports (COM & LPT)**.
   Unplug the ESP32 and see which device disappears; reconnect it and see which
   returns. Select that port in Arduino IDE. If no port appears, try a known
   working USB data cable and a direct computer USB port. A power LED alone does
   not prove that the cable has working data wires. Check the USB-serial device's
   driver if Windows shows an unknown device; use its manufacturer's driver.
2. **Isolate the board.** With power disconnected, temporarily remove the sensor,
   button and other external wiring, then retry the BOOT/EN upload with only the
   ESP32 and USB attached. External wiring can interfere with power or boot pins.
   On the classic ESP32, GPIO2 must be floating or low for download mode; GPIO12
   held high can select the wrong flash voltage. Keep the board's own components
   intact. Reconnect the approved project wiring only after disconnecting power.
3. **Check the serial path without writing flash.** Close Serial Monitor again.
   Manually enter download mode as above, then run the optional PowerShell check
   below. It uses the esptool installation shown in the submitted log. Replace
   COM5 if the port check found a different port.

```powershell
$naariEsptool = Join-Path $env:LOCALAPPDATA 'Arduino15\packages\esp32\tools\esptool_py\5.3.1\esptool.exe'
if (-not (Test-Path -LiteralPath $naariEsptool)) { throw 'esptool 5.3.1 was not found at the path used by the supplied log.' }
& $naariEsptool --chip esp32 --port COM5 --baud 115200 --before no-reset --after no-reset read-mac
```

`read-mac` reads the chip identity and does not write or erase flash. `no-reset`
preserves the manually selected download mode. If it prints the ESP32 identity
and MAC successfully, the serial/download path works in that test: retry Arduino
Upload with BOOT held during reset. After the diagnostic, release BOOT and tap
EN/RESET to run the application. If communication still fails, one diagnostic
retry at `--baud 9600` can help separate baud/noise problems; it is not a firmware
repair.

4. **Record what the board sends.** Open Serial Monitor at 115200, leave BOOT
   released, and tap EN/RESET. Save the complete output (or explicitly record
   that it remains blank). Also record the Device Manager port/device name and
   whether a different data cable/direct USB port changed the result. A board
   that remains silent through these checks needs local power/USB/board diagnosis.

## Acceptance and closure

| Gate | Required evidence | Status from the submitted log |
|---|---|---|
| Firmware compilation | Successful compile and image generation | Passed |
| ROM loader connection | ESP32 identity received on the verified port | Failed in this attempt |
| Upload | Flash writing and verification finish successfully | Not reached |
| Correct firmware boot | Firmware version marker after reset | Not supplied |
| Sensor readiness and SOS | Physical tests in the existing acceptance plan | Still pending |

Repository CI verifies software builds and regression tests. It does not operate
the owner's USB cable, buttons or Windows COM port. Do not mark the upload or
sensor issue physically closed until the successful upload and boot evidence
have been captured. A merge or a branch deletion does not satisfy those gates.

## Primary references

- [Espressif: troubleshooting, including no serial data received](https://docs.espressif.com/projects/esptool/en/latest/esp32/troubleshooting.html)
- [Espressif: boot mode selection and manual BOOT/EN sequence](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html)
- [Espressif: read-mac command](https://docs.espressif.com/projects/esptool/en/latest/esp32/esptool/basic-commands.html#read-built-in-mac-address-read-mac)
- [Espressif: reset options](https://docs.espressif.com/projects/esptool/en/latest/esp32/esptool/advanced-options.html)
