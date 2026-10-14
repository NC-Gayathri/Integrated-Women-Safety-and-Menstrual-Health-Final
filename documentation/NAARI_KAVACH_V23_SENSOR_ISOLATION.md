# V23 physical isolation and heartbeat/fall acceptance — 14 October 2026

## What the latest live v22 log proves

The MAX30102 has actual light readings but **does not produce reliable beat
intervals**: at the end of the most recent capture there were 15 pulse
candidates, only two accepted intervals, six inconsistent intervals, two
out-of-range intervals and 21 placement/baseline rebases. The output
`VITALS:ACQUIRING` is expected given that evidence. It would be wrong to
publish a made-up number just because `[FINGER] DETECTED` appears.

The actual MPU is identified as an **MPU6500** (WHO_AM_I `0x70`), not an
MPU6050, although firmware supports both. Its six-byte acceleration reads
intermittently fail with `tx=4 rx=-1` (generic write-phase error) and
`tx=0 rx=0` (the register pointer write completed, but zero acceleration
bytes were received). Momentary `READY` after successful configuration
cannot prove stable future sampling. There is no documented, continuous
low-g + impact + post-impact stillness sequence in this trace. Therefore,
no `FALL_DETECTED` should be fabricated.

`[EVENT] SOS` does establish local triple-click behavior but not phone
delivery. No Wi-Fi, synthetic pulse, disabled I2C checks, or fall-event
shortcuts are necessary or acceptable.

## Software repair: proper isolation acceptance, not fake readings

The **firmware stays v22** with marker
`[EVIDENCE_POLICY] pulse-and-fall-diags-v22-20261014`.
The corrected Windows readout helper accepts `-Sensor Both` (default),
`-Sensor Mpu`, or `-Sensor Optical`. It measures the full requested
duration after a fresh physical boot marker. Selected sensor mode requires
(1) its READY transition, (2) at least one live output line from the
sensor (`[MPU_SIGNAL]` or `[SIGNAL]`), and (3) zero relevant transport
faults. Faults of an intentionally disconnected other module can be
ignored in single-sensor mode, but **shared bus faults**, unknown-address
I2C failures, reboot markers and the tested module's faults always fail.
The default `Both` mode remains strict. An optional
`-RequireMeasuredHeartbeat` requires an actual numeric
`[EVENT] HEART_RATE:...` (not just finger contact). An optional
`-RequireFallEvent` requires an actual `[EVENT] FALL_DETECTED`
(not just LOW_G_ENTER). Neither proves accuracy or phone delivery.

### Procedure: do not unplug powered components

**First: switch OFF ESP32 and sensor power.** Inspect the actual regulator
and I2C pull-up arrangements before applying any supply voltage. Never
connect an unknown bare optical chip to 5 V, tie an unverified I/O pin to
5 V, hot-plug jumper wires, or disable brownout detection. Use a
verified 3.3 V-compatible MPU module, common ground, short firm SDA=GPIO21
and SCL=GPIO22 leads, and a stable USB supply.

Connect **only MPU6500** and use a unique capture filename. Capture with
the device stationary and gently move the *secured assembly* during
another test. Do **not** drop loose modules, the USB-connected ESP32 or a
solderless breadboard. Do not demand optical READY with the MAX absent.

```powershell
git checkout master
git pull --ff-only origin master
# Flash first, with both modules powered and connected, or after wiring to
# the desired test setup, then close Serial Monitor:
.\ble-bridge\flash_ble.ps1 -Port COM5
.\ble-bridge\read_com5.ps1 -Port COM5 -Sensor Mpu -Seconds 300 -OutputPath .\mpu-alone-01.txt -RequireTransportStable
```

If this returns fault exit code 4, the MPU **itself or its connections**
remain unstable. With power OFF, change the jumper wires to short,
firm/soldered leads, reseat/connect common GND, confirm supply at the
module *while active*, and try a known-good, supported MPU breakout.
A multimeter can miss brief voltage dips, and an oscilloscope or logic
analyzer is needed to verify I2C signal timing. If the MPU fails alone,
do not alter the fall algorithm to pretend the readings succeeded.

Then power off and connect **only MAX30102**, with the correct voltage
regulation/logic for that exact breakout:

```powershell
.\ble-bridge\read_com5.ps1 -Port COM5 -Sensor Optical -Seconds 120 -OutputPath .\optical-alone-01.txt -RequireTransportStable -RequireMeasuredHeartbeat
```

Hold the finger **still and gently** over both optical windows. Prevent
ambient light leaks and avoid pressing too hard. This command will
report failure if the sensor is connected but no real beat intervals yield
a valid BPM; that distinguishes physical waveform quality from transport
stability. A missing BPM is not solved by assigning a default value.
Test again with physically stable placement, then inspect the v22
`[PULSE_EVIDENCE]` counters. If they continue showing irregular or
out-of-range intervals, collecting the raw 100 Hz stream with a test-only
capture tool is the next justified basis for tuning the pulse algorithm.

Finally, switch power off, reconnect **both** sensors and repeat the
full five-minute test:

```powershell
.\ble-bridge\read_com5.ps1 -Port COM5 -Sensor Both -Seconds 300 -OutputPath .\both-01.txt -RequireTransportStable
```

If each sensor passes individually but the combined test fails, the
shared power rail, aggregate pull-ups, cable topology, signal integrity
or module interaction is suspect. Do not infer the defective component
from a single `tx=4` or SDA/SCL-high snapshot.

A controlled physical fall test may use `-Sensor Mpu -RequireFallEvent`
**only after** stable transport has been established with a securely
mounted assembly in a padded fixture. True fall verification requires
the sampled low-g interval, the measured impact and 600 ms of valid
post-impact stillness. A sudden slap/motion or a detached lead is
not equivalent to a confirmed fall. Use test configurations to avoid
unintended notifications/emergency consequences.

## Acceptance ledger

- Software regression: production PowerShell parser and an independent
  test of both-sensor, single-sensor and unknown/shared fault classifications
  must pass on GitHub CI.
- MPU transport: 300s uninterrupted READY and actual MPU_SIGNAL readings,
  zero relevant I2C/controller errors.
- Optical transport: uninterrupted READY and actual SIGNAL readings;
  the independent measured-BPM requirement must also pass for the promised
  heartbeat display.
- Dual bus: 300s both live, no shared/I2C/sensor error.
- Fall: complete sampled 3-phase sequence yields local FALL_DETECTED,
  and Android/back-end/phone receive it in a safe test with external
  alert side effects disabled.
- **Until hardware evidence is collected, physical closure remains open.**
