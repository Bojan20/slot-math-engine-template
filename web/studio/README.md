# slot-math-studio

Production studio app — wires the v5 onyx/cyan UI to the real
TypeScript engine from `src/` (rtpEstimator + Zod-backed IR validator).

All 6 tabs (Build · Compose · Catalog · Play · Sensitivity · Certify)
are LIVE wired and exercised by 128 vitest specs plus the W200
Playwright e2e suite.

## Quick start

```bash
# From repo root
npm run studio:dev          # → http://localhost:5173 (Vite)
npm run studio:build        # → ../../dist/studio/
npm run studio:test         # vitest run · studio-local specs
npm run studio:typecheck    # tsc --noEmit
npm run studio:e2e          # Playwright (4 scenarios)
npm run studio:demo         # 3-minute walking-skeleton demo
```

Or directly inside `web/studio/`:

```bash
cd web/studio
npm install
npm run dev
```

## 6-tab overview

| # | Tab          | Purpose                                                         | Wave |
|---|--------------|-----------------------------------------------------------------|------|
| 1 | Build        | Symbol pool · reels · paytable · live closed-form RTP           | W197 |
| 2 | Compose      | Drag features from palette → feature graph → stacked RTP bars   | W199 |
| 3 | Catalog      | 97 P-IDs · 16 L&W M-gaps · filter by tier/complexity/jurisdiction | W199 |
| 4 | Play         | Pixi WebGL spin renderer · seed override · autoplay · replay    | W198 |
| 5 | Sensitivity  | 1000-point param sweep · 1D/2D heatmap · A/B compare · CSV       | W199 |
| 6 | Certify      | Real MC (5 RNG backends) · 15 jurisdictions · 12-section PAR · operator-package.zip | W199 |

## Persona switcher

The header offers three personas that retune the default tab + the
right-rail inspector:

| Persona  | Default tab    | Headline metric         | Rail emphasis            |
|----------|---------------|-------------------------|--------------------------|
| Math     | Sensitivity   | RTP / Hit / σ / P99     | Statistical moments      |
| Design   | Play          | Win-feel pill           | Animation timeline · theme picker |
| Producer | Certify       | Days-to-cert · $ saved  | KPI strip · pipeline · risk register |

Switch by clicking `Math / Design / Producer` in the header. State
persists across sessions via `localStorage` (`studio-state-v1`).

## Keyboard shortcuts

| Keys      | Action                                |
|-----------|---------------------------------------|
| ⌘K        | Command palette                       |
| ?         | Open keyboard-shortcuts help          |
| Space     | Spin (when Play tab active)           |
| B         | Auto-balance reels (Build tab)        |
| R         | Run MC (Certify tab)                  |
| 1 … 6     | Jump to tab N                         |
| ⌘S        | Manual save · `studio-state-v1` flush |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ index.html · 6 tab panels + modals + toasts         │
└──────────────────────────────────────────────────────┘
            ↓                                ↓
┌─────────────────────────┐    ┌─────────────────────────┐
│ app.js (legacy v5 UI)   │←──→│ src/main.ts (TS bridge) │
│ · workspaces · variants │    │ · window.__studio__     │
│ · DOM rendering         │    │ · debounced RTP         │
│ · toasts · modals       │    │ · persistence           │
└─────────────────────────┘    └─────────────────────────┘
                                            ↓
        ┌───────────────────────────────────┴─────────┐
        ↓                  ↓             ↓            ↓
┌──────────────┐   ┌─────────────┐ ┌─────────┐ ┌─────────────┐
│ engine.ts    │   │ gdd-parser  │ │ playTab │ │ certify.ts  │
│ buildIR /    │   │ pdf/csv/xls │ │ Pixi    │ │ MC + 15 jur │
│ validateIR / │   │ → IR        │ │ render  │ │ + 12-sec PAR│
│ rtp est      │   │             │ │         │ │ + op-pkg    │
└──────────────┘   └─────────────┘ └─────────┘ └─────────────┘
        ↓
