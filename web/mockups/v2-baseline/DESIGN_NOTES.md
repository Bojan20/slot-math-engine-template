# Slot Math Studio — v2 baseline

**Production-quality merge** of `corti-mockup` (Tide & Lattice) and `kimi-mockup`
(Atrium), with a new 3-persona awareness layer overlaid on top.

The goal: a single mockup that math designers, visual designers, and
producers all open and immediately see what matters to them — without
forking the IDE into three separate apps.

---

## Merge decisions

### Corti is the GLAVNA BAZA (chosen as the visual + structural spine)

We took Corti as the foundation because:

- The graphite/bone/signal-teal palette reads as an **engineering tool**,
  not a casino product. The Kimi parchment + burnt amber + oxblood, however
  competent, drifts toward "vintage gambling" semiotics that Boki explicitly
  wants to avoid.
- Corti's 3-column-per-tab grid (palette · canvas · metrics) is the natural
  workspace shape for slot math — palette feeds canvas, canvas feeds metrics.
- The 11 mineralogy + acoustic SVG symbols (Pebble, Tide, Arc, Knot, Prism,
  Shard, Meridian, Keystone, Obelisk, Lattice, Sonar) are tier-discriminated
  by stroke weight and colour role, not by ornament. They survive abstraction
  better than any A/K/Q/J card glyphs.
- The asymmetric reel offset on the PLAY tab (cols 2 and 4 shifted +12 px) is
  a deliberate anti-Vegas cue.
- The black-disk SPIN button is the heaviest UI mass on the page — gravity
  centre, not bling.

### Kimi accessibility tokens were absorbed wholesale

These are pure-win additions with zero design cost:

| Kimi element | Where it lives in v2 |
|---|---|
| `role="tablist"` + `aria-selected` + ArrowLeft/Right/Home/End cycling | `app.js` `activateTab` + tab keydown handler |
| Skip-to-content link | `<a href="#main" class="skip">` styled to slide in on `:focus` |
| `prefers-reduced-motion: reduce` blanket disable | `@media` block in `styles.css` |
| `:focus-visible` rings (2 px teal, 2 px offset) | global `:focus-visible` rule |
| Engine status bar with **2.2 s** pulsing teal dot | `.statusbar .dot` + `@keyframes pulse` |
| `font-feature-settings: "tnum"` on all numerics | `.tnum` utility class + applied to par-value, paytable, history, statusbar, par-kv .v, kpi-v, ph-v |
| Notion-style small-caps section heads (≈10–11 px, 0.08–0.12 em) | `.col-head`, `.section-title`, `.side-block h3`, `.paytable-head`, `.par-sheet-head`, `.par-label` — tightened to KIMI rhythm |

### What we explicitly dropped from Kimi

- Parchment background gradient (`radial-gradient` warm spots).
- Burnt-amber `--accent-2` and oxblood `--warn` chromatic pair — Corti keeps
  a single `--signal` teal accent + `--warn` terracotta, no second hot colour.
- Hex stage on PLAY tab — Corti's asymmetric cartesian grid was chosen
  instead (it lines up with the math view, the hex stage broke that link).
- `<details>`/`<summary>` paytable collapse — paytable is always visible.

---

## ⭐ NEW — Persona switcher

**Why.** Boki explicitly said: *math designers + visual designers + producers
will all use this*. A single static mockup can't speak to three audiences
equally; instead of forking the UI we overlay **emphasis** through a body
class.

### Mechanism

A 3-button segmented control sits in the topbar (right of the tablist, left
of the IR pill). Clicking a button:

1. Removes any existing `persona-*` class from `<body>`.
2. Adds `body.persona-math | body.persona-design | body.persona-producer`.
3. Updates the `aria-pressed` state of each button.
4. Rewrites the **status-bar headline** to a persona-specific summary.

The CSS overlay rules are pure show/hide on three utility classes:

```css
body.persona-math    .design-only,
body.persona-math    .producer-only { display: none; }
body.persona-design  .math-only,
body.persona-design  .producer-only { display: none; }
body.persona-producer .math-only,
body.persona-producer .design-only  { display: none; }
```

Plus a handful of **emphasis tweaks** (no layout shift):

| Persona | Visual emphasis | Statusbar headline |
|---|---|---|
| **Math** *(default)* | Per-symbol contribution chart visible, volatility pips prominent, all numerics in tabular mono | `77 closed-form solvers verified · 5351 specs · 106 CI gates · 97 P-IDs · v2.63` |
| **Design** | Palette tiles enlarge (36 → 48 px gem, gap 8 → 10), paytable rows get per-tier colour-tint (low/mid/high/wild/scatter), "Win feel" chip (tight / balanced / loose) shows next to RTP, theme-picker stub (Geological / Cosmic / Botanical) appears at bottom of palette | `11 symbols · 4 tiers · paytable balance: balanced · live RTP recompute · 100 ms` |
| **Producer** | KPI strip replaces the per-symbol chart in the BUILD right rail (Time-to-cert, Legacy baseline, Cost saved/title, Releases/quarter, Regulator rejects, Coverage L&W), plus a 5-cell wave-progress milestone tracker (W196 ✅ W197 ⏳ W198 W199 W200). On CERTIFY a 3-cell headline appears above the PAR sheet (< 1 min closed-form vs 2–4 wks legacy vs 12 artefacts in op-pkg) | `Cost saved · $40 K/title · Time saved · 3 wks · Risk · 0 regulator rejections` |

