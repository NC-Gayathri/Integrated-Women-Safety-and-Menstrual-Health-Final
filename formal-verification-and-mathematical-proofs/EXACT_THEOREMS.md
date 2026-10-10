# Exact mathematical theorems and SMT query ledger

**NAARI KAVACH — formal-verification evidence, 10 October 2026**

This page enumerates **every one of the 24 numbered Z3 queries** executed by the two Python proof runners, with GitHub-native LaTeX, expected solver outcome, assumptions, and the meaning of each result. There are **18 UNSAT refutation checks and 6 SAT witness checks**: P01–P06, P09, P11–P12 (9 UNSAT) plus R01–R06, R09–R11 (9 UNSAT); P07–P08, P10 (3 SAT) plus R07–R08, R12 (3 SAT). These are *abstract, finite-width SMT queries*, **not** a verified translation of complete ESP32 C++, Android, or electronics.

- [Proof method, limitations, and reproduction](PROOF_SCOPE_AND_REPRODUCTION.md)
- [Inductive SOS counter proof](SOS_COUNTER_INDUCTION.md)
- [Executable P01–P12 model](prove_naari.py) and [executable R01–R12 model](prove_i2c_recovery.py)
- [Earlier assurance narrative, retained without deletion](README.md)

## A. Mathematical universe and notation

All clock symbols in the SMT queries are unsigned 32-bit *bit-vectors*. Their arithmetic is modular rather than unbounded integer subtraction:

```math
\mathbb{U}_{32}=\{0,1,\dots,2^{32}-1\},\quad
\Delta(t,u)=\bigl(t-u\bigr)\bmod 2^{32}.
```

All inequalities in the clock formulas below are **unsigned** comparisons. At the current instant $t$, the measured duration from a stored timestamp $u$ is the bit-vector value $\Delta(t,u)$. Interpretation as real elapsed time assumes the stored event is recent enough to avoid ambiguity from a full timer wrap. The abstractions do *not* model how those timestamps were originally reached.

The two proof runners ask an SMT solver whether a proposed counterexample exists. A query answered **UNSAT** establishes that *no valuation satisfying its formulas exists*. A query answered **SAT** merely proves that *at least one valuation exists*; it does not prove that the physical device will ever reach it.

## B. Fall-alert guard: exact modeled formula

Variables: $q\in\{0,1,2\}$ means IDLE, FREE_FALL, IMPACT; $E$ means sensor ready; $V$ means this accelerometer read was successful; $H$ means an earlier fall was reported; $Z$ means the latest acceleration magnitude is strictly between $0.8g$ and $1.3g$; $S$ means a stationary interval start has been recorded. The stored times are $t_p$ (previous accelerometer sample), $t_a$ (last alert), $t_i$ (impact start), and $t_s$ (stationary interval start).

Define:

```math
\begin{aligned}
B &:= (q\ne 0)\land\bigl(\Delta(t,t_p)>150\bigr),\\
C &:= H\land\bigl(\Delta(t,t_a)<25000\bigr),\\
I &:= \Delta(t,t_i)\le2000,\\
L &:= \Delta(t,t_s)\ge600,\\
A &:= E\land V\land\neg B\land\neg C\land(q=2)
 \land I\land Z\land S\land L.
\end{aligned}
```

Here $A$ is the **abstract emission predicate**—not a byte-for-byte symbolic execution of the firmware. The absence of a recorded stationary start ($\neg S$) prevents emission in this abstraction. "Near $1g$" is an observation about magnitude, **not** a proof that a person is motionless.

### P01 — emission requires IMPACT (UNSAT)

```math
A\land(q\ne2)\quad\textbf{UNSAT}
\quad\Longrightarrow\quad A\Rightarrow(q=2).
```

The modeled guard cannot emit while in IDLE or FREE_FALL.

### P02 — a blind sample gap blocks emission (UNSAT)

```math
A\land B\quad\textbf{UNSAT}
\quad\Longrightarrow\quad A\Rightarrow\neg B.
```

