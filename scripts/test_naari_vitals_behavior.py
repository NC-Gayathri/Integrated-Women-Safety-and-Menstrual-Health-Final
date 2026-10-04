#!/usr/bin/env python3
"""Signal regressions with test-only waveforms; not clinical validation."""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    'clean_pulse', 'low_amplitude_pulse', 'buffered_pulse', 'dark', 'flat_light', 'light_ramp',
    'finger_removed', 'clipped_100', 'clipped_102', 'beat_expired', 'samples_expired',
    'reason_no_samples', 'reason_low_light', 'reason_weak_pulse',
    'overflow_100', 'overflow_102',
    'partial_report', 'fifo_config_mismatch',
]
with tempfile.TemporaryDirectory(prefix='naari-vitals-') as temporary:
    executable = str(Path(temporary) / 'vitals-test')
    subprocess.run([
        os.environ.get('CXX', 'g++'), '-std=c++17', '-Wall', '-Wextra', '-Werror',
        '-Wno-unused-parameter', '-Wno-unused-variable', '-fsanitize=undefined',
        '-fno-sanitize-recover=all', '-I', str(ROOT / 'tests/naari_optical/fakes'),
        str(ROOT / 'tests/naari_optical/vitals_test.cpp'), '-o', executable,
    ], check=True)
    results = [subprocess.run([executable, case], timeout=10).returncode for case in CASES]
    print(f'Vitals behavior: {results.count(0)}/{len(CASES)} passed', flush=True)
    raise SystemExit(any(results))
