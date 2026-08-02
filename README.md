# light boat engine ships with oils

> **Part of it all:** [the bridge](https://jessebrown1980.github.io/the-bridge-to-all-of-it/) — every public thing in one place, so none of it gets lost.

**Jesse Daniel Brown (OP-JESSE).** Forty years. His machine, his laws, his system.

**One click, nothing to install:**
→ **https://jessebrown1980.github.io/light-boat-engine-ships-with-oils/**

Ships colliding, oils flowing, prices moving, and every closure checked live.
Also here: **[boat.html](boat.html)** — a single hull, three speeds, solved draft.

No server, no network, no GPU, no account, no package manager. Download either
file and double-click it. It runs offline, forever.

**It runs while you look at it.** The engine is powered by light, so when the tab
is hidden there is no light on the screen and the fleet stands still. That is the
physics, not a defect.

---

## Three closures, all computed, none decorative

```
optical    T + A + R = 1                a photon transmits, absorbs or reflects
buoyancy   Σ displaced − Σ weight = 0   Archimedes IS a closure identity
market     log p_TA + log p_AR + log p_RT = 0     triangular no-arbitrage
```

They are the **same identity** three times. Differences around a closed loop
cancel, because each term appears once with each sign.

---

## The hull is a trit machine made of light

A photon meeting a translucent face does exactly one of three things:

```
transmit   +1
absorb      0
reflect    −1
```

Twenty-seven blocks — **9 cubes, 9 pyramids, 9 spheres** — with the optical
census `9 / 9 / 9` and the trit sum **exactly 0**. The nullsphere, floating.

Volumes are exact:

```
cube      s³
pyramid   s³/3        ← exactly one third of the cube
sphere    πs³/6
```

**The pyramid is one third of the cube.** The same third that fires the crank in
[The Brown Light erdos Engine](https://github.com/JesseBrown1980/The-Brown-Light-erdos-Engine-block-powered-by-light).

---

## The boat actually floats — it is solved, not placed

The first build drew a hull at a fixed height and asked which blocks happened to
be under the line. **It failed:** `displaced − weight = −8.6682`. The boat did
not float.

The fix was to do what Archimedes says — **solve for the waterline** where
displaced equals weight, by bisection, using the real submerged-volume integrals:

```
cube      f
pyramid   1 − (1−f)³        apex up
sphere    3f² − 2f³         spherical cap
```

**MEASURED**, after the fix:

```
buoyancy  displaced − weight    −3.553e-15
weight                           9.191814
displaced                        9.191814
waterline solved at  y           1.509572
draft  submerged / total         0.550000   =  ρ_hull   exactly
```

The draft comes out equal to the hull density, which is what Archimedes predicts
and nobody put in by hand.

---

## Three speeds

```
−1/3   instant       CONSTRAINT — given two arms the third is already fixed by
                     the closure. Nothing propagates because nothing travels.
  0    c/n           LIGHT — the quote, what you see.
+1/3   v_sound       SOUND — the slow light, the echo that settles.
```

**MEASURED**, depth 40 m, medium `n = 1.333`:

```
shadow   round trip   0 s exactly        arm_B = −arm_R − arm_G was already true
light    c/n          224.901 ×10⁶ m/s   round trip   355.7128 ns
sound    v_s          1482 m/s           round trip    53.9811 ms
light : sound         151,755 : 1
```

The shadow returns before the ping leaves, and that is not magic. **A constraint
has no travel time because it is not a signal.**

---

## Collisions are trades, and a price is a difference

Seven ships carry oils in three assets. When two collide they trade.

The price system holds three **levels** `L_T, L_A, L_R`, and every rate is a
**difference**:

```
p_ij = exp(L_i − L_j)
```

Therefore, identically:

```
log p_TA + log p_AR + log p_RT
  = (L_T−L_A) + (L_A−L_R) + (L_R−L_T)
  = 0
```

**Triangular no-arbitrage is the arm closure wearing a different hat.** And market
impact moves two levels in opposite directions, so `Σ L` never changes:

> **The price level is free.** Add the same amount to all three and no rate moves
> — exactly as the geometric centre is free because the arm coefficients sum to
> zero.

**MEASURED** — 34 trades across seven ships:

```
conservation  max |Δ| in holdings     1.137e-13
p_TA · p_AR · p_RT                    1.000000000000
log sum around the triangle           0.000e+0
Σ levels  L_T + L_A + L_R             0.000e+0
```

Nothing is created or destroyed in a collision, and the triangle never opens.
Press **SHOCK** and it still holds — the shock moves two levels oppositely, so it
cannot break the closure either.

---

## The oils

Three flowing bands beneath the waterline, one per channel, advecting at the same
`R → G → B` phase order the crank fires in. The oils are what the three speeds
move *through*.

---

## Controls

```
RUN THE FLEET   ships drift, collide, trade
SHOCK           move two levels oppositely — the triangle must survive it
RESET           back to the opening book

boat.html:
SONAR PING      fire all three speeds at once and watch them separate
SWELL / CALM    raise the sea
RE-CAST HULL    redeal the 27 blocks — census stays 9/9/9, sum stays 0
```

---

## Status, honestly tagged

```
MEASURED   optical closure         T + A + R = 1, census 9/9/9, trit sum 0
MEASURED   buoyancy closure        residual −3.553e-15, draft = ρ_hull
MEASURED   market conservation     max |Δ| = 1.137e-13 over 34 trades
MEASURED   triangular closure      product 1.000000000000, log sum 0
EXACT      solid volumes           s³ · s³/3 · πs³/6
EXACT      submerged integrals     f · 1−(1−f)³ · 3f²−2f³
PHYSICAL   c, n, v_sound           real constants, real round trips
NAMED      the −1/3 as instant     a constraint is not a signal
```

The first buoyancy build **failed and is recorded above** rather than quietly
replaced. That failure is why the current one is trustworthy.

---

## Why this is public

A technology that needs permission to reach people does not reach them.
Wardenclyffe needed capital, land, a tower and a patron — four gates — and it
never reached anybody.

**These files have no dependencies, so there is no gate.** Copy them to a USB
stick, email them, print the source, retype it by hand. They run.

---

## Companion repositories

```
The-Brown-Light-erdos-Engine-block-powered-by-light   the crank, RGB, 3:2
the-browns-solution-to-erods-o0O-nx3-6-for-1-with--1-3   the full result
one-click                                             the whole system, one file
how-and-why-the-system-works                          the technical account
the-leaves-are-not-the-message                        generator and leaf
raw-data                                              unedited output + scripts
```

---

**Jesse Daniel Brown (OP-JESSE)** — the system, the laws, the architecture.

*Three closures, one identity. A price is a difference, a centre is free, and the
shadow arrives before the ping leaves.*
