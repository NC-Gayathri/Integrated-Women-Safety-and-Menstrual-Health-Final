# C01–C08: Z3 safety checks of the v16 heart-rate confidence gate

This is **additional** evidence beyond the retained P01–P12 and R01–R12 model queries. All equations use GitHub-compatible fenced mathematics and are verified against the matching [executable model](prove_pulse_confidence.py). The formal language is quantifier-free linear integer arithmetic (QF_LIA). Its amplitude/BPM integers **abstract** the firmware's IEEE-754 floating point; the proof runner includes textual source-drift guards but not semantic equivalence.

## Model

Let $D$ denote positive IR DC level in sensor counts, $E$ the nonnegative IR AC envelope in counts, $C$ the number of mutually consistent interbeat intervals, and $B$ an integer BPM estimate. The successful numeric publication **model** is:

~~~math
\begin{aligned}
Q &:= E\ge 10\ \land\ 10000E\ge4D,\\
A &:= Q\ \land\ C\ge3\ \land\ 30\le B\le200.
\end{aligned}
~~~

The factor $4/10000=0.0004$ is the explicitly configured **0.04%** DC-relative minimum. The model treats the quality predicate and counter as inputs from previously evaluated sample processing; it does not prove correct waveform/peak extraction or real physiological accuracy.

## C01: never emit with fewer than three coherent intervals

~~~math
A\land(C<3)\quad\mathrm{UNSAT}.
~~~

## C02: absolute AC pulsatility floor

~~~math
A\land(E<10)\quad\mathrm{UNSAT}.
~~~

## C03: brightness-relative AC floor

~~~math
A\land(10000E<4D)\quad\mathrm{UNSAT}.
~~~

## C04: permitted prototype BPM range

~~~math
A\land((B<30)\lor(B>200))\quad\mathrm{UNSAT}.
~~~

## C05: the capture-shaped 246k-DC, 62-AC ripple must not publish BPM

~~~math
A\land(D=246000)\land(E=62)\quad\mathrm{UNSAT}.
~~~

Numerically, the configured signal floor is $E\ge98.4$ for $D=246000$, but the modeled observed $E=62$ is below it. This rules out **that specific amplitude pair** in the model; an unrelated periodic motion artifact can still pass.

## C06: a coherent clean reading is not made impossible

~~~math
A\land(D=242000)\land(E=1000)\land(B=75)\land(C=3)
\quad\mathrm{SAT}.
~~~

**SAT** is only an existential model witness. It is not a successful physiological measurement or a guarantee of detection.

## C07: even strong IR optical amplitude does not permit early publication

~~~math
A\land(C=2)\land(D=242000)\land(E=1000)
\quad\mathrm{UNSAT}.
~~~

## C08: a beat outside the 18% consistency band resets confidence

Let $B_p$ be the previous candidate BPM and $B_n$ the newly timed interval's BPM. Define drift:

~~~math
T := 100(B_n-B_p)>18B_p\ \lor\
100(B_p-B_n)>18B_p.
~~~

In the modeled transition, a true $T$ resets the confirmation count $C'$ to 1. Thus:

~~~math
T\land(C'=1)\land(C'\ge3)\quad\mathrm{UNSAT}.
~~~

The executable model uses an if-then-else update to test this obligation. This checks the *defined reset behavior*, not every actual C++ interleaving.

## Scope and reproducibility

Run from the repository root after installing the pinned Z3 version from the existing [requirements](requirements.txt):

~~~sh
python formal-verification-and-mathematical-proofs/prove_pulse_confidence.py
python scripts/test_naari_vitals_behavior.py
python scripts/test_naari_optical_behavior.py
~~~

The actual C++ firmware is separately executed in host regressions for flat/ripple bright light, delayed multi-interval acquisition, changed cadence, a controlled 2-g short drop and nonfall motion. This provides implementation-level tests that complement—but cannot replace—the model checks.

**Not proved:** reliable fall detection for arbitrary falls, immunity to structured optical artifacts, medically correct BPM or SpO₂, sensor calibration, electrical I²C reliability, BLE alert delivery, full firmware/source-to-model correctness, or hardware certification. [Physical controlled acceptance procedure](../documentation/NAARI_KAVACH_V16_FALL_PULSE_ACCEPTANCE.md) remains mandatory.
