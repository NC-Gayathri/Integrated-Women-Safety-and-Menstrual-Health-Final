#!/usr/bin/env python3
"""Regression contract for NAARI KAVACH optical-sensor readiness.

CI cannot emulate the physical MAX3010x, but it can prevent the integration
firmware from regressing to the brittle I2C initialisation path that allowed
identification without a confirmed READY state.
"""
from pathlib import Path
import re

FIRMWARE = Path("esp32-firmware/naari_kavach_dual_sensor_ble_test/naari_kavach_dual_sensor_ble_test.ino")
src = FIRMWARE.read_text(encoding="utf-8")


def fail(message: str) -> None:
    raise AssertionError(message)


def function_body(name: str) -> str:
    marker = re.search(rf"\b{name}\s*\([^)]*\)\s*\{{", src)
    if not marker:
        fail(f"missing function: {name}")
    start = marker.end() - 1
    depth = 0
    for i in range(start, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[start + 1:i]
    fail(f"unterminated function: {name}")


timeout = re.search(r"#define\s+I2C_TIMEOUT_MS\s+(\d+)", src)
if not timeout:
    fail("I2C_TIMEOUT_MS is missing")
if int(timeout.group(1)) < 50:
    fail("I2C timeout is too short for the proven MAX3010x diagnostic path (need >= 50 ms)")

read_body = function_body("readRegister8")
if "Wire.endTransmission(false)" not in read_body or "Wire.endTransmission(true)" not in read_body:
    fail("readRegister8 must fall back from repeated-start to a STOP-based register-pointer transaction")

write_body = function_body("writeRegister8")
if write_body.count("Wire.endTransmission(true)") < 2 and "I2C_TRANSACTION_ATTEMPTS" not in write_body:
    fail("writeRegister8 must retry a transient write failure before declaring configuration failure")

if "resetOpticalSensor" not in src:
    fail("optical initialisation must perform a bounded software reset before configuration")
if "verifyOpticalConfiguration" not in src:
    fail("optical initialisation must read back critical configuration before announcing READY")

init_body = function_body("identifyAndConfigureOptical")
reset_pos = init_body.find("resetOpticalSensor")
configure_pos = init_body.find("configureMax301")
verify_pos = init_body.find("verifyOpticalConfiguration")
ready_pos = init_body.find("opticalReady = true")
if min(reset_pos, configure_pos, verify_pos, ready_pos) < 0:
    fail("identifyAndConfigureOptical is missing reset/configure/verify/READY stages")
if not (reset_pos < configure_pos < verify_pos < ready_pos):
    fail("READY must only be set after reset, configuration, and configuration read-back verification")

print("NAARI optical readiness regression contract PASS")
