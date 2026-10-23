# V25 sensor and LED fault isolation (23 October 2026)

Project submission deadline: **3 November 2026**.

## Evidence boundary

Gayathri reports unsuccessful physical rectification on 21 October.
Existing logs show successful local SOS but recurring unavailable MPU (0x68/0x69)
and MAX3010X (0x57) with LEDs not visibly lit. Earlier capture briefly found
MPU6500 WHO_AM_I 0x70 and actual MAX30102 optical samples before I2C errors.
No fresh boot header, power-rail measurements, exact breakout photographs or
30-second V25 log have been supplied. The hardware root cause is **not established**.

## Important power safety

The bare MAX30102 core requires ~1.8 V and separate LED supply around 3.3 V.
Some module boards include regulators and level shifting; others do not.
The module's actual silk-screened VCC/VIN is NOT necessarily the bare core VDD.
Consult its specific pinout, do not put 3.3 V on a bare 1.8 V VDD pin,
do not apply 5 V to unverified sensor or I2C pins, and do not reconnect powered
modules. Both modules must share GND and I2C SDA21/SCL22 with compatible
pull-up voltage. Inspect breakout front and back for regulatory components.
Sources: https://www.analog.com/en/products/max30102.html and
https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/i2c.html.

## Two separate firmware modes

1. **Real wearable application:** esp32-firmware/naari_kavach_dual_sensor_ble_test/
   naari_kavach_dual_sensor_ble_test.ino. Keeps BLE, triple-click SOS and
   verified-vitals/fall state machines. Boot marker contains
   [DIAGNOSTIC_POLICY] probe-and-led-evidence-v24-20261017.
2. **TEMPORARY triage:** esp32-firmware/naari_sensor_triage/naari_sensor_triage.ino.
   Replaces the wearable application for diagnosis. **No BLE or emergency SOS**
   while this sketch is flashed; never use it for protection.

## Gayathri: do this first, without changing any wires

1. Photograph front and back of MPU and MAX30102 boards and the entire wiring.
   On a Windows PC open Arduino IDE, select DOIT ESP32 DEVKIT V1 and the
   actual ESP32 COM port.
2. Open the **V25 temporary diagnostic** file. Upload it with both modules
   connected (after confirming their correct safe voltage). Open Arduino
   Serial Monitor at 115200 baud. Press EN/RESET and capture the full boot
   and test, including the [TRIAGE_SUMMARY] and [TRIAGE_END] lines.
3. Confirm a new version line:
   [TRIAGE_VERSION] naari-shared-bus-power-fifo-v25-20261023.
   The sketch checks both I2C addresses at 10 kHz, performs supported MPU
   configuration and six-byte acceleration reads, verifies MAX30102 ID and
   drive registers, then counts real, complete optical FIFO reads at 50 Hz
   for 30 seconds. Hold a finger gently over the optical windows for most
   of the capture. Red is pulsed and may be faint; IR is invisible.
   Register readback and nonzero samples do NOT prove physical LED light.
4. **Immediately restore the real BLE/SOS application.** Flash the official
   sketch from master with the guarded flash helper, and verify the v24
   boot marker. Never leave this triage sketch flashed on the wearable.

The existing ble-bridge/read_com5.ps1 helper checks official application
versions and is NOT a capture tool for the temporary V25 sketch. Capture
V25 using Arduino Serial Monitor; do not bypass official version checks.

## Failure interpretation

| V25 evidence | What it can establish | Next physical test |
| --- | --- | --- |
| BUS init=FAILED | ESP32 I2C initialization failed | Check board/pins/core; no sensor I2C permitted |
| BOTH 0x57 and 0x68/0x69 error=2 | No ACK on those probes | Check GND, power, wire continuity, module VIN, swapped SDA/SCL |
| error=4 or 5 | Generic bus error or timeout, not proven NACK | Test pull-ups, signal integrity, supply dips, voltage compatibility |
| MPU WHO_AM_I 0x70 then sampled accel frames | MPU6500 can communicate at this clock | Demand 300s stable production motion samples |
| MPU ACCEL_READ_FAIL | Missing trustworthy movement data | Fix I2C first, NEVER simulate fall |
| MAX PART_ID=0x15 and DRIVE_REGISTERS_VERIFIED | Digital mode and current registers read back | Check FIFO statistics and separate LED power supply |
| optical_samples=0 | No full unread FIFO frames collected | Inspect module clock, FIFO, wiring, power, optics |
| optical_samples>0 but all zero | Digital FIFO data without a useful optical signal | Check sensor light rail and optical contacts |
| optical_samples>0, nonzero>0 | Optical ADC returned nonzero values | Still need actual measured pulse, not clinical proof |
| SHUTDOWN not verified | Optical LED shutdown could not be read back | Switch off power safely; do not wear in diagnostic mode |

A working 10-kHz diagnostic is NOT proof that the production 100-kHz shared
I2C bus can operate. A GPIO2 LED pulse is not the MAX30102 emitter light.
The red emitter can be faint and IR is invisible.

## If both connected still fail: isolate with POWER OFF each time

- Test **MPU-only** with a safely compatible breakout, stable common ground,
  short secure SDA21/SCL22. Run V25. A missing 0x57 is expected and is not
  an MPU fault. Require supported WHO_AM_I and real complete accelerometer
  frames. If not, suspect wire/supply/breakout.
- Test **MAX30102-only** with confirmed correct regulator/LED rail and voltage
  for that exact module. Run V25. Missing MPU ACK is expected. Require 0x57
  ACK, PART_ID=0x15, register verification and non-empty optical FIFO.
- If each works alone and both fail together, inspect common rail sag when
  optical LED is driven, conflicting parallel I2C pull-ups, cable length,
  module grounds, I2C rise time. A logic analyzer/oscilloscope is useful
  when a multimeter cannot catch fast dropouts.
- Never remove the pull-ups blindly, disable brownout checks, hardcode BPM,
  or declare FALL_DETECTED without real complete low-g/impact/stillness.

## Final acceptance before the 3 November submission

After restoring official firmware and confirming its fresh v24 boot marker:

1. MPU-only: 300 seconds of READY and actual MPU_SIGNAL values, zero
   relevant transport errors.
2. Optical-only: 120 seconds of READY plus actual SIGNAL values and
   valid measured HEART_RATE event, zero relevant transport errors.
3. Both: 300 seconds simultaneously, zero I2C errors/controller reset/
   unexpected device reboot.
4. Controlled mobile test: actual phone receipt of local triple-click SOS
   with outgoing emergency side effects disabled. Confirm fall in a padded,
   secured test fixture, not by dropping wired electronics.
5. Save board photos, power readings during LED activity and serial logs as
   submission evidence. If physical checks fail, report their exact failed
   gates rather than claiming full end-to-end formal verification.

PowerShell commands for PRODUCTION firmware only (replace COM5 if different):

    .\ble-bridge\flash_ble.ps1 -Port COM5
    .\ble-bridge\read_com5.ps1 -Port COM5 -Sensor Mpu -Seconds 300 -OutputPath .\mpu-final.txt -RequireTransportStable
    .\ble-bridge\read_com5.ps1 -Port COM5 -Sensor Optical -Seconds 120 -OutputPath .\optical-final.txt -RequireTransportStable -RequireMeasuredHeartbeat
    .\ble-bridge\read_com5.ps1 -Port COM5 -Sensor Both -Seconds 300 -OutputPath .\both-final.txt -RequireTransportStable

Software verification is scoped: actual source behavior tests, compiled ESP32
firmware, and Z3 modeled invariants. These **cannot certify physical sensors**.
Physical closure remains OPEN until fresh real-board evidence passes.
