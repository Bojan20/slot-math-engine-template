---
schema: urn:slotmath:studio-button-audit:v1
agent: STUDIO_BUTTON_AUDITOR
date: 2026-05-27
scope:
  - web/studio/index.html (1704 LOC)
  - web/studio/app.js (5749 LOC)
totals:
  static_buttons_in_html: 123
  data_action_attrs: 0
  click_handlers_in_app_js: 133
  delegated_listeners: 2  # document-level click delegation (#bp-close, ws-menu, qs-menu)
  unique_id_selectors_via_$: 175
findings:
  critical_unbound: 19
  critical_math_drift: 1
  warn_a11y: 7
  warn_disabled_gaps: 7
  info_console_leak: 0
---

# Studio Button Audit — `web/studio/index.html` + `web/studio/app.js`

## Executive summary

The Studio shell is a hand-rolled vanilla DOM app (no framework) that wires every interactive element through a thin `$("#id")` querySelector helper plus a handful of `$$(".class")` ranged bindings. Out of **123 static `<button>` tags** in `index.html`, **133 click listeners** are registered in `app.js` — but the apparent 1:1 ratio is misleading. A **whole panel** (Certify · `panel-certify`) is a façade: the four header CTAs (`btn-run-mc`, `btn-gen-par`, `btn-run-audit`, `btn-export-zip`) plus the entire MC-size selector, seed-randomizer, verify-signature button and the jurisdiction-modal close button are all **dead clicks** — there is zero reference to those IDs anywhere in `app.js`. The IR Library + Studio Pilots side-rail (11 buttons) is also placeholder-only. On top of that the Play tab's `spin()` (the most-clicked button in the Studio) does **not** consult the loaded IR — it returns `Math.random() < 0.28` and `Math.random() * 12` regardless of which symbol pool / paytable / reels are active. RTP / hit / variance shown on the Play tab are therefore independent of the math model and constitute a hard math-drift risk. Compute · Validate · Auto-balance · Sensitivity sweep · sensitivity-MC paths are correctly bound and route through `recompute()` / `doAutoBalanceFor()` / `sensBridge()` which all honour `symbols[i].weight`.

---

## 1 · Totals walked

| Category | Count |
|---|---|
| Static `<button>` tags in `index.html` | 123 |
| `[data-action]` attributes | 0 (the codebase uses `data-tab`, `data-persona`, `data-preset`, `data-bp`, `data-pilot`, `data-toggle`, `data-mc-size`, `data-theme-preset`, `data-mode` instead) |
| `addEventListener('click', …)` call sites in `app.js` | 133 |
| Inline `onclick=` in `index.html` | 6 (all in `#bottom-panel`: 3 bp-tabs + bp-close + 2 redundant) |
| Click handlers wired via `document.addEventListener` delegation | 4 (drawer-close, outside-click-to-dismiss menus × 3) |
| Unique `$("#id")` selector targets | 175 |
| **Estimated coverage** | **~84 % of static buttons reach a real handler** |

---

## 2 · CRITICAL — Unbound buttons (clicking does nothing)

| # | id / selector | Source line (index.html) | Owner panel | Evidence |
|---|---|---|---|---|
| 1 | `#btn-run-mc` | 892 | Certify header | Zero refs in app.js (grep confirmed) |
| 2 | `#btn-gen-par` | 893 | Certify header | Zero refs |
| 3 | `#btn-run-audit` | 894 | Certify header | Zero refs |
| 4 | `#btn-export-zip` | 895 | Certify header (primary CTA "Download Operator Package") | Zero refs |
| 5 | `.certify-mc-size[data-mc-size]` × 5 | 909–913 | Certify · MC size group | Zero refs to `data-mc-size` |
| 6 | `#certify-seed-random` | 939 | Certify · RNG seed row | Zero refs |
| 7 | `#certify-verify-sig` | 992 | Certify · Merkle commit row | Zero refs |
| 8 | `#certify-jur-modal-close` | 1017 | Certify · jurisdiction detail modal | Zero refs |
| 9 | `#btn-build-more` ("⋯") | 322 | Build header more menu | Zero refs |
| 10 | `#btn-seed` | 682 | Play tab seed pill | Zero refs (only text mutated by spin) |
| 11 | `.side-item` template buttons × 10 | 260–269 | IR Library side rail | No `data-tpl` attr, no click binding (dynamic `data-ws` items ARE bound; the static template list is a stub) |
| 12 | `.side-item[data-pilot="wrath-of-olympus"]` | 279 | Studio Pilots side rail | Zero refs to `data-pilot` |
| 13 | `.m-form` formula buttons × 5 | 1044, 1050, 1056, 1062, 1068 | Right-rail moments card | Zero refs to `.m-form` |

