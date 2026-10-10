#!/usr/bin/env python3
"""Z3 QF_BV checks of the rate-limited shared I2C recovery *abstraction*.

These are proof obligations of the modeled transition guard, not a proof
that a broken electrical bus, module power supply, or controller will recover.
"""
from pathlib import Path
import re
from z3 import Solver

ROOT = Path(__file__).resolve().parents[1]
FW = ROOT / "esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino"

def check_code_association():
    source = FW.read_text(encoding="utf-8")
    guards = [
        r"#define\s+SHARED_I2C_FAULT_WINDOW_MS\s+3000\b",
        r"#define\s+SHARED_I2C_RESTART_INTERVAL_MS\s+10000\b",
        r"void noteSensorTransportFault\(bool optical\)",
        r"opticalFaultObserved\s*=\s*true;",
        r"mpuFaultObserved\s*=\s*true;",
        r"!opticalFaultObserved\s*\|\|\s*!mpuFaultObserved",
        r"opticalReady\s*\|\|\s*mpuReady",
        r"SHARED_I2C_FAULT_WINDOW_MS",
        r"SHARED_I2C_RESTART_INTERVAL_MS",
        r"if \(sda == LOW \|\| scl == LOW\)",
        r"\(void\)Wire\.end\(\);",
        r"const bool began = Wire\.begin\(I2C_SDA, I2C_SCL\);",
        r"mpuReady = false;\s*opticalReady = false;",
        r"resetVitalsState\(\);\s*lastMpuRetry = millis\(\);\s*lastOpticalRetry = millis\(\);",
        r"noteSensorTransportFault\(false\);",
        r"noteSensorTransportFault\(true\);",
        r"tx=%u rx=%d SDA=%d SCL=%d",
        r"\[FIRMWARE\] shared-bus-diagnostic-v13-20261010",
    ]
    for g in guards:
        assert re.search(g, source), "Model-to-source guard disappeared: " + g
    print(f"Source association guards: {len(guards)}/{len(guards)} PASS")

# now/timestamps are 32-bit MCU milliseconds, including arithmetic overflow.
# The guard is invoked after setting the reported fault's timestamp to now.
BASE = r"""
(set-logic QF_BV)
(declare-const now (_ BitVec 32))
(declare-const opposite_fault_at (_ BitVec 32))
(declare-const last_restart_at (_ BitVec 32))
(declare-const opt_reported Bool)
(declare-const mpu_reported Bool)
(declare-const opt_ready Bool)
(declare-const mpu_ready Bool)
(declare-const previously_restarted Bool)
(declare-const sda_low Bool)
(declare-const scl_low Bool)
(declare-const began Bool)
(define-fun paired_recent () Bool
 (and opt_reported mpu_reported
      (bvule (bvsub now opposite_fault_at) (_ bv3000 32))))
(define-fun cooldown_passed () Bool
 (or (not previously_restarted)
     (bvuge (bvsub now last_restart_at) (_ bv10000 32))))
(define-fun both_unavailable () Bool
 (and (not opt_ready) (not mpu_ready)))
(define-fun diagnostic () Bool
 (and paired_recent both_unavailable cooldown_passed))
(define-fun restart () Bool
 (and diagnostic (not sda_low) (not scl_low)))
; Firmware deliberately invalidates all outputs after attempting a restart.
(define-fun output_ready_after_restart () Bool
 (and (not restart) opt_ready))
(define-fun stale_hr_after_restart () Bool
 (and (not restart) opt_ready))
"""
CLAIMS = [
("R01 no restart with one sensor healthy", "unsat", "(and restart (or opt_ready mpu_ready))"),
("R02 no restart without both faults", "unsat",
 "(and restart (or (not opt_reported) (not mpu_reported)))"),
("R03 no restart outside correlation window", "unsat",
 "(and restart (bvugt (bvsub now opposite_fault_at) (_ bv3000 32)))"),
("R04 held SDA never receives controller restart", "unsat", "(and restart sda_low)"),
("R05 held SCL never receives controller restart", "unsat", "(and restart scl_low)"),
("R06 restart forbidden within cooldown", "unsat",
 "(and restart previously_restarted (bvult (bvsub now last_restart_at) (_ bv10000 32)))"),
("R07 restart possible when both fail and lines released", "sat",
 "(and restart previously_restarted (bvuge (bvsub now last_restart_at) (_ bv10000 32)))"),
("R08 first correlated fault permits restart", "sat", "(and restart (not previously_restarted))"),
("R09 fresh success cannot bypass revalidation", "unsat",
 "(and restart began output_ready_after_restart)"),
("R10 reset cannot retain modeled stale readings", "unsat",
 "(and restart stale_hr_after_restart)"),
("R11 restart denied for 9000ms over wrap", "unsat",
 "(and restart previously_restarted (= last_restart_at (_ bv4294962296 32)) (= now (_ bv4000 32)))"),
("R12 restart permitted after 12000ms over wrap", "sat",
 "(and restart previously_restarted (= last_restart_at (_ bv4294962296 32)) (= now (_ bv7000 32)))"),
]

def main():
    check_code_association()
    for label, expected, query in CLAIMS:
        s = Solver()
        s.from_string(BASE + "\n(assert " + query + ")\n")
        outcome = str(s.check())
        assert outcome == expected, f"{label}: expected {expected}, got {outcome}"
        print(f"PASS {label}: {outcome}")
    print(f"Shared-I2C model queries: {len(CLAIMS)}/{len(CLAIMS)} PASS")
    print("NOT PROVEN: MCU C++ equivalence, restart latency, electrical line levels, sensor bus stability, sensor accuracy, BLE delivery.")

if __name__ == "__main__":
    main()
