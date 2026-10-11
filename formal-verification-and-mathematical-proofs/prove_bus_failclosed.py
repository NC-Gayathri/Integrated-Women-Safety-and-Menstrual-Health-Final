#!/usr/bin/env python3
"""Ten scoped QF_BV obligations for the v17 fail-closed I2C controller policy.

One-step Boolean controller and sensor guards; 32-bit unsigned clock counters.
NOT C++ source-to-SMT equivalence and NOT proof of working power/wiring.
"""
from pathlib import Path
import re
from z3 import Solver

ROOT = Path(__file__).resolve().parents[1]
FW = ROOT / "esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino"

source = FW.read_text(encoding="utf-8")
GUARDS = (
    r"#define\s+SHARED_I2C_RESTART_BUDGET\s+2\b",
    r"#define\s+SHARED_I2C_RESTART_WINDOW_MS\s+60000\b",
    r"#define\s+SHARED_I2C_RESTART_INTERVAL_MS\s+10000\b",
    r"if\s*\(!i2cControllerOperational\)\s*return;",
    r"if\s*\(sharedI2cRestartCount\s*>=\s*SHARED_I2C_RESTART_BUDGET\)",
    r"\+\+sharedI2cRestartCount;",
    r"i2cControllerOperational\s*=\s*configured;",
    r"const bool configured = began && Wire\.setClock\(I2C_CLOCK_HZ\);",
    r"void maintainI2cController\(\)",
    r"maintainI2cController\(\);",
    r"if \(digitalRead\(I2C_SDA\) == LOW \|\| digitalRead\(I2C_SCL\) == LOW\) return;",
    r"Serial\.println\(\s*\"\[BUS\] PERSISTENT_I2C_FAULT;",
    r"\[BUS_POLICY\] failclosed-recurrence-v17-20261011",
)
for pattern in GUARDS:
    assert re.search(pattern, source), "Model/code association failed: " + pattern
assert source.count("if (!i2cControllerOperational) return;") >= 2
print(f"V17 source association: {len(GUARDS)} guards + two sensor exits PASS")

# Unsigned 32-bit modular differences; the effective budget resets only when
# the specified 60s epoch expires. Z3 SAT witnesses are NOT hardware liveness.
BASE = r"""
(set-logic QF_BV)
(declare-const now (_ BitVec 32))
(declare-const window_at (_ BitVec 32))
(declare-const last_restart_at (_ BitVec 32))
(declare-const restart_count (_ BitVec 2))
(declare-const window_active Bool)
(declare-const previously_restarted Bool)
(declare-const controller_ready Bool)
(declare-const optical_fault Bool)
(declare-const mpu_fault Bool)
(declare-const optical_ready Bool)
(declare-const mpu_ready Bool)
(declare-const sda_low Bool)
(declare-const scl_low Bool)
(declare-const sos_accepted Bool)
(assert (bvule restart_count (_ bv2 2)))
(define-fun epoch_expired () Bool
 (or (not window_active)
     (bvuge (bvsub now window_at) (_ bv60000 32))))
(define-fun effective_count () (_ BitVec 2)
 (ite epoch_expired (_ bv0 2) restart_count))
(define-fun cooldown_passed () Bool
 (or (not previously_restarted)
     (bvuge (bvsub now last_restart_at) (_ bv10000 32))))
(define-fun paired_fault () Bool
 (and optical_fault mpu_fault (not optical_ready) (not mpu_ready)))
(define-fun restart () Bool
 (and paired_fault cooldown_passed (not sda_low) (not scl_low)
      (bvult effective_count (_ bv2 2))))
(define-fun sensor_io () Bool controller_ready)
(define-fun readiness_possible () Bool controller_ready)
"""
CHECKS = [
    ("B01 controller failure forbids sensor I2C", "unsat",
     "(and (not controller_ready) sensor_io)"),
    ("B02 controller failure forbids readiness claims", "unsat",
     "(and (not controller_ready) readiness_possible)"),
    ("B03 exhausted active window forbids restart", "unsat",
     "(and restart window_active (not epoch_expired) (= restart_count (_ bv2 2)))"),
    ("B04 sampled low SDA or SCL forbids restart", "unsat",
     "(and restart (or sda_low scl_low))"),
    ("B05 full 10s cooldown before another restart", "unsat",
     "(and restart previously_restarted (bvult (bvsub now last_restart_at) (_ bv10000 32)))"),
    ("B06 first eligible fault can restart", "sat",
     "(and restart (not previously_restarted) (not window_active) (= restart_count (_ bv0 2)))"),
    ("B07 budget renews after 60s", "sat",
     "(and restart window_active epoch_expired (= restart_count (_ bv2 2)))"),
    ("B08 rollover cannot bypass unexpired 60s budget", "unsat",
     "(and restart window_active (= restart_count (_ bv2 2)) "
     "(= window_at (_ bv4294962296 32)) (= now (_ bv5000 32)))"),
    ("B09 SOS can be accepted when sensor controller fails", "sat",
     "(and (not controller_ready) sos_accepted)"),
    ("B10 a ready sensor forbids shared restart", "unsat",
     "(and restart (or optical_ready mpu_ready))"),
]
for name, expected, query in CHECKS:
    solver = Solver()
    solver.from_string(BASE + "\n(assert " + query + ")\n")
    outcome = str(solver.check())
    assert outcome == expected, f"{name}: wanted {expected}, got {outcome}"
    print(f"PASS {name}: {outcome}")
print(f"V17 controller gate + budget model: {len(CHECKS)}/{len(CHECKS)} PASS")
print("NOT PROVEN: real I2C power or pull-ups, controller driver soundness, full firmware semantics, physical SOS delivery.")