**Total dead clicks: 19 logical buttons** (29 instances when counting the 5 MC-size, 5 m-form, and 10 side-item buttons individually). These look operable (cursor pointer, hover state) but produce no side-effect.

### Impact

- **`#btn-export-zip`** is the headline CTA at the top of Certify ("Download Operator Package") — most-prominent gold button on the page. Clicking it does nothing. For a vendor-cert demo this is the most damaging silent failure.
- Certify panel is effectively read-only / decorative.
- IR Library + Pilot rail looks loadable but only the dynamically-rendered `[data-ws]` workspace switcher actually works.

---

## 3 · CRITICAL — Handlers bypassing IR weights (math drift)

| # | Handler | File:line | What it does | Why it's wrong |
|---|---|---|---|---|
| 1 | `spin()` bound to `#btn-spin`, `#btn-auto10`, `#btn-replay` | app.js:3684–3699 | `const hit = Math.random() < 0.28; const win = hit ? +(Math.random()*12).toFixed(1) : 0;` | Hardcoded 28 % hit-frequency + uniform 0–12× win — **completely ignores** `getActiveVariant().symbols[].weight`, paytable, paylines, reels. The Play tab's RTP-sim, Hit %, Win × all derive from these fake numbers. Loading Wrath of Olympus (validated 20.69 % hit, σ 4.51, P99 53.82×) doesn't change a single number on the Play tab. |
| 2 | `#btn-replay` | app.js:3699 | Just emits `toast("Replayed last spin · seed 0x9F-2E1B")` — hard-coded fake seed | Pure cosmetic, never actually replays |

### Mitigations already in place

- `recomputeFor(variant)` (app.js:740–793) **does** honour weights for the legacy heuristic branch (`payMass = Σ (x3+x4+x5) · weight/total`) and prefers `rtpAllocation.total_cf` / `total_mc_5b` from imported IRs. ✅
- `doAutoBalanceFor()` (1129–1154) mutates `s.weight` correctly. ✅
- Sensitivity sweep delegates to `sensBridge()` (TS-side) which receives the full variant. ✅
- `#sensitivity-run-mc` (4579–4596) rebuilds IR via `variantToIrForMc(v)` and feeds the auto-MC orchestrator — correct. ✅
- Play Template (`#btn-play-template`) runs `variantToFullIR(v)` + MTL sealing ceremony — uses real IR. ✅

### Recommended fix

Replace the body of `spin()` (lines 3685–3693) with either:
1. Pull a sample from the actual reels strip using `pickSymbol(weights)` and evaluate against `variant.evaluation.paylines`, or
2. Disable the Play-tab interactive spin until a real runtime kernel (the one used by Play Template) is wired up.

---

## 4 · WARN — Missing accessible name (aria-label)

| # | Selector / id | Visible content | Issue |
|---|---|---|---|
| 1 | `.m-form` × 5 (lines 1044–1068) | "📐" emoji only | Screen-reader announces "📐 button"; `title` attr is not a reliable accessible name |
| 2 | `.btn-swap-compare` × 3 (lines 471, 710, 869) | "⇄" only | title-only; should add `aria-label="Swap A↔B"` |
| 3 | `#btn-help` (165) | "?" | Acceptable but borderline — would benefit from `aria-label="Keyboard shortcuts"` |
| 4 | `#btn-build-more` (322) | "⋯" only | Already unbound; if revived must add aria-label |
| 5 | `#wiz-close`, `#picker-close`, `#help-close`, `#ng-close`, `#irl-close`, `#nv-close`, `#cmp-close`, `#gdd-close`, `#bp-close` — modal close buttons | "×" | `#bp-close` and `#certify-jur-modal-close` have `aria-label="Close"` / `aria-label="Close drawer"`; the other 8 do not. |
| 6 | `.persona-btn` × 3 (133–135) | "Math" / "Design" / "Producer" + `aria-pressed` | ✅ good |
| 7 | `#ws-switch` (122) | child span with workspace name + caret | OK (text in children) |

**Net: 7 distinct selectors / 17 button instances with weak or missing accessible names.**

---

## 5 · WARN — Disabled-state gaps (no IR loaded → buttons should be inert)

