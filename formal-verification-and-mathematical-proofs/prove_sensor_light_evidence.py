#!/usr/bin/env python3
"""Bounded logical assurance of NAARI v24 diagnostic evidence gates.

The Z3 model proves conditional state invariants, NOT power integrity, physical
LED emission, I2C waveform correctness or the complete ESP32 firmware.
Live C++-sketch tests and ESP32 compilation independently check the code.
"""
from pathlib import Path
from z3 import And, Bool, Not, Solver, sat, unsat

root = Path(__file__).resolve().parents[1]
src = (root / "esp32-firmware/naari_kavach_dual_sensor_ble_test" /
       "naari_kavach_dual_sensor_ble_test.ino").read_text(encoding="utf-8")


def function_body(name):
    marker = src.find(name + "(")
    assert marker >= 0, f"function missing: {name}"
    opening = src.find("{", marker)
    assert opening >= 0
    depth = 0
    for i in range(opening, len(src)):
        if src[i] == "{":
            depth += 1
        if src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[opening:i + 1]
    raise AssertionError(f"unbalanced: {name}")


probe = function_body("probeAddress")
init = function_body("identifyAndConfigureOptical")
setup = function_body("setup")
assert "lastError = error" in probe
assert "[I2C] Probe failed addr=0x%02X error=%u" in probe
assert "Wire.endTransmission(true)" in probe
assert "pulseLed(LED_PULSE_MS)" in setup
assert "[GPIO_LED] GPIO2 status pulse requested" in setup
assert "sendBleEvent(\"SOS\")" in src
assert "if (!probeAddress(MAX3010X_ADDR))" in init
stages = [
    init.find("if (!probeAddress(MAX3010X_ADDR))"),
    init.find("if (!readRegister8(MAX3010X_ADDR, 0xFF, part)"),
    init.find("if (!resetOpticalSensor(opticalChip))"),
    init.find("if (!configured)"),
    init.find("if (!verifyOpticalConfiguration(opticalChip))"),
    init.find("[OPTICAL_DRIVE]"),
    init.find("opticalReady = true"),
]
assert -1 not in stages and stages == sorted(stages), (
    "identity -> reset -> configure -> readback -> drive evidence -> READY must remain ordered"
)

bus, address, identity, reset, writes, readback = [
    Bool(s) for s in ("bus", "address_ack", "identity", "reset", "writes", "readback")
]
ready = And(bus, address, identity, reset, writes, readback)
drive_evidence = ready  # Stage-gated register evidence, not measured photons.
gpio2_boot = Bool("gpio2_boot")
sos = Bool("sos")
physical_light = Bool("physical_light")  # Intentionally NOT constrained by the model.


def prove(name, *constraints):
    solver = Solver()
    solver.add(*constraints)
    assert solver.check() == unsat, name
    print(f"PASS UNSAT: {name}")


def witness(name, *constraints):
    solver = Solver()
    solver.add(*constraints)
    assert solver.check() == sat, name
    print(f"PASS SAT control: {name}")


for variable, name in [
    (bus, "controller"), (address, "address acknowledgement"),
    (identity, "chip identity"), (reset, "completed reset"),
    (writes, "configuration writes"), (readback, "readback match")
]:
    prove("READY requires " + name, ready, Not(variable))
    prove("optical drive report requires " + name, drive_evidence, Not(variable))
witness("healthy configured module can report drive registers", ready)
witness("both devices absent yet GPIO2 boot pulse allowed",
        Not(address), gpio2_boot, Not(ready))
witness("SOS independent of optical communication",
        Not(address), Not(ready), sos)
witness("confirmed registers do not prove physical LED photons",
        drive_evidence, Not(physical_light))
print("PASS: v24 source contract and 12 modeled UNSAT properties")
