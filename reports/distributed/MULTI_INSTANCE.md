# Multi-Instance Distributed Determinism Report

> **W152 Wave 22 — Faza 13.6 acceptance proof.** Generated 2026-05-15T09:55:58.509Z.

**Headline:** ✅ PASS — 4/4 fixtures show bit-identical RTP + signature across 4 independent Node child processes.

## Per-fixture results

| Fixture | Instances | Unique signatures | Determinism |
|---|---:|---:|:---:|
| `3x5-5lines.json` | 4 | 1 | ✅ |
| `5x3-20lines.json` | 4 | 1 | ✅ |
| `5x3-243ways.json` | 4 | 1 | ✅ |
| `cascade-drop.json` | 4 | 1 | ✅ |

## Methodology

- **Instances per fixture**: 4 independent Node child processes (`spawnSync`).
- **Spins per instance**: 5000, seed=12345 (identical across all instances).
- **Pass criterion**: every instance returns bit-identical RTP + bit-identical SHA-256 signature.
- **Why this matters**: distributed sim (Faza 9.8 + 13.6) requires that scaling out across machines never diverges. If one instance produces a different RTP for the same (fixture, seed), the scaling guarantee is broken.
- **Determinism source**: PCG-64 / ChaCha20 RNG backends are bit-exact across platforms; IR-native dispatch is pure.
