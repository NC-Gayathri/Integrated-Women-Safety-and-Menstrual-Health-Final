# Exact v17 bus-controller safety obligations — B01 to B10

**Scope:** These ten propositions are machine-checked using Z3's quantifier-free bit-vector logic by [prove_bus_failclosed.py](prove_bus_failclosed.py). The executable program is the authoritative statement of each query. An UNSAT result prohibits a counterexample *within the modeled guards*; a SAT result establishes only model satisfiability, **not** hardware availability.

## Symbols and precise definitions

All timestamps are unsigned 32-bit values. Let $t$ be the current sample, $w$ the restart-window start, $\rho$ the last restart time, and $n\in\{0,1,2\}$ the number of controller restart attempts already consumed in the current window. Let $H$ be window-active, $P$ be previously-restarted, $K$ be controller-ready, $F_O,F_M$ be optical/MPU fault flags, $R_O,R_M$ be their readiness flags, and $D_S,D_C$ be whether SDA/SCL are sampled LOW.

```math
\begin{aligned}
\Delta(t,u)&=(t-u)\bmod 2^{32},\\
X&:=\neg H\lor\Delta(t,w)\ge60000,\\
n_{\mathrm{eff}}&:=
\begin{cases}0,&X,\\ n,&\neg X,\end{cases}\\
C&:=\neg P\lor\Delta(t,\rho)\ge10000,\\
F&:=F_O\land F_M\land\neg R_O\land\neg R_M,\\
J&:=F\land C\land\neg D_S\land\neg D_C
 \land(n_{\mathrm{eff}}<2),\\
T&:=K,\qquad Q:=K.
\end{aligned}
```

$J$ means **eligible to attempt a reset** in the abbreviated budget abstraction, $T$ means sensor transfer is allowed, and $Q$ means readiness *may be considered* after controller state. The firmware has additional timing correlation checks (the older R01–R12 proof model), so this new model is a **necessary-condition abstraction**, not a complete equivalence claim. It assumes an observed fault pair to model eligible resets.

## B01 — no sensor I²C transfer when the controller failed

```math
\neg K\land T\quad\mathrm{UNSAT}.
```

Since $T:=K$, the post-failure I²C gate disallows sensor access. This is a guard-level theorem; real-sketch fake-Wire regressions additionally exercise that guard.

## B02 — no sensor READY path when controller unusable

```math
\neg K\land Q\quad\mathrm{UNSAT}.
```

A failed Wire controller is a blocking prerequisite for sensor readiness claims. It does not guarantee that a READY sensor is electrically stable.

## B03 — two restart attempts exhaust a live 60-second window

```math
J\land H\land\neg X\land(n=2)\quad\mathrm{UNSAT}.
```

As long as the window remains active, another restart cannot satisfy the attempt-budget guard.

## B04 — sampled LOW on either wire forbids software restart

```math
J\land(D_S\lor D_C)\quad\mathrm{UNSAT}.
```

This is *not* a voltage measurement: HIGH samples cannot prove correct 3.3 V regulation, fast I²C rising edges, or module power.

## B05 — the 10-second attempt spacing still applies

```math
J\land P\land\bigl(\Delta(t,\rho)<10000\bigr)
\quad\mathrm{UNSAT}.
```

No new reset may be attempted during that modeled interval.

## B06 — first eligible fault is not blocked by the budget

```math
\exists\mathbf{x}:\quad J\land\neg P\land\neg H\land(n=0)
\quad\mathrm{SAT}.
```

This is an existence witness, not a prediction of real controller recovery.

## B07 — the 60-second budget epoch can renew

```math
\exists\mathbf{x}:\quad J\land H\land X\land(n=2)
\quad\mathrm{SAT}.
```

After the epoch expires, the effective count is reset to zero in the mathematical model.

## B08 — rollover does not bypass an unexpired budget

```math
\begin{gathered}
w=2^{32}-5000,\qquad t=5000,\qquad
\Delta(t,w)=10000<60000,\\
J\land H\land(n=2)\land(w=2^{32}-5000)
\land(t=5000)\quad\mathrm{UNSAT}.
\end{gathered}
```

The model's modular subtraction retains a 10-second interval across wraparound. It cannot prove meaningful elapsed time over a complete 49.7-day counter cycle.

## B09 — SOS abstract input does not depend on I²C controller state

```math
\exists\mathbf{x}:\quad \neg K\land\mathrm{SOSAccepted}
\quad\mathrm{SAT}.
```

**Critical limitation:** This is only satisfiability of independent Boolean variables. It is *not* a liveness theorem; real SOS button power, scheduling, BLE transport, paired phone, network and emergency delivery remain outside the model.

## B10 — no shared reset while either sensor remains ready

```math
J\land(R_O\lor R_M)\quad\mathrm{UNSAT}.
```

The system should preserve a still-functional module when only one of the two reports a fault.

## Implementation-focused regression witnesses

The unchanged Arduino sketch is executed through a controllable C++ fake-I²C boundary. The new cases assert: failed Wire.begin, failed Wire.setClock, *zero* subsequent I²C bus transactions before controller restoration, independent post-restoration sensor reinitialization, two resets inside 60 seconds followed by a persistent-fault diagnostic with no third reset, and a fresh bounded retry epoch after 60 seconds. The original suite still checks SOS while both sensors fail, separate SDA/SCL held-LOW cases, and stale vitals invalidation.

**What is not proved:** The physical cause of the user's recurring `tx=4` errors, electrical SDA/SCL rise times, proper 1.8 V/3.3 V sensor rails, hardware interrupt timing, full C++ refinement to SMT, BLE reception, human fall classification, or medically valid oxygen saturation. Refer to [the electrical acceptance guide](../documentation/NAARI_KAVACH_V17_RECURRENCE_DIAGNOSIS.md) for the remaining real-board checks.
