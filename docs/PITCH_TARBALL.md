# Pitch Tarball Bundler (W212 Faza 800.0)

Single-command export of every Vendor B pilot pitch + proof artifact into one
distributable, offline-safe archive.

## What's inside the tarball

```
pitch-package/
├── README.md                      ← auto-generated, per-role reading order
├── MANIFEST.json                  ← SHA-256 of every file, optional Ed25519 sig
├── INSTALL.md                     ← reproducer steps (pilot:seed + pilot:integration + pilot:dossier)
├── CONTACT.md                     ← sales / technical placeholder
├── VERSION.txt                    ← engine commit + bundle version + timestamp
├── verify.mjs                     ← embedded verifier (offline, no deps)
│
├── sales/
│   ├── 01-executive-deck.html     ← 12-slide pitch deck (standalone HTML)
│   ├── 02-roi-calculator.html     ← ROI model + reference TS source
│   ├── 03-technical-deep-dive.html
│   ├── 04-competitive-matrix.html
│   ├── 05-pitch-guide.html
│   ├── 06-pilot-dossier.html      ← 12-section evaluation dossier
│   └── storyboards/
│       ├── storyboard-30sec-elevator.md
│       ├── storyboard-5min-deep.md
│       └── storyboard-90min-board.md
│
├── proof/
│   ├── integration-suite-latest.json   ← 10/10 PASS, from pilot:integration
│   ├── smoke-test-latest.json          ← 6/6 OK, from smoke:all
│   ├── closed-form-portfolio.json      ← 77 solvers CF vs MC reconciliation
│   ├── industry-pattern-catalog.json   ← 97 P-IDs
│   ├── lw-coverage-matrix.json         ← 16/16 M-gap closure receipts
│   ├── demo-theater-narrative-cto.md   ← CTO persona day-by-day narrative
│   ├── demo-theater-timeline.json      ← full event log
│   └── cert-dossier-samples/           ← 1 manifest + sig per lab
│       ├── BMM-manifest.json
│       ├── BMM.sig
│       ├── GLI-manifest.json
│       ├── GLI.sig
│       ├── eCOGRA-manifest.json
│       ├── eCOGRA.sig
│       ├── NMi-manifest.json
│       └── NMi.sig
│
└── reference/
    ├── PILOT_GUIDE.md
    ├── PILOT_ARCHITECTURE.md
    ├── DEPLOYMENT.md
    ├── MULTI_TENANT.md
    ├── WALLET_PROVIDERS.md
    ├── MARKETPLACE_API.md
    └── CERT_LAB_SUBMISSION.md
```

## How to generate

```sh
# Full export to dist/pitch/ as tar.gz (default).
npm run pitch:tarball

# Dry-run: show what would be bundled without writing to disk.
npm run pitch:tarball:dry

# Custom output / format / operator / version.
node scripts/pitch/build-pitch-tarball.mjs \
  --output=dist/pitch \
  --format=zip \
  --operator=Vendor C \
  --bundle-version=v20990101
```

Bundle filename: `slot-math-engine-pitch-{bundle-version}-{commit-short}.{tar.gz|tar|zip}`.

Side-car `*.manifest.json` is also written next to the archive for at-a-glance
inspection.

### CLI flags

| Flag | Default | Meaning |
|---|---|---|
| `--output=DIR` | `dist/pitch` | Output directory |
| `--format=tar.gz\|tar\|zip` | `tar.gz` | Archive format |
| `--operator=NAME` | `Vendor B` | Operator name in README + greeting |
| `--bundle-version=vYYYYMMDD` | today UTC | Embedded bundle version |
| `--include-binaries` | off | Reserved for future binary attachments |
| `--sign` | off | Ed25519-sign the manifest with W209/W210 HSM key |
| `--dry-run` | off | Compute everything, skip disk writes |

Env vars also honoured by the README generator:
- `PITCH_OPERATOR_NAME` — overrides `--operator`
- `PITCH_GREETING` — replaces the default "Hello … team" intro line

## How to verify

Recipients (or CI) can verify a tarball's integrity without unpacking anything
permanent:

```sh
npm run pitch:verify -- dist/pitch/slot-math-engine-pitch-v20990101-abc12345.tar.gz
```

Or, from inside an already-unpacked bundle:

```sh
cd /tmp/unpacked-pitch-package
node verify.mjs
```

Exit codes:
- `0` — OK; every file matches the manifest
- `1` — FAIL; at least one tampered, missing, or extra entry
- `2` — CORRUPT; archive unreadable or MANIFEST.json missing

Add `--verbose` for per-file FAIL details, `--json` for machine-readable output.

## Customisation (rebrand for any operator)

By default the README greets "Vendor B"; switch operator names without rebuilding
any source artifact:

```sh
PITCH_OPERATOR_NAME=Vendor C npm run pitch:tarball
PITCH_GREETING="G'day, mate — here's your tarball." \
  PITCH_OPERATOR_NAME=Vendor C npm run pitch:tarball
```

The same applies to the M-gap coverage matrix label (engine documents that
Vendor B M1..M16 are closed; the matrix is informational and survives re-branding
since the underlying mechanic kernels are vendor-agnostic).

### Per-operator manifest mode (W213)

Pass `--operator=<id>` with one of the slugs from
`scripts/pitch/operators/*.json` to apply context-aware brand swap across
every text/markdown/HTML payload in the bundle (README, CONTACT, INSTALL,
deck, dossier, coverage matrix, etc.). Filenames pick up an operator prefix:

```sh
npm run pitch:tarball -- --operator=aristocrat
# → dist/pitch/slot-math-engine-pitch-aristocrat-v20260518-<sha>.tar.gz
```

The MANIFEST.json gains an `operator` block:

```json
"operator": {
  "operatorId": "aristocrat",
  "displayName": "Vendor C",
  "legalName": "Vendor C Technologies, Inc.",
  "tier": "Tier-1",
  "hqLocation": "Sydney, Australia",
  "tickerSymbol": "ALL.AX"
},
"intendedAudience": "Chief Mathematics Officer",
"pricingTier": "Tier-1 Enterprise",
"expiresAt": "2026-08-16T…"
```

Build all 7 default operators in one shot:

```sh
npm run pitch:build-all-operators
# 7 tarballs in <1s on a 2024 MacBook (target: <2 min)
```

See `docs/OPERATOR_BRANDING.md` for the manifest schema and how to add a
new operator.

## Production signing chain (W213)

Beyond the W212 single-key `--sign` flag, the engine ships a three-level
Ed25519 signing tree (root → intermediate → leaf) with an RFC-3161 timestamp
stub. See `docs/PRODUCTION_SIGNING.md` for the full chain-of-custody
walkthrough, recovery procedures, and tamper-detection guarantees.

```sh
npm run pitch:gen-keys                       # one-off chain generation
npm run pitch:verify-prod-sign -- env.json   # end-to-end verify
```

## CDN distribution prep (W213)

`scripts/pitch/cdn-distribute.mjs` simulates upload to a private CDN
(Cloudflare R2 / S3 layout). Outputs per-operator subdirectories and a
single `dist/cdn/index.json` directory file with TTL-signed URLs.

```sh
npm run pitch:cdn-prep -- --src-dir=dist/pitch --out=dist/cdn
```

## Determinism

For a fixed commit, fixed `--bundle-version`, fixed `--operator`, and an
unchanged set of source files, the archive is byte-identical (modulo the
`generatedAt` timestamp embedded in `MANIFEST.json` and `VERSION.txt`). Pass
an explicit `--bundle-version` and clamp the timestamp via the
`buildPitchTarball({ generatedAt })` programmatic API for fully reproducible
builds.

## Signing (optional)

When `--sign` is passed and `server/data/hsm-keys.json` exists (W209/W210
provisioned), the bundler appends an Ed25519 signature to `MANIFEST.json`
covering `sha256(canonical-manifest-bytes-without-signature)`. The same key
material signs cert-lab submissions and marketplace listings — operators
who pin the engine's public key only need it once.

Signature shape:

```json
{
  "algorithm": "ed25519",
  "publicKey": "<hex64>",
  "signature": "<hex128>",
  "signedAt": "2099-01-01T00:00:00.000Z",
  "signer": "slot-math-engine-hsm",
  "message": "sha256(MANIFEST.json bytes without signature field)"
}
```

## Distribution

- **Email attachment** — every HTML in `sales/` opens directly via `file://`
  double-click. No HTTP server, no CDN, no font fetch.
- **Slack / DM** — drop the `.tar.gz` in a DM; recipient runs `tar xzf` then
  `node verify.mjs`.
- **SFTP / S3** — upload the bundle plus the side-car `.manifest.json`;
  recipients can pre-check the manifest before pulling the larger archive.
- **Air-gapped** — bundle contains zero external references; safe to copy
  via USB into a compliance lab's offline review network.

Bundle size in the live repo is ~100 KB compressed (≤5 MB target), generated
in ~40 ms on a 2024 MacBook (≤30 s target).

## Programmatic API

Every script exports its core helpers for reuse:

```js
import { buildPitchTarball } from 'slot-math-engine-template/scripts/pitch/build-pitch-tarball.mjs';
import { verifyTarball } from 'slot-math-engine-template/scripts/pitch/verify-pitch-tarball.mjs';
import { renderReadme } from 'slot-math-engine-template/scripts/pitch/generate-pitch-readme.mjs';
import { composeFromMarkdownFile } from 'slot-math-engine-template/scripts/pitch/compose-standalone-html.mjs';
import { buildManifest } from 'slot-math-engine-template/scripts/pitch/tarball-metadata.mjs';
```

Use the programmatic surface for CI gates ("rebuild + verify on every PR"),
custom operator pipelines, or in tests.

## Tests

- `scripts/tests/pitch-tarball.test.mjs` — 25 specs (parsing, manifest,
  collectors, tar/zip layout, full build)
- `scripts/tests/pitch-tarball-verify.test.mjs` — 13 specs (parsing, verdict
  cases, end-to-end tamper detection)
- `scripts/tests/pitch-readme-gen.test.mjs` — 14 specs (role guides, stats,
  custom operator)
- `scripts/tests/pitch-html-compose.test.mjs` — 14 specs (markdown render,
  offline sanitiser, file IO)

Total new specs: 66 (target was 41+).

## Files added (W212 Agent A)

| File | Lines | Purpose |
|---|---|---|
| `scripts/pitch/build-pitch-tarball.mjs` | ~440 | Main builder |
| `scripts/pitch/verify-pitch-tarball.mjs` | ~220 | Companion verifier |
| `scripts/pitch/generate-pitch-readme.mjs` | ~210 | README + INSTALL + CONTACT + VERSION |
| `scripts/pitch/compose-standalone-html.mjs` | ~260 | Standalone HTML compositor |
| `scripts/pitch/tarball-metadata.mjs` | ~150 | MANIFEST.json helpers |
| `scripts/tests/pitch-tarball.test.mjs` | ~280 | Builder tests |
| `scripts/tests/pitch-tarball-verify.test.mjs` | ~180 | Verifier tests |
| `scripts/tests/pitch-readme-gen.test.mjs` | ~140 | README tests |
| `scripts/tests/pitch-html-compose.test.mjs` | ~150 | HTML compose tests |
| `docs/PITCH_TARBALL.md` | this file | User documentation |