| # | Button | Behaviour on blank variant | Should be |
|---|---|---|---|
| 1 | `#btn-compute` (Build) | Recomputes against blank variant; renders dashes (`—`) via `isVariantBlank()` guard | OK — harmless but should still be visually disabled |
| 2 | `#btn-autobalance` | Calls `doAutoBalance()` → tries `variant.symbols.filter(...)` — silently does nothing on blank | Should be disabled until ≥1 symbol exists |
| 3 | `#btn-spin`, `#btn-auto10`, `#btn-replay` (Play) | Runs `Math.random()` regardless | Should be disabled until reels exist (and the underlying handler should be rewritten — see §3) |
| 4 | `#btn-play-template` | Has a guard (3342: warns "Build or import a math model first") ✅ | OK, but visual `disabled` state would be cleaner |
| 5 | `#btn-run-mc`, `#btn-gen-par`, `#btn-run-audit`, `#btn-export-zip` (Certify) | Currently unbound (§2) — when bound, must require validated IR | N/A until bound |
| 6 | `#sensitivity-run` | Guard at 4478 (param required) ✅ | OK |
| 7 | `#irl-load` (modal Load button) | Starts `disabled=true`, flips to `false` once a card is selected ✅ | OK |

**Pattern observed:** Disabled state is implemented case-by-case (irl-load, sensitivity-run, play-template via setAttribute). Inconsistent — most Build / Play / Certify buttons stay clickable on blank state.

---

## 6 · INFO — Console hygiene (debug-trace leaks)

`console.*` call count in `app.js`: **14**.

| Line | Statement | Verdict |
|---|---|---|
| 32, 42 | `console.log("[studio] nuked …")` / `cleared …` | Startup-only service-worker / cache cleanup — INFO-level, not click-handler leak. ✅ |
| 360, 361, 364 | `console.warn("[compose|rule-editor|math-notebook] render failed:")` | Defensive try/catch; warn-only on render failure. ✅ |
| 1838, 2134, 2146, 2264, 3077, 3429, 4594, 5518, 5526 | `console.warn(...)` various import / drawer-close / play-template / sensitivity / state-restore failure paths | All `warn` — appropriate. ✅ |

**No click handler emits `console.log` for debug.** Clean.

---

## 7 · Per-tab binding map (quick reference)

### Header

| id | Bound? | Handler |
|---|---|---|
| `#ws-switch` | ✅ | toggles `#ws-menu` (app.js:1381) |
| `#ws-newgame-btn` | ✅ | `openNewGameModal()` (1391) |
| `#persona-cta` | ✅ | swap-by-persona (295–323) |
| `#btn-cmdp` | ✅ | `openCmdp()` (4109) |
| `#btn-toggle-left/-status/-panel/-right` | ✅ | `toggleLayoutZone()` (3275) |
| `#btn-help`, `#btn-status-help` | ✅ | `showModal("help-modal")` (4138/9) |
| `#btn-compare` | ✅ | `openCompareModal()` (2645) |
| `.persona-btn` × 3 | ✅ | `setPersona()` (292) |

### Tabs / panels

| id | Bound? |
|---|---|
| `.tab[data-tab]` × 6 | ✅ (367) |

### Build

| id | Bound? | Notes |
|---|---|---|
| `#btn-quickstart` | ✅ | opens menu (2871) |
| `#btn-validate` | ✅ | (3621) |
| `#btn-autobalance` | ✅ | (3659) — IR-weight correct |
| `#btn-compute` | ✅ | (3325) — IR-weight correct |
| `#btn-play-template` | ✅ | (3340) — IR-weight correct + MTL seal |
| `#btn-build-more` | ❌ | unbound (322) |
| `.preset[data-preset]` × 3 | ✅ | (687) |
| `#preset-custom-toggle` | ✅ | (708) |
| `#show-grid` | ✅ | (binding inside renderSymbolList) |
| `#my-icons-export`, `#my-icons-import` | ✅ | (5605/5623) |

### Compose

| id | Bound? |
|---|---|
| `#compose-validate`, `#compose-export`, `#compose-clear` | ✅ (5035, 5056, 5075) |
| `#rule-suggest`, `#rule-add`, `#rule-lib-toggle` | ✅ (5331, 5314, 5323) |
| `#rule-test`, `#rule-dup`, `#rule-del` | ✅ (5237, 5242, 5247) |
| `#mn-add-cell`, `#mn-run-all` | ✅ (5437, 5446) |

### Catalog

| id | Bound? |
|---|---|
| `#cat-clear-filters` | ✅ (3939) |
| `#cat-d-insert` | ✅ (3954) → `insertSelectedPatternIntoVariant` |
| `#cat-d-specs` | ✅ (3956) |
| `[data-pid]`, `[data-juris]`, `[data-mgap]` chips | ✅ (3838, 3891, 3795) |

### Play

