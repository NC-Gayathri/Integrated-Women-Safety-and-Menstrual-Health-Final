# Weak-contact numeric-vitals rejection — 5 October 2026

Current firmware: `[FIRMWARE] fall-guard-v8-20261006`.

The physical v6 capture proved a strong valid phase around RED 202k / IR 230k,
then showed a degraded optical region around 3–5k counts that remained above
the older permissive `fingerPresent` gate. Small ripple in that region could
mature into partial heart-rate estimates while SpO2 remained acquiring.

V7 keeps the permissive raw contact gate for state detection, but numeric
vitals now require tracked DC levels of at least RED 5,000 and IR 10,000.
Below that prototype quality floor, beat timing and ratio history are cleared
before they can mature, diagnostics report `WEAK_CONTACT`, and BLE reports
`VITALS:NO_VALID_READING`. A previously valid estimate is cleared immediately.

This is a conservative prototype signal-quality rule, not clinical calibration.
The existing low-amplitude regression at approximately RED 10k / IR 20k must
continue to acquire, while the physical weak-contact regression at RED 3.5k /
IR 3.9k +/- 120 must never produce a numeric vital.

The change does not alter I2C timing, LED current, MPU/fall logic, SOS logic,
rate-alias rejection, signal-settling behavior, or the prototype SpO2 formula.
