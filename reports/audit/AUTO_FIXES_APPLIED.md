# CORTI W204-AUDIT — Auto-fixes Applied

**Date:** 2026-05-18
**Scope:** Top-5 highest-impact, additive-only WCAG 2.1 AA fixes.
**Constraint:** No visual breaking changes — only additive CSS rules,
new aria-labels, new semantic wrappers. Engine code untouched.

## Fix 1 — `:focus-visible` indicator (Critical/Serious, all apps)

**WCAG rule:** 2.4.7 Focus Visible.
**Problem:** Operator + Regulator had `:focus { outline: none }` without
replacement. Marketplace + Production had no `:focus-visible` rules at all.
**Fix:**
- `web/operator/styles.css`: added `:focus-visible` block with
  2px emerald outline + 2px offset.
- `web/regulator/styles.css`: same with amber outline.
- `web/marketplace/styles.css`: same with amber accent.
- `web/production/index.html`: inline `:focus-visible` block with light-blue.

## Fix 2 — Secondary text contrast (`--text-2`)

**WCAG rule:** 1.4.3 Contrast (Minimum), 3:1 for UI text.
**Problem:** `--text-2: #5C6470` on `--bg-2: #171C24` gave 2.86:1 ratio.
**Fix:** Override at end of each stylesheet bumps `--text-2` to `#8A92A0`
(ratio ≈ 4.6:1 against `--bg-2`).
- `web/studio/styles.css`
- `web/operator/styles.css`
- `web/marketplace/styles.css`

## Fix 3 — Skip-to-content link

**WCAG rule:** 2.4.1 Bypass Blocks.
**Problem:** Operator / Regulator / Marketplace / Production had no
"skip to main content" link. Studio already had one.
**Fix:** Added `<a class="skip-link" href="#…-main">Skip to content</a>` as
first element under `<body>` + visible-on-focus CSS in each app's stylesheet.

## Fix 4 — Landmark roles + `<h1>` headings

**WCAG rules:** 1.3.1 Info and Relationships, 2.4.6 Headings and Labels.
**Problem:** Operator / Regulator / Marketplace had no `<h1>` outside of
JS-rendered partials, and the `<header>` lacked an explicit
`role="banner"`. The `<main>` lacked `tabindex="-1"` so the skip-link
couldn't land on it.
**Fix:**
- Added `role="banner"` to all `<header>` elements.
- Promoted brand titles to `<h1>` (font sizing preserved via inline style).
- Added `aria-label="Primary"` to nav landmarks.
- Added `role="main" tabindex="-1"` to `<main>` so skip-link focuses it.
- Added `aria-current="page"` on the active nav button.

## Fix 5 — `aria-label` on Studio bare inputs

**WCAG rules:** 1.3.1 / 3.3.2 Labels or Instructions.
**Problem:** Studio had 22 `<input>` elements (range/checkbox/file)
without programmatically-associated labels.
**Fix:** Added `aria-label="…"` to the inputs the audit could not
prove were wrapped in a `<label>` element (multi-line wraps and
inputs paired with adjacent text spans):
- 6 tier-pool range sliders (HP, MP, LP, Wild, Scatter, Mult)
- `cat-wave-min`, `cat-wave-max` range sliders
- `sensitivity-samples` number input
- `sensitivity-slider` range input
- `audio-mute` checkbox
- `gdd-file-input` file picker

## Post-fix audit results (static mode)

| App         | Critical | Serious | Moderate | Minor |
|---          |---:|---:|---:|---:|
| studio      | 0  | 0  | 0  | 11 |
| operator    | 0  | 0  | 0  | 1  |
| regulator   | 0  | 0  | 0  | 1  |
| marketplace | 0  | 0  | 0  | 1  |
| production  | 0  | 0  | 0  | 2  |

All Minor findings remaining are heading-related (apps that render
their `<h2>+` headings via JS post-mount; the static auditor cannot
see those) and are tracked but not blocking.

## Performance audit (static mode)

| App         | FCP   | LCP   | TTI   | CLS  | TBT  | Bundle (gz) | Score |
|---          |---:   |---:   |---:   |---:  |---:  |---:         |---:   |
| studio      | 473ms | 716ms | 858ms | 0.02 | 42ms | 52.14KB     | 100   |
| operator    | 270ms | 379ms | 382ms | 0.02 | 1ms  | 1.06KB      | 100   |
| regulator   | 268ms | 376ms | 378ms | 0.02 | 1ms  | 0.82KB      | 100   |
| marketplace | 267ms | 374ms | 376ms | 0.02 | 1ms  | 0.68KB      | 100   |
| production  | 232ms | 325ms | 327ms | 0.02 | 1ms  | 0.67KB      | 100   |

## Browser compatibility (static feature scan)

| App         | Chromium 120+ | Firefox 119+ | WebKit 17+ | Edge 120+ |
|---          |---            |---           |---         |---        |
| studio      | PASS          | PASS         | PASS       | PASS      |
| operator    | PASS          | PASS         | PASS       | PASS      |
| regulator   | PASS          | PASS         | PASS       | PASS      |
| marketplace | PASS          | PASS         | PASS       | PASS      |
| production  | PASS          | PASS         | PASS       | PASS      |
