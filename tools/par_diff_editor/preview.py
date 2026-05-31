"""SLOT-MATH Faza 6.3 — PAR diff editor preview backend.

Pure computation — no network I/O here. Studio calls compute_preview_diff()
with current PAR + edited PAR, gets back per-metric delta plus a
fast-feedback MC summary.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PreviewRequest:
    """One PAR edit preview request."""
    game_id: str
    current_par: dict[str, Any]    # currently-live canonical PAR
    edited_par: dict[str, Any]     # designer's edited draft
    fast_feedback_spins: int = 1_000_000  # T1-equivalent


@dataclass
class PreviewResponse:
    """Per-metric delta + MC summary."""
    game_id: str
    metric_deltas: dict[str, float] = field(default_factory=dict)
    rtp_old: float = 0.0
    rtp_new: float = 0.0
    hit_freq_old: float = 0.0
    hit_freq_new: float = 0.0
    max_win_old: float = 0.0
    max_win_new: float = 0.0
    spins_simulated: int = 0
    warnings: list[str] = field(default_factory=list)


def _safe_get(d: dict, *path: str, default: Any = 0.0) -> Any:
    cur = d
    for k in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k, default)
    return cur


def diff_metrics(current: dict[str, Any], edited: dict[str, Any]) -> dict[str, float]:
    """Compute per-metric delta (edited - current) for the headline numbers."""
    out: dict[str, float] = {}
    out["rtp_total"] = (
        float(_safe_get(edited, "rtp", "rtp_total", default=0.0))
        - float(_safe_get(current, "rtp", "rtp_total", default=0.0))
    )
    out["base_game"] = (
        float(_safe_get(edited, "rtp", "base_game", default=0.0))
        - float(_safe_get(current, "rtp", "base_game", default=0.0))
    )
    out["free_spins"] = (
        float(_safe_get(edited, "rtp", "free_spins", default=0.0))
        - float(_safe_get(current, "rtp", "free_spins", default=0.0))
    )
    out["hit_freq"] = (
        float(_safe_get(edited, "limits", "hit_freq_target", default=0.0))
        - float(_safe_get(current, "limits", "hit_freq_target", default=0.0))
    )
    out["max_win_x"] = (
        float(_safe_get(edited, "limits", "max_win_x", default=0.0))
        - float(_safe_get(current, "limits", "max_win_x", default=0.0))
    )
    out["variance"] = (
        float(_safe_get(edited, "rtp", "variance", default=0.0))
        - float(_safe_get(current, "rtp", "variance", default=0.0))
    )
    return out


def _shallow_validation(par: dict[str, Any]) -> list[str]:
    """Quick sanity check — return warnings list (not errors, editor is permissive)."""
    warnings: list[str] = []
    rtp = float(_safe_get(par, "rtp", "rtp_total", default=0.96))
    if not 0.50 <= rtp <= 0.99:
        warnings.append(f"rtp_total {rtp:.4f} out of typical [0.50, 0.99] range")
    hf = float(_safe_get(par, "limits", "hit_freq_target", default=0.25))
    if not 0.05 <= hf <= 0.60:
        warnings.append(f"hit_freq_target {hf:.4f} out of typical [0.05, 0.60] range")
    max_win = float(_safe_get(par, "limits", "max_win_x", default=5000.0))
    if max_win > 50_000:
        warnings.append(f"max_win_x {max_win} > 50000 — extreme; verify intentional")
    return warnings


def compute_preview_diff(request: PreviewRequest) -> PreviewResponse:
    """Build preview response from a request — synchronous, deterministic.

    Note: real MC sweep is run by the orchestrator (Faza 3) — this preview
    only computes declared-value deltas for fast feedback. Studio shows
    "headline impact" while T1 MC runs async in the background.
    """
    deltas = diff_metrics(request.current_par, request.edited_par)
    warns = _shallow_validation(request.edited_par)

    return PreviewResponse(
        game_id=request.game_id,
        metric_deltas=deltas,
        rtp_old=float(_safe_get(request.current_par, "rtp", "rtp_total", default=0.0)),
        rtp_new=float(_safe_get(request.edited_par, "rtp", "rtp_total", default=0.0)),
        hit_freq_old=float(_safe_get(request.current_par, "limits", "hit_freq_target", default=0.0)),
        hit_freq_new=float(_safe_get(request.edited_par, "limits", "hit_freq_target", default=0.0)),
        max_win_old=float(_safe_get(request.current_par, "limits", "max_win_x", default=0.0)),
        max_win_new=float(_safe_get(request.edited_par, "limits", "max_win_x", default=0.0)),
        spins_simulated=0,  # set by orchestrator when MC finishes
        warnings=warns,
    )
