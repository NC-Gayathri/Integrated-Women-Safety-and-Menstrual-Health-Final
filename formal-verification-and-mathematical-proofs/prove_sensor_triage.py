#!/usr/bin/env python3
"""Scoped Z3 assurance of v25 triage evidence gates, with source anchors.

Important: This proves the abstract implication model ONLY, not that the real
device is electrically healthy or that its emitters produce any photons.
Physical acceptance requires new board evidence.
"""
from pathlib import Path
from z3 import And, Bool, Not, Solver, sat, unsat

root = Path(__file__).resolve().parents[1]
path = root / "esp32-firmware/naari_sensor_triage/naari_sensor_triage.ino"
code = path.read_text(encoding="utf-8")


def body(name: str) -> str:
    pos = code.find(name + "(")
    assert pos >= 0, f"missing source function {name}"
    start = code.find("{", pos)
    assert start >= 0, name
    nesting = 0
    for i in range(start, len(code)):
        if code[i] == "{":
            nesting += 1
        elif code[i] == "}":
            nesting -= 1
            if nesting == 0:
                return code[start:i + 1]
    raise AssertionError("unclosed function: " + name)


# Source conformance: the exact behavior-test target also appears in the proof.
setup = body("setup")
opt = body("initOptical")
mpu = body("initMpu")
fifo = body("pollOptical")
accel = body("pollMpu")
finish = body("finishTest")
main = body("loop")
assert "began && Wire.setClock(10000)" in setup
assert "if (!busReady)" in setup and "testFinished = true" in setup
assert 'if (part != 0x15)' in opt
assert "if (!resetDone)" in opt
assert "const bool verified = configured &&" in opt
assert "opticalConfigured = true;" in opt
assert "if (!verified)" in opt
assert "if ((meta[0] & 0x1F) == (meta[2] & 0x1F)) return;" in fifo
assert "if (!readBytes(OPT_ADDR, 0x07, raw, 6))" in fifo
assert "++opticalSamples" in fifo and fifo.index("++opticalSamples") > fifo.index(
    "if (!readBytes(OPT_ADDR, 0x07, raw, 6))")
assert "if (!readBytes(mpuAddr, 0x3B, raw, 6))" in accel
assert "++mpuSamples" in accel and accel.index("++mpuSamples") > accel.index(
    "if (!readBytes(mpuAddr, 0x3B, raw, 6))")
assert "if (opticalConfigured)" in finish
assert "write8(OPT_ADDR, 0x09, 0x80)" in finish
assert "if (stopVerified) opticalConfigured = false" in finish
assert "if (!busReady || testFinished)" in main
assert 'Serial.println("[TRIAGE_END] REFLASH THE OFFICIAL BLE+SOS APPLICATION NOW.")' in finish
assert "FALL_DETECTED" not in code and 'sendBleEvent(' not in code
assert "HEART_RATE:" not in code and "SPO2:" not in code

bus, optical_ack, optical_part, reset_done, cfg_write, cfg_readback, \
mpu_ack, mpu_part, mpu_write, mpu_readback, meta_ok, unread, burst_ok, \
accel_burst_ok, photons = [
    Bool(s) for s in (
        "bus", "optical_ack", "optical_part", "reset_done", "cfg_write",
        "cfg_readback", "mpu_ack", "mpu_part", "mpu_write", "mpu_readback",
        "meta_ok", "unread_fifo", "complete_fifo_frame",
        "complete_acceleration", "actual_photons"
    )
]
optical_config = And(bus, optical_ack, optical_part, reset_done, cfg_write, cfg_readback)
mpu_config = And(bus, mpu_ack, mpu_part, mpu_write, mpu_readback)
fresh_optical_sample = And(optical_config, meta_ok, unread, burst_ok)
fresh_mpu_sample = And(mpu_config, accel_burst_ok)


def prove(label, *clauses):
    s = Solver()
    s.add(*clauses)
    assert s.check() == unsat, label
    print("PASS UNSAT:", label)


def witness(label, *clauses):
    s = Solver()
    s.add(*clauses)
    assert s.check() == sat, label
    print("PASS SAT positive/negative control:", label)


for precondition, label in [
    (bus, "working controller"), (optical_ack, "address ACK"),
    (optical_part, "MAX30102 identity"), (reset_done, "completed reset"),
    (cfg_write, "configuration writes"), (cfg_readback, "configuration readback")
]:
    prove("optical readiness requires " + label, optical_config, Not(precondition))
for precondition, label in [
    (meta_ok, "clean FIFO metadata"), (unread, "unread FIFO pointer"),
    (burst_ok, "complete six-byte FIFO frame")
]:
    prove("counted optical sample requires " + label, fresh_optical_sample, Not(precondition))
for precondition, label in [
    (mpu_ack, "MPU ACK"), (mpu_part, "supported MPU identity"),
    (accel_burst_ok, "complete MPU burst")
]:
    prove("counted MPU sample requires " + label, fresh_mpu_sample, Not(precondition))

witness("healthy modeled sensors produce valid frames", fresh_optical_sample, fresh_mpu_sample)
witness("optical register success permits physically dead emitter",
        optical_config, Not(photons))
witness("MPU down, optical available", Not(mpu_ack), fresh_optical_sample)
witness("optical down, MPU available", Not(optical_ack), fresh_mpu_sample)
print("V25: source contract + 12 UNSAT properties + 4 SAT controls PASS")
