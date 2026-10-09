#!/usr/bin/env python3
"""Run the actual BLE integration sketch against a deterministic I2C boundary.

These host tests are software regression evidence, not physical sensor evidence.
The independent ESP32 compile job validates Arduino preprocessing and the SDK.
"""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    'ready_100', 'ready_102', 'deferred_read_failure', 'transient_write',
    'absent', 'unreadable_identity', 'unknown', 'reset_timeout_100',
    'reset_timeout_102', 'write_failure_100', 'write_failure_102',
    'readback_failure_100', 'readback_failure_102', 'mismatch_100', 'mismatch_102',
    'shutdown_100', 'shutdown_102', 'burst_deferred_read', 'fifo_partial_read',
    'sos_during_init', 'disconnect_recovery', 'no_finger',
    'fifo_error_consumed_100', 'fifo_error_consumed_102',
    'mpu6050_ready', 'mpu6500_ready', 'mpu6500_high_address',
    'mpu_unknown_identity', 'mpu6500_config_write_failure',
    'mpu6500_config_readback_mismatch', 'mpu6500_wake_readback_mismatch',
    'mpu6500_reconnect', 'mpu6500_sos_during_init',
    'metadata_wr_100', 'metadata_rd_100', 'metadata_ovf_100',
    'metadata_wr_102', 'metadata_rd_102', 'metadata_ovf_102',
    'metadata_wr_timeout_100', 'metadata_wr_timeout_102',
    'empty_fifo_100', 'empty_fifo_102', 'healthy_metadata_stop_fallback',
    'optical_failed_init_backoff', 'mpu_failed_init_backoff',
    'mpu_runtime_backoff', 'bus_failure_sos', 'optical_failure_mpu_healthy',
    'mpu_fault_discards_fall', 'mpu_disconnect_discards_fall',
    'mpu6050_single_axis_drop', 'mpu6500_single_axis_drop',
    'mpu_handling_spike_rejected', 'mpu_single_stationary_sample_rejected',
]
with tempfile.TemporaryDirectory(prefix='naari-sensors-') as temporary:
    executable = str(Path(temporary) / 'readiness-test')
    subprocess.run([
        os.environ.get('CXX', 'g++'), '-std=c++17', '-Wall', '-Wextra', '-Werror',
        '-Wno-unused-parameter', '-Wno-unused-variable', '-fsanitize=undefined', '-fno-sanitize-recover=all',
        '-I', str(ROOT / 'tests/naari_optical/fakes'),
        str(ROOT / 'tests/naari_optical/readiness_test.cpp'), '-o', executable,
    ], check=True)
    results = [subprocess.run([executable, case], timeout=10).returncode for case in CASES]
    print(f'Sensor behavior: {results.count(0)}/{len(CASES)} passed', flush=True)
    raise SystemExit(any(results))
