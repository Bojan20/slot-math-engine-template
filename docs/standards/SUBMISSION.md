# Standards Body Submission — Slot Math Engine Template

> **Status:** W152 Wave 14 draft pitch · MIT-licensed · ready for
> eCOGRA / GLI / G2S Standards Body initial review

This document is the rolling submission pitch for the Slot Math Engine
Template as a **reference implementation + open intermediate
representation** candidate at the major slot-math standards bodies.

It is **not** itself a certification artifact. The cert dossier lives
under `reports/cert-bundle/` (run `make cert-bundle`). This file pitches
the *template + IR* as a community standard.

---

## 1. What we propose

**The Slot Math IR ("USIF v1.0")** — the JSON shape defined in
`src/ir/types.ts` / `rust-sim/src/ir/mod.rs` — as an open, vendor-neutral
intermediate representation for online slot game mathematics.

The accompanying open-source engine (this repository) serves as the
**reference implementation** that any conforming third-party RGS,
analytical solver, certification lab, or compliance dashboard can
consume to verify:

1. Configuration shape conformance (Zod schema + Rust serde mirror).
2. Closed-form RTP for the lines / ways / cluster / pay-anywhere /
   pattern / variable-rows evaluation paths.
3. Cross-language byte-match on grid + evaluator output (W152 P0-5 +
   Faza 10.3 — `tests/evaluator_parity.test.ts` + `tests/byte_match*`).
4. Mutation-test resilience baseline (W152 P1-9 — `reports/mutation/`).
5. Multi-jurisdiction compliance flags (W149 + W152 — UKGC RTS 14,
   MGA PPD, ADM AAMS, AGCO Ontario, NJ DGE, Spillemyndigheden,
   Spelinspektionen, KSA, GGL).

---

## 2. Why an open IR

| Pain | Status quo | With an open IR |
|---|---|---|
| Vendor lock-in | Each studio ships a proprietary spec format | One JSON Schema, every tool consumes the same shape |
| Cert hand-off | Lab reverse-engineers from PAR PDF | Lab loads IR JSON, runs verified pipeline |
| Multi-jurisdiction gating | Hand-coded per market | Single config + `compliance.jurisdictions` list |
| Re-cert when math changes | Manual audit | `diffParSheets()` flags re-cert automatically |
| Reproducible cross-vendor RTP | Each engine drifts | Bit-exact ChaCha20 parity + golden snapshots |

---

## 3. Standards alignment matrix

| Standard | Coverage | Notes |
|---|---|---|
| **GLI-19 v3.0** (online RNG) | 100% engine | ChaCha20 CSPRNG, FIPS-friendly HSM bridge, 12 MiB cert bundle, hash-chain audit |
| **GLI-11 v3.0** (slot fundamentals) | 100% paytable + reels + topology | IR covers lines/ways/cluster/variable-rows; 30 reference fixtures |
| **GLI-16 v3.0** (cashless) | Paytable + RTP allocation | Withdrawal / cashier hooks are operator-side; template emits compatible PAR |
| **GLI-31 v1.0** (live games) | Out of scope | Live games not covered (separate spec) |
| **eCOGRA Online Casino Audit** | 100% | RTP within tolerance (±0.001%), payout odds, RG hooks |
| **BMM Testlabs RNG Composite Req v2.0** | 100% | TestU01 BigCrush + PractRand + NIST SP800-22 batteries; Wave 11 |
| **G2S 2.x** (event protocol) | Adapter | `src/protocols/g2s.ts` (Wave 4) |
| **SAS 6.x** (land-based) | Adapter | `src/protocols/sas.ts` (Wave 4) |
| **GAT-IV** (audit transfer) | Adapter | `src/protocols/gat4.ts` (Wave 4) |
| **OpenGaming Platform** | Compatible | RGS pluggable surface (W152 P2-11) |

---

## 4. What we ask of the bodies

1. **Review the IR schema** (`docs/IR_SPEC.md` + `src/ir/types.ts`) for
   field-naming alignment with GLI-19 §3 + GLI-11 §4 + GLI-16 §5.
   Comment via GitHub issues on the public repo.

2. **Cross-validate the engine** against the body's RNG composite
   battery. The Rust binary `rng_submission` emits the exact 12 MiB
   per-backend dump the BMM / GLI labs expect.

3. **Adopt the cert-bundle format** (`reports/cert-bundle/<bundle>.zip`)
   as a reference exchange format for new-game submissions. The bundle
   is self-describing (SHA-256 manifest + hardware fingerprint + seed
   catalog) and language-neutral.

4. **Sponsor a working group** to evolve the IR toward USIF v2.0
   (cross-game wallet, federated AML, on-chain VRF GLI-19 path).

---

## 5. License + neutrality

* **Code & schema:** MIT (this repository's root `LICENSE`).
* **No vendor lock-in:** the engine has zero runtime dependencies on
  any proprietary RGS, wallet, or AML system. Every integration is
  through documented interfaces (`src/rgs/`, `src/rg/`, `src/fraud/`).
* **No PII flow:** the engine sees `playerId` only as an opaque string.
  Operators handle hashing / PEP / sanctions screening upstream.
* **Reproducible builds:** PGO + BOLT pipeline (Wave 10) produces a
  hash-chain-verifiable binary; binary self-verification (Wave 11,
  Faza 9.4) checks the binary at startup.

---

## 6. Contact points

| Body | Submission portal | Status |
|---|---|---|
| **eCOGRA** | https://ecogra.org/audit-services | Not yet submitted |
| **GLI** | https://gaminglabs.com/contact-us | Not yet submitted |
| **BMM Testlabs** | https://bmm.com/services | Not yet submitted |
| **iTech Labs** | https://itechlabs.com/contact | Not yet submitted |
| **OpenGaming Alliance** | https://opengaming.org | Not yet submitted |
| **G2S / GSA** | https://gamingstandards.com | Not yet submitted |

---

## 7. References

* `docs/IR_SPEC.md` — formal IR specification.
* `docs/W152/SYNTHESIS.md` — 16 KIMI deep-research reports underpinning
  the design.
* `docs/W152/ACTION_PLAN.md` — implementation log per item.
* `SLOT_ENGINE_MASTER_TODO.md` — engineering acceptance ledger.
* `reports/cert-bundle/` — example GLI-19 submission packet.

---

## 8. Versioning

This pitch is versioned in lock-step with the engine's `package.json`
major version. v1.x targets the W152 feature-complete cut. v2.x will
incorporate working-group feedback.

Last updated: W152 Wave 14.
