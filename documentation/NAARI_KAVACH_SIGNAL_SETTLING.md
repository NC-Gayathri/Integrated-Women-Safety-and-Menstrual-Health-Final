# Optical signal settling — 5 October 2026

Current firmware: `[FIRMWARE] fall-guard-v8-20261006`.
The authoritative source is the dual-sensor sketch on `master`. All earlier
MPU compatibility, upload, I2C recovery and stale-phone-value repairs remain
included.

## What the latest capture actually contains

`Pasted text(20261005-125514).txt` contains 94 once-per-second signal reports:
79 `ACQUIRING`, two `SPO2_ACQUIRING`, and 13 `VALID`. There are 15 heart-rate
reports (67–97), 13 prototype SpO2 reports (91–100), one local SOS event and one
local `FALL_DETECTED` event. Reported sample ages are 1–8 ms. There are no I2C
errors, overflows, resets or brownout lines in this excerpt. There is also no
boot marker, so the excerpt alone does not establish the flashed revision.

The optical signal responds strongly: IR ranges from approximately 7,000 to
246,000. This is no longer the earlier uniformly low-light capture. A run of
accepted estimates is present, but repeated large changes in baseline surround
long acquisition periods. A `VALID` line even persists during a large downward
change. The log does not establish whether those changes came from placement,
pressure, movement, lighting or another cause. The local fall event does not
prove a real fall, and Serial SOS does not prove delivery to the phone.

## Reproduced software gap and bounded repair

Tests against v5 reproduced retained HR/SpO2 after a large change to either raw
channel. The old DC tracker used 0.99 of its previous value per sample. A large
step therefore left an extended decay tail, and estimates could remain valid
until a later beat/window check rejected them.

V6 treats a channel's deviation **greater than 10% of its tracked DC level** as
a discontinuity. It immediately clears beat and ratio history, rebases both
channels, and sends the existing `VITALS:ACQUIRING` event if a valid estimate was
being discarded. This clears the phone between the normal one-second reports.
It requires **100 subsequent stable samples** before resuming beat detection;
another large change restarts that interval. At the verified 100 Hz sample rate
this is one second of signal data, including when frames arrive in FIFO batches.
Initial contact also uses this settling interval.

Serial reports `reason=SETTLING` during that interval and BLE reports
`VITALS:ACQUIRING`. Once settled, detection still needs new beats and a valid
ratio window. A flat bright background becomes `WEAK_PULSE`, not invented
numbers. Darkness, clipping, missing samples and transport faults retain their
existing invalidation behavior.

The 10% rule is a conservative prototype quality heuristic. It is not a
calibrated contact detector or general motion-artifact cancellation. It can
delay output on a changing signal, and it does not prove that all accepted
waveforms are physiological. LED current, contact thresholds, I2C pins and
clock, SOS gesture and brownout protection are unchanged.

## Verification

The actual-sketch suites contain **51 sensor/SOS cases and 30 acquisition
cases**. The new cases cover red-only/IR-only changes on both chips, upward and
downward steps, a high-to-low transition above the old contact threshold,
repeated disturbances, FIFO-batched settling, high-baseline pulses, immediate
BLE clearing, settling diagnostics and sample expiry during settling. Ten fault
cases were observed failing before their respective changes; a high-baseline
control passed before and after. Prior low-amplitude and buffered pulses,
unsupported fast cadence, clipping, stale values and transport regressions
remain included.

The partial-report fixture now supplies two full ratio windows so it cannot
depend on startup settling aligning a window boundary. It still requires fresh
HR, invalid SpO2, clearing the phone's old pair before sending HR, and no SpO2
publication.

Run the existing scripts and the closure workflow. CI additionally builds the
real ESP32 binary and Android APK and checks the phone parser, TypeScript, lint,
upload helpers and guarded cleanup. These are software regression/build checks,
not mathematical proof of arbitrary sensor input or physical/medical accuracy.

## Use the current build

Upload the current sketch from `master` using the
[existing upload procedure](NAARI_KAVACH_ESP32_UPLOAD_RECOVERY.md). Open Serial
at 115200 and confirm the **v6 marker above**. Keep the optical module and finger
stationary during acquisition; covering and uncovering it naturally requires
reacquisition. Accepted values should clear on a large change and resume only
after a new usable pulse is measured. `SETTLING` and `ACQUIRING` are measurement
states, not an upload or sensor-identification failure.

Full device acceptance still requires stable physical operation, a usable real
pulse, clearing after removal, and SOS receipt on the phone. The latest excerpt
supports actual optical acquisition and local SOS execution, but it cannot
complete those remaining claims or establish the clinical accuracy of SpO2.

## Reference

[Analog Devices: How to Design a Better Pulse Oximeter](https://www.analog.com/en/resources/technical-articles/how-to-design-a-better-pulse-oximeter.html)
describes optical placement, motion artifacts and the need for calibration.
It does not prescribe or certify this firmware's 10% heuristic.
