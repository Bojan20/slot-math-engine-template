# PAR PDF samples — P0 #6 deliverable

> Status: **first generated sample committed**. Renderer at
> `src/report/parPdf.ts`. CLI: `slot-sim par-pdf <report.json>`.

## Files

| File                              | Source            | Pages | Notes                              |
|-----------------------------------|-------------------|-------|------------------------------------|
| `sample-par-sheet.pdf`            | synthetic JSON    | 3     | All 8 GLI-shaped sections rendered |

## How to generate

### From a SimReport.json

```bash
# Renderer entry point (after `npm run build`)
node dist/cli/cli.js par-pdf path/to/SimReport.json --out path/to/PAR.pdf
```

### Programmatically

```typescript
import { renderParSheetToFile, renderParSheetPdf } from 'src/report/parPdf.js';

// To a file
await renderParSheetToFile(report, 'out/PAR.pdf');

// To a Buffer (for piping into S3, HTTP response, etc.)
const buf = await renderParSheetPdf(report);
```

## Section coverage (GLI-16 Appendix D + adjacent)

1. **Meta** — game / version / math version / layout / pay system / target RTP / max win / config hash / generation timestamp
2. **RTP summary** — observed RTP, error margin, 95% CI bounds, spins, seed, **per-source breakdown** (base / scatter / FS / H&W / cascade / ...)
3. **Hit frequency & volatility** — hit rate, dead-spin rate, avg win on hit, variance, std-dev, volatility index, classification, dead-streak stats
4. **Win distribution quantiles** — P50 / P90 / P99 / P99.9, tail buckets (≥100×, ≥500×, ≥1000×, ≥5000×), max observed win + spin index
5. **Feature contribution** — per-feature trigger rate, frequency, avg win, RTP contribution
6. **Win histogram** — bucketed counts, percentages, RTP contribution per bucket
7. **Paytable excerpt** — line-win paytable, scatter pays, H&W orb values + expected orb value
8. **Notes & compliance** — submitter, jurisdiction, standard, cycle size, free-form notes

Each section degrades gracefully — if the source JSON lacks a field, the
PDF renders `—` instead of throwing.

## Input contract

The renderer accepts the canonical TS `SimReport` shape, but is
**structurally typed** — any external dialect that matches the
`ParRenderInput` interface (see `src/report/parPdf.ts`) renders too.
This means a 3rd-party PAR JSON produced by a `reel_strips` / `weighted_pairs`
dialect converter can be rendered without manual translation.

## Compliance defaults

- A4 page size, 50 pt margins
- Compress disabled → output PDF is text-searchable for audit / regression
- Page footer = configurable disclaimer + page numbers (`Page N / M`)
- PDF Info dictionary populated with Title / Author / Subject / CreationDate

## What's NOT in v1 (next iteration)

- ❌ Embedded base-game reel strip distribution charts (text histogram only)
- ❌ Signature line for math designer / submitter
- ❌ Multi-language support (English only)
- ❌ Watermark for "draft" vs "submission" modes
- ❌ GLI-19 §8 jurisdictional comparison table (UK/MGA/ADM overlay)