Once in a non-IDLE state, more than 150 ms between successful readings blocks an alert in this modeled decision step.

### P03 — cooldown after a prior fall is enforced (UNSAT)

```math
A\land C\quad\textbf{UNSAT}
\quad\Longrightarrow\quad A\Rightarrow\neg C.
```

A prior alert inside the unsigned 25,000-ms cooldown excludes new emission.

### P04 — readiness and successful read are mandatory (UNSAT)

```math
A\land(\neg E\lor\neg V)\quad\textbf{UNSAT}
\quad\Longrightarrow\quad A\Rightarrow(E\land V).
```

Neither an unavailable sensor nor a failed accelerometer read can satisfy the modeled guard.

### P05 — near-one-g reading and sufficiently long modeled stationary interval (UNSAT)

```math
A\land(\neg Z\lor\neg S\lor\neg L)\quad\textbf{UNSAT}
\quad\Longrightarrow\quad A\Rightarrow(Z\land S\land L).
```

This is a predicate/clock property only. It does not prove continuous real-world stillness or absence of missed samples outside the defined guard.

### P06 — the impact deadline holds (UNSAT)

```math
A\land\neg I\quad\textbf{UNSAT}
\quad\Longrightarrow\quad A\Rightarrow\bigl(\Delta(t,t_i)\le2000\bigr).
```

The modeled fall cannot be reported after its post-impact timeout expires.

### P07 — a first fall before 25 seconds is possible (SAT witness)

```math
\exists\,\mathbf{x}:\quad A\land\neg H\land(t<25000)
\quad\textbf{SAT}.
```

The model does not require a boot-time cooldown when no previous alert exists. **SAT is not a guarantee that a physical fall is detected.**

### P08 — emission is still possible after cooldown (SAT witness)

```math
\exists\,\mathbf{x}:\quad
A\land H\land\bigl(\Delta(t,t_a)\ge25000\bigr)
\quad\textbf{SAT}.
```

There exists a modeled state with a prior alert and an expired cooldown in which the guard can emit.

### P09 — zero-valued sample timestamp does not waive the gap rule (UNSAT)

```math
A\land(t_p=0)\land(t=800)\quad\textbf{UNSAT}.
```

When $q=2$ as required by $A$, the 800-ms gap is greater than 150 ms even though the previous sample timestamp equals zero. This specifically protects against treating an actual zero timestamp as a “no sample” sentinel.

### P10 — short interval across 32-bit rollover is admitted (SAT witness)

```math
\begin{gathered}
q=2,\qquad t_p=4294967196=2^{32}-100,\qquad t=10,\\
\Delta(10,2^{32}-100)=110\le150,\\
\exists\,\mathbf{x}:\ (q=2)\land(t_p=2^{32}-100)
 \land(t=10)\land\neg B\quad\textbf{SAT}.
\end{gathered}
```

A 110-ms interval remains short when modular subtraction crosses zero.

### P11 — long interval across 32-bit rollover is rejected (UNSAT)

```math
\begin{gathered}
q=2,\quad t_p=4294966296=2^{32}-1000,\quad t=10,\\
\Delta(10,2^{32}-1000)=1010>150,\\
(q=2)\land(t_p=2^{32}-1000)\land(t=10)\land\neg B
\quad\textbf{UNSAT}.
\end{gathered}
```

A gap spanning 1,010 ms cannot masquerade as a short interval.

### P12 — fall cooldown also holds across rollover (UNSAT)

```math
\begin{gathered}
H,\quad t_a=4294967040=2^{32}-256,\quad t=1000,\\
\Delta(1000,2^{32}-256)=1256<25000,\\
A\land H\land(t_a=2^{32}-256)\land(t=1000)
\quad\textbf{UNSAT}.
\end{gathered}
```

The recent-alert cooldown still blocks the abstract guard across a timer rollover.

## C. Shared-I²C controller-recovery guard: exact modeled formula

