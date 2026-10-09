#!/usr/bin/env python3
"""SMT proof of a narrow, explicitly abstracted NAARI fall-alert safety gate.

Input to SMT: QF_BV formulas, exact 32-bit modular clock arithmetic.
Proof scope: one decision step after the detector has reached a given phase.
NOT a proof of hardware, BLE delivery, temporal completeness or C++ equivalence.
"""
from pathlib import Path
import re
from z3 import Solver

ROOT = Path(__file__).resolve().parents[1]
FW = ROOT / "esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino"
BLE = ROOT / "services/BleService.ts"

def check_source_guard():
    fw = FW.read_text(encoding="utf-8")
    ble = BLE.read_text(encoding="utf-8")
    for pattern in [
        r"#define\s+MPU_SAMPLE_MAX_GAP_MS\s+150\b",
        r"#define\s+FALL_COOLDOWN_MS\s+25000\b",
        r"#define\s+FALL_POST_IMPACT_TIMEOUT_MS\s+2000\b",
        r"#define\s+FALL_STATIONARY_MIN_MS\s+600\b",
        r"if\s*\(fallState\s*!=\s*FALL_IDLE\s*&&\s*now\s*-\s*previousMpuSample\s*>\s*MPU_SAMPLE_MAX_GAP_MS\)",
        r"if\s*\(hasFallTriggered\s*&&\s*now\s*-\s*lastFallTriggeredAt\s*<\s*FALL_COOLDOWN_MS\)",
        r"if\s*\(now\s*-\s*impactStartedAt\s*>\s*FALL_POST_IMPACT_TIMEOUT_MS\)",
        r"if\s*\(magnitude\s*>\s*0\.80f\s*&&\s*magnitude\s*<\s*1\.30f\)",
        r"if\s*\(now\s*-\s*stationaryStartedAt\s*>=\s*FALL_STATIONARY_MIN_MS\)",
        r"sendBleEvent\(\"FALL_DETECTED\"\)",
        r"hasFallTriggered\s*=\s*true;",
        r"\[FIRMWARE\] formal-timing-v12-20261010",
    ]:
        assert re.search(pattern, fw), "Model/code drift: " + pattern
    for pattern in [
        r"text\.toUpperCase\(\)\s*===\s*'SOS'",
        r"text\.toUpperCase\(\)\s*===\s*'STATUS:ONLINE'",
        r"targetSubscribed = this\.subscribeToCharacteristic\(char\)",
        r"!subscription \|\| typeof subscription\.remove !== 'function'",
    ]:
        assert re.search(pattern, ble), "BLE source drift: " + pattern
    print("Source guard checks: 16/16 PASS")

# 0=IDLE, 1=FREE_FALL, 2=IMPACT. Stage 3 is excluded.
# ready/read_ok are environment values; never assumed to be true.
# near_one_g means magnitude in (0.8g,1.3g), not physical stillness.
# stationary_seen means the firmware has a nonzero stationaryStartedAt.
BASE = r"""
(set-logic QF_BV)
(declare-const phase (_ BitVec 2))
(declare-const ready Bool)
(declare-const read_ok Bool)
(declare-const has_alerted Bool)
(declare-const near_one_g Bool)
(declare-const stationary_seen Bool)
(declare-const now (_ BitVec 32))
(declare-const previous_sample (_ BitVec 32))
(declare-const last_alert (_ BitVec 32))
(declare-const impact_started (_ BitVec 32))
(declare-const stationary_started (_ BitVec 32))
(assert (bvule phase (_ bv2 2)))
(define-fun blind_gap () Bool
  (and (not (= phase (_ bv0 2)))
       (bvugt (bvsub now previous_sample) (_ bv150 32))))
(define-fun cooldown () Bool
  (and has_alerted
       (bvult (bvsub now last_alert) (_ bv25000 32))))
(define-fun impact_live () Bool
  (bvule (bvsub now impact_started) (_ bv2000 32)))
(define-fun stationary_long () Bool
  (bvuge (bvsub now stationary_started) (_ bv600 32)))
(define-fun emitted () Bool
  (and ready read_ok (not blind_gap) (not cooldown)
       (= phase (_ bv2 2)) impact_live near_one_g
       stationary_seen stationary_long))
"""
PROOFS = [
    ("P01 requires impact phase", "unsat", "(and emitted (not (= phase (_ bv2 2))))"),
    ("P02 rejects blind interval", "unsat", "(and emitted blind_gap)"),
    ("P03 blocks real cooldown", "unsat", "(and emitted cooldown)"),
    ("P04 requires ready + good read", "unsat",
     "(and emitted (or (not ready) (not read_ok)))"),
    ("P05 requires near-1g + duration", "unsat",
     "(and emitted (or (not near_one_g) (not stationary_seen) (not stationary_long)))"),
    ("P06 honors impact timeout", "unsat", "(and emitted (not impact_live))"),
    ("P07 fresh-boot alert is possible", "sat",
     "(and emitted (not has_alerted) (bvult now (_ bv25000 32)))"),
    ("P08 post-cooldown alert possible", "sat",
     "(and emitted has_alerted (bvuge (bvsub now last_alert) (_ bv25000 32)))"),
    ("P09 zero timestamp does not bypass gap", "unsat",
     "(and emitted (= previous_sample (_ bv0 32)) (= now (_ bv800 32)))"),
    ("P10 short cross-rollover gap accepted", "sat",
     "(and (= phase (_ bv2 2)) (= previous_sample (_ bv4294967196 32)) "
     "(= now (_ bv10 32)) (not blind_gap))"),
    ("P11 long cross-rollover gap rejected", "unsat",
     "(and (= phase (_ bv2 2)) (= previous_sample (_ bv4294966296 32)) "
     "(= now (_ bv10 32)) (not blind_gap))"),
    ("P12 cooldown works across rollover", "unsat",
     "(and emitted has_alerted (= last_alert (_ bv4294967040 32)) "
     "(= now (_ bv1000 32)))"),
]

def prove():
    check_source_guard()
    passed = 0
    for title, expected, claim in PROOFS:
        s = Solver()
        s.from_string(BASE + "\n(assert " + claim + ")\n")
        result = str(s.check())
        assert result == expected, f"{title}: expected {expected}, got {result}"
        print(f"PASS {title} [{result}]")
        passed += 1

    # Exhaustive 3-state SOS counter abstraction, assuming debounced presses.
    # Loop inductiveness: every state in 0,1,2 transitions back into 0,1,2.
    for count in (0, 1, 2):
        for pressed in (False, True):
            for window_open in (False, True):
                if not pressed:
                    nxt, fired = count, False
                elif count == 0 or not window_open:
                    nxt, fired = 1, False
                elif count == 1:
                    nxt, fired = 2, False
                else:
                    nxt, fired = 0, True
                assert nxt in (0, 1, 2)
                assert not fired or (count == 2 and pressed and window_open)
    fw = FW.read_text(encoding="utf-8")
    assert 'sendBleEvent("SOS")' in fw and "buttonClickCount++" in fw
    assert "BUTTON_TRIPLE_CLICK_WINDOW_MS 1800" in fw
    print("PASS SOS counter invariant (12 abstract transitions)")
    print(f"SMT safety abstraction: {passed}/{len(PROOFS)}; SOS abstraction: PASS")
    print("NOT PROVEN: full C++ semantics, real 3-axis motion, sensor accuracy, power rail, Bluetooth authenticity/delivery, availability/medical reliability.")

if __name__ == "__main__":
    prove()
