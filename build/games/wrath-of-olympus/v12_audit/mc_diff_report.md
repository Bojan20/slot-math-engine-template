# MC Sweep Diff Report — wrath-of-olympus / wrath-of-olympus.ir.json

**Tier:** T2
**Overall:** 🔴 FAIL
**Failed metrics:** 3
**Cross-seed CV (RTP):** 4.36e-04
**PAR Merkle:** `adcd910fd218564b...`

## Per-metric breakdown

| Metric | Target | Measured | Δ | Tolerance | Pass |
|--------|--------|----------|---|-----------|:----:|
| rtp | 0.960011 | 0.088573 | -8.714382e-01 | 2.000000e-04 | 🔴 |
| hit_freq | 22.267681 | 1.000000 | -2.126768e+01 | 2.073405e-08 | 🔴 |
| variance | 20.340000 | 0.025328 | -2.031467e+01 | 1.017000e+00 | 🔴 |
| max_win_x | 5000.000000 | 49.062413 | -4.950938e+03 | 0.000000e+00 | ✅ |

## 🔴 Suspected root causes

- **rtp** → PAR paytable mapping bug, kernel composition drift, OR float-stable Welford accumulation issue
- **hit_freq** → reel-strip mapping bug, or wild substitution wiring mismatch
- **variance** → feature pay distribution mismapped, or max-win cap not enforced

---

**Action:** halt pipeline, do not deploy. Fix the implicated layer,
re-run MC sweep at the same tier with the same seed set, verify all
metrics pass before proceeding.
