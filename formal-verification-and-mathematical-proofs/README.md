# Formal Verification and Mathematical Proofs

This is the authoritative, GitHub-rendered proof dossier for NAARI KAVACH. **All original assurance notes are retained below.**

**Start with the complete proof statements:** [exact P01–P12 and R01–R12 LaTeX theorem ledger](EXACT_THEOREMS.md). The 24 numbered SMT queries include **18 UNSAT safety/refutation checks and 6 SAT witnesses**; they do not constitute whole-device formal verification.

For the separate abstract counter induction see [SOS-S1 and SOS-S2](SOS_COUNTER_INDUCTION.md). [Methodology, proof obligations, toolchain and limits](PROOF_SCOPE_AND_REPRODUCTION.md) explains precisely what GitHub/Z3 proved and what remains a physical hardware acceptance task.

**Run the exact checks** from the repository root:

```sh
python -m pip install -r formal-verification-and-mathematical-proofs/requirements.txt
python "formal-verification-and-mathematical-proofs/prove_naari.py"
python "formal-verification-and-mathematical-proofs/prove_i2c_recovery.py"
python "formal-verification-and-mathematical-proofs/check_proof_documentation.py"
```

---

## Original mathematical-assurance narrative (preserved)

# NAARI KAVACH v12 — reproducible mathematical assurance and limits

**Date:** 10 October 2026. **Scope:** `formal-timing-v12-20261010` on the dual-sensor ESP32 test sketch. This document records *bounded formal evidence*, not certification that all firmware, Android, electronics, or medical functions are correct.

## 1. Exactly what is being proved

The proof runner [`prove_naari.py`](prove_naari.py) encodes a **single fall-alert decision step** as a quantifier-free fixed-width bit-vector (SMT QF_BV) formula and asks Z3 to find a violating assignment. `unsat` means the specified violating assignment **cannot exist within this formal model**. `sat` control queries show the rules are not rendered vacuous by forcing every alert impossible.

All ESP32 clocks in the SMT model are **32-bit unsigned vectors**:

```text
delta(now, then) = (now - then) modulo 2^32
G = (state != IDLE) AND (delta(now, previous_sample) > 150)
C = has_alerted AND (delta(now, last_alert) < 25000)
I = (delta(now, impact_started) <= 2000)
N = near_one_g AND stationary_seen AND
    (delta(now, stationary_started) >= 600)
A = ready AND good_read AND (NOT G) AND (NOT C) AND
    (state == IMPACT) AND I AND N
```

Here `A` is the *abstract* fall-event guard. `near_one_g` means measured acceleration magnitude lies in the open interval (0.8g, 1.3g); it **does not prove physical stillness**. `stationary_seen` abstracts the firmware's previously initialized stationary timestamp. Input sample correctness and sensor readiness are nondeterministic variables; they are not assumed accurate.

### Formal claims and corresponding proof queries

| ID | Proven **within the specified model** |
|---|---|
| P01 | Emission implies the impact phase. |
| P02 | A >150 ms unobserved MPU interval blocks emission. |
| P03 | A prior alert less than 25,000 ms ago blocks emission. |
| P04 | Sensor not-ready and bad-read inputs block emission. |
| P05 | No emission without a near-1g reading and >=600 ms of modeled near-1g interval. |
| P06 | No emission if impact timeout exceeds 2,000 ms. |
| P07 | A valid alert before 25 seconds after boot remains possible (SAT witness). |
| P08 | A post-cooldown valid alert remains possible (SAT witness). |
| P09 | Previous timestamp zero does not disable the >150 ms guard. |
| P10 | A genuine short modular-time interval across 2^32 wrap remains short (SAT witness). |
| P11 | A long interval across 2^32 wrap is rejected. |
| P12 | A 25-second alert cooldown remains effective across a modular-time wrap. |

All safety claims are **one-step implications**, not claims of complete physical fall detection or of the correctness of every predecessor state. `P07` and `P08` are reachability witnesses for an admissible input combination in the abstraction, not field-test results.

### Inductive SOS button-counter invariant

Assume a valid debounced press is an atomic input and the counter is initially 0. The firmware counter update keeps it in `{0,1,2}`. Its base case is 0; under the modeled update the next value from any member of `{0,1,2}` again lies in that set. An SOS event occurs **only** when a debounced press arrives while the counter is 2 and the 1.8-second window remains open. Exhaustive enumeration checks all 3 × 2 × 2 = 12 modeled counter/press/window combinations.

This is an induction proof for the **debounced press/counter abstraction**; it does not prove physical debounce reliability or guarantee an SOS event when the ESP32 has lost power.

## 2. Independent code-associated counterexamples repaired

**CE-01: Zero timestamp blind interval.** In v11 the `previousMpuSample != 0` condition suppressed the gap check if the last successful sample occurred at clock value 0 (possible after wrap). With `state=IMPACT`, `previousMpuSample=0`, `now=1000`, an earlier near-1g interval could complete despite 1000 ms without sampled data. v12 removes this invalid sentinel. The real firmware is also executed against `mpu_timestamp_zero_blind_gap_rejected` in the C++ host harness. The state fixture is synthetic and targeted: it is not a physical drop demonstration.

**CE-02: Prefix-based emergency event.** The Android BLE parser previously accepted `SOS_EXTRA` or `SOS:FAKE` as the genuine SOS event because it used `startsWith('SOS')`. v12 requires an exact case-insensitive SOS packet, and likewise requires an exact STATUS:ONLINE packet. HEART_RATE and SPO2 now require the entire numeric suffix to be 1–3 ASCII digits rather than accepting `parseInt('72garbage') == 72`. Existing legit packets and malformed-packet regressions run against the real TypeScript parser.

