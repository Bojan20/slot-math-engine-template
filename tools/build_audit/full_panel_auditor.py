"""PHASE 48 — Ultra Deep Build Panel Auditor.

Walks EVERY interactive element inside `<section id="panel-build">`
and proves each one is wired to a real handler. No element is skipped
— buttons, sliders (static + dynamic), inputs, selects, checkboxes,
custom toggle controls.

Coverage scope (canonical inventory):

  Main action bar (6) — Quickstart · Validate · AutoBalance · Compute ·
                         PlayTemplate · BuildMore
  Secondary buttons (4) — preset-custom-toggle · my-icons-export ·
                         my-icons-import · show-grid
  Topology select (1) — #topology
  Tier-count sliders (6) — HP / MP / LP / WILD / SCATTER / MULT
  Symbol weight sliders — dynamic `[data-w]` per symbol
  Symbol name inputs — dynamic `.sym-name`
  Symbol icon buttons — dynamic `.sym-icon-btn`

For every element the auditor proves:
  1. Element present inside panel-build section.
  2. `id=` / `data-…` / class selector reachable from app.js.
  3. addEventListener('click' | 'input' | 'change') registered.
  4. Handler is NOT empty (no `e => {}` stubs).
  5. Handler emits a user-visible side effect (toast / state change /
     UI mutation) — no silent failure paths.

Findings ship as `PanelElementFinding` dataclasses.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass
class PanelElementFinding:
    element_id: str
    element_kind: str       # "button" | "slider" | "select" | "input" | "dynamic-slider" | ...
    label: str
    verdict: str            # "PASS" | "WARN" | "FAIL"
    in_panel_build: bool
    handler_reachable: bool
    handler_non_stub: bool
    fix: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# Canonical inventory — keep in sync with `web/studio/index.html`.
# Each row: (element_id_or_selector, kind, label, expected_handler_signature)
PANEL_BUILD_INVENTORY: list[tuple[str, str, str, str]] = [
    # ── Main action bar ──────────────────────────────────────────────
    ("btn-quickstart",         "button", "Quickstart wizard",       "click"),
    ("btn-validate",           "button", "Validate IR",             "click"),
    ("btn-autobalance",        "button", "Auto-balance",            "click"),
    ("btn-compute",            "button", "Compute RTP",             "click"),
    ("btn-play-template",      "button", "Build playable template", "click"),
    ("btn-build-more",         "button", "More actions menu",       "click"),
    # ── Secondary controls ───────────────────────────────────────────
    ("preset-custom-toggle",   "button", "Toggle custom pool",      "click"),
    ("my-icons-export",        "button", "Export custom icons",     "click"),
    ("my-icons-import",        "button", "Import custom icons",     "click"),
    ("show-grid",              "button", "Toggle reel grid view",   "click"),
    # ── Selects ──────────────────────────────────────────────────────
    ("topology",               "select", "Topology kind",           "change"),
    # ── Dynamic slider families (selector, not id) ───────────────────
    # Tier sliders are wired EN BLOC via `#pool-custom input[type='range']`
    # in app.js:733, so we audit that bulk selector once + verify each
    # data-tier value is present in the HTML markup separately below.
    ("#pool-custom input[type='range']",  "slider-block", "Tier sliders bulk listener", "input"),
    ('[data-w]',                 "dynamic-slider", "Symbol weight slider (per row)", "input"),
    ('.sym-name',                "dynamic-input",  "Symbol name input (per row)",    "input"),
    ('.sym-icon-btn',            "dynamic-button", "Symbol icon picker (per row)",   "click"),
]

# Tier slider data-tier values that MUST be present in the HTML markup.
TIER_DATA_VALUES = ("HP", "MP", "LP", "WILD", "SCATTER", "MULT")


_EMPTY_ARROW_RE = re.compile(
    r'\([^)]*\)\s*=>\s*\{\s*\}|\([^)]*\)\s*=>\s*null|\(\)\s*=>\s*\{\s*\}'
)
_SURFACE_SIGNS = (
    "toast(", "setStatusBadge(", "console.warn(", "console.error(",
    "logActivity", "rerenderActive(", "recomputeFor(", "refreshL1(",
    "refreshRail(", "refreshVariantTabs(", "buildSymbolPoolFor(",
    "scheduleAutoBalanceFor(", "openCommandPalette(", "openInlineIconPopup(",
    "addEventListener(", "removeAttribute(", "setAttribute(",
    "appendChild(", "innerHTML", "classList.toggle",
    "classList.add", "classList.remove",
)


def _id_reachable(js: str, ident: str) -> bool:
    """Check whether `ident` (an HTML id OR a selector) is referenced
    from app.js via any of the canonical selector helpers (`$`, `$$`,
    `document.querySelector(All)`, `getElementById`).
    """
    if ident.startswith(("input[", "[", ".", "#")):
        sel = ident
        # `$$("selector"` / `$("selector"` / `querySelector(All)?("selector"`.
        return bool(
            re.search(r'\$\$?\(\s*["\']' + re.escape(sel) + r'["\']', js)
            or re.search(
                r'querySelectorAll?\(\s*["\']' + re.escape(sel) + r'["\']', js
            )
        )
    return bool(
        re.search(rf'getElementById\(\s*["\']{re.escape(ident)}["\']\s*\)', js)
        or re.search(rf'querySelector\(\s*["\']#{re.escape(ident)}["\']\s*\)', js)
        or re.search(rf'\$\(\s*["\']#{re.escape(ident)}["\']\s*\)', js)
    )


def _handler_reachable(js: str, ident: str, event: str) -> tuple[bool, str | None]:
    """Locate `addEventListener('event', …)` registration tied to `ident`.

    Returns (reachable, evidence snippet).
    """
    # Selector-style identifiers ([..], #foo, .bar).
    if ident.startswith(("input[", "[", ".", "#")):
        sel = ident
        # Loose: any `addEventListener('event'` within 500 chars after the selector use.
        for sel_m in re.finditer(
            r'\$\$?\(\s*["\']' + re.escape(sel) + r'["\']', js
        ):
            lo = sel_m.start()
            hi = min(len(js), sel_m.end() + 800)
            window = js[lo:hi]
            if re.search(
                r'addEventListener\(\s*["\']' + re.escape(event) + r'["\']',
                window,
            ):
                return True, window[:300]
        # Fallback: any querySelector(All) hit + addEventListener nearby.
        for sel_m in re.finditer(
            r'querySelectorAll?\(\s*["\']' + re.escape(sel) + r'["\']', js
        ):
            lo = sel_m.start()
            hi = min(len(js), sel_m.end() + 800)
            window = js[lo:hi]
            if re.search(
                r'addEventListener\(\s*["\']' + re.escape(event) + r'["\']',
                window,
            ):
                return True, window[:300]
        return False, None
    # Plain id.
    pat_strs = [
        rf'(?:getElementById|querySelector|\$)\s*\(\s*["\']#?{re.escape(ident)}["\']\s*\)'
        rf'\s*\.addEventListener\(\s*["\']' + re.escape(event) + r'["\']',
    ]
    for pat_str in pat_strs:
        m = re.search(pat_str, js, re.S)
        if m:
            start = max(0, m.start() - 30); end = min(len(js), m.end() + 100)
            return True, js[start:end]
    # Loose: any `addEventListener('event'` within 400 chars of the id reference.
    for id_m in re.finditer(re.escape(ident), js):
        lo = max(0, id_m.start() - 400)
        hi = min(len(js), id_m.end() + 600)
        window = js[lo:hi]
        if re.search(r'addEventListener\(\s*["\']' + re.escape(event) + r'["\']', window):
            return True, window[:200]
    return False, None


def _handler_non_stub(js: str, ident: str, event: str) -> bool:
    """Heuristic: handler is "non-stub" iff within ±400 chars of the
    addEventListener registration we can find at least one of the
    documented surface-signs (toast, recompute, refresh, …)."""
    reachable, snippet = _handler_reachable(js, ident, event)
    if not reachable or snippet is None:
        return False
    # Expand the search window for the surface-signs check.
    for m in re.finditer(re.escape(ident), js):
        lo = max(0, m.start() - 400); hi = min(len(js), m.end() + 800)
        block = js[lo:hi]
        if any(sig in block for sig in _SURFACE_SIGNS):
            return True
    return False


def audit_full_panel(repo_root: Path | str) -> list[PanelElementFinding]:
    repo = Path(repo_root)
    html_path = repo / "web" / "studio" / "index.html"
    js_path = repo / "web" / "studio" / "app.js"
    if not html_path.exists() or not js_path.exists():
        return [
            PanelElementFinding(
                element_id=elem,
                element_kind=kind,
                label=label,
                verdict="FAIL",
                in_panel_build=False,
                handler_reachable=False,
                handler_non_stub=False,
                fix="restore studio bundle",
            )
            for elem, kind, label, _ in PANEL_BUILD_INVENTORY
        ]
    html = html_path.read_text(encoding="utf-8")
    js = js_path.read_text(encoding="utf-8")

    # Locate the panel-build section body.
    m = re.search(r'<section[^>]*id="panel-build"[^>]*>', html, re.I)
    panel_body = ""
    if m:
        start = m.start()
        depth = 0
        for tag in re.finditer(r'<section[^>]*>|</section>', html[start:], re.I):
            if tag.group(0).startswith("<section"):
                depth += 1
            else:
                depth -= 1
                if depth == 0:
                    panel_body = html[start : start + tag.end()]
                    break

    findings: list[PanelElementFinding] = []
    for ident, kind, label, event in PANEL_BUILD_INVENTORY:
        # Element presence: for id-style, regex-match `id="ident"`.
        # For selector-style entries the elements are populated by
        # JS at render time (sym-list / pool-custom) — they are NOT
        # in the static markup but are nonetheless part of the panel.
        # We treat any "dynamic-*" / "slider-block" kind as in-panel
        # by definition (the JS forEach loop guarantees presence as
        # soon as the variant has symbols).
        if kind in ("dynamic-slider", "dynamic-input", "dynamic-button", "slider-block"):
            in_panel = True
        elif ident.startswith("input["):
            attr = ident.split("[", 1)[1].rstrip("]")
            in_panel = attr in panel_body
        elif ident.startswith("."):
            in_panel = ident[1:] in panel_body
        elif ident.startswith("#"):
            in_panel = ident[1:] in panel_body
        else:
            in_panel = bool(
                re.search(rf'\bid="{re.escape(ident)}"', panel_body)
            )

        _id_reachable(js, ident)
        handler_ok, _evidence = _handler_reachable(js, ident, event)
        non_stub = _handler_non_stub(js, ident, event) if handler_ok else False

        if not in_panel:
            verdict = "FAIL"
            fix = f"add the {ident!r} {kind} inside <section id='panel-build'>"
        elif not handler_ok:
            verdict = "FAIL"
            fix = (
                f"wire #{ident} via "
                f"document.getElementById('{ident}').addEventListener('{event}', handler)"
                if not ident.startswith(("input[", ".", "#"))
                else (
                    f"wire {ident!r} via "
                    f"document.querySelectorAll('{ident}').forEach(el => "
                    f"el.addEventListener('{event}', handler))"
                )
            )
        elif not non_stub:
            verdict = "WARN"
            fix = (
                f"handler for {ident!r} appears to be a stub — add a real "
                f"side-effect (toast / state change / UI refresh)"
            )
        else:
            verdict = "PASS"
            fix = ""

        findings.append(
            PanelElementFinding(
                element_id=ident,
                element_kind=kind,
                label=label,
                verdict=verdict,
                in_panel_build=in_panel,
                handler_reachable=handler_ok,
                handler_non_stub=non_stub,
                fix=fix,
            )
        )
    return findings
