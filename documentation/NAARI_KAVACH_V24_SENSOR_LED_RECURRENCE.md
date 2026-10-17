# V24 recurrent missing sensors and unlit optical emitters — 17 October 2026

## What the new hardware log actually establishes

The supplied log reports repeated `[MPU] ... not detected at 0x68 or 0x69`,
`[EVENT] SENSOR:MAX3010X:NOT_READY`, and a successfully detected third press
with `[EVENT] SOS`. It does **not** contain a fresh boot header, I2C probe
error codes, power measurements, or an optical readback. It does not establish
which of power, board, wiring, pull-ups, I2C controller, or firmware age caused
the simultaneous sensor loss. A real physical repair is NOT established.

In the production sketch, GPIO2 drives the **ESP32 board-status LED**, whereas
the MAX30102 internal pulse-emitter RED and IR LEDs are enabled by MAX30102
registers across the shared I2C bus, provided its power rails work. The IR LED
is not visible to the naked eye. GPIO2 blinking is **not** proof of optical
emitter light and neither is a successful I2C register readback.

## Implemented changes

- On failed `probeAddress()`, serial prints
  `[I2C] Probe failed addr=0x57 error=2 SDA=1 SCL=1.` (illustrative only):
  real address, real final `Wire.endTransmission` return code and instantaneous
  pin levels. No guessed readouts are emitted. `2` is usually address NACK;
  `4` means an unspecified Wire error; `5` is timeout. An SDA/SCL snapshot
  HIGH does not rule out fast electrical glitches.
- Production firmware records `[DIAGNOSTIC_POLICY] probe-and-led-evidence-v24-20261017`.
  It requests a short GPIO2 status LED pulse after BLE and sensor startup.
  A missing on-board LED pulse suggests a separate board/pin/LED issue, not
  definitive proof of a fault in the MAX30102 emitter circuitry.
- After the real optical reset, configuration writes, and mode/current readback
  all succeed, production firmware prints `[OPTICAL_DRIVE]` with the verified
  register settings. This message means **programmed drive registers**, not
  verified physical light and not a valid heart-rate measurement.
- All existing optical fail-closed rules, 2-second retries, shared-controller
  bounded recovery, 100-Hz acquisition, SOS and BLE behavior remain in place.
- A new stand-alone **MAX30102-only emitter diagnostic sketch** tests a
  conservatively slow 10-kHz I2C bus, checks identities and readbacks, then
  requests 10 seconds of LED drive and verifies shutdown. It does not produce
  vitals or SOS/BLE events; it must not be left as the application firmware.

## Physical sequence — power OFF before touching a wire

1. Start with a steady USB supply and a verified 3.3-V-compatible breakout,
   never a bare 1.8-V-logic optical IC wired to 3.3-V logic. Compare BOTH
   breakout front/back labels to their manufacturer documentation: VIN, logic
   pull-up voltage, MAX30102 LED supply, MPU VCC, common GND. Do not hot-plug.
2. Reflash `master`'s production sketch with the guarded
   `ble-bridge/flash_ble.ps1` helper on the **actual** COM port. Capture a
   new 115200-baud log with the entire boot header. On the Windows machine:

   ```powershell
   .\ble-bridge\flash_ble.ps1 -Port COM5
   .\ble-bridge\read_com5.ps1 -Port COM5 -Sensor Both -Seconds 300 -OutputPath .\both-v24.txt -RequireTransportStable
   ```

   Replace COM5 with the actual port. A successful helper run is necessary but
   does not by itself establish that sensor hardware is healthy.
3. Stop USB power. Disconnect **both** breakouts, then connect **only the MPU**
   with verified safe 3.3-V-compatible voltage, short SDA21/SCL22 leads, and
   common ground. Reflash production firmware (not the optical diagnostic).
   ```powershell
   .\ble-bridge\read_com5.ps1 -Port COM5 -Sensor Mpu -Seconds 300 -OutputPath .\mpu-v24.txt -RequireTransportStable
   ```
   Expect real MPU READY plus repeating `[MPU_SIGNAL]` with **zero errors**.
   If this fails, inspect the actual 0x68/0x69 address and WHO_AM_I and repair
   power/contacts rather than synthesizing fall values.
