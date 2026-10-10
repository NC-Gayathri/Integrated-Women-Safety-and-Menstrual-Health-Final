#!/usr/bin/env python3
"""Bounded Z3 model checks for the v16 heart-rate evidence gate.

Model is an integer-scaled abstraction of a single sample/beat decision step.
It is *not* full C++ equivalence, clinical HR validation or motion rejection.
"""
from pathlib import Path
import re
from z3 import And, Bool, If, Int, Not, Or, Solver, sat, unsat

ROOT = Path(__file__).resolve().parents[1]
FW = ROOT / "esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino"
source = FW.read_text(encoding="utf-8")
guards = (
    r"#define\s+HEART_MIN_CONSISTENT_INTERVALS\s+3\b",
    r"#define\s+HEART_MAX_BEAT_DEVIATION\s+0\.18f\b",
    r"#define\s+OPTICAL_MIN_IR_AC_FRACTION\s+0\.0004\b",
    r"#define\s+OPTICAL_MIN_IR_ENVELOPE\s+10\.0\b",
    r"irEnvelope\s*<\s*minPulseEnvelope",
    r"consistentBeatIntervals\s*>=\s*HEART_MIN_CONSISTENT_INTERVALS",
    r"fabsf\(observedBpm\s*-\s*candidateBpm\)",
    r"consistentBeatIntervals\s*=\s*1;",
    r"sendBleEvent\(\"VITALS:ACQUIRING\"\)",
    r"\[ALGORITHM\] fall-pulse-confidence-v16-20261010",
)
for g in guards:
    assert re.search(g, source), "Production/model source guard disappeared: " + g
print(f"HR source association guards: {len(guards)}/{len(guards)} PASS")

# Rates and amplitudes here are integer-scaled deliberately. The production
# firmware computes floating point estimates, so these are model properties
# and NOT an exact IEEE754 floating-point refinement proof.
dc, env, bpm, count = Int("dc"), Int("env"), Int("bpm"), Int("count")
domain = And(dc >= 0, dc <= 262143, env >= 0, env <= 262143,
             bpm >= 0, bpm <= 240, count >= 0, count <= 3)
# env >= max(10, dc*0.0004) without fractional arithmetic.
quality = And(env >= 10, 10000 * env >= 4 * dc)
may_report = And(quality, count >= 3, bpm >= 30, bpm <= 200)
queries = [
    ("C01 requires three intervals", unsat, And(may_report, count < 3)),
    ("C02 requires absolute AC floor", unsat, And(may_report, env < 10)),
    ("C03 requires DC-relative AC floor", unsat,
     And(may_report, 10000 * env < 4 * dc)),
    ("C04 requires plausible BPM", unsat,
     And(may_report, Or(bpm < 30, bpm > 200))),
    ("C05 capture-shaped high-DC ripple cannot pass", unsat,
     And(may_report, dc == 246000, env == 62)),
    ("C06 clean 75 BPM pulse is permitted", sat,
     And(may_report, dc == 242000, env == 1000, bpm == 75, count == 3)),
    ("C07 only two intervals never report", unsat,
     And(may_report, count == 2, env == 1000, dc == 242000)),
]
for title, expected, extra in queries:
    solver = Solver()
    solver.add(domain, extra)
    result = solver.check()
    assert result == expected, f"{title}: expected {expected}, got {result}"
    print(f"PASS {title}: {result}")

# Model the explicit abrupt-rate-change branch. An incompatible beat interval
# starts confidence at 1, invalidating any prior numeric estimate.
prev_bpm, observed_bpm, new_count = Int("prev_bpm"), Int("observed_bpm"), Int("new_count")
drift_domain = And(prev_bpm >= 30, prev_bpm <= 200,
                   observed_bpm >= 30, observed_bpm <= 200)
out_of_band = Or(100 * (observed_bpm - prev_bpm) > 18 * prev_bpm,
                 100 * (prev_bpm - observed_bpm) > 18 * prev_bpm)
solver = Solver()
solver.add(drift_domain, out_of_band,
           new_count == If(out_of_band, 1, 3), new_count >= 3)
assert solver.check() == unsat, "C08 drift branch must drop confirmation"
print("PASS C08 abrupt cadence change resets multi-beat confidence: unsat")
print("HR confidence abstraction: 8/8 checks PASS")
print("NOT PROVEN: motion artifacts, peak detection correctness, sampling clock fidelity, biological BPM accuracy, full C++ semantics or clinical calibration.")