| id | Bound? | IR-correct? |
|---|---|---|
| `#btn-spin`, `#btn-auto10`, `#btn-replay` | ✅ | ❌ — `Math.random()` only (§3) |
| `#btn-seed` | ❌ | n/a |
| `#btn-demo-fs`, `#btn-demo-hw`, `#btn-demo-cascade` | ✅ | bridge to TS playTab (3704–3713) |

### Sensitivity

| id | Bound? |
|---|---|
| `#sensitivity-run` | ✅ (4571) |
| `#sensitivity-run-mc` | ✅ (4580) — rebuilds IR ✅ |
| `#sensitivity-export-csv` | ✅ (4575) |
| `#sensitivity-save-b` | ✅ (4577) |
| `#sensitivity-mode-1d`, `#sensitivity-mode-2d` | ✅ (4599, 4605) |

### Certify

| id | Bound? |
|---|---|
| `#btn-run-mc` | ❌ |
| `#btn-gen-par` | ❌ |
| `#btn-run-audit` | ❌ |
| `#btn-export-zip` | ❌ |
| `.certify-mc-size[data-mc-size]` × 5 | ❌ |
| `#certify-seed-random` | ❌ |
| `#certify-verify-sig` | ❌ |
| `#certify-jur-modal-close` | ❌ |

### Right rail / status / bottom drawer

| id | Bound? |
|---|---|
| `#rail-expand` | ✅ (1113) |
| `.m-form` × 5 | ❌ |
| `#audio-upload-btn` | ✅ (5721) |
| `.theme-tile[data-theme-preset]` × 4 | ✅ (336, 5648) |
| `#btn-toggle-bottom` | ✅ (3088) |
| `#bp-close` | ✅ delegated (3082) + inline onclick (1421) |
| `.bp-tab[data-bp]` × 3 | ✅ delegated (3145) + inline onclick |

### Modals (all close + primary buttons bound)

| Modal | close | cancel | primary |
|---|---|---|---|
| New Game | ✅ | ✅ | ✅ `#ng-create` (1623) |
| IR Library | ✅ | ✅ | ✅ `#irl-load` (1770, disabled-until-selected) |
| New Variant | ✅ | ✅ | ✅ `#nv-create` (2603) |
| Compare | ✅ | ✅ | ✅ `#cmp-enter` (2656) |
| GDD review | ✅ | ✅ | ✅ `#gdd-draft` + `#gdd-generate` (2519, 2523) |
| Wizard | ✅ | back/next | ✅ (2967, 2973) |
| Help | ✅ | n/a | n/a |
| Picker | ✅ | n/a | n/a |
| Cert jurisdiction detail | ❌ `#certify-jur-modal-close` | n/a | n/a |

---

## 8 · Top-3 priority remediations

1. **Wire up Certify panel (HIGH).** 13 dead buttons (4 header CTAs + 5 MC sizes + seed-random + verify-sig + jurisdiction-modal close + decorative MC-size group). The "Download Operator Package" gold CTA is the most visible regression for vendor demos. Either disable + grey out the panel until backend hooks land, OR wire to existing `ops/operator-package` worker bridge.
2. **Rewrite `spin()` to consult IR weights (HIGH).** Replace `Math.random() < 0.28` heuristic with `pickSymbolWeighted(reel.strip)` × paylines evaluator. This is math drift on the most-clicked button.
3. **Add aria-label to 5 × `.m-form` formula buttons + 3 × `.btn-swap-compare` + 8 modal `×` close buttons (MED).** One-line each; restores screen-reader parity with the bp-close / certify-jur-modal-close pattern already in use.

---

## 9 · Methodology

1. Read `web/studio/index.html` lines 1–1704 — extracted every `<button>` tag and every `[data-*]` attribute referenced by class.
2. Read `web/studio/app.js` lines 1–5749 — extracted `$("#id").addEventListener("click")`, `getElementById(...).addEventListener("click")`, `$$(".class").forEach(...).addEventListener("click")`, document-delegated click listeners, and inline `onclick=` handlers.
3. For each candidate id from step 1, grepped step 2 for any reference (`#id`, `"id"`). Zero references → unbound.
4. For each bound handler that touched RTP / hit / variance, traced the call chain: `btn-compute` → `recompute()` → `recomputeFor(variant)`; `btn-spin` → `spin()`; `btn-autobalance` → `doAutoBalanceFor()`; `sensitivity-run` → `sensBridge().runSweepAsync()`; `sensitivity-run-mc` → `variantToIrForMc()` → `autoMcTrigger()`. Verified each consumed `variant.symbols[].weight` OR a validated `rtpAllocation` block from the IR — except `spin()`.
5. Console-log scan: full-file regex for `console\.(log|debug|warn|error|info)` → 14 hits, all error-path or boot-only, none in click handlers.

End of audit.
