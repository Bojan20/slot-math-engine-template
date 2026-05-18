# Cert Pipeline

End-to-end certification flow from IR draft to regulator-signed PDF.

## ASCII overview

```
designer / Studio
       |
       v
   IR draft  ---->  closed-form solver  ---->  rtp + hit-freq + variance
       |                                              |
       v                                              v
   MC validator (50M spins)                     PAR sheet (USIF v1)
       |                                              |
       +----------------------+-----------------------+
                              |
                              v
                  operator-package.zip
                  | * IR canonical
                  | * paytable
                  | * PAR-USIF
                  | * audit hash-chain
                  | * jurisdiction emit
                  | * ed25519 signature
                              |
                              v
                  POST /api/cert/submit
                              |
                              v
                       cert lab queue
                              |
                              v
                  signed cert PDF
                              |
                              v
                  regulator portal
```

## Step 1 - Author the IR

Use the Studio mini-app or the SDK `IRBuilder`. The IR must include `gameId`, `topology`, `symbols`. See **IR Schema**.

## Step 2 - Closed-form acceptance

```bash
npm run closed-form-portfolio
```

Computes RTP for every IR in the portfolio and gates against the target +/- 0.5%. Fails the wave if any entry drifts.

## Step 3 - Monte-Carlo validation

Each mechanic has a dedicated acceptance script under `scripts/*-acceptance.mjs`. Example for the W196 stacked-wheel kernel:

```bash
npm run stacked-multi-wheel-composition-acceptance
```

The script runs 6 industry configs x 20-50K MC spins each and writes `reports/acceptance/<mechanic>/operator-package.zip`.

## Step 4 - PAR sheet (USIF v1)

The PAR sheet is generated alongside the acceptance dossier:

```bash
npm run par-sample-kit
```

Output lives under `out/par-samples/<gameId>/PAR-USIF.json`. The schema is documented in `docs/USIF_PAR_SCHEMA_v1.md`.

## Step 5 - Jurisdiction overlay

```bash
npm run jurisdiction-auto-gate
```

For every jurisdiction in the IR's `jurisdictions` array the gate verifies:

- Loss-limit + reality-check timing for UKGC / MGA
- Autoplay rejection for UKGC
- Max-bet caps for NV / NJ
- Reality-check intervals
- Self-exclusion handling

## Step 6 - Operator package

```bash
npm run operator-package
```

Zips the canonical IR + paytable + PAR + audit chain + jurisdiction emit + ed25519 signature.

## Step 7 - Submit to cert lab

```bash
npm run cert:submit -- --package ./operator-package.zip
```

Returns a tracking id. Poll with:

```bash
npm run cert:verify -- --tracking-id <id>
```

When the cert lab returns a signed PDF the producer pins the wave commit hash in `SLOT_ENGINE_MASTER_TODO.md` and the dossier ships to the regulator.

## Step 8 - Regulator handoff

The signed cert PDF + the operator package are uploaded to the regulator portal (`web/regulator/`). The regulator replays the audit chain offline using `npm run billion-spins-replay` against the bundled hash-chain.

## Daily cert-replay cron

Production deploys run `npm run cert:daily` once per day. It picks the previous day's spins out of the audit store, replays them against the closed-form kernel, and writes a timestamped dossier under `reports/acceptance/cert-daily/`. Any mismatch pages the on-call engineer.