**Critical design rule:** persona switch is **emphasis change, not layout
shift**. Tabs, panels, reels, paytable, machine canvas, MC bar, PAR sheet,
jurisdictions are identical across all three personas. Only side widgets
appear/disappear and a handful of accents (tile size, row tint, KPI strip
vs contribution chart) toggle.

### Producer styling discipline

The KPI strip and Certify headline are styled to read like a **Linear /
Vercel project dashboard**, not a Vegas casino marquee:

- All KPI numbers in mono tabular numerals.
- No gradients, no glow, no oversized hero number.
- KPI cards on a 2-column grid, 8 px gap, hairline border, paper-2 fill.
- Milestone tracker is 5 thin cells with `done | now | future` states; the
  active wave gets a 1-px ink-700 border, done waves get accent-soft fill
  with a small ✓ in the corner.
- The Certify producer headline is a single horizontal strip with
  thin-rule dividers, type set in mono 22 px — comparable to a Datadog
  metric row, not a slot bonus screen.

---

## What was kept from Corti, verbatim

- All 11 inline SVG symbol definitions (sprite block in `<svg width="0">`).
- Build/Play/Certify grid templates: `230 / 1fr / 360`, `1fr / 320`, `1fr / 360`.
- Reel editor + weighted reel cards + paytable with live input recompute.
- 100 ms debounced `scheduleRecompute` + `.pulse` class on `par-value`.
- Cartesian asymmetric reel canvas (`.window.offset { padding-top: 12px }`).
- Black-disk SPIN with hairline inner ring.
- Volatility pips (5 segments).
- Per-symbol contribution rows (now wrapped in `.math-only`).
- 12-section PAR sheet rendered as a 3-column grid.
- Jurisdiction chip with custom-drawn check mark, multi-toggle.
- Download package button with placeholder file-name.

## What was absorbed from Kimi

- ARIA tablist + Arrow-key cyclic navigation (incl. Home/End).
- Skip-to-content link (`a.skip` with off-screen positioning + `:focus` slide-in).
- `prefers-reduced-motion: reduce` blanket animation/transition disable.
- `:focus-visible` rings on every interactive element.
- Status-bar pulsing teal dot (2.2 s `box-shadow` ring expansion).
- Tabular numerals everywhere via `.tnum` utility class.
- Small-caps section heads (10–11 px / 0.10–0.14 em).
- ARIA roles + `aria-label` on draggable palette tiles, jurisdiction chips
  (now `role="checkbox"` with `aria-checked`), and reel weight sliders.

## What is fully new in v2

- 3-persona switcher control in the topbar.
- `.math-only` / `.design-only` / `.producer-only` overlay primitives.
- DESIGN-only: palette-tile scaling, paytable per-tier tint, win-feel chip,
  theme-picker stub.
- PRODUCER-only: KPI strip with 6 cards, 5-cell milestone tracker, Certify
  headline strip with time-to-cert vs legacy-baseline framing.
- Status-bar headline that rewrites per persona.

---

## Acceptance checklist

| Check | Status |
|---|---|
| `file://` opens without error | ✅ no CDN, no external font, no framework |
| BUILD/PLAY/CERTIFY tabs clickable | ✅ |
| Persona switcher in topbar, 3 visible states | ✅ |
| Math / Design / Producer differ visually but not structurally | ✅ |
| ARIA tablist with Arrow-key cyclic navigation | ✅ Left/Right/Home/End |
| Skip-to-content link works | ✅ slides in on Tab focus |
| Tabular numerals everywhere | ✅ via `.tnum` utility |
| Statusbar pulsing dot 2.2 s | ✅ `@keyframes pulse` |
| Live RTP reacts to paytable input | ✅ 100 ms debounce |
| Drag-drop + click-to-select | ✅ both paths bound |
| 0 console errors | ✅ vanilla JS only |
| 0 external CDNs | ✅ |
| Responsive 1280×800 + 1920×1080 | ✅ media queries at 1400 / 1200 |
| Reduced-motion preference respected | ✅ blanket disable |

---

## File inventory

```
v2-baseline/
├── index.html          ~33 KB   Corti DOM + persona switcher + math/design/producer-only blocks
├── styles.css          ~27 KB   Corti tokens + KIMI accessibility + persona overlay rules
├── app.js              ~11 KB   Corti compute + KIMI ARIA + persona toggle handler
├── symbols/            (11 SVG copied from corti-mockup/symbols/)
└── DESIGN_NOTES.md     (this file)
```
