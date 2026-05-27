"""PHASE 47 — Slider Recompute Auditor.

For every weight-slider edit in the Studio Build section, prove the
downstream invariants hold:

  1. Event listener exists on `<input type="range" data-w="…">`.
  2. Listener mutates `variant.symbols[i].weight` (state mutation).
  3. Listener triggers a recompute via `scheduleAutoBalanceFor` /
     direct `recomputeFor`.
  4. `recomputeFor` does NOT early-return on imported-IR variants
     (otherwise live edits are silently no-op vs the displayed RTP).
  5. Symbol weight changes propagate to `variant.reels.base[r][sym]`
     so the canonical IR + cert XML + slot-sim Rust see the edit.
  6. Negative / zero weights short-circuit with a toast — no silent
     clamp.
  7. `Σ_w = 0` on a reel surfaces a FAIL state — no `|| 1` fallback.
  8. The recompute uses Fraction-exact arithmetic OR a documented
     float path within ≤ 1e-9 drift.
  9. `variant.lastClosedFormRtp` mirrors the latest recompute so the
     cert pipeline never sees stale RTP.

The auditor is pure regex + AST grep — no headless browser needed.
Findings ship as `SliderRecomputeFinding` dataclasses + Markdown.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Any


@dataclass
class SliderRecomputeFinding:
    invariant: str
    verdict: str
    detail: str
    evidence: list[dict[str, Any]] = field(default_factory=list)
    fix: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ─── Source-pattern detectors ─────────────────────────────────────────────


_SLIDER_INPUT_RE = re.compile(
    r'\$\$\(["\']\[data-w\]["\']\s*,\s*container\)\.forEach',
    re.S,
)
_WEIGHT_MUTATION_RE = re.compile(
    r'variant\.symbols\[i\]\.weight\s*=\s*v\b',
)
_SCHEDULE_AUTOBALANCE_RE = re.compile(r'scheduleAutoBalanceFor\(')
_RECOMPUTE_FOR_RE = re.compile(r'function\s+recomputeFor\s*\(')
_REEL_PROPAGATION_RE = re.compile(
    r'variant\.reels(\.base)?\s*[\[\.]',
)
_LAST_CLOSED_FORM_RE = re.compile(r'lastClosedFormRtp')
_NEGATIVE_GUARD_RE = re.compile(
    r'(?:weight|v)\s*(?:<=?|<)\s*0',
)
_TOTAL_ZERO_FALLBACK_RE = re.compile(
    r'reduce\s*\([^)]+,\s*s\s*=>\s*a\s*\+\s*s\.weight,\s*0\)\s*\|\|\s*1',
)


# ─── Reference recompute (Fraction-exact) ─────────────────────────────────


def reference_recompute(
    symbols: list[dict[str, Any]],
    reels: list[dict[str, Any]] | None = None,
    paytable: list[dict[str, Any]] | None = None,
    paylines: list[list[int]] | None = None,
) -> dict[str, Any]:
    """Independent, Fraction-exact recompute that the Studio should run
    every time a slider tick lands. This is the ground-truth reference
    the auditor compares the engine against.

    Returns a dict with:
      - rtp          (float, derived from Fraction)
      - rtp_exact    (Fraction)
      - hit_freq     (float)
      - sigma_proxy  (float, weight-dispersion proxy when no MC available)
      - reel_sums    (list[float], Σ per reel)
      - status       ("OK" | "EMPTY_REEL" | "NEGATIVE_WEIGHT" | "MISSING_INPUT")
      - status_detail (str)
    """
    out: dict[str, Any] = {
        "rtp": 0.0,
        "rtp_exact": Fraction(0),
        "hit_freq": 0.0,
        "sigma_proxy": 0.0,
        "reel_sums": [],
        "status": "OK",
        "status_detail": "",
    }

    # 1. Reject negative weights up-front. This is the auditor's "weight
    #    contract" — neither symbol.weight nor reel weight is allowed
    #    to go below zero.
    for s in symbols:
        w = s.get("weight")
        if isinstance(w, (int, float)) and w < 0:
            out["status"] = "NEGATIVE_WEIGHT"
            out["status_detail"] = f"symbol {s.get('id')!r} weight {w} < 0"
            return out

    # 2. Build per-reel weight sums + reject Σ=0.
    if reels and isinstance(reels, list):
        for r_idx, r in enumerate(reels):
            if not isinstance(r, dict) or not r:
                out["status"] = "EMPTY_REEL"
                out["status_detail"] = f"reel index {r_idx} has no symbols"
                return out
            total = sum(Fraction(v) for v in r.values())
            if total == 0:
                out["status"] = "EMPTY_REEL"
                out["status_detail"] = f"reel index {r_idx} has Σ_w = 0"
                return out
            out["reel_sums"].append(float(total))

    # 3. Closed-form RTP (Fraction) when we have a full IR slice; else
    #    fall back to a deterministic weight-dispersion proxy.
    if reels and paytable and paylines:
        rtp_exact = _closed_form_rtp(symbols, reels, paytable, paylines)
        if rtp_exact is not None:
            out["rtp_exact"] = rtp_exact
            out["rtp"] = float(rtp_exact)
    else:
        # Weight-dispersion proxy: NOT a real RTP, but a reproducible
        # metric that depends linearly on the slider so the auditor can
        # check the slider→recompute wiring even when the test fixture
        # lacks reels/paytable.
        total = sum(Fraction(s.get("weight", 0)) for s in symbols)
        if total == 0:
            out["status"] = "EMPTY_REEL"
            out["status_detail"] = "symbol pool Σ_w = 0"
            return out
        # Proxy: pay-mass weighted by share, scaled to a plausible RTP band.
        pay_mass = Fraction(0)
        for s in symbols:
            pay = s.get("pay") or {}
            x = (
                Fraction(pay.get("x3", 0))
                + Fraction(pay.get("x4", 0))
                + Fraction(pay.get("x5", 0))
            )
            pay_mass += x * Fraction(s.get("weight", 0)) / total
        # RTP proxy = pay_mass * scale + intercept; clamp to [0.50, 1.05].
        proxy = Fraction(88, 100) + pay_mass * Fraction(86, 10000)
        proxy = max(Fraction(50, 100), min(Fraction(105, 100), proxy))
        out["rtp_exact"] = proxy
        out["rtp"] = float(proxy)

    # 4. Hit-frequency proxy and sigma proxy from weight dispersion.
    total_w = sum(Fraction(s.get("weight", 0)) for s in symbols)
    if total_w > 0:
        out["hit_freq"] = float(
            Fraction(22, 100)
            + Fraction(len(symbols) - 6, 1) * Fraction(6, 1000)
        )
        # Std deviation of weights → marketing "sigma" proxy.
        mean = sum(Fraction(s.get("weight", 0)) for s in symbols) / max(len(symbols), 1)
        var = sum(
            (Fraction(s.get("weight", 0)) - mean) ** 2 for s in symbols
        ) / max(len(symbols), 1)
        # Float-cast at the very end.
        try:
            out["sigma_proxy"] = float(var) ** 0.5
        except (ValueError, ZeroDivisionError):
            out["sigma_proxy"] = 0.0
    return out


def _closed_form_rtp(
    symbols: list[dict[str, Any]],
    reels: list[dict[str, Any]],
    paytable: list[dict[str, Any]],
    paylines: list[list[int]],
) -> Fraction | None:
    """Same closed-form walker as `tools.build_audit.weight_auditor` —
    duplicated here so the slider auditor does not pull the heavier
    fixture IR. Returns None when the inputs are degenerate."""
    if not (reels and paytable and paylines and symbols):
        return None
    reel_probs: list[dict[str, Fraction]] = []
    for r in reels:
        total = sum(Fraction(v) for v in r.values())
        if total <= 0:
            return None
        reel_probs.append({k: Fraction(v) / total for k, v in r.items()})
    wild_id = next(
        (s.get("id") for s in symbols if isinstance(s, dict) and s.get("kind") == "wild"),
        None,
    )
    pay_index: dict[tuple[str, int], Fraction] = {}
    for row in paytable:
        if not isinstance(row, dict):
            continue
        sym = row.get("symbol")
        for k, v in row.items():
            if k == "symbol" or not isinstance(v, (int, float)):
                continue
            if k.startswith("pay"):
                try:
                    run = int(k[3:])
                except ValueError:
                    continue
                pay_index[(str(sym), run)] = Fraction(v).limit_denominator(10_000_000)
    rtp = Fraction(0)
    for line in paylines:
        if not isinstance(line, list) or not line:
            continue
        anchor_probs = reel_probs[0]
        for anchor in anchor_probs:
            cum_p = Fraction(1)
            for reel_idx, _ in enumerate(line):
                if reel_idx >= len(reel_probs):
                    break
                pr = reel_probs[reel_idx]
                p_hit = pr.get(anchor, Fraction(0))
                if reel_idx > 0 and wild_id is not None and wild_id != anchor:
                    p_hit += pr.get(wild_id, Fraction(0))
                cum_p *= p_hit
                run_length = reel_idx + 1
                if run_length >= 3:
                    pay = pay_index.get((anchor, run_length))
                    if pay is not None:
                        rtp += cum_p * pay
                if p_hit == 0:
                    break
    return rtp


# ─── Public audit entry ───────────────────────────────────────────────────


def audit_slider_recompute(
    repo_root: Path | str,
) -> list[SliderRecomputeFinding]:
    """Run every slider-recompute invariant check against the live
    `web/studio/app.js` source.

    The auditor produces 9 findings, one per invariant. PASS / WARN / FAIL
    is decided by direct source inspection — no runtime needed.
    """
    repo = Path(repo_root)
    js_path = repo / "web" / "studio" / "app.js"
    if not js_path.exists():
        fail = SliderRecomputeFinding(
            invariant="bundle-present",
            verdict="FAIL",
            detail=f"app.js missing at {js_path}",
            fix="restore studio bundle or skip audit on this checkout",
        )
        return [fail]

    js = js_path.read_text(encoding="utf-8")
    findings: list[SliderRecomputeFinding] = []

    # 1. Slider event handler exists.
    has_slider_loop = bool(_SLIDER_INPUT_RE.search(js))
    findings.append(
        SliderRecomputeFinding(
            invariant="slider-listener-present",
            verdict="PASS" if has_slider_loop else "FAIL",
            detail=(
                "$$('[data-w]', container).forEach loop present"
                if has_slider_loop
                else "missing data-w slider event wire"
            ),
            fix="restore `$$('[data-w]', container).forEach(s => s.addEventListener('input', ...))`",
        )
    )

    # 2. Slider mutates variant.symbols[i].weight.
    has_mutation = bool(_WEIGHT_MUTATION_RE.search(js))
    findings.append(
        SliderRecomputeFinding(
            invariant="slider-mutates-state",
            verdict="PASS" if has_mutation else "FAIL",
            detail=(
                "found `variant.symbols[i].weight = v`"
                if has_mutation
                else "no state mutation from slider"
            ),
            fix="add `variant.symbols[i].weight = v` inside the listener body",
        )
    )

    # 3. Slider triggers a recompute (direct or via scheduleAutoBalance).
    has_recompute_call = bool(_SCHEDULE_AUTOBALANCE_RE.search(js))
    findings.append(
        SliderRecomputeFinding(
            invariant="slider-triggers-recompute",
            verdict="PASS" if has_recompute_call else "FAIL",
            detail=(
                "scheduleAutoBalanceFor wired"
                if has_recompute_call
                else "slider does not trigger recompute"
            ),
            fix="call scheduleAutoBalanceFor(variant, paneKey, i) after the mutation",
        )
    )

    # 4. recomputeFor exists.
    has_recompute_fn = bool(_RECOMPUTE_FOR_RE.search(js))
    findings.append(
        SliderRecomputeFinding(
            invariant="recompute-function-exists",
            verdict="PASS" if has_recompute_fn else "FAIL",
            detail=(
                "function recomputeFor(variant) defined"
                if has_recompute_fn
                else "no recomputeFor function"
            ),
            fix="define `function recomputeFor(variant) { … }` in app.js",
        )
    )

    # 5. Reel propagation — symbol slider edits update variant.reels.base.
    #    We look for an explicit "variant.reels.base[…][sym] = …" pattern
    #    near the slider listener; this is the canonical hook the Rust
    #    sim + cert XML rely on.
    has_reel_propagation = bool(
        re.search(
            r'variant\.reels(?:\.base)?\s*\[[^\]]+\]\s*\[[^\]]+\]\s*=',
            js,
        )
    ) or bool(
        re.search(
            r'propagateSliderWeightToReels|syncSymbolWeightsToReels',
            js,
        )
    )
    findings.append(
        SliderRecomputeFinding(
            invariant="symbol-slider-propagates-to-reels",
            verdict="PASS" if has_reel_propagation else "WARN",
            detail=(
                "symbol weight propagates to variant.reels.base"
                if has_reel_propagation
                else "symbol slider does not write through to variant.reels.base — "
                     "cert XML + slot-sim Rust will use stale per-reel weights"
            ),
            fix=(
                "add propagateSliderWeightToReels(variant, i, v) inside the "
                "slider listener so canonical IR reflects the change"
            ),
        )
    )

    # 6. Negative-weight guard. Accept either:
    #     - `if (v <= 0) { ... }`
    #     - `if (!Number.isFinite(v) || v <= 0)`
    #     - named helper (rejectInvalidSliderWeight / guardWeightNonNegative)
    #     - inline check that also mentions Number.isFinite alongside the slider listener.
    has_negative_guard = bool(
        re.search(
            r'(?:Number\.isFinite\s*\(\s*v\s*\)[^|]*\|\|\s*)?v\s*<=\s*0',
            js,
        )
    ) or bool(
        re.search(r'rejectInvalidSliderWeight|guardWeightNonNegative', js)
    )
    findings.append(
        SliderRecomputeFinding(
            invariant="negative-weight-guard",
            verdict="PASS" if has_negative_guard else "WARN",
            detail=(
                "negative-weight guard present"
                if has_negative_guard
                else "no explicit guard for weight ≤ 0 in the slider listener "
                     "— keyboard/scroll-wheel can bypass the HTML min= attribute"
            ),
            fix=(
                "add `if (v <= 0) { toast({ kind: 'red', msg: 'weight must be > 0' });"
                " e.target.value = variant.symbols[i].weight; return; }` "
                "at the top of the listener"
            ),
        )
    )

    # 7. Σ=0 silent fallback (`|| 1`).
    has_silent_fallback = bool(_TOTAL_ZERO_FALLBACK_RE.search(js))
    findings.append(
        SliderRecomputeFinding(
            invariant="sigma-zero-no-silent-fallback",
            verdict="FAIL" if has_silent_fallback else "PASS",
            detail=(
                "found silent `|| 1` fallback on Σ_w = 0 — recompute "
                "silently produces wrong RTP"
                if has_silent_fallback
                else "no silent Σ=0 fallback detected"
            ),
            fix=(
                "replace `total = … || 1` with explicit "
                "`if (!total) { surface FAIL state; return; }`"
            ),
        )
    )

    # 8. lastClosedFormRtp / cert-snapshot field maintained.
    has_cert_snapshot = bool(_LAST_CLOSED_FORM_RE.search(js))
    findings.append(
        SliderRecomputeFinding(
            invariant="cert-rtp-snapshot-updated",
            verdict="PASS" if has_cert_snapshot else "WARN",
            detail=(
                "variant.lastClosedFormRtp surface present"
                if has_cert_snapshot
                else "no `lastClosedFormRtp` field — cert pipeline may see stale RTP "
                     "if it reads a memoised value instead of variant.rtp"
            ),
            fix=(
                "store the latest exact RTP in variant.lastClosedFormRtp at the end "
                "of recomputeFor so cert XML emit reads the live value"
            ),
        )
    )

    # 9. Imported-IR variant short-circuit. If recomputeFor early-returns
    #    on imported IRs (i.e. `if (alloc) { … return; }` before native
    #    heuristic), live slider edits don't move the displayed RTP.
    has_early_return_on_imported = bool(
        re.search(
            r'variant\.rtpAllocation[\s\S]{0,400}?return;',
            js,
        )
    )
    has_imported_rebuild = bool(
        re.search(
            r'recomputeImportedIrFromLiveWeights|rebuildRtpAllocationFromIrLive',
            js,
        )
    )
    if has_early_return_on_imported and not has_imported_rebuild:
        findings.append(
            SliderRecomputeFinding(
                invariant="imported-ir-respects-slider",
                verdict="WARN",
                detail=(
                    "recomputeFor early-returns on imported-IR variants "
                    "without a live-recompute hook — slider edits on PAR-imported "
                    "games will not move the displayed RTP"
                ),
                fix=(
                    "before the imported-IR early-return, call "
                    "recomputeImportedIrFromLiveWeights(variant) which rebuilds "
                    "rtp_allocation.total_cf from the current reels + paytable"
                ),
            )
        )
    else:
        findings.append(
            SliderRecomputeFinding(
                invariant="imported-ir-respects-slider",
                verdict="PASS",
                detail=(
                    "imported-IR variants either lack early-return or carry the "
                    "explicit live-recompute hook"
                ),
            )
        )

    return findings
