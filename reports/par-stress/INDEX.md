# PAR Distribution Stress — INDEX

> Generated: 2026-05-13T10:19:28.210Z
> Seeds per fixture: 50  · Spins per seed: 20000
> Pass threshold: CoV(RTP) ≤ 2.50%

| Fixture | Family | RTP mean | RTP std | CoV | p05 | p95 | Pass | Runtime |
|---|---|---:|---:|---:|---:|---:|:---:|---:|
| `classic-3x3-lines` | Lines | 55.422% | 0.721% | 1.301% | 54.409% | 56.484% | ✅ | 4123ms |
| `3x5-5lines` | Lines | 98.299% | 1.221% | 1.242% | 96.311% | 100.370% | ✅ | 6041ms |

## Determinism note
Seeds list is committed verbatim in `scripts/par-distribution-stress.mjs` (prime-stride spread for the first 50, deterministic LCG extension beyond). Rerunning against the same engine commit produces byte-identical `<fixture>.distribution.json` files.
