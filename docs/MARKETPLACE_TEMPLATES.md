# Marketplace Templates

W209 Faza 500.0 — Game Template Marketplace.

A **template** in the marketplace is a turnkey slot product: kernel
(via L&W P-IDs) + theme + paytable defaults + license model + preview
asset. An operator can buy a template, run it through the re-skin wizard,
and ship a custom game to the cabinet in 12-18 days.

## Anatomy

```
templates/
  data/templates.json          — 6 seed templates
  data/template-previews/      — 6 inline SVGs (256x192)
  src/templates.ts             — loader + filters + stats
  src/template-browser.ts      — UI bindings + helpers
  src/reskin-wizard.ts         — 6-step state machine
  src/licensing.ts             — perpetual / revenue-share / hybrid
```

## Template manifest

```json
{
  "id": "tpl-quick-hit-dragons",
  "displayName": "Quick Hit Dragons",
  "description": "Asian dragon-themed Quick Hit variant ...",
  "based_on_pids": ["P-082"],
  "lw_gap_target": "M5",
  "layout": "5x3",
  "rtp_target": 95.5,
  "volatility": "medium-high",
  "max_win_x": 5000,
  "symbol_pack": "asian-dragon",
  "audio_pack": "asian-temple",
  "price_usd": 25000,
  "license_terms": "perpetual + revenue_share_3pct",
  "preview_image": "tpl-quick-hit-dragons-preview.svg",
  "tags": ["asian", "dragon", "quick-hit", "mystery-progressive"],
  "ready_to_ship_days": 14
}
```

Required:
- `id` — `tpl-*` prefix, kebab-case
- `based_on_pids` — at least one L&W P-ID from the catalog
- `lw_gap_target` — one of `M1`..`M16`
- `rtp_target` — strictly within `[90, 99.999]`
- `preview_image` — `.svg` filename under `data/template-previews/`

## Author flow

1. Pick the kernel(s) by P-ID from `docs/INDUSTRY_PATTERN_CATALOG.md`.
2. Choose a layout that fits the kernel (e.g. nested mini-slot → 6x4).
3. Pick `symbol_pack` + `audio_pack` from the studio theming engine.
4. Set price + `license_terms` — see Pricing strategies below.
5. Add a preview SVG (256x192, cyan + onyx + theme accent).
6. Add the entry to `data/templates.json` and run
   `web/marketplace$ npx vitest run` — schema is asserted in tests.

## Pricing strategies

| Model            | Upfront        | Royalty             | Typical fit                              |
| ---------------- | -------------- | ------------------- | ---------------------------------------- |
| `perpetual`      | full price     | 0%                  | Smaller operators, predictable spend     |
| `revenue-share`  | 30% of price   | 3-5%                | Aggressive launch / risk-share programs  |
| `hybrid`         | full price     | 3-5% (capped)       | Premium licenses, big-name studios       |

`licensing.parseLicenseTerms` understands these forms in the manifest:

```
perpetual
revenue_share_5pct
perpetual + revenue_share_3pct
perpetual + revenue_share_4pct + cap_50000
```

## Re-skin walkthrough

1. **Pick template** — `tpl-quick-hit-dragons`.
2. **Pick theme** — `mythological` (from the 8 studio themes).
3. **Rename symbols** — `HP1 = Phoenix` in `en`, `Fénix` in `es`.
4. **Tweak paytable** — `HP1@5 = 500`, `WILD@5 = 1000`.
5. **Preview** — wizard renders 5x3 reels with the new labels.
6. **Export** — ZIP bundle `{ manifest.json, game.ir.json, README.md }`.

`runQuickHitDragonsToPhoenixDemo()` is a one-call test fixture that
exercises this path end-to-end and is asserted in
`tests/reskin-wizard.test.ts`.

## License verification

The marketplace mints a JWT-like license token at purchase:

```
header.payload.sig
```

`verifyLicense(token)` replays the signature and checks expiry. Today
the signer is a deterministic FNV-1a stub; Agent C swaps in HMAC-SHA256
backed by HSM in the production wave.
