# Software Bill of Materials (SBOM)

W214 Faza 600.3 — explanation of the SBOM standard we ship + regen
cadence + distribution policy.

## Why CycloneDX 1.5?

CycloneDX is an OWASP-maintained, regulator-friendly SBOM standard.
We emit `specVersion: "1.5"` which is what GLI/BMM/iTechLabs accept
as part of the cert dossier paper trail. It is also what L&W's own
security team uses internally.

## What our SBOM contains

`scripts/security/sbom-generate.mjs` walks:

- root `package.json` + `package-lock.json`
- 8 sub-package `package.json`s (`web/studio`, `web/operator`,
  `web/regulator`, `web/marketplace`, `web/pitch`, `web/onboarding`,
  `web/support`, `sdk`)
- the Rust workspace `rust-sim/Cargo.toml` (direct deps only — the
  fuzz workspace pulls indirectly)

For each direct dependency we record:

- `name`
- `version` (cleaned of `^` / `~` prefixes)
- `bom-ref` in `pkg:npm/<name>@<version>` or `pkg:cargo/<name>@<version>` form
- SHA-256 of the canonical `<name>@<version>` identifier
- SPDX license (best-effort from `node_modules/<pkg>/package.json`,
  falls back to `UNKNOWN`)
- `properties.manifest` — which root manifest declared it
- `properties.section` — `dependencies` / `devDependencies` / etc.

## Sample component entry

```json
{
  "type": "library",
  "bom-ref": "pkg:npm/fastify@4.28.0",
  "name": "fastify",
  "version": "4.28.0",
  "scope": "required",
  "hashes": [
    { "alg": "SHA-256", "content": "<sha256-of-fastify@4.28.0>" }
  ],
  "licenses": [{ "license": { "id": "MIT" } }],
  "properties": [
    { "name": "manifest", "value": "root" },
    { "name": "section", "value": "dependencies" }
  ]
}
```

## Output files

- `reports/sbom/sbom-current.json` — overwritten on each run.
- `reports/sbom/sbom-current.xml` — minimal XML rendering (regulators
  who can't ingest JSON still get the same payload).
- `reports/sbom/sbom-${commitShort}.json` — pinned snapshot for the
  current `HEAD`.

## Regeneration cadence

| Cadence | Trigger | Owner |
| --- | --- | --- |
| Per-PR | `dependency-review.yml` when `package*.json` changes | CI |
| Daily | `daily-security-audit.yml` (cron) | CI |
| Per-cert | `npm run cert:bundle` includes the latest SBOM | dossier builder |
| Ad-hoc | `npm run security:sbom` | engineer |

The SBOM is content-addressable: identical lockfile state yields a
byte-identical SBOM (modulo `metadata.timestamp` and the random
`serialNumber`).

## Distribution policy

- Public: yes, the SBOM is included in `operator-package.zip`.
- Regulators: GLI/BMM/iTechLabs receive the JSON + XML during cert
  submission.
- L&W security team: receives the SBOM with every release.
- We do NOT redact license info — a transparent SBOM is the entire
  point of shipping one.

## How to validate

Any CycloneDX-aware tool accepts the JSON. The standard validation
command (if `cyclonedx-cli` is installed):

```
cyclonedx validate --input-file reports/sbom/sbom-current.json \
  --input-format json --input-version v1_5
```

Our SBOM was validated against the official CycloneDX 1.5 schema as
part of the W214 acceptance criteria.

## Adding a new package root

Edit `scripts/security/sbom-generate.mjs#PACKAGE_ROOTS`. Add a row
with a stable `id` and absolute `dir`. The next SBOM regeneration
picks the new manifest up automatically.