4. Switch OFF again; connect **only MAX30102**. The 10-kHz isolated light sketch
   is under `esp32-firmware/max30102_light_probe/max30102_light_probe.ino`.
   **Temporarily flash that exact sketch** with Arduino IDE, DOIT ESP32 DEVKIT
   V1, 115200-baud Serial Monitor. Require:
   `[PROBE] addr=0x57 result=0`,
   `[LIGHT_TEST] PART_ID=0x15`,
   `[LIGHT_TEST] DRIVE_REGISTERS_VERIFIED`, and
   `[LIGHT_TEST] EMITTER_SHUTDOWN_VERIFIED`.
   Observe whether the **red** LED visibly illuminates during its 10-s drive
   interval. IR is invisible; a camera may display some IR but is not a
   calibrated light sensor. If register verification passes but red remains
   completely dark, inspect LED supply, breakout pinout, optics, or a damaged
   emitter; no software proof can exonerate hardware.
5. **Reflash production firmware** after the light test. With only MAX
   connected, capture 120s:
   ```powershell
   .\ble-bridge\read_com5.ps1 -Port COM5 -Sensor Optical -Seconds 120 -OutputPath .\optical-v24.txt -RequireTransportStable -RequireMeasuredHeartbeat
   ```
   Require real READY, real `[SIGNAL]` frames, stable physical waveform and
   valid `[EVENT] HEART_RATE:...`; an `[OPTICAL_DRIVE]` marker alone is
   insufficient. No dummy BPM and no relaxed SpO2 confidence gates.
6. Power OFF and reconnect BOTH only after individual testing. Require a full
   five-minute `-Sensor Both -RequireTransportStable` acceptance without
   `[I2C]` failures, shared bus restart or ESP32 reset. If both pass alone
   but fail together, test shared pull-up strengths, cable topology, power
   rail sag during LED activity, regulator capacity and I2C edges with an
   oscilloscope/logic analyzer. Validate mobile SOS receipt in a controlled
   test with emergency side effects disabled.

## Diagnostic decision table

| Observed evidence | Defensible interpretation | Next action |
| --- | --- | --- |
| GPIO2 never pulses; production boot marker present | Board LED not visually confirmed | Verify this board actually has a GPIO2 active-high LED; confirm wiring |
| 0x57 and 0x68/0x69 report error=2 | Neither address ACKed on those attempts | Power off, verify sensor supply, SDA/SCL/pull-up voltages and contacts |
| Probe error=4 or =5 | Bus/controller error or timeout, **not** proven address NACK | Check supply during activity, bus electrical integrity and scope |
| 0x57 ACK but part or reset/configuration fails | Module responds but optical READY unsafe | Inspect matching stage log; compare isolated 10-kHz test |
| Optical drive readbacks pass but red light stays off | Digital registers verified, **not** LED power/emission | Check LED rail, solder joints, breakout type and actual light |
| 0x57 RED visible and sampling but BPM absent | Light exists; signal/beat evidence untrusted | Stabilize placement, review pulse evidence, do not fabricate BPM |
| Either sensor READY only briefly | Initialization transient, not reliable transport | Demand entire post-boot stable capture |

## Verification and unresolved physical acceptance

The mandatory GitHub closure gate executes the actual C++ firmware through
its fake I2C boundary (including no-sensor/SOS, live optical register evidence,
and GPIO2 boot-pulse assertions), compiles production AND isolated Arduino
sketches for the stated ESP32 target, and checks source-linked Z3 logical
safety properties. The Z3 abstraction verifies the logical conjunction of
controller, address, identity, reset, configuration, readback and the
independence of GPIO2/SOS. It **does not** verify hardware electrical state,
actual LED photons, clinical accuracy, or phone delivery.

**Physical acceptance remains OPEN until new real-board evidence completes
all the steps above. No code change remotely fixes an unplugged sensor or
insufficient LED supply.**
