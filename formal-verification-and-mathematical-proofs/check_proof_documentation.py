#!/usr/bin/env python3
"""Fail-closed regression for renamed, GitHub-rendered math proof dossier.

No third-party dependencies; verifies documentation coverage and paths only,
not source-to-SMT semantic equivalence.
"""
from pathlib import Path
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
DIR = Path(__file__).resolve().parent
FOLDER = "formal-verification-and-mathematical-proofs"
assert DIR.name == FOLDER, f"Unexpected proof folder: {DIR}"
assert not (ROOT / "verification").exists(), "Obsolete verification directory remains"

required = {
    "README.md", "EXACT_THEOREMS.md", "SOS_COUNTER_INDUCTION.md",
    "PROOF_SCOPE_AND_REPRODUCTION.md", "prove_naari.py",
    "prove_i2c_recovery.py", "requirements.txt", "check_proof_documentation.py",
}
assert required <= {p.name for p in DIR.iterdir()}, "Missing proof artifact"

fall = (DIR / "prove_naari.py").read_text(encoding="utf-8")
i2c = (DIR / "prove_i2c_recovery.py").read_text(encoding="utf-8")
theorems = (DIR / "EXACT_THEOREMS.md").read_text(encoding="utf-8")
sos = (DIR / "SOS_COUNTER_INDUCTION.md").read_text(encoding="utf-8")
expected_p = {f"P{x:02d}" for x in range(1, 13)}
expected_r = {f"R{x:02d}" for x in range(1, 13)}
actual_p = set(re.findall(r'\("(P\d\d)\b', fall))
actual_r = set(re.findall(r'\("(R\d\d)\b', i2c))
doc_p = re.findall(r'^### (P\d\d)\b', theorems, flags=re.MULTILINE)
doc_r = re.findall(r'^### (R\d\d)\b', theorems, flags=re.MULTILINE)
assert actual_p == expected_p, f"Fall queries changed: {actual_p ^ expected_p}"
assert actual_r == expected_r, f"I2C queries changed: {actual_r ^ expected_r}"
assert len(doc_p) == 12 and set(doc_p) == expected_p, "A fall theorem was omitted/duplicated"
assert len(doc_r) == 12 and set(doc_r) == expected_r, "An I2C theorem was omitted/duplicated"
assert re.findall(r'\("P\d\d[^"\n]*",\s*"(unsat|sat)"', fall).count("sat") == 3
assert re.findall(r'\("R\d\d[^"\n]*",\s*"(unsat|sat)"', i2c).count("sat") == 3
assert "SOS-S1" in sos and "SOS-S2" in sos, "SOS induction absent"

# Fail closed if a runner keeps its P/R label but silently changes its SMT
# model/claim bytes. Git blob SHA-1 is a revision identity, not a security proof.
source_locks = {
    "prove_naari.py": "846bdd32f824c4f7a3755dc1c903c5c30028ddae",
    "prove_i2c_recovery.py": "4e0a558d38f3ee4cf5126db21bdcafba4536b1e4",
}
for name, expected in source_locks.items():
    blob = (DIR / name).read_bytes()
    identity = hashlib.sha1(
        b"blob " + str(len(blob)).encode("ascii") + b"\0" + blob
    ).hexdigest()
    assert identity == expected, f"Solver source changed without theorem review: {name}"
    assert expected in theorems, f"Theorem ledger omits source lock for {name}"


def check_fences(path):
    content = path.read_text(encoding="utf-8")
    fences = re.findall(r"^```([A-Za-z0-9_-]*)\s*$", content, re.MULTILINE)
    assert len(fences) % 2 == 0, f"Unbalanced Markdown fences in {path}"
    for a, b in zip(fences[0::2], fences[1::2]):
        assert a and not b, f"Malformed Markdown fence sequence {a!r}, {b!r} in {path}"
    minimum_math = {"EXACT_THEOREMS.md": 24, "SOS_COUNTER_INDUCTION.md": 4,
                    "PROOF_SCOPE_AND_REPRODUCTION.md": 2}[path.name]
    assert fences.count("math") >= minimum_math, f"Missing GitHub math in {path}"
    for raw in re.findall(r'\]\(([^)\s]+)(?:\s+"[^"]*")?\)', content):
        pathpart = raw.split("#")[0]
        if not pathpart or "://" in pathpart or pathpart.startswith("mailto:"):
            continue
        assert (path.parent / pathpart).exists(), f"Broken local link in {path.name}: {raw}"

for name in ("EXACT_THEOREMS.md", "SOS_COUNTER_INDUCTION.md",
             "PROOF_SCOPE_AND_REPRODUCTION.md"):
    check_fences(DIR / name)

requirements = (DIR / "requirements.txt").read_text(encoding="utf-8").strip()
assert requirements == "z3-solver==5.1.0.0", "Unpinned solver version"
workflow = (ROOT / ".github/workflows/naari-kavach-closure.yml").read_text(encoding="utf-8")
assert f'"{FOLDER}/**"' in workflow, "Folder edits must trigger PR workflow"
for runner in ("prove_naari.py", "prove_i2c_recovery.py", "check_proof_documentation.py"):
    assert f"{FOLDER}/{runner}" in workflow, f"CI does not execute {runner}"
assert f"{FOLDER}/requirements.txt" in workflow, "CI dependency path not updated"

for active in ("README.md", "esp32-firmware/README.md",
               "documentation/NAARI_KAVACH_SHARED_BUS_DIAGNOSIS_V13.md",
               ".github/workflows/naari-kavach-closure.yml"):
    assert "verification/" not in (ROOT / active).read_text(encoding="utf-8"), (
        f"Obsolete active proof path in {active}")

print("Proof documentation: all 24 P/R IDs, SOS-S1/S2, MathJax fences, "
      "local links, dependency pin, relocated CI and removed old folder PASS")