Let $O$ and $M$ represent previously observed optical and MPU transport-fault transitions, $R_O$ and $R_M$ represent their current readiness, $D_S,D_C$ mean SDA and SCL sampled LOW, $H_R$ mean any shared-controller restart response was previously attempted, $t_f$ mean the *opposite sensor* fault timestamp, and $t_r$ the last controller-restart attempt timestamp.

```math
\begin{aligned}
F &:= O\land M\land\bigl(\Delta(t,t_f)\le3000\bigr),\\
K &:= \neg H_R\lor\bigl(\Delta(t,t_r)\ge10000\bigr),\\
U &:= \neg R_O\land\neg R_M,\\
D &:= F\land U\land K,\\
J &:= D\land\neg D_S\land\neg D_C.
\end{aligned}
```

Here $D$ is the modeled shared-fault diagnosis, and $J$ is the **permission to attempt** a controller restart. Neither implies success of the ESP32 peripheral restart or the physical sensors. The temporal fault window and cooldown are bit-vector arithmetic, not wall-clock guarantees across arbitrary resets.

### R01 — no restart while either sensor remains ready (UNSAT)

```math
J\land(R_O\lor R_M)\quad\textbf{UNSAT}
\quad\Longrightarrow\quad J\Rightarrow(\neg R_O\land\neg R_M).
```

The shared-controller restart guard excludes the healthy-sensor case.

### R02 — a single fault cannot authorize a shared restart (UNSAT)

```math
J\land(\neg O\lor\neg M)\quad\textbf{UNSAT}
\quad\Longrightarrow\quad J\Rightarrow(O\land M).
```

Both independently recorded sensor fault flags are required.

### R03 — correlation beyond three seconds is disallowed (UNSAT)

```math
J\land\bigl(\Delta(t,t_f)>3000\bigr)\quad\textbf{UNSAT}.
```

A reported opposite-sensor failure outside the 3,000-ms window cannot satisfy the modeled restart guard.

### R04 — sampled LOW SDA suppresses restart (UNSAT)

```math
J\land D_S\quad\textbf{UNSAT}
\quad\Longrightarrow\quad J\Rightarrow\neg D_S.
```

This concerns a **sampled GPIO logic level**, not a laboratory determination of the wire voltage or a proof that no electrical hazard exists.

### R05 — sampled LOW SCL suppresses restart (UNSAT)

```math
J\land D_C\quad\textbf{UNSAT}
\quad\Longrightarrow\quad J\Rightarrow\neg D_C.
```

Likewise, held-low SCL cannot satisfy the modeled restart condition.

### R06 — controller-restart cooldown holds (UNSAT)

```math
J\land H_R\land\bigl(\Delta(t,t_r)<10000\bigr)
\quad\textbf{UNSAT}.
```

A previous shared-restart attempt less than 10,000 ms ago excludes a second permitted restart.

### R07 — eligible restart after cooldown is satisfiable (SAT witness)

```math
\exists\,\mathbf{y}:\quad J\land H_R
 \land\bigl(\Delta(t,t_r)\ge10000\bigr)
\quad\textbf{SAT}.
```

The guard is not permanently disabled after an earlier restart.

### R08 — a first eligible shared fault is satisfiable (SAT witness)

```math
\exists\,\mathbf{y}:\quad J\land\neg H_R
\quad\textbf{SAT}.
```

The first-attempt path is not vacuous.

### R09 — modeled restart clears optical READY even if Wire.begin succeeds (UNSAT)

Let $W$ denote whether `Wire.begin` is modeled as successful, and let $R_O'$ be the model's post-restart readiness, defined by the explicit transition abstraction:

```math
R_O' :=
\begin{cases}
\mathrm{false},&J\\
R_O,&\neg J.
\end{cases}
\qquad
J\land W\land R_O'\quad\textbf{UNSAT}.
```

**Scope warning:** this result follows from how the *abstract post-state* is defined. It does not independently prove that deployed C++ always resets the flag, or that firmware reinitialization works electrically. The C++ host regressions provide separate executable support.

