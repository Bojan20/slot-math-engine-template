"""W6.7 — Spec → Mermaid diagram visualizer.

Given a `MathDslSpec` (or YAML text), emits a Mermaid `flowchart` text
that GitHub/GitLab/HackMD/Studio UI all render natively. Shows:

    [Topology] → [Symbols (count by kind)] → [Features] → [Constraints]
    └ Free spins / progressive / cascade nodes branch out
    └ Jurisdictions panel
    └ RTP target + volatility class as labeled edges

Output is plain Mermaid text, no external deps. Caller wraps it in
```mermaid``` fence for markdown.
"""

from __future__ import annotations

from .spec import MathDslSpec


def _kind_count(spec: MathDslSpec) -> dict[str, int]:
    counts: dict[str, int] = {}
    for s in spec.symbols:
        counts[s.kind] = counts.get(s.kind, 0) + 1
    return counts


def render_mermaid(spec: MathDslSpec) -> str:
    """Return Mermaid `flowchart TD` text for the spec."""
    lines = ["flowchart TD"]
    name = spec.meta.get("name") or "Slot Game"
    safe_name = name.replace('"', '')

    # Topology node
    top = spec.topology
    if top.kind == "rectangular":
        topo_label = f"{top.reels}x{top.rows} lines"
    elif top.kind == "variable_rows":
        rng = top.row_range_per_reel or []
        if rng:
            mn = min(r[0] for r in rng)
            mx = max(r[1] for r in rng)
            topo_label = f"variable {top.reels}r [{mn}-{mx}] ways"
        else:
            topo_label = f"variable {top.reels}r ways"
    elif top.kind == "cluster_grid":
        topo_label = f"cluster {top.reels}x{top.rows} ({top.adjacency or 'orthogonal'})"
    else:
        topo_label = top.kind
    lines.append(f'  G["{safe_name}"]:::title')
    lines.append(f'  T["Topology: {topo_label}"]:::topology')
    lines.append("  G --> T")

    # Symbol kind breakdown
    counts = _kind_count(spec)
    if counts:
        sym_lines = ", ".join(f"{k}×{v}" for k, v in sorted(counts.items()))
        lines.append(f'  S["Symbols: {sym_lines}"]:::symbols')
        lines.append("  T --> S")

    # Features
    for i, f in enumerate(spec.features):
        node = f"F{i}"
        label = f.kind
        if f.kind == "free_spins":
            extras = []
            if f.trigger_count_min is not None:
                extras.append(f"trig≥{f.trigger_count_min}")
            if f.initial_spins is not None:
                extras.append(f"{f.initial_spins} spins")
            if f.global_multiplier is not None:
                extras.append(f"x{f.global_multiplier}")
            if extras:
                label = f"free_spins ({', '.join(extras)})"
        elif f.kind == "linear_progressive":
            extras = []
            if f.pool_id:
                extras.append(f.pool_id)
            if f.contribution_x is not None:
                extras.append(f"contrib {f.contribution_x*100:.2f}%")
            if extras:
                label = f"progressive ({', '.join(extras)})"
        elif f.kind == "cascade":
            extras = []
            if f.replacement:
                extras.append(f.replacement)
            if f.max_chain:
                extras.append(f"max chain {f.max_chain}")
            if extras:
                label = f"cascade ({', '.join(extras)})"
        lines.append(f'  {node}["{label}"]:::feature')
        lines.append(f"  S --> {node}")

    # Constraints panel
    c = spec.constraints
    constr_label = (
        f"target_rtp {c.target_rtp:.4f}\\n"
        f"volatility {c.volatility_class}\\n"
        f"hit_freq {c.hit_freq_target:.3f}\\n"
        f"max_win {c.max_win_x:g}x"
    )
    lines.append(f'  C["{constr_label}"]:::constraints')
    lines.append("  G --> C")

    # Jurisdictions
    if c.jurisdictions:
        jl = ", ".join(c.jurisdictions)
        lines.append(f'  J["Jurisdictions: {jl}"]:::juris')
        lines.append("  C --> J")

    # Styling
    lines.extend([
        "  classDef title fill:#1d3557,color:#fff,stroke:#000,stroke-width:2px",
        "  classDef topology fill:#a8dadc,stroke:#1d3557",
        "  classDef symbols fill:#f1faee,stroke:#457b9d",
        "  classDef feature fill:#e63946,color:#fff,stroke:#000",
        "  classDef constraints fill:#fcbf49,stroke:#000",
        "  classDef juris fill:#90be6d,color:#fff,stroke:#000",
    ])

    return "\n".join(lines) + "\n"


def render_mermaid_fenced(spec: MathDslSpec) -> str:
    """Same as `render_mermaid` but wrapped in a ```mermaid fence."""
    return "```mermaid\n" + render_mermaid(spec) + "```\n"
