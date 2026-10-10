#!/usr/bin/env python3
"""Test the real cleanup command against disposable local Git repositories."""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / '.github/scripts/delete-verified-repair-branch.sh'
BRANCH = 'fix/naari-kavach-mpu6500-compatibility'
REF = f'refs/heads/{BRANCH}'

def git(path, *args):
    return subprocess.check_output(['git', '-C', str(path), *args], stderr=subprocess.PIPE, text=True).strip()

with tempfile.TemporaryDirectory(prefix='naari-cleanup-') as temp:
    remote, work = Path(temp) / 'remote.git', Path(temp) / 'work'
    subprocess.run(['git', 'init', '--bare', '-q', str(remote)], check=True)
    subprocess.run(['git', 'init', '-q', str(work)], check=True)
    git(work, 'config', 'user.email', 'test@example.invalid')
    git(work, 'config', 'user.name', 'Cleanup test')
    git(work, 'remote', 'add', 'origin', str(remote))
    git(work, 'commit', '--allow-empty', '-m', 'verified repair')
    verified = git(work, 'rev-parse', 'HEAD')
    git(work, 'push', 'origin', f'HEAD:{REF}')

    env = {**os.environ, 'REPAIR_BRANCH': BRANCH, 'REPAIR_HEAD': verified}
    # A collaborator adds work after the guards inspect the original SHA.
    git(work, 'commit', '--allow-empty', '-m', 'concurrent work')
    newer = git(work, 'rev-parse', 'HEAD')
    git(work, 'push', 'origin', f'HEAD:{REF}')
    attempt = subprocess.run(['bash', str(SCRIPT)], cwd=work, env=env, capture_output=True, text=True)
    assert attempt.returncode != 0, 'stale cleanup must be rejected'
    assert git(remote, 'rev-parse', REF) == newer, 'concurrent work must remain'
    print('PASS cleanup preserves concurrently updated branch')

    # An exact-head lease is allowed to delete only that verified revision.
    env['REPAIR_HEAD'] = newer
    attempt = subprocess.run(['bash', str(SCRIPT)], cwd=work, env=env, capture_output=True, text=True)
    assert attempt.returncode == 0, attempt.stderr
    assert not git(remote, 'for-each-ref', '--format=%(refname)', REF)
    print('PASS cleanup deletes exactly the verifier-approved branch revision')

    # v12 branch name is an explicitly allowlisted *exact* exception.
    v12_branch = 'fix/naari-formal-assurance-v12'
    v12_ref = f'refs/heads/{v12_branch}'
    git(work, 'push', 'origin', f'HEAD:{v12_ref}')
    env['REPAIR_BRANCH'] = v12_branch
    env['REPAIR_HEAD'] = newer
    attempt = subprocess.run(['bash', str(SCRIPT)], cwd=work, env=env, capture_output=True, text=True)
    assert attempt.returncode == 0, attempt.stderr
    assert not git(remote, 'for-each-ref', '--format=%(refname)', v12_ref)
    print('PASS cleanup deletes exact v12 formal-assurance branch')

    env['REPAIR_BRANCH'] = 'fix/naari-formal-assurance-v12-extra'
    attempt = subprocess.run(['bash', str(SCRIPT)], cwd=work, env=env, capture_output=True, text=True)
    assert attempt.returncode != 0, 'lookalike v12 branch must not be allowlisted'
    print('PASS cleanup rejects v12 lookalike branch')

    env['REPAIR_HEAD'] = ''
    attempt = subprocess.run(['bash', str(SCRIPT)], cwd=work, env=env, capture_output=True, text=True)
    assert attempt.returncode != 0, 'missing lease must fail closed'
    print('PASS cleanup rejects missing verified SHA')

    env['REPAIR_HEAD'] = newer
    env['REPAIR_BRANCH'] = ''
    attempt = subprocess.run(['bash', str(SCRIPT)], cwd=work, env=env, capture_output=True, text=True)
    assert attempt.returncode != 0, 'missing branch identity must fail closed'
    print('PASS cleanup rejects missing verified branch')

    env['REPAIR_BRANCH'] = 'master'
    attempt = subprocess.run(['bash', str(SCRIPT)], cwd=work, env=env, capture_output=True, text=True)
    assert attempt.returncode != 0, 'default branch must never satisfy repair cleanup policy'
    print('PASS cleanup rejects non-repair branch names')
