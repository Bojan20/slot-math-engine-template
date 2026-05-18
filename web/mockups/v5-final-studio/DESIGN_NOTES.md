# v5-final-studio — Production studio, info-arch redesign over v4

## Brief

v5 is **not** an iteration of v4-final — it is a **redesign over** v4. We
keep v4's onyx + cyan engineering palette and the 6-tab structure, then
collapse the chaos: 8 shell rows → 4, 9 right-rail sections → 3 (context-
aware), 5 accent hues → 1 primary + state-only. Adds workflow wizards,
contextual toolbars, automation toasts, and a keyboard-first action layer.

## What we KEPT from v4-final

| Area | Kept |
|---|---|
| Color palette | Onyx baseline (`#0A0D11`) + electroliz cyan (`#22D3EE`), JetBrains Mono numerics |
| Icon library | 40 stroke-only cyan SVG glyphs (inline sprite + `symbols/lib/`) |
| Tab structure | 6 tabs: Build · Compose · Catalog · Play · Sensitivity · Certify |
| Persona switcher | Math / Design / Producer with same visual modulations |
| Dynamic symbols | Tier-driven pool (HP/MP/LP/WILD/SCATTER/MULT) |
| Catalog / L&W | 97 P-IDs, 16 L&W M-gaps, 15 jurisdictions, W196 pin |
| Engineering tokens | All `--bg-*`, `--line-*`, `--text-*` carried over |
| ARIA, skip-link, reduced-motion | Full a11y preserved |

## What we UKINULI / SAKRILI to reduce chaos

| v4 had | v5 does | Why |
|---|---|---|
| **8-row shell** (header + ws-tabs + ctx + tab-nav + global-status + main + bottom + ticker + statusbar) | **4-row shell** (header / tabs / main / statusbar) | UX: vertical fragmentation = cognitive overhead. Ticker collapsed into statusbar. |
| **9 right-rail sections** always visible | **3 default** + Expand reveals 6 more | UX: information triage; only show what's relevant to current selection. |
| **5 accent hues** (cyan + amber + violet + rose + green dekorativno) | **1 primary** (cyan) + state-only (warn=amber, err=rose, ok=green) | UX: states are signal, not decoration. |
| **General toolbar** with global Save / Export pills | **Per-tab contextual toolbars** | Slot designer: relevant actions live next to where you act. |
| **9 tier-counts sliders** always visible | **3 preset buttons** + Custom expands sliders | Senior designer: 80% case is "Standard 11", not bespoke. |
| **Workspace tabs row + workspace pills** | **Single workspace dropdown** in header | UX: 2 navs for same thing was redundant. |
| **Modal-only icon picker** | **Inline 12-icon popup**, "Browse all 40" opens modal | Slot designer: keep flow in-place, modal only on demand. |
| **3 status rows** (ws-tabs + ctx + global-status) | **1 statusbar** (28px) with ticker as rolling text | UX: F-pattern reads top-down; status belongs at bottom. |
| **Activity log in left rail** mixed with workspace nav | **Bottom panel** (⌘J, collapsed by default) | UX: left rail = workspace nav only; logs = on-demand. |

## 4-row shell layout

| Row | Height | Content |
|---|---|---|
| 1 Header | 44 px | brand · workspace dropdown · persona · ⌘K · ? · user avatar |
| 2 Tabs | 38 px | 6 tabs + Level-1 metrics (RTP / Hit / Vola) always visible top-right |
| 3 Main | flex  | 3-col: 220px sidebar (workspaces / IR Library / L&W templates) / panels / 304px context-aware Inspector |
| 4 Status | 28 px | engine + CI + L&W badges / ticker / save-age + ⌘J logs + ? shortcuts |

## Context-aware right rail (Inspector)

Default view → **3 sections**:
1. **Overall RTP** — big number + arc gauge + target / drift
2. **Hit-freq & volatility** — 4-cell pair (hit, σ, class, maxWin) + sparkline
3. **Recent changes** — 4 most recent activities

When user selects a **paytable cell** → rail re-renders to:
1. **This symbol** — pay × big · weight · contribution to RTP
2. **What-if Δ** — +10% pay / −10% pay simulated
3. **Tier neighbors** — sibling symbols in same tier

When user selects a **reel cell** → rail re-renders to:
1. **Reel cell** — pmf %, symbol id, tier
2. **Reel weight balance** — σ vs avg
3. **Impact on RTP** — contribution + if-doubled

"Expand" button (top-right of rail) reveals 6 more cards: CI gates,
L&W coverage, engine telemetry, audit trail, producer KPI, wave pin.

