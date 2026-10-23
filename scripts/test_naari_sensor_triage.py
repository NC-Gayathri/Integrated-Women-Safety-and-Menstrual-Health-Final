#!/usr/bin/env python3
"""Run deterministic C++ tests against the real v25 Arduino triage sketch.

These tests validate code/transport policy using a fake I2C device. They cannot
verify real supply voltages, red light, IR light or clinical measurements.
"""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    "no_sensors_no_false_ready",
    "mpu6500_and_real_fifo_path",
    "optical_fifo_read_fault",
    "fifo_empty_no_fabrication",
    "mpu_accel_fault_isolated",
    "mpu6500_high_address",
    "unsupported_optical_part",
    "controller_failure_blocks_all_io",
]
with tempfile.TemporaryDirectory(prefix="naari-v25-triage-") as temporary:
    executable = str(Path(temporary) / "triage-test")
    subprocess.run([
        os.environ.get("CXX", "g++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
        "-Wno-unused-parameter", "-Wno-unused-variable",
        "-fsanitize=undefined", "-fno-sanitize-recover=all",
        "-I", str(ROOT / "tests/naari_optical/fakes"),
        str(ROOT / "tests/naari_optical/triage_test.cpp"), "-o", executable,
    ], check=True, cwd=ROOT)
    results = [
        subprocess.run([executable, case], timeout=12, cwd=ROOT, check=False).returncode
        for case in CASES
    ]
    print(f"V25 triage: {results.count(0)}/{len(CASES)} PASS", flush=True)
    raise SystemExit(any(results))
