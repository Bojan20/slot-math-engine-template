# PAR library

Local storage za sve uploadovane PAR sheets, normalizovane u canonical
format (`slot-math-canonical-par/v1`).

## Directory layout

```
reports/par-library/
├── README.md                         (ovaj fajl)
├── .gitignore                        (excludes proprietary vendor data)
├── _template/                        (example layout, in git)
│   ├── canonical.par.yaml            (canonical PAR, gitignored u live variants)
│   ├── audit.lossless.json           (round-trip byte-diff evidence)
│   ├── merkle.sha256                 (per-variant Merkle pin)
│   └── source.original.{xlsx,pdf,...}  (vendor original, GITIGNORED — proprietary)
└── <game-name>/
    └── <variant-id>/
        ├── canonical.par.yaml        ← only this is in git (sa scrubbed SWID)
        ├── audit.lossless.json       ← committed (audit evidence)
        ├── merkle.sha256             ← committed (Merkle pin)
        └── source.original.*         ← .gitignore (proprietary vendor format)
```

## Naming convention

```
<game-name>/<variant-id>/
```

- `<game-name>`: lowercase, kebab-case (e.g. `crimson-tiger`,
  `lucky-phoenix`)
- `<variant-id>`: lowercase alphanumeric + dash (e.g. `a`, `b`, `92pct`,
  `med-vol`)

Examples:
- `reports/par-library/crimson-tiger/variant-a/`
- `reports/par-library/crimson-tiger/variant-b/`
- `reports/par-library/lucky-phoenix/92pct/`

## What goes in git (and what doesn't)

| File | In git? | Why |
|---|---|---|
| `canonical.par.yaml` | ✅ (sa scrubbed SWID) | Engine internal source of truth |
| `audit.lossless.json` | ✅ | Auditable round-trip evidence |
| `merkle.sha256` | ✅ | Cryptographic attestation pin |
| `source.original.xlsx` | ❌ gitignored | Vendor proprietary, never published |
| `source.original.pdf` | ❌ gitignored | Same |
| `source.original.json` | ❌ gitignored | Same |
| `*.swid.txt` / `*.identifier.txt` | ❌ gitignored | SWID/proprietary identifier |

## How variants are created

```bash
# Add a new variant
slot-math par add path/to/crimson-tiger-variant-a.xlsx \
    --game crimson-tiger --variant a

# List all variants
slot-math par list

# Inspect one variant
slot-math par info crimson-tiger/a

# Remove (only from library — built games unaffected)
slot-math par remove crimson-tiger/a
```

(CLI implemented u Faza 1.7, currently planning.)

## Read-only after import

PAR variants are **read-only after import**. If designer sends an updated
PAR, treat as new variant (`variant-a-v2`, not in-place edit). Reason:
already-built games are Merkle-pinned to original variant SHA; mutating
breaks attestation chain.

## See also

- [`docs/PAR_TO_PLAYABLE_GAME_ARCHITECTURE.md`](../../docs/PAR_TO_PLAYABLE_GAME_ARCHITECTURE.md)
  — full architecture
- [`reports/schemas/canonical_par.schema.json`](../schemas/canonical_par.schema.json)
  — schema spec
- [`SLOT_ENGINE_MASTER_TODO.md`](../../SLOT_ENGINE_MASTER_TODO.md)
  — Faza 1 sub-task list
