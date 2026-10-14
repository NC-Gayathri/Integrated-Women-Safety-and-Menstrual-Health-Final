# Contact chatter and MPU transport failures — 14 October 2026

Current physical acceptance marker: `[CONTACT_POLICY] qualified-contact-v21-20261014`.
Earlier policy markers remain in the boot header. The Windows flash and capture
helpers require this newest marker, so an older uploaded binary cannot satisfy
their version check.

## What the supplied trace establishes

The MPU6500 sometimes identifies but fails writes to wake register 0x6B and
accelerometer configuration register 0x1C. The optical sensor continues to
provide fresh frames. The trace also repeatedly alternates FINGER DETECTED and
REMOVED around weak optical levels near IR 3,000. It contains a local SOS event,
but no successful numeric vitals or MPU READY, phone delivery evidence, or boot
marker establishing which firmware ran.

In the pinned [ESP32 Arduino 3.3.12 Wire implementation](https://github.com/espressif/arduino-esp32/blob/3.3.12/libraries/Wire/src/Wire.cpp),
transmit return 4 is a generic error, 2 includes NACK, and 5 is timeout. Here
`rx=-1` is our diagnostic sentinel for a receive that was not attempted after
a transmit failure. SDA=SCL=1 is only a digital snapshot; it does not establish
electrical stability. This capture does not identify the defective component.

## Software correction

The old single-sample contact rule immediately toggled at IR 3,000. V21 requires
20 consecutive qualifying frames (200 ms at the verified 100 Hz sample rate),
with RED at least 5,000 and IR at least 10,000, before announcing new contact.
Those are the existing numeric-quality floors, not a new clinical calibration.
Weak frames break qualification; clipping, transport reset and missing samples
discard it. Buffered FIFO frames count by samples rather than loop speed.

Once contact is qualified, the original RED 1,000 / IR 3,000 exit floors remain.
A frame at or below either floor, or clipping, immediately clears estimates.
The gap between entry and exit thresholds prevents weak rebound from declaring
new contact. Pending contact is available as CONTACT_PENDING in explicit signal
diagnostics. WEAK_CONTACT remains distinguishable from LOW_LIGHT.

The settling, pulse-confidence and SpO2 quality gates remain active. Qualifying
light does not prove a pulse; changing placement can still yield SETTLING or
ACQUIRING. The MPU's retries, configuration verification and error reporting
remain active. V21 does not force sensor READY or restart a healthy optical
sensor to disguise a motion-sensor fault.

## Software verification and limits

The actual sketch is compiled in host regressions with undefined-behavior
sanitization. Fourteen added contact cases cover both optical chips, boundary
chatter, interrupted qualification, stale-frame arrival, transport recovery,
clipping and removal/reapplication. They fail against pre-repair master and
pass with the correction. Two existing settling fixtures now establish contact
for 20 frames before exercising their original settling assertions.

Two additional MPU fault-injection controls reproduce error 4 at the wake and
configuration writes: no false MPU READY, continued optical samples, no shared
controller restart, local SOS handling, and recovery only after successful
configuration. These controls validate existing behavior; they do not prove
the physical MPU has recovered. Existing SMT checks concern their documented
abstract safety models, not contact accuracy or the electrical assembly.

## Apply and decide physical acceptance

From the repository root on the connected Windows computer, replace COM5 if
the board uses another port. Close Serial Monitor before each helper:

```powershell
git checkout master
git pull --ff-only origin master
.\ble-bridge\flash_ble.ps1 -Port COM5
.\ble-bridge\read_com5.ps1 -Port COM5 -Seconds 300 -OutputPath .\naari-v21-test.txt -RequireTransportStable
```

Follow the helper's reset prompt. Its five-minute transport check requires the
new marker, both sensors READY, and zero observed transport faults. An existing
output file is never overwritten. The check does not certify pulse accuracy or
phone delivery. Hold a finger still over both optical windows for 20 seconds
to evaluate acquisition separately, then remove it and check that values clear.

If the MPU error persists, switch all power off and disconnect the MAX module.
Test the MPU alone with short, secure connections: SDA21, SCL22, common GND and
the already specified 3.3 V supply. Missing optical messages are expected in
this isolation test; do not use the dual-sensor acceptance switch for it. If
MPU failures persist, replace its jumper connections and compare with a known
working MPU module. If each sensor works alone but fails together, inspect
the shared supply and pull-ups locally. Do not change an unidentified breakout
to 5 V or disable brownout protection. See the [electrical isolation procedure](NAARI_KAVACH_V17_RECURRENCE_DIAGNOSIS.md).

Hardware acceptance remains open until the current binary passes the physical
tests. A passing GitHub build or a local SOS log cannot close that requirement.
