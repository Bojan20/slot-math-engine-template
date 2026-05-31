# `_template/` — reference layout for one PAR variant

This dir shows the structure each `<game>/<variant>/` folder should
have. Adapters (`tools/par_normalize/`) emit identical layout for live
variants.

## Files

| File | Source | Description |
|---|---|---|
| `canonical.par.yaml` | adapter output | The canonical PAR (this is what engine reads) |
| `audit.lossless.json` | adapter output | Round-trip evidence (re-export → byte-diff = 0) |
| `merkle.sha256` | adapter output | SHA-256 over `canonical.par.yaml` (Merkle pin) |
| `source.original.<ext>` | vendor upload | Original vendor file (XLSX/PDF/JSON/CSV) — **gitignored** |

This `_template/` itself is in git as documentation. Live variants are
named per game/variant, e.g. `reports/par-library/crimson-tiger/a/`.
