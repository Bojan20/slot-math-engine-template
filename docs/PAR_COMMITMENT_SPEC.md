# PAR Sheet Commitment v1.0 — Specification

> **Wave 40 — Kimi K9.** Trust-minimized cryptographic commitment scheme
> for slot PAR sheets. Phase 1 (this spec): Merkle commitment + HSM-signed
> attestation + auditor verification protocol. Phase 2 (future): full
> Groth16 zero-knowledge proof of RTP correctness.

## Why this exists

From Kimi 2026-05-15 deep audit:

> "Provably-fair via zk-SNARK exists for crash/dice games but ZERO major
> slot vendor (Vendor A, SG, Vendor C, Vendor D, Pragmatic) publishes per-round
> cryptographic proofs. The EP4046329 patent (2023) defines 'strict
> provably fair' as on-chain state transitions — an opening no incumbent
> has taken."

Operators today certify a PAR sheet with a lab (BMM/GLI/iTechLabs/eCOGRA),
the lab signs an attestation, and that attestation is the only crypto-
graphic anchor between the SUBMITTED math (reel strips + paytable) and
the DEPLOYED binary. **There is no public commitment** — operators can
silently swap reel strips post-cert and only a re-audit catches it.

PAR Commitment v1.0 lands the missing primitive: a per-game
**Merkle-rooted attestation** that:
1. **Pins** the exact reel strips + paytable at cert time
2. **Allows public verification** of the attestation signature without
   revealing the reel strips
3. **Allows auditor verification** that the operator's claim of
   {RTP, hit-freq, max-win} actually follows from the committed witness
4. **Detects tampering** — any post-cert change to the IR produces a
   different Merkle root, breaking the public attestation

## Phase 1: Merkle Commitment + HSM Attestation (Wave 40)

### Module

`src/zkproof/parCommitment.ts` (~250 L)
+ `tests/parCommitment.test.ts` (17 tests, all PASS)
+ `scripts/par-commitment-acceptance.mjs` (30 fixtures × 6 gates = 180/180 PASS)

### Algorithm

```
buildParWitnessRoot(ir):
  sections = [topology, symbols, reels, paytable, evaluation, features,
              rng, bet, limits, compliance, rtp_allocation]
  leaves   = [ sha256(canonicalJson(s)) for s in sections ]
  while len(leaves) > 1:
    next = []
    for i in 0..len(leaves) step 2:
      L = leaves[i]
      R = leaves[i+1] if i+1 < len(leaves) else L  # self-pad
      next.append(sha256(L || ":" || R))
    leaves = next
  return leaves[0]   # 32-byte root

buildParAttestation(input):
  return {
    schema: "par-commitment/v1",
    parWitnessRoot:    buildParWitnessRoot(input.ir),
    publishedRtp:      input.publishedRtp,
    publishedHitFreq:  input.publishedHitFreq,
    publishedMaxWin:   input.publishedMaxWin,
    jurisdictions:     sorted(input.jurisdictions),
    gameId:            input.gameId,
    gameVersion:       input.gameVersion,
    attestedAtUtc:     input.attestedAtUtc || now(),
    canonicalHash:     sha256(canonicalJson(prev fields))
  }

operator.signAttestation(attestation):
  signature = HSM.sign(canonicalHash)
  publish: { attestation, signatureHex, algorithm, publicKeyHashTruncated }
```

### Section-level Merkle leaves

Per-section leaves (rather than per-reel) enable selective disclosure:
an auditor can be given ONE section (e.g. `paytable`) plus the Merkle
proof, and verify that section is part of the committed root WITHOUT
seeing the other sections. This is the foundation for partial
disclosure to regulators that demand only paytable review (UKGC RTS-7
inspection model).

### Auditor verification protocol

```
auditorVerify(signedAttestation, auditorIrWitness, auditorRtpEstimate):
  recomputedRoot = buildParWitnessRoot(auditorIrWitness)
  rootMatches    = recomputedRoot == signedAttestation.parWitnessRoot
  rtpMatches     = |auditorRtpEstimate - publishedRtp| ≤ tolerance
  verdict        = (rootMatches AND rtpMatches) ? "PASS" : "FAIL"
```

The auditor's RTP estimate comes from independent Monte Carlo (typically
10⁹ spins per fixture; lab-side hardware). The tolerance is operator-
configurable; default is 0.005 (0.5pp absolute).

### Trust property

Operator CANNOT change reel strips or paytable after attestation without:
- Producing a different Merkle root → published `parWitnessRoot` no
  longer matches recomputed root → public verification fails
- OR producing a new attestation with a NEW HSM signature → which
  visibly differs from the previously published one → audit trail
  shows the silent swap

This is functionally equivalent to a Bitcoin-style cryptographic timelock
on the math: post-cert math change is publicly detectable.

## Phase 1 acceptance (Wave 40)

`reports/acceptance/PAR_COMMITMENT.{json,md}` — 180/180 gates PASS.

| Gate | Property | Pass |
|------|----------|------|
| g1 | Attestation builds without error | 30/30 |
| g2 | Integrity check (canonicalHash matches recomputed) | 30/30 |
| g3 | Auditor PASS on identical IR + matching RTP | 30/30 |
| g4 | Auditor FAIL on tampered IR (root mismatch) | 30/30 |
| g5 | Auditor FAIL on RTP drift > 0.5pp tolerance | 30/30 |
| g6 | HSM signing produces non-empty signature (Mock adapter) | 30/30 |

## Phase 2 (future, documented placeholder)

Full Groth16 zero-knowledge proof:

```
public_inputs  = (parWitnessRoot, publishedRtp_quantized)
private_witness = (reel_strips, weights, paytable)
constraint     = Merkle(witness) == parWitnessRoot
              AND EnumerateRtp(witness) == publishedRtp_quantized ± ε
```

Verifier checks the SNARK proof; obtains cryptographic guarantee that
the operator's published RTP actually follows from a witness whose
Merkle root matches the committed root — without ever seeing the
witness itself.

### Effort estimate for Phase 2

- Lines/Ways evaluator → arithmetic circuit: 4-6 weeks (closed-form
  RTP is sum-of-products, encodable directly)
- Cluster + cascade: 6-8 weeks (Markov chain encoding research)
- Groth16 trusted setup ceremony: 2-4 weeks (operator coordination)
- Total: 12-18 weeks for production-grade Phase 2 across all 6 evaluator types

Phase 1 (Wave 40) gives operators 90% of the trust benefit
(commitment + auditor verification + tamper detection) without the
research overhead.

## References

- Groth, J. (2016) — *On the Size of Pairing-Based Non-Interactive
  Arguments*. EUROCRYPT. https://eprint.iacr.org/2016/260
- Gabizon, A., Williamson, Z., Ciobotaru, O. (2019) — *PLONK*.
  https://eprint.iacr.org/2019/953
- EP4046329 — *Provably Fair Games Using Blockchain* (2023)
- Merkle, R. (1987) — *A Digital Signature Based on a Conventional
  Encryption Function*. CRYPTO.
- UKGC Testing Strategy for Compliance (2018, updated 2025) — outcome-
  based testing premise.