**CE-03: Unknown-packet cloud pollution.** Strict parsing originally routed malformed frames to the `RAW` type, but the backend sync fallback mislabeled RAW as `STATUS_HEARTBEAT`. The backend now skips ingestion of all RAW packets and the malformed-packet regression requires zero cloud ingestion. Neither a RAW packet nor an untrusted advertised device name can be treated as authenticated emergency evidence.

**Other previously repaired defects** remain covered by CI host tests: first-boot fall suppression, blind intervals, sensor failure recovery, fake optical values and the false-success BLE monitor registration path.

## 3. Connection to the actual implementation

The SMT model is **not** a full compiler translation from the Arduino source. To reduce accidental model/source divergence, the proof script checks 12 production firmware markers and four BLE parser/notification markers before solving. The actual firmware runs via the existing C++ fake-I2C boundary regressions with undefined-behavior sanitizer; Arduino CI compiles the real sketch, and separate CI builds the Android APK. If source/drift checks fail, CI fails. Those checks **do not constitute a formal proof of model equivalence**.

The default-branch merge/branch-cleanup job now depends on the dedicated `formal-smt` job in addition to the four existing build/test jobs.

Run:

```sh
python -m pip install z3-solver==5.1.0.0
python formal-verification-and-mathematical-proofs/prove_naari.py
python formal-verification-and-mathematical-proofs/prove_i2c_recovery.py
python scripts/test_naari_optical_behavior.py
python scripts/test_naari_vitals_behavior.py
node scripts/test_naari_ble_vitals.cjs
```

The last command also requires project npm dependencies.

## 4. Properties that **are not mathematically proved**

1. **Whole-program functional correctness:** not all C++ variables, C runtime, scheduler interleavings, IRQ timing, I2C hardware, BLE stack, Android services, app UI, backend, or cloud are translated to SMT or given inductive invariants.
2. **Availability:** a damaged cable, disconnected battery, controller reset, persistent I2C fault, Android crash or unavailable phone can stop SOS and fall alerts entirely.
3. **End-to-end notification authenticity/delivery:** exact-name/UUID BLE discovery and an exact packet parser do **not** authenticate the device. No cryptographic authenticated BLE pairing/protocol proof or physical phone-delivery proof is supplied.
4. **Clinical correctness:** SpO2 is a non-calibrated signal approximation, no gold-standard accuracy trial exists; near-1g readings do not certify human immobility; missed impacts and false positives remain possible.
5. **Time-domain assumptions:** modular subtraction is appropriate for short intervals when clocks make progress and the most recent event actually falls within the represented interval. A 32-bit clock repeats about every 49.71 days, so permanent duration claims require additional logic or a larger time domain.
6. **Hardware:** user-provided v9 logs repeatedly show brownouts and both MAX30102 and MPU6500 I2C faults. Those remain **FAILED / UNMEASURED**, even if v13 SMT/CI checks pass.

For hardware closure, physically measure regulated supply under load, verify bus electrical levels/pull-ups and breakout requirements, power down before rewiring, then perform separate ESP32-only, MPU-only and combined 5-minute error-free runs. Flash the current **v13** dual-sensor firmware and prove the live `[FIRMWARE] shared-bus-diagnostic-v13-20261010` marker. A pasted runtime excerpt without its boot marker does not establish that the current source was flashed. Verify three-click SOS and fall receipt on a real subscribed phone in a safe fixture with emergency action disabled. See the [physical acceptance ledger](../documentation/NAARI_KAVACH_FORMAL_AUDIT_2026-10-09.md).

**Assurance label:** FORMAL SAFETY ABSTRACTION + EXECUTABLE REGRESSIONS; **NOT** END-TO-END VERIFIED HARDWARE/SOFTWARE/SAFETY CERTIFICATION.

## 5. v13 dual-sensor bus fault mitigation (10 October 2026)

The user's repeated optical FIFO metadata failure at address 0x57 register 0x04 together with MPU6500 I²C failures at address 0x68 is **physical evidence of recurring shared-bus communication loss**; neither repeated READY nor local SOS cancels that evidence. v13 records the final register-read TX/RX failure details and samples SDA/SCL at the fault. It correlates independent runtime sensor failure transitions within 3 seconds, and only when both sensors are unavailable does it consider one ESP32 Wire controller reinitialization. The attempt is rate-limited to no more than one per 10 seconds; if either line is LOW it skips controller reset rather than driving the held bus. It does not use GPIO bit-bang clock pulses or weaken brownout protection. All sensor state must be revalidated independently after a restart.

The dedicated [shared-I²C QF_BV proof runner](prove_i2c_recovery.py) checks **12 additional model-level SMT queries**, including 32-bit millisecond wraparound. The actual sketch's host regression suite now includes correlated outage, held-low line, controller-begin failure, and one-sensor-isolated failure cases. These do not establish electrical line rise time, supply voltage, wire integrity, I²C driver completeness, or whole-program correctness.

[Physical isolation and interpretation of new error logs](../documentation/NAARI_KAVACH_SHARED_BUS_DIAGNOSIS_V13.md) describes the required ESP32-only, sensor-only, dual-sensor and phone acceptance stages. **The physical/root-cause verification remains open** until those stages actually pass.
