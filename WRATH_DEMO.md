# Wrath of Olympus — First Real-World Pipeline Demo

> Proof that `slot-math-engine-template` can ingest a **production-locked game**
> from a downstream studio repo and emit a complete deployment artefakt
> end-to-end.

## What this proves

Until now slot-math had:
- 55/55 atomic features ✅
- 207/207 acceptance tests ✅
- Synthetic-IR e2e gates ✅

What was **missing** was a real-world demonstration. This demo closes that gap:

| Step | Input | Output | Status |
|---|---|---|---|
| 1 | Wrath of Olympus v12.0.0 lock manifest (downstream repo) | `reports/par-library/wrath-of-olympus/v12.0.0/{game.ir.json, closed-form-rtp.json, source-lock-state.json}` | ✅ imported |
| 2 | 3 math agents (statistical + invariants + edge-cases) | A:WARN · B:PASS · C:PAR_v3_RECOMMENDED | ✅ archived in Wrath repo |
| 3 | `attestation_chain.build_deploy_attestation()` | Deploy signature `8e7b7581…` chained par→ir→mc→bundle→deploy | ✅ |
| 4 | `assemble_variant(par, ir, mc, out_root)` | `build/games/wrath-of-olympus/v12.1.0/{web, server, attestation, README, manifest}` | ✅ |
| 5 | `verify_artefact_integrity(variant_dir)` | hash drift = 0 | ✅ PASS |
| 6 | `emit_compare_report(game, [4 variants])` | `reports/dossier/variant-compare-wrath-of-olympus.html` | ✅ |

## Artefakt root

```
build/games/wrath-of-olympus/v12.1.0/
├── README.md                         ← regulator paper trail
├── build.manifest.json               ← machine-readable summary
├── attestation/
│   ├── par.merkle                    ← 9a000a38… (Wrath lock root)
│   ├── ir.merkle
│   ├── mc_sweep.merkle               ← 7e443c54… (Wrath 10B MC)
│   ├── bundle.merkle
│   ├── deploy.signature.sha256       ← 3b4ff8f5…
│   └── chain.json                    ← full attestation tree
├── server/                           ← Fastify RGS (Dockerfile + OpenAPI)
│   ├── server.js, package.json, Dockerfile, api.openapi.json
└── web/                              ← Pixi.js scaffolded playable
    ├── index.html, bundle.js, game.ir.json, assets/
```

## Hashes

| Artefakt | SHA-256 |
|---|---|
| Wrath lock root (v12.0.0) | `9a000a38911a4995da617b01d9e6ff8a4349d671d3ccb84443b7df012901a15b` |
| Web bundle | `e8f71d9ec92a1e14…` |
| RGS bundle | `fa1af488725952998…` |
| Deploy root (bundle merkle) | `c7040d434e64047af…` |
| Deploy signature | `3b4ff8f5c3985aae51d92cf0a071ed29d5c9b281a18692da9d8b3166f90c250c` |
| Jurisdiction (this build) | MGA |

## What's NOT in this demo (transparent gap disclosure)

- The web bundle is the **scaffolded shell**, not production Pixi skin —
  Wrath's own production sprites + animations live in the Wrath repo's
  `dist/` directory, separate from this engine.
- The "MC sweep" used for deploy attestation reuses Wrath's **own** 10B
  re-verification (12.99M spins/sec via Wrath's existing Rust simulator);
  slot-math's `mc_convergence.rs` binary is a synthetic Bernoulli+lognormal
  scaffold and would FAIL a Wrath-specific RTP gate (proof-of-plumbing,
  not real game evaluation). The real W244 kernel DAG dispatcher is the
  next gap to close before slot-math can run any game's math standalone.

For the v1.0 product proof, the pipeline successfully **ingests, attests,
deploys, and compares** — math evaluation itself remains delegated to each
game's locked simulator (which is the correct security model anyway: math
is the studio's IP, deploy is the engine's responsibility).

## Reproduce

```bash
# 1. Verify the deploy artefakt
python3 -c "
from tools.par_deploy.assemble import verify_artefact_integrity
from pathlib import Path
ok, viol = verify_artefact_integrity(Path('build/games/wrath-of-olympus/v12.1.0'))
print('PASS' if ok else f'FAIL: {viol}')
"

# 2. Open the variant compare report
open reports/dossier/variant-compare-wrath-of-olympus.html

# 3. Run the assemble pipeline yourself (idempotent)
python3 scripts/deploy-wrath.py   # (see below for inline script)
```

## See also

- Wrath v12.1.0 repo: `~/Projects/Wrath Of Olympus/` (tag `v12.1.0`)
- Wrath submission bundle: `~/Projects/Wrath Of Olympus/dist/WRATH_OF_OLYMPUS_v12.1.0_MATH_SUBMISSION.zip`
- Wrath PAR v3 (32 tabs xlsx): `~/Projects/Wrath Of Olympus/reports/par/WRATH_OF_OLYMPUS_v12.1.0_PAR_v3.xlsx`
- Wrath one-pager: `~/Projects/Wrath Of Olympus/reports/dossier/wrath-of-olympus-one-pager.html`
