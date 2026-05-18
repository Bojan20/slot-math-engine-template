# Studio Workflow

The Studio mini-app (`web/studio/`) is the daily driver for three roles: **designer**, **math**, and **producer**. Each role has a dedicated tab and a workflow tuned to that role.

## Designer

The designer scaffolds a game by picking a topology, dropping in symbols, and sketching features. The Studio handles the IR plumbing so the designer never edits JSON by hand.

Steps:

1. Click **New Game** in the Studio top bar
2. Pick a topology: rectangular (5x3), megaways, cluster grid, colossal reels, or multi-grid
3. Drop in symbols from the **Symbol Library** sidebar
4. Add features (free spins, sticky wilds, cascades, hold-and-spin, etc.) via the **Mechanics** tab
5. Save - the IR document is written to `web/studio/ir-library/<gameId>.ir.json`

Tip: the **Diff** view shows the IR delta vs the last save, which makes producer review trivial.

## Math

The math role lives in the **Math** tab. It exposes:

- **Closed-form solver dial** - changes parameters and watches RTP move in real time
- **MC validator** - kicks off a 100k-spin Monte-Carlo run and overlays the histogram on the closed-form prediction
- **PAR sheet preview** - the exact PAR-USIF table that will ship to the regulator
- **Hit-frequency distribution** - shows the cumulative payout curve

The math role's job is to lock the RTP within +/- 0.02 of target before the producer signs off.

## Producer

The producer's tab focuses on shippability:

- **Acceptance dossier** - aggregates closed-form + MC + jurisdiction overlays into a single PDF
- **Operator package** - generates the `operator-package.zip` (PAR + audit chain + IR + jurisdiction emit)
- **Jurisdiction gate** - per-jurisdiction pass/fail (15 jurisdictions)
- **Cert lab submit** - signs the package with the HSM ed25519 key, pushes to the cert lab REST endpoint

Once the cert lab returns a green stamp the producer hits **Pin** which records the wave commit hash + portfolio entry in `SLOT_ENGINE_MASTER_TODO.md`.

## End-to-end roundtrip

```
designer -> IR draft
     |
     v
math -> closed-form RTP + MC validation
     |
     v
producer -> dossier + operator-package -> cert lab -> regulator
```

The whole loop fits inside a 90-minute working session. The longest leg is usually the MC validation, which we cap at 100k spins for the designer feedback loop and bump to 50M for the producer acceptance run.