### R10 — modeled restart invalidates an old HR value (UNSAT)

Let $V_H$ denote the previous model-level HR-valid flag and $V_H'$ its modeled post-state:

```math
V_H' :=
\begin{cases}
\mathrm{false},&J\\
V_H,&\neg J.
\end{cases}
\qquad
J\land V_H\land V_H'\quad\textbf{UNSAT}.
```

**Scope warning:** this is a **transition-definition check**, not an independent firmware proof. It confirms consistency of the chosen fail-closed abstract model; real firmware tests are still required for the implementation.

### R11 — 9,000 ms elapsed over rollover is inside cooldown (UNSAT)

```math
\begin{gathered}
t_r=4294962296=2^{32}-5000,\qquad t=4000,\\
\Delta(4000,2^{32}-5000)=9000<10000,\\
J\land H_R\land(t_r=2^{32}-5000)\land(t=4000)
\quad\textbf{UNSAT}.
\end{gathered}
```

Modular clock wraparound cannot by itself terminate a recent 10-second cooldown.

### R12 — 12,000 ms elapsed over rollover passes cooldown (SAT witness)

```math
\begin{gathered}
t_r=4294962296=2^{32}-5000,\qquad t=7000,\\
\Delta(7000,2^{32}-5000)=12000\ge10000,\\
\exists\,\mathbf{y}:\ J\land H_R
\land(t_r=2^{32}-5000)\land(t=7000)
\quad\textbf{SAT}.
\end{gathered}
```

There exists an admissible configuration where cooldown no longer prohibits a restart.

## D. Separate inductive SOS button-counter proof

The 12 enumerated transitions for the three possible counter values and two Boolean inputs (debounced press and valid time window) establish a simple **inductive invariant** of the *counter abstraction*:

```math
\begin{gathered}
c_0=0,\qquad c_n\in\{0,1,2\},\\
\forall n:\quad c_n\in\{0,1,2\}\ \Longrightarrow\
c_{n+1}\in\{0,1,2\},\\
\mathrm{SOS}_n\Longrightarrow
(c_n=2)\land\mathrm{press}_n\land\mathrm{window}_n.
\end{gathered}
```

The full case split and assumptions appear in [SOS_COUNTER_INDUCTION.md](SOS_COUNTER_INDUCTION.md). This does **not** guarantee that physical presses are detected, that power is available, or that a phone receives an alert.

## E. What the 24 solver results *do not* establish

They do not prove model equivalence to Arduino C++ or Android TypeScript, whole-system functional correctness, fair scheduling or liveness, measured voltage/clock rise times, absence of intermittent I²C dropouts, authenticity/delivery of BLE packets, calibrated HR/SpO₂ accuracy, safe physical fall classification, or end-to-end emergency reliability. Source-regex guards, real-sketch host test cases, successful board compilation and passing APK CI increase evidence, but **do not close these formal and physical gaps**.

The original exact queries and their solver classifications remain individually traceable by the IDs above. We preserve **all P01–P12 and R01–R12 identifiers** and explicitly label SAT witnesses rather than silently treating them as universally proved theorems.

## F. Proof source identity and anti-drift check

The original P01–P12 solver script has **Git blob identity** `846bdd32f824c4f7a3755dc1c903c5c30028ddae`. The R01–R12 script, now with explicitly modeled post-restart state assignments for R09/R10, has Git blob identity `4e0a558d38f3ee4cf5126db21bdcafba4536b1e4`. The [automated documentation checker](check_proof_documentation.py) recalculates both Git content identities directly from their local bytes and requires these same identities to appear on this page.

Consequently, merely reusing a theorem label while silently changing its solver source **fails CI**. An intentional future mathematical change must update the proof documentation, identify the new source bytes and rerun the solver and independent tests. These Git identities are **revision/drift guards**, not a proof of source/model equivalence or adversarial supply-chain authenticity.