┌────────────────────────────────────────────────────────┐
│ @engine alias → ../../src/ (REAL slot-math-engine)     │
│ · ir/types.ts · ir/index.ts (Zod + crossValidate)      │
│ · utils/rtpEstimator.ts (estimateFullRtp + sigma)      │
└────────────────────────────────────────────────────────┘
```

### Hook contract

`app.js` installs at script load:

```js
window.__studio_ui_hook__ = {
  getWorkspaces, getWsOrder, getActiveWorkspaceId,
  getActiveVariant, applyState, onRTPUpdate, logActivity
};
```

`src/main.ts` installs:

```ts
window.__studio__ = {
  computeRTP, buildIR, validateCurrentIR,
  exportIR, importIR, saveNow, roundTripCheck,
  scheduleRTPRecompute, parseGDD, generateFromGDD
};
window.__studio_polish__   // W200 polish API (spinners, toasts, empty states)
window.__studio_play__     // PLAY tab Pixi bridge
window.__studio_compose__  // COMPOSE feature-graph bridge
window.__studio_sensitivity__ // SENSITIVITY sweep bridge
window.__studio_certify__  // CERTIFY MC + PAR + op-pkg bridge
```

### Real engine imports (via `@engine` alias)

- `@engine/ir/types.ts` — `SlotGameIR`, `Symbol`, `SymbolKind`
- `@engine/ir/index.ts` — `parseGameIR` (Zod + crossValidate)
- `@engine/utils/rtpEstimator.ts` — `estimateFullRtp`, `estimateVolatilityIndex`

Nothing in `src/` is modified — the studio is a strict consumer.

### Persistence

localStorage key: `studio-state-v1`. Saved every 30 s, on tab hide,
and on manual `__studio__.saveNow()`. Schema version pinned to 1;
mismatched restores are dropped silently.

### IR import/export

- **Export**: `Blob([JSON.stringify(ir, null, 2)])` → `<workspace>-<variant>.ir.json`
- **Import**: file picker → `JSON.parse` → `validateIRBlob` (real Zod).
- **GDD import**: drop `.pdf` / `.docx` / `.xlsx` / `.csv` / `.md` / `.json` /
  `.txt` onto the BUILD tab → confidence-scored extraction → review modal →
  Generate Game produces a valid IR.

## Tests

```bash
# Unit + integration (vitest · 128 specs)
npm run studio:test

# E2E (Playwright · 4 scenarios)
npm run studio:e2e           # headless chromium
npm run studio:e2e:headed    # with browser window (debug)

# Walking-skeleton demo (~3 min, end-to-end)
npm run studio:demo
```

E2E scenarios (`web/studio/e2e/`):

1. `math-user.spec.ts` — Math persona · Sensitivity sweep · CSV export
2. `design-user.spec.ts` — Design persona · PLAY spin · autoplay
3. `producer-user.spec.ts` — Producer persona · MC 100K · jurisdictions · op-pkg
4. `gdd-import.spec.ts` — BUILD · drop sample GDD · review · Generate

Playwright config: `playwright.config.ts` (root). Auto-starts the Vite
dev server, viewport 1440×900, screenshots on failure, reports written
to `reports/playwright/`.

## Known limitations

- **Mobile / tablet** — UI requires ≥ 1024 px width. Below that a guard
  banner is shown ("Best viewed at 1280×800+"). Touch and small-screen
  support are roadmapped for W210+.
- **PDF files > 10 MB** — chunked parsing is not yet implemented; the
  GDD importer rejects them with a clear toast.
- **WebGL fallback** — when WebGL is unavailable the Pixi renderer is
  skipped and the engine runs headlessly (a yellow notice appears in
  the PLAY tab).
- **IR → studio round-trip** — IR import is currently validate-only;
  the studio state model is intentionally lossy (tier counts, not full
  reel strips). The round-trip preserves correctness at the IR level.
- **1B MC** is gated to the CLI (`npm run sub-ms-mc-bench`); the
  in-browser worker tops out at 100M for memory safety.
