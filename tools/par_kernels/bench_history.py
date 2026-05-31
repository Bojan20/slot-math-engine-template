"""SLOT-MATH bench-history — diff two `batch --bench` JSON payloads.

Consumes the structured JSON emitted by `slot-math batch --bench <path>`
and produces a regulator-readable regression report:

  - per-game RTP delta (composer + MC)
  - per-game throughput delta (rounds_per_sec)
  - new games / removed games
  - convergence pass/fail flips
  - overall portfolio gate transition

Designed for PR comments and bench-history pinning. Schema-stable so
older baselines parse without migration up through schema_version 1.x.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class GameDiff:
    """Per-game regression deltas (current minus baseline)."""
    game: str
    variant: str
    shape: str
    target_rtp: float | None = None
    composer_delta_bps_curr: float | None = None
    composer_delta_bps_base: float | None = None
    composer_drift_bps: float | None = None     # curr - base
    mc_rtp_curr: float | None = None
    mc_rtp_base: float | None = None
    mc_drift_bps: float | None = None
    rounds_per_sec_curr: float | None = None
    rounds_per_sec_base: float | None = None
    speed_ratio: float | None = None            # curr / base
    pass_curr: bool | None = None
    pass_base: bool | None = None
    pass_flipped: bool = False
    notes: list[str] = field(default_factory=list)


@dataclass
class PortfolioDiff:
    """Aggregate diff across two portfolio sweep runs."""
    current_generated_at: str
    baseline_generated_at: str
    current_overall_ok: bool
    baseline_overall_ok: bool
    games: list[GameDiff] = field(default_factory=list)
    new_games: list[str] = field(default_factory=list)
    removed_games: list[str] = field(default_factory=list)
    config_diff: dict[str, tuple[Any, Any]] = field(default_factory=dict)

    @property
    def overall_pass_flipped(self) -> bool:
        return self.current_overall_ok != self.baseline_overall_ok

    @property
    def has_regression(self) -> bool:
        """Any pass→fail flip OR composer drift > 10 bps OR speed -20%+."""
        if self.overall_pass_flipped and not self.current_overall_ok:
            return True
        for g in self.games:
            if g.pass_flipped and g.pass_curr is False:
                return True
            if g.composer_drift_bps is not None and abs(g.composer_drift_bps) > 10.0:
                return True
            if g.speed_ratio is not None and g.speed_ratio < 0.80:
                return True
        return False


def load_bench(path: Path | str) -> dict:
    """Read + parse a bench JSON file. Accepts schema_version 1.x."""
    p = Path(path)
    data = json.loads(p.read_text())
    sv = data.get("schema_version", "")
    if not sv.startswith("1."):
        raise ValueError(f"unsupported bench schema_version: {sv!r}")
    return data


def diff_bench(current: dict, baseline: dict) -> PortfolioDiff:
    """Compute per-game and aggregate diff (current minus baseline)."""
    diff = PortfolioDiff(
        current_generated_at=current.get("generated_at", ""),
        baseline_generated_at=baseline.get("generated_at", ""),
        current_overall_ok=bool(current.get("summary", {}).get("overall_ok", False)),
        baseline_overall_ok=bool(baseline.get("summary", {}).get("overall_ok", False)),
    )
    # Config diff
    c_cfg = current.get("config", {})
    b_cfg = baseline.get("config", {})
    for k in set(c_cfg) | set(b_cfg):
        if c_cfg.get(k) != b_cfg.get(k):
            diff.config_diff[k] = (b_cfg.get(k), c_cfg.get(k))

    # Index games by (game, variant)
    def _key(g: dict) -> str:
        return f"{g['game']}/{g['variant']}"

    base_by_key = {_key(g): g for g in baseline.get("games", [])}
    curr_by_key = {_key(g): g for g in current.get("games", [])}

    diff.new_games = sorted(set(curr_by_key) - set(base_by_key))
    diff.removed_games = sorted(set(base_by_key) - set(curr_by_key))

    for key in sorted(set(curr_by_key) & set(base_by_key)):
        c = curr_by_key[key]
        b = base_by_key[key]
        gd = GameDiff(
            game=c["game"], variant=c["variant"], shape=c.get("shape", "?"),
            target_rtp=c.get("target_rtp"),
            composer_delta_bps_curr=c.get("composer_delta_bps"),
            composer_delta_bps_base=b.get("composer_delta_bps"),
            mc_rtp_curr=(c.get("mc") or {}).get("rtp"),
            mc_rtp_base=(b.get("mc") or {}).get("rtp"),
            rounds_per_sec_curr=(c.get("mc") or {}).get("rounds_per_sec"),
            rounds_per_sec_base=(b.get("mc") or {}).get("rounds_per_sec"),
            pass_curr=c.get("overall_ok"),
            pass_base=b.get("overall_ok"),
        )
        # Drifts
        if (gd.composer_delta_bps_curr is not None
                and gd.composer_delta_bps_base is not None):
            gd.composer_drift_bps = (
                gd.composer_delta_bps_curr - gd.composer_delta_bps_base
            )
        if gd.mc_rtp_curr is not None and gd.mc_rtp_base is not None:
            gd.mc_drift_bps = (gd.mc_rtp_curr - gd.mc_rtp_base) * 10000.0
        if (gd.rounds_per_sec_curr and gd.rounds_per_sec_base
                and gd.rounds_per_sec_base > 0):
            gd.speed_ratio = gd.rounds_per_sec_curr / gd.rounds_per_sec_base
        gd.pass_flipped = (gd.pass_curr != gd.pass_base)
        if gd.pass_flipped:
            gd.notes.append(
                f"pass flipped: base={'✅' if gd.pass_base else '🔴'} → "
                f"curr={'✅' if gd.pass_curr else '🔴'}"
            )
        diff.games.append(gd)

    return diff


def format_diff_markdown(diff: PortfolioDiff, *, comment_header: bool = True) -> str:
    """Render a portfolio diff as a regulator-readable Markdown block."""
    lines = []
    overall_emoji = "✅" if diff.current_overall_ok else "🔴"
    regression_emoji = "⚠️ REGRESSION" if diff.has_regression else "✅ no regression"
    if comment_header:
        lines += [
            f"## Portfolio Sweep — diff vs baseline {overall_emoji}",
            "",
            f"**Status:** {regression_emoji}  ",
            f"**Current run:** `{diff.current_generated_at or '—'}`  ",
            f"**Baseline run:** `{diff.baseline_generated_at or '—'}`",
            "",
        ]

    if diff.overall_pass_flipped:
        if diff.current_overall_ok:
            lines += ["> 🟢 Overall portfolio gate flipped **🔴 → ✅** (recovery).", ""]
        else:
            lines += ["> 🔴 Overall portfolio gate flipped **✅ → 🔴** (regression).", ""]

    if diff.config_diff:
        lines += ["### Config changes", "",
                  "| Key | Baseline | Current |",
                  "|---|---|---|"]
        for k, (b, c) in sorted(diff.config_diff.items()):
            lines.append(f"| `{k}` | `{b}` | `{c}` |")
        lines.append("")

    if diff.new_games:
        lines += ["### New games (added since baseline)", "",
                  *(f"- `{g}`" for g in diff.new_games), ""]
    if diff.removed_games:
        lines += ["### Removed games (gone since baseline)", "",
                  *(f"- `{g}`" for g in diff.removed_games), ""]

    if diff.games:
        lines += ["### Per-game deltas", "",
                  "| Game | Variant | Shape | Composer Δ (curr) | "
                  "Composer drift | MC Δ (curr) | MC drift | Speed | Pass flip |",
                  "|---|---|---|---:|---:|---:|---:|---:|:---:|"]
        for g in diff.games:
            comp_curr = (f"{g.composer_delta_bps_curr:+.2f} bps"
                         if g.composer_delta_bps_curr is not None else "—")
            comp_drift = (f"{g.composer_drift_bps:+.2f} bps"
                          if g.composer_drift_bps is not None else "—")
            mc_curr = (f"{g.mc_rtp_curr*100:.2f}%"
                       if g.mc_rtp_curr is not None else "—")
            mc_drift = (f"{g.mc_drift_bps:+.2f} bps"
                        if g.mc_drift_bps is not None else "—")
            speed = (f"×{g.speed_ratio:.2f}" if g.speed_ratio is not None else "—")
            flip = ("⚠️" if g.pass_flipped else "")
            lines.append(
                f"| {g.game} | {g.variant} | `{g.shape}` | {comp_curr} | "
                f"{comp_drift} | {mc_curr} | {mc_drift} | {speed} | {flip} |"
            )
        lines.append("")

    if not diff.has_regression and not diff.overall_pass_flipped \
            and not diff.new_games and not diff.removed_games \
            and not diff.config_diff:
        lines += ["_All games converge identically to baseline within sampling._", ""]

    return "\n".join(lines)


# ───────── CLI integration ─────────

def cmd_bench_diff(args) -> int:
    current = load_bench(args.current)
    baseline = load_bench(args.baseline)
    diff = diff_bench(current, baseline)
    md = format_diff_markdown(diff)
    if args.out:
        Path(args.out).write_text(md)
    else:
        print(md)
    # Exit 1 on regression (CI gate behavior)
    return 1 if (diff.has_regression and args.fail_on_regression) else 0
