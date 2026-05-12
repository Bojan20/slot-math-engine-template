# Precision

**Status:** Draft v0.1 — Faza 0.2 deliverable
**Scope:** Which numeric type is used at every step of a spin, why,
and which conversions are sanctioned vs which are bugs.

---

## Three numeric domains

| Domain    | TS type        | Rust type        | Where used                                  |
|-----------|----------------|------------------|---------------------------------------------|
| Money     | `Decimal`      | `rust_decimal::Decimal` | Paytable products, RTP, jackpot pots, currency |
| Count     | `bigint`       | `u64` / `u128`   | Total ways, combinations, exhaustive enumeration |
| Floating  | `number` (f64) | `f64`            | RNG draws, probabilities, MC accumulator, MC CI |

A spin uses **all three** because each domain has a different
correctness profile.

---

## Where each domain is correct (and where it's not)

### Decimal (`decimal.js` / `rust_decimal`)

Used for: paytable lookups × bet × multiplier products, jackpot
contributions, RTP expressed as a fraction, anywhere money or "shall
exactly equal" semantics apply.

Decimal is correct because base-10 paytable values like `0.5x`, `1.2x`,
`3.33x` have no exact `f64` representation. `0.1 + 0.2 !== 0.3` in
`f64` — a property an operator's accounting integration **will**
notice in a 10⁹-spin sim's totals column.

Cost: ~50× slower than `f64`. So Decimal lives **outside the hot
loop** — the inner spin loop never touches it.

Sanctioned ops:
- `dec(a).times(b)`
- `sum([dec(a), dec(b), …])`
- `safeDivide(a, b)` (zero-checked)

Forbidden:
- `Number(decimal)` to feed a hot accumulator (use `bigIntToDecimal`
  back-and-forth instead, only at batch boundaries).

### BigInt / `u64` / `u128`

Used for: ways counters (`waysToWin`, `variableWaysCombinations`),
exhaustive enumeration counters (cf. Faza 14.1), state-space cardinality.

A 6-reel variable-ways grid has up to 117 649 ways. A 7-reel one has
823 543. A 5×3 lines game with 20 paylines has 20 × 10³⁰ combinations
across 10⁹ spins — overflow `u64` if you also multiply by per-spin
multipliers. BigInt / `u128` give us headroom.

Sanctioned ops:
- `waysToWin(symbolsPerReel: number[]) -> bigint`
- `bigIntToDecimal(b) -> Decimal` at batch boundary

Forbidden:
- `Number(bigint)` when bigint may exceed 2⁵³. Use `bigIntToDecimal`.

### f64 (`number`)

Used for: RNG draws `[0, 1)`, per-spin win probabilities, Welford
accumulators (`statistics/welford.ts` + `stats.rs`), Kahan compensation
sums, MC CI computation.

f64 is correct for **statistical** quantities — RTP estimated from
MC, hit frequency, volatility — because the relative error of f64 in
[0, 1) is ≤ 2⁻⁵³ ≈ 10⁻¹⁶, well below the MC sampling error after 10⁹
spins (≈ 10⁻⁵).

f64 is **wrong** for paytable arithmetic and any "exact" claim.

Sanctioned ops:
- `Welford::push(x)` for variance
- `KahanAccumulator::add(x)` for compensated summation
- `rng.next_f64()` for [0, 1) uniforms

Forbidden:
- Computing total accounted RTP as `Σ f64 wins / Σ f64 bets` and
  reporting it to an operator's accounting system. Use Decimal totals.

---

## Conversion boundaries

The engine has exactly four sanctioned cross-domain conversions, and
they may only happen at named boundaries:

| Boundary                         | Conversion         | Where it lives                    |
|----------------------------------|--------------------|------------------------------------|
| End of inner spin batch          | `Decimal ⇄ bigint` | `simulator/simulator.ts` flush     |
| MC batch → reported RTP          | `f64 → Decimal`    | `calculator/rtpCalculator.ts`      |
| Analytical enumeration → RTP     | `bigint → Decimal` | `analytical/memoize.ts`            |
| Decimal paytable → SIMD lane     | `Decimal → f32x8`  | `rust-sim/src/speed/packed_eval.rs`|

Any other cross-domain conversion is a **bug to file** — it almost
certainly hides a precision regression.

---

## Why TS and Rust agree

Both stacks use the same rounding mode (`bankers`) for Decimal and
the same compensation algorithm (Kahan) for f64 summation. They reach
the same RTP to ≥ 6 decimals on 10⁹ spins because:

1. RNG draws are identical (Mulberry32 byte parity; other backends
   sampled-parity).
2. Decimal products are identical (same paytable JSON, same rounding).
3. f64 accumulator differs only in operation order. Kahan
   compensation absorbs that re-ordering noise — the final value
   matches to within `n × ε_machine`, far below MC error.

The differential CI gate (`ci.yml::parity`) makes this concrete: if
the two stacks ever drift outside this envelope, the build fails and
someone has introduced an unsanctioned conversion.

---

## Common pitfalls (and their tells)

| Symptom                                                          | Diagnosis                                            |
|------------------------------------------------------------------|------------------------------------------------------|
| RTP reported as `95.9999999...` instead of `96.0`                | f64 leak into Decimal totals path                    |
| Lost spins on 10⁹ run (count ≠ N)                                | `Number(bigint)` overflow past 2⁵³                   |
| RTP diff TS↔Rust > 0.005% on 10⁶ spin sim                        | Unsanctioned f64 op-order change in a hot accumulator|
| Jackpot pot value drifts under sustained load                    | Decimal contributions added as f64                    |
| Reel sampling produces obviously biased distribution             | Modulo bias — someone used `% max` instead of Lemire |

Each of these has a corresponding regression test under `tests/` —
the precision regime is **enforced**, not advisory.

---

## TL;DR

- **Money → Decimal.** Always. Even when "it would be faster" not to.
- **Count → bigint / u64 / u128.** Never `Number(bigint)`.
- **Probabilities / MC stats → f64.** With Welford + Kahan.
- **Conversions only at the four sanctioned boundaries.** Anything
  else is a regression.