## 5 Workflow Wizards (data/wizards.json)

| # | Wizard | Use case | Steps |
|---|---|---|---|
| 1 | **New Game** | Designer drops fresh IR | 1 template → 2 symbol pool → 3 target RTP & jurisdiction → BUILD pre-filled |
| 2 | **Re-balance Existing** | Off-target RTP | Triggers auto-balance with diff toast |
| 3 | **Compare Two** | Side-by-side games | Picks A + B from workspaces |
| 4 | **Run Cert** | Automated MC + PAR + ZIP | Jumps to CERTIFY, queues MC 100M |
| 5 | **Compose Features** | Feature graph template | Opens COMPOSE pre-loaded |

Entry points: **Quick Start dropdown** in BUILD ctx-bar (top-right) and
**⌘K palette → Quick Start** category.

## Automation visible — toasts list

System actively does, then announces. Toast = cyan info / ok / warn / err.

| Trigger | Toast |
|---|---|
| Preset clicked | "Preset Standard applied · 11 symbols loaded" (ok) |
| Symbol weight changed | Auto-balance schedules; toast: "Auto-balanced reel weights · 3 deltas · RTP → 95.47%" (cyan) + "Show diff" action |
| Manual auto-balance | Same as above (kbd B or button) |
| On target | "On target · RTP 95.50% · no rebalance needed" (ok) |
| Validate clicked | "IR validated · 0 issues · ready to run" (ok) |
| Compute clicked | "Closed-form RTP recomputed · 95.42% · 1.4 ms" (ok) |
| Save (manual or auto) | "Saved onyx-lattice-v0.4.12 · IR validated · 0 issues" (ok) |
| Wizard finished | "New game from New Game · 11 symbols · target 95.5% · Adjust paytable" + "Auto-balance →" action |
| Workspace switch | "Switched to Pearl Dive" (cyan) |
| MC run | "MC 100M queued · ETA ~3 min" (cyan) + "Open logs" action |
| First load | "Welcome · Press ⌘K to search or Quick Start for new game wizard" |

Auto-save fires every 30s; statusbar shows "saved 12s ago" ticking each second.

## Symbol Pool — progressive disclosure

```
[Standard 11]*  [Compact 7]  [Rich 15]  [Custom ▾]
                                              ↓ (expands 6 sliders inline)
                  HP ━━●━━ 3
                  MP ━━●━━ 3
                  ...
```

Symbol Table = 1-row-per-symbol; inline rename (single click input),
inline icon swap (12-cell popup adjacent — modal only on "Browse all 40"),
inline weight slider, payout x3/x4/x5 mono read-only with "⋯" overflow.

## Primary Action Hierarchy (F-pattern · per tab)

| Tab | Primary (cyan filled) | Secondary (cyan outline) | Ghost / overflow |
|---|---|---|---|
| Build | Compute RTP | Quick Start ▾ · Validate · Auto-balance | ⋯ |
| Compose | Compose RTP | Add node · Re-route · Validate | — |
| Catalog | Bookmark | Compare 2 · Filter | search input |
| Play | Spin (Space) | Autoplay 10 · Replay · Seed | — |
| Sensitivity | Run sweep | A/B | param selectors |
| Certify | Export ZIP | Run MC · Generate PAR · Sign HSM | — |

One **dominant** cyan filled button per tab. Designers' eye lands top-right.

## Information Triage · 3 levels

| Level | Where | What |
|---|---|---|
| **L1 — always visible** | Top-right tabs row | RTP · Hit · Vola class |
| **L2 — contextual** | Right-rail Inspector default | RTP gauge · Hit/σ/class/maxWin · recent activity |
| **L3 — on demand** | Right-rail Expand · ⌘J bottom panel · CERTIFY tab | full audit, CI gates, MC progress, signed PAR |

## Keyboard shortcut table

| Combo | Action |
|---|---|
| ⌘K  | Command palette |
| ⌘1 – ⌘6 | Switch tabs (Build / Compose / Catalog / Play / Sensitivity / Certify) |
| ⌘S  | Save (also fires validate + activity log) |
| ⌘Z / ⇧⌘Z | Undo / Redo (toast mock) |
| ⌘J  | Toggle bottom panel (Activity / MC progress / CI gates) |
| ?   | Open shortcuts cheatsheet |
| esc | Close palette / wizard / picker / help / inline popup |
| ↑ ↓ | Navigate command palette |
| ↵   | Execute palette item |
| ← → | Cycle tabs (when tab focused) |
| **Tab-contextual** | |
| Space | Spin (PLAY tab) |
| B | Auto-balance (BUILD tab) |
| R | Run MC (CERTIFY tab) |

