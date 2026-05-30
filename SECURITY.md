# Security Policy

## Supported Versions

The `main` branch of `slot-math-engine-template` is the supported
version. Historical tags are not patched.

| Version | Supported |
|---------|-----------|
| main    | ✅        |
| 1.0.x   | ✅ (slot-math-kernels PyPI) |
| < 1.0   | ❌        |

## Reporting a Vulnerability

If you find a security vulnerability — including but not limited to:

- RNG bias / non-uniformity in `rust-sim/src/rng.rs`
- Determinism break (a build producing different Merkle for same input)
- Sandbox escape in the IR evaluator
- Cryptographic weakness in Provably Fair Crash
- Acceptance JSON forgery that bypasses Merkle verification
- Schema validation bypass in `reports/schemas/`

**Do not open a public GitHub issue.**

Instead, email **bojan.petkovic25@gmail.com** with subject prefix
`[SECURITY]`. Include:

1. Affected component (file path or kernel name)
2. Repro steps
3. Suggested mitigation if known
4. Whether you want public credit when the fix lands

You should receive an acknowledgment within **7 days**. A fix or
remediation plan will follow within **30 days** for confirmed issues.

## Cryptographic Attestation

The project's primary cryptographic invariant is Merkle-root
determinism. If you can demonstrate that two clean rebuilds produce
different `master_merkle_root_sha256` for the same source tree, that
is a high-severity security issue — please report immediately.

## What's NOT In Scope

- Performance regressions (benchmark drift is a CI signal, not security)
- Mutation testing coverage gaps (Stryker score < 100 %)
- Cosmetic HTML rendering issues
- Issues in third-party libraries (`numpy`, `pyodide`, etc) — report
  to the upstream project
