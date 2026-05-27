"""W8.3 — DSL docs generator.

Auto-generates a markdown design document from a `MathDslSpec` for
vendor handoff / sales decks / regulator submissions. Includes:

  • Game overview (name, vendor, author, theme tags)
  • Topology + symbol summary table
  • Feature catalog (with parameters)
  • RTP & volatility commitments
  • Jurisdiction matrix
  • Mermaid diagram (W6.7)
  • Lint findings (W8.2, info-level filtered out by default)
  • Constraint manifest (every value the Z3 solver will optimize to)

The output is git-friendly markdown the studio can render in the
designer portal or vendor onboarding email.
"""

from __future__ import annotations

from .spec import MathDslSpec
from .visualize import render_mermaid_fenced
from .lint import lint_spec, render_lint, filter_by_severity


_KIND_NAMES = {
    "lp": "Low pay",
    "hp": "High pay",
    "wild": "Wild",
    "scatter": "Scatter",
    "bonus": "Bonus",
    "multiplier": "Multiplier",
    "sticky": "Sticky",
    "expanding": "Expanding",
    "mystery": "Mystery",
    "transform": "Transforming",
    "chain_wild": "Chain wild",
}


def render_docs(spec: MathDslSpec, *, include_info_lint: bool = False) -> str:
    """Render the full design doc as markdown."""
    out: list[str] = []
    name = spec.meta.get("name") or "Untitled Slot"
    out.append(f"# {name}\n")

    vendor = spec.meta.get("vendor")
    author = spec.meta.get("author")
    description = spec.meta.get("description")

    if description:
        out.append(f"_{description}_\n")
    out.append("")
    out.append("| Field | Value |")
    out.append("|---|---|")
    out.append(f"| Vendor | {vendor or '—'} |")
    out.append(f"| Author | {author or '—'} |")
    if spec.meta.get("theme_tags"):
        tags = ", ".join(f"`{t}`" for t in spec.meta.get("theme_tags") or [])
        out.append(f"| Theme tags | {tags} |")
    out.append(f"| Schema version | `{spec.schema_version}` |")
    out.append("")

    # Topology
    out.append("## Topology\n")
    t = spec.topology
    out.append("| Property | Value |")
    out.append("|---|---|")
    out.append(f"| Kind | `{t.kind}` |")
    out.append(f"| Reels | {t.reels} |")
    out.append(f"| Rows | {t.rows} |")
    if t.kind == "variable_rows" and t.row_range_per_reel:
        rng_str = ", ".join(f"[{r[0]},{r[1]}]" for r in t.row_range_per_reel)
        out.append(f"| Row range per reel | {rng_str} |")
    if t.ways_cap is not None:
        out.append(f"| Ways cap | {t.ways_cap:,} |")
    if t.kind == "cluster_grid":
        out.append(f"| Adjacency | {t.adjacency or 'orthogonal'} |")
    if isinstance(spec.paylines, int):
        out.append(f"| Paylines | {spec.paylines} |")
    out.append("")

    # Symbols
    out.append("## Symbols\n")
    out.append("| ID | Name | Kind | Substitutes |")
    out.append("|---|---|---|---|")
    for s in spec.symbols:
        subs = (
            "*" if s.substitutes == "*"
            else (", ".join(s.substitutes) if isinstance(s.substitutes, list) else "—")
        )
        kind_label = _KIND_NAMES.get(s.kind, s.kind)
        out.append(f"| `{s.id}` | {s.name or s.id} | {kind_label} | {subs} |")
    out.append("")

    # Features
    out.append("## Features\n")
    if not spec.features:
        out.append("_(none declared — base game only)_\n")
    else:
        out.append("| Kind | Parameters |")
        out.append("|---|---|")
        for f in spec.features:
            params = []
            for fld in (
                "trigger_count_min", "initial_spins", "global_multiplier",
                "retrigger_spins", "max_total_spins", "respins_initial",
                "replacement", "max_chain", "pool_id", "contribution_x",
                "seed_x", "must_hit_by_x",
            ):
                v = getattr(f, fld, None)
                if v is not None:
                    params.append(f"`{fld}`={v}")
            params_text = ", ".join(params) if params else "(defaults)"
            out.append(f"| `{f.kind}` | {params_text} |")
        out.append("")

    # Constraints
    out.append("## Constraints\n")
    c = spec.constraints
    out.append("| Property | Value |")
    out.append("|---|---|")
    out.append(f"| Target RTP | **{c.target_rtp:.4f}** ({c.target_rtp*100:.2f}%) |")
    out.append(f"| RTP tolerance | ± {c.rtp_tolerance} |")
    out.append(f"| Volatility class | **{c.volatility_class}** |")
    out.append(f"| Hit frequency target | {c.hit_freq_target:.3f} ({c.hit_freq_target*100:.1f}%) |")
    out.append(f"| Max win | {c.max_win_x:,g}× |")
    out.append(f"| Win cap apply | `{c.win_cap_apply}` |")
    out.append(f"| Pay min / max | {c.pay_min} / {c.pay_max} |")
    out.append(f"| Monotonic pay ladder | {'yes' if c.pay_ladder_monotonic else 'no'} |")
    out.append("")

    # RTP allocation
    if any(v is not None for v in (
        c.rtp_alloc_base, c.rtp_alloc_free_spins,
        c.rtp_alloc_hold_and_win, c.rtp_alloc_jackpot,
    )):
        out.append("### RTP allocation\n")
        out.append("| Bucket | Share |")
        out.append("|---|---|")
        for label, val in (
            ("Base game", c.rtp_alloc_base),
            ("Free spins", c.rtp_alloc_free_spins),
            ("Hold & win", c.rtp_alloc_hold_and_win),
            ("Jackpot", c.rtp_alloc_jackpot),
        ):
            if val is not None:
                out.append(f"| {label} | {val:.4f} |")
        out.append("")

    # Jurisdictions
    out.append("## Jurisdictions\n")
    if c.jurisdictions:
        out.append(", ".join(f"`{j}`" for j in c.jurisdictions))
    else:
        out.append("_(none declared — defaults to UKGC + MGA at compile time)_")
    out.append("")

    # Hints
    if spec.hints:
        out.append("## Designer hints\n")
        out.append("| Hint | Value |")
        out.append("|---|---|")
        for k, v in sorted(spec.hints.items()):
            out.append(f"| `{k}` | {v} |")
        out.append("")

    # Diagram
    out.append("## Architecture diagram\n")
    out.append(render_mermaid_fenced(spec))

    # Lint findings
    findings = lint_spec(spec)
    if not include_info_lint:
        findings = [f for f in findings if f.severity != "info"]
    if findings:
        out.append("## Lint findings\n")
        out.append(render_lint(findings))

    out.append("---")
    out.append(
        "_Generated by `tools.math_dsl.docs.render_docs` "
        "(CORTEX Slot Math Engine v1.0.0)_"
    )
    return "\n".join(out) + "\n"
