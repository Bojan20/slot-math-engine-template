# slot-math-studio

Production studio app — wires the v5 onyx/cyan UI to the real
TypeScript engine from `src/` (rtpEstimator + Zod-backed IR validator).

## Run

```bash
cd web/studio
npm install
npm run dev          # → http://localhost:5173 (Vite)
```

## Build

```bash
npm run build        # → ../../dist/studio/
npm run preview      # serve dist/studio on :5174
```

## Test

```bash
npm test             # vitest run · studio-local specs (tests/*.test.ts)
```

The root project's full vitest suite (5351 specs) is unchanged — run
`npm test` from the repo root.

## Architecture

```
web/studio/
├── index.html            v5 shell · loads app.js + src/main.ts
├── styles.css            v5 styling (untouched)
├── app.js                v5 UI logic · seeded state · workspace/variant
│                         management · DOM rendering · wizards · toasts.
│                         Exposes `window.__studio_ui_hook__` for the TS layer.
├── src/
│   ├── main.ts           Entry · installs `window.__studio__` bridge,
│                         boots Persistence, binds import file picker.
│   ├── engine.ts         Real engine wire — buildIRFromVariant,
│                         computeLiveRTP, validateIRBlob, roundTripIR.
│   ├── persistence.ts    localStorage auto-save (30s + on visibility hide).
│   └── types.ts          Studio-local types (Tier, StudioVariant, …).
├── tests/
│   └── main.test.ts      Engine-bridge specs.
├── data/                 Seed JSON (copied from v5-final-studio).
├── symbols/lib/          40 stroke-only cyan SVG glyphs (copied).
├── vite.config.ts        Vite + `@engine` → `../../src/`.
├── vitest.config.ts      Mirrors the alias for tests.
├── tsconfig.json         Strict TS, ES2022, Bundler resolution.
└── package.json
```

### Hook contract

`app.js` installs (synchronously, at bottom of IIFE):

```js
window.__studio_ui_hook__ = {
  getWorkspaces, getWsOrder, getActiveWorkspaceId,
  getActiveVariant, applyState, onRTPUpdate, logActivity
};
```

`main.ts` installs (on script load):

```ts
window.__studio__ = {
  computeRTP, buildIR, validateCurrentIR,
  exportIR, importIR, saveNow, roundTripCheck, scheduleRTPRecompute
};
```

`app.js`'s `rerenderAll()` calls `window.__studio__.scheduleRTPRecompute()`
on every state-changing edit (debounced 100 ms inside `main.ts`). The
TS bridge mutates `variant.rtp`/`variant.sigma` so the UI's existing
render paths pick up real engine numbers transparently.

### Real engine imports (via `@engine` alias)

- `@engine/ir/types.ts` — `SlotGameIR`, `Symbol`, `SymbolKind`
- `@engine/ir/index.ts` — `parseGameIR` (Zod + crossValidate)
- `@engine/utils/rtpEstimator.ts` — `estimateFullRtp`, `estimateVolatilityIndex`

Nothing in `src/` is modified — the studio is a strict consumer.

### Persistence

localStorage key: `studio-state-v1`. Saved every 30 s, on tab hide, and
on manual `__studio__.saveNow()`. Schema version pinned to 1; mismatched
restores are dropped silently.

### IR import/export

- Export: `Blob([JSON.stringify(ir, null, 2)])` → `<workspace>-<variant>.ir.json`
- Import: file picker → `JSON.parse` → `validateIRBlob` (real Zod).
  Currently logs validation result without auto-overwriting state (the
  IR→studio mapping is lossy — round-trip preservation lives at the
  IR level, not the studio-state level).
