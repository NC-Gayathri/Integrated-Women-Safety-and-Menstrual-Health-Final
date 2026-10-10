# Formal-verification method, reproducibility and limitations

**Assurance boundary:** the two executable proof runners are **hand-written abstractions** of selected production safety predicates. They are not source-to-SMT translations, full CBMC runs, an electrical simulation, or a certification that the wearable will always send SOS.

## 1. What GitHub displays as mathematics

GitHub Markdown supports its native LaTeX/MathJax syntax through ```math` fenced blocks and inline dollar math. No raster screenshot or external equation-image service is needed; the equations in [EXACT_THEOREMS.md](EXACT_THEOREMS.md) render directly on GitHub.

Reference: [GitHub Docs — Writing mathematical expressions](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions).

## 2. Source of truth and all retained evidence

| Evidence | Location | What the evidence establishes |
|---|---|---|
| 12 fall/SOS SMT queries (P01–P12) | [prove_naari.py](prove_naari.py) | 9 UNSAT refutation checks + 3 SAT reachability witnesses, in the declared bit-vector abstraction |
| 12 dual-I²C SMT queries (R01–R12) | [prove_i2c_recovery.py](prove_i2c_recovery.py) | 9 UNSAT model checks + 3 SAT witnesses; two UNSAT properties follow from explicit modeled post-state assignments |
| SOS-S1, SOS-S2 | [SOS_COUNTER_INDUCTION.md](SOS_COUNTER_INDUCTION.md) | Inductive counter range and sound SOS gating under 12 abstract transitions |
| Source association guards | both proof runners | 17 pattern checks in the fall runner and 18 pattern checks in the I²C runner; **textual**, not semantic equivalence |
| Real firmware host regression suite | [sensor tests](../scripts/test_naari_optical_behavior.py) | The actual C++ sketch executed against simulated I²C inputs: **64/64 passed** on v13 |
| Vitals host regression suite | [vitals tests](../scripts/test_naari_vitals_behavior.py) | **33/33** on v13 |
| Toolchain builds | [release workflow](../.github/workflows/naari-kavach-closure.yml) | DOIT ESP32 compile, Android TypeScript/lint, Android APK build and release branch cleanup on `master` |
| Field observation | [physical diagnosis guide](../documentation/NAARI_KAVACH_SHARED_BUS_DIAGNOSIS_V13.md) | User log shows recurring dual-sensor I²C failures; physical root cause **not established** |

All existing mathematical material previously in `verification/README.md` is retained in this folder's [README.md](README.md) as part of the rename. The underlying two solver programs are moved, not dropped.

## 3. Exact proof mechanism

Z3 is used with quantifier-free bit-vector logic (`QF_BV`). For a modeled guard `G` and a prohibited state `Bad`, the runner constructs a query:

```math
\Phi := G\land\mathrm{Bad}.
```

If Z3 returns **UNSAT**, then no assignment in the declared logic satisfies `\Phi`, and consequently `G\Rightarrow\neg\mathrm{Bad}` holds in that model.

A **SAT** query is an existential witness:

```math
\operatorname{SAT}(\Phi)
\Longleftrightarrow
\exists\,\mathbf{x}:\Phi(\mathbf{x}).
```

A SAT result **does not mean a universal safety theorem passed**. It is a useful non-vacuity or boundary-value check: the modeled guard is not always false. The runner expects the exact outcome shown alongside each theorem ID.

All timestamp subtraction is performed modulo `2^{32}` and compared unsigned. This is valid for the specific small intervals used by the model. It is **not** a temporal guarantee across arbitrarily long outages, timer resets, power loss, or multiple complete counter wraps.

## 4. Critical mathematical qualification of R09 and R10

Both are **consequences of deliberately written post-state definitions**, rather than independently derived implementations guarantees:

```math
\begin{aligned}
R_O'&:= \operatorname{ite}(J,\mathrm{false},R_O),\\
V_H'&:= \operatorname{ite}(J,\mathrm{false},V_H).
\end{aligned}
```

Thus `J\land R_O'` and `J\land V_H'` are unsatisfiable **by substitution into the model**. They do not verify that the actual C++ implementation physically resets sensor state, or that any I²C restart succeeds. The real sketch's regression tests separately exercise the relevant failure paths. This distinction must not disappear from an external report.

Likewise P01–P06 and R01–R06 are implications following from the *explicitly defined guard formulas*—valuable bounded checks for contradictions and drift, but not the same as source-level proof.

## 5. Exact reproduction (after checkout of current master)

From the repository root, on Python 3.12 or another compatible interpreter:

```bash
python -m pip install -r formal-verification-and-mathematical-proofs/requirements.txt

python "formal-verification-and-mathematical-proofs/prove_naari.py"
python "formal-verification-and-mathematical-proofs/prove_i2c_recovery.py"
python "formal-verification-and-mathematical-proofs/check_proof_documentation.py"

python scripts/test_naari_optical_behavior.py
python scripts/test_naari_vitals_behavior.py
```

The exact pinned solver package is `z3-solver==5.1.0.0`, installed in the *formal-smt* GitHub Actions job. The proof-dossier checker has only Python standard-library dependencies; source execution also needs the repository's existing C++ host-test toolchain. App compilation and firmware compilation remain separate release jobs.

Expected proof summary: `12/12` fall SMT, SOS 12-transition invariant PASS, `12/12` I²C SMT, 17 + 18 source guard checks, and exactly the same 24 P/R IDs in the documentation as in Python. The checker explicitly rejects a half-completed folder rename, missing source files, mismatched theorem IDs, broken in-folder relative links, unbalanced math fences, or residual active references to the old `verification/` path.

## 6. Formal assumptions and unproven obligations

**Model inputs and transition assumptions:** single decision step, Boolean sensor readiness and I²C error flags provided as symbolic/environment values, integer `millis()` modulo `2^{32}`, sensor measurement classification as a given Boolean, no modeling of microcontroller scheduler interleavings, I²C clock stretch, Wire internals, or probabilistic sensor noise. SOS abstraction assumes an already debounced atomic press and precomputed time-window status.

**Outstanding source-level obligations:** build an automated translation or verified refinement relation from production firmware state to SMT variables, include all reachable predecessor states and interrupts, establish implementation invariants inductively, test concurrent BLE/sensor scheduling and command authenticity, and demonstrate end-to-end alert receipt/delivery. None of these is implied by `UNSAT` alone.

**Outstanding physical obligations:** verify the exact flashed firmware marker, measure 3.3 V supply and GPIO-level compatibility, isolate each sensor, document pull-up/resistor/level-shifter configuration, collect a stable combined-bus observation interval, and verify Android receives SOS. Previous brownouts and the user-supplied dual-sensor failures make the device's safety/availability claim **OPEN**. The 97–99% SpO₂ values and varying pulse estimates are prototype computations, not clinical validation.

**Final classification:** *machine-checked abstract safety constraints plus source-associated executable regressions and successful build checks; not a mathematical proof of the full hardware–software system.*