## Trojstvena uloga · konkretne odluke

### Senior Slot Designer odluke

1. **Quick Start dropdown** instead of empty BUILD with "+ New" hint. Designer
   never starts blank — 80% case is "Classic 5×3" or "Megaways". Wizard pre-fills.
2. **Pool presets** (Compact 7 / Standard 11 / Rich 15) front and center
   instead of 6 sliders. Designer doesn't want to think "how many MPs do I need" —
   they want Standard, tweak from there. Custom expands.
3. **Inline icon popup** (12 candidates) instead of modal-default. Designer
   editing reel does not want to lose context every icon swap. Modal only
   for full 40-glyph browse.

### Math Designer odluke

1. **Level-1 metrics fixed in tabs row** — RTP / Hit / Vola **always** in
   peripheral vision. Math designer never has to scan to confirm target.
2. **Decimal precision visible** — RTP rendered to 2dp in L1, 4dp in
   CERTIFY rows ("95.4218%"). Tabular-nums + JetBrains Mono so columns
   align for copy-paste to Excel.
3. **Closed-form vs MC delta** explicit in CERTIFY card ("Δ +0.0031%" with
   "PASS" indicator). Formula visible in COMPOSE tab as monospace code
   block under canvas.

### UI/UX Designer odluke

1. **One primary action per tab, top-right** (F-pattern terminus). User's
   eye lands on cyan filled button without scanning. Secondaries are cyan
   outline (still cyan, but visually subordinate). Ghosts = neutral.
2. **3 → 6 → 9 rail card disclosure** (default → Expand → all). Linear-
   style "show what matters now" — not Bloomberg-style "show everything."
3. **State colors as state only** — green/amber/rose appear *only* when
   acceptance status, drift threshold, regulator violation. Decorative
   colors removed. Result: a warning amber on the screen genuinely
   means warning, not "this is a number."

## Visual baseline (locked)

- Onyx `#0A0D11` bg / cyan `#22D3EE` primary / cool-white `#E8ECF1` text
- Tabular nums everywhere `font-feature-settings: "tnum" 1`
- Hairline 1px lines `--line: #252B36` / strong `#3B4452`
- Whitespace: section spacing **24px** (was 12 in v4 dense areas)
- Type hierarchy 4 levels: 18 (H1) / 13 (H2) / 12-12.5 (body) / 9-11 (micro caps)
- Density: tab content padding `16px 20px 24px` — gusto, ne sabijeno
- 0 external assets, 0 CDN, all inline SVG sprite, `file://` safe

## File inventory

```
v5-final-studio/
├── index.html         ~58 KB · 4-row shell + 6 panels + 4 modals + 40-glyph SVG sprite
├── styles.css         ~28 KB · single-accent palette, F-pattern hierarchy
├── app.js             ~31 KB · wizards + auto-balance + ctx rail + kbd shortcuts
├── DESIGN_NOTES.md    (this file)
├── data/
│   ├── catalog-97.json    (copy from v4-final)
│   ├── lw-16.json         (copy from v4-final)
│   ├── symbol-lib.json    (copy from v4-final)
│   └── wizards.json       (NEW — 5 workflow wizards)
└── symbols/lib/           (40 stroke-only cyan SVGs · copy from v4-final)
```

## Acceptance checklist

- [x] file:// opens without errors / 0 console errors
- [x] First-glance scan identifies primary action without reading
- [x] Context-aware right rail switches when paytable / reel cell selected
- [x] Quick Start dropdown shows 5 wizards
- [x] Symbol pool — 3 preset buttons, Custom expands 6 sliders
- [x] Symbol table inline rename + inline icon popup
- [x] Auto-balance toast simulates on tier change + on B kbd
- [x] Auto-save ticking in statusbar
- [x] ⌘1-6, ⌘K, ⌘S, ⌘Z, ⌘J, Space (PLAY), B (BUILD), R (CERTIFY), ? all work
- [x] 3 L1 metrics (RTP / Hit / Vola) always visible in tabs row
- [x] All 6 tabs clickable
- [x] Persona switcher works
- [x] ⌘K palette works (27 commands across 7 categories)
- [x] No external CDN
- [x] Responsive 1280×800 + 1920×1080 (CSS grid + flex)
- [x] prefers-reduced-motion respected (ticker animation disabled)
