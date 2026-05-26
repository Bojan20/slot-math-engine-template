# 📦 Slot Math Engine — Bundle Manifest

End-to-end Python toolkit bundle for slot game math engineering. Goes
from a vendor PAR sheet to a regulator-ready signed cert ZIP in a
single command, with closed-form solvers for design exploration and
evolutionary optimization for RTP target fit.

## Install

```bash
# from repo root
pip install -e .

# with optional SMT solver (Z3)
pip install -e .[smt]

# with optional PDF extractor (PyMuPDF)
pip install -e .[gdd]

# everything
pip install -e .[all]
```

After install, the following console scripts are available system-wide:

## Console scripts (installed by `pip install`)

| Command | Purpose | Source module |
|---|---|---|
| `slot-parse`         | Universal PAR sheet parser (vendor profile YAML) | `tools.parse_par.__main__` |
| `slot-build`         | Full pipeline: PAR → IR → TS codegen → Studio → cert ZIP | `tools.slot_build.__main__` |
| `slot-build-verify`  | Auto MC verify CI gate (3-tier matrix) | `tools.slot_build.verify` |
| `slot-build-cert`    | Standalone cert bundle builder (signed ZIP + verify.sh) | `tools.slot_build.cert_package` |
| `slot-fs-audit`      | Per-FS-set RTP attribution diagnostic | `tools.diagnostics.fs_rtp_audit` |
| `slot-ir-fuzz`       | Math invariant continuous fuzzer | `tools.diagnostics.ir_invariant_fuzzer` |
| `slot-evolve`        | μ+λ ES genetic IR solver (RTP target fit) | `tools.evolution.genetic_solver` |
| `slot-pareto`        | NSGA-II multi-objective Pareto solver | `tools.evolution.pareto_solver` |
| `slot-batch`         | Parallel 1000-variant Pareto batch runner | `tools.evolution.batch_runner` |
| `slot-player-sim`    | Player-behavior session cohort simulator | `tools.player_sim.session_simulator` |

## Closed-form solver kernels (importable)

```python
from tools.solvers import (
    StackedWildRandomReelParams, stacked_wild_rtp, stacked_wild_mc,
    SymbolUpgradeParams,         symbol_upgrade_rtp, symbol_upgrade_mc,
    MysteryRevealParams,         mystery_reveal_rtp, mystery_reveal_mc,
    ClusterPaysParams,           cluster_pays_rtp, cluster_pays_mc,
    BonusWheelParams, WheelSegment, bonus_wheel_rtp, bonus_wheel_mc,
)

# Example: stacked-wild RTP estimate in microseconds
params = StackedWildRandomReelParams(
    p_trigger=0.05, n_reels=5, n_lines=20,
    symbol_probs={"Red7": 0.05, "Blue7": 0.06, "Cherry": 0.15},
    symbol_pays_5oak={"Red7": 200, "Blue7": 100, "Cherry": 20},
    wild_prob=0.02,
)
print(f"RTP contribution: {stacked_wild_rtp(params):.5f}")
```

## End-to-end PAR → cert ZIP

```bash
# Parse a vendor PAR sheet, generate IRs, code-gen Studio + TS engine,
# build a signed cert bundle, and verify integrity — one command:
slot-build games/<vendor>/raw \
    --sheet PAR-001 \
    --codegen-ts /tmp/ts \
    --codegen-studio /tmp/studio \
    --cert-package /tmp/cert

# Verify the emitted cert bundle:
unzip -d /tmp/unpack /tmp/cert/*.cert.zip
bash /tmp/unpack/verify.sh
# → exit 0 on intact, exit 1 on any tamper
```

## Crypto-verifiable PAR provenance

```python
from tools.provenance import build_provenance, verify_proof
from tools.provenance.merkle_tree import build_merkle_tree

# Hash + sign PAR rows; emit per-row inclusion proofs
artifact, tree = build_provenance(
    par_rows=[{"combo": ["Red7"] * 5, "pays": 200}, ...],
    meta={"vendor": "X", "swid": "SWID-001"},
)

# Anyone with the public key + signed root can verify ANY single row
# offline without re-running the full MC:
proof = tree.proof_for(0)
assert verify_proof(par_rows[0], proof, artifact)
```

## Phase coverage

| Phase | Status | Highlights |
|---|---|---|
| Phase 1 (Math Foundation) | 🟢 90% | P1.1-P1.5 ✅, P1.6 80/100, P1.8 fuzzer ✅ |
| Phase 2 (Vendor Parity)   | 🟡 30% | Vendor A 0.03% + Vendor B 0.26% parity |
| Phase 3 (Auto-Build)      | ✅ COMPLETE | W5.1-W5.7 sve sub-waves landed |
| Phase 4 (GDD Ingestion)   | ✅ DONE   | W6.1-W6.5 (`slot-build-gdd <pdf>`) |
| Phase 5 (Studio UI)       | 🟡 40%   | scaffold ✅, A/B + IR editor ⏳ |
| Phase 6 (Self-Evolution)  | ✅ COMPLETE | W7.1-W7.6 + W7.4-batch all landed |
| Phase 7 (Commercialization) | 🔴 0%  | marketplace + GaaS API ⏳ |

## Test surface

```bash
# All Python tests
python -m unittest discover -s tools/tests

# Specific kernel
python -m unittest tools.tests.test_p1_6_solver_kernels -v

# Per-tool smoke
slot-ir-fuzz games/<vendor>/out/<ir.json> --runs 9 --spins 20000
slot-fs-audit games/<vendor>/out/<lw>.<swid>.slot-sim.ir.json
slot-evolve <ir.json> --target-rtp 0.95 --population 10 --generations 20
```

## Industry-first features (4 documented in Kimi research)

| Wave | Description |
|---|---|
| W7.1 | μ+λ ES genetic IR solver (no commercial competitor publishes this) |
| W7.4 | NSGA-II Pareto multi-objective slot-math optimizer |
| W7.5 | Merkle-tree + ed25519 PAR cell provenance (regulator-verifiable) |
| W7.6 | Player-behavior cohort sim (Fixed/Martingale/Anti-Martingale/StopLoss/WinChase) |

## Mission acceptance

5 of 10 criteria DONE: #1 PAR→cert, #2 GDD→Studio, #7 10⁹ spins/60s, #9 GLI-16 cert, #10 1000-variant Pareto.

## License

Proprietary. Vendor identifiers redacted per W-SANITIZE policy. Raw PAR
sheets and derived artifacts under `games/*/raw|out|reports/` are
NEVER tracked in git.
