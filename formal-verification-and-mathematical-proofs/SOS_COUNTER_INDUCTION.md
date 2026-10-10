# SOS click-counter: exhaustive abstract induction

**Verification classification:** a finite-state **invariant proof for a modeled counter**, with 12 explicit input/state combinations checked by `prove_naari.py`. No claim is made that physical button debounce, BLE delivery, SMS, or the Android backend is formally verified.

## 1. Inputs, state, and initial condition

```math
\begin{aligned}
c&\in\mathcal{C}:=\{0,1,2\},\\
p&\in\{0,1\},\\
w&\in\{0,1\},\\
c_0&=0.
\end{aligned}
```

Here $p$ is an accepted, debounced button press, $w$ indicates that the 1.8-second window is open, and $c_0$ is the initial counter. We model only the counter update on an atomic iteration. The values of $p$ and $w$ are inputs to the model. The Python proof does **not** execute the physical switch, timer ISR, Android phone, or GATT stack.

## 2. Total transition relation

The actual abstract update logic checked by the Python source is:

```math
(c',a)=T(c,p,w)=
\begin{cases}
(c,0),&p=0,\\
(1,0),&p=1\ \land\ (c=0\ \lor\ w=0),\\
(2,0),&p=1\ \land\ c=1\ \land\ w=1,\\
(0,1),&p=1\ \land\ c=2\ \land\ w=1.
\end{cases}
```

Here $a=1$ means the *abstract counter* emitted SOS in that update.

## 3. Complete case analysis (3 × 2 × 2 = 12)

| Before `c` | Press `p` | Window `w` | After `c'` | Emit `a` |
|:--:|:--:|:--:|:--:|:--:|
| 0 | 0 | 0 | 0 | 0 |
| 0 | 0 | 1 | 0 | 0 |
| 0 | 1 | 0 | 1 | 0 |
| 0 | 1 | 1 | 1 | 0 |
| 1 | 0 | 0 | 1 | 0 |
| 1 | 0 | 1 | 1 | 0 |
| 1 | 1 | 0 | 1 | 0 |
| 1 | 1 | 1 | 2 | 0 |
| 2 | 0 | 0 | 2 | 0 |
| 2 | 0 | 1 | 2 | 0 |
| 2 | 1 | 0 | 1 | 0 |
| 2 | 1 | 1 | 0 | **1** |

Both Boolean input values are covered at each of three possible states.

## 4. Theorem SOS-S1 — closure under transition (induction)

Claim:

```math
\forall n\ge0,\quad c_n\in\mathcal{C}.
```

**Base:** $c_0=0\in\mathcal{C}$.

**Inductive step:** assume $c_n\in\mathcal{C}$. Every one of the 12 table rows has its next value $c_{n+1}\in\mathcal{C}$. Therefore by mathematical induction, the counter never leaves $\{0,1,2\}$ **under this transition definition**.

## 5. Theorem SOS-S2 — emission gating

Claim:

```math
\forall n,\quad a_n=1\Longrightarrow
\bigl(c_n=2\bigr)\land\bigl(p_n=1\bigr)\land\bigl(w_n=1\bigr).
```

**Proof:** in the complete table, exactly one row has $a=1$, and it requires $(c,p,w)=(2,1,1)$. No other abstract state/input combination emits.

## 6. A concrete trace (not a real-device proof)

```math
\begin{aligned}
(0,1,1)&\mapsto(1,0),\\
(1,1,1)&\mapsto(2,0),\\
(2,1,1)&\mapsto(0,1).
\end{aligned}
```

The third accepted press in an open window emits one modeled SOS and resets the click counter.

**Not proved:** that the third physical press is accepted; that the ESP32 is powered; that a pressed switch is electrically debounced; that a BLE notification is transmitted and authenticated; that the Android phone is connected; that backend emergency handling succeeds. The user-supplied device log *did* show three local button counts and `[EVENT] SOS`, which is separate empirical evidence, **not** a theorem of this counter model.

[Return to all 24 numbered SMT queries](EXACT_THEOREMS.md).
