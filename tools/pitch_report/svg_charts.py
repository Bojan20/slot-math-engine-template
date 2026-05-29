"""W6.3 — Inline SVG bar charts (deterministic, no JS).

Tiny SVG primitive helpers. Every coordinate is rounded to 2 decimal
places so chart XML is byte-identical across machines for the same
input list. No external font, no script tags — works in headless render.
"""

from __future__ import annotations

from typing import Iterable


def _fmt(x: float) -> str:
    """Deterministic float formatter: 2 decimals, no `-0.00`."""
    s = f"{x:.2f}"
    if s == "-0.00":
        s = "0.00"
    return s


def bar_chart_rtp_delta(
    rows: list[dict],
    *,
    width: int = 720,
    height: int = 220,
    title: str = "RTP delta vs target (%)",
) -> str:
    """Horizontal bar chart of (label, delta_rtp%) pairs.

    Each `row` must have ``label`` and ``value`` (delta as a fraction).
    Bars are centred on a zero baseline; ±1% tolerance band shaded.
    """
    n = len(rows)
    if n == 0:
        return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="40"><text x="10" y="20">no data</text></svg>'

    margin_left = 140
    margin_right = 40
    margin_top = 30
    margin_bottom = 24
    plot_w = width - margin_left - margin_right
    plot_h = height - margin_top - margin_bottom
    bar_h = max(8, int(plot_h / n) - 2)
    bar_gap = 2

    # Scale: max abs delta capped to 2% so bars fill the area.
    max_abs = max(0.02, max(abs(float(r["value"])) for r in rows))
    zero_x = margin_left + plot_w / 2.0

    def x_for(v: float) -> float:
        return zero_x + (v / max_abs) * (plot_w / 2.0)

    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'role="img" aria-label="{title}">'
    )
    # Title
    parts.append(
        f'<text x="{margin_left}" y="18" font-family="monospace" '
        f'font-size="12" fill="#222">{title}</text>'
    )
    # ±1% tolerance band
    band_w = (0.01 / max_abs) * (plot_w / 2.0)
    parts.append(
        f'<rect x="{_fmt(zero_x - band_w)}" y="{margin_top}" '
        f'width="{_fmt(2 * band_w)}" height="{plot_h}" '
        f'fill="#e8f4ea" stroke="#bcd9c0" stroke-width="0.5"/>'
    )
    # Zero baseline
    parts.append(
        f'<line x1="{_fmt(zero_x)}" y1="{margin_top}" '
        f'x2="{_fmt(zero_x)}" y2="{margin_top + plot_h}" '
        f'stroke="#888" stroke-width="1"/>'
    )

    for i, row in enumerate(rows):
        v = float(row["value"])
        label = str(row.get("label", ""))
        y = margin_top + i * (bar_h + bar_gap)
        if v >= 0:
            x = zero_x
            w = max(1.0, x_for(v) - zero_x)
            colour = "#2e7d32" if abs(v) <= 0.01 else "#c62828"
        else:
            x = x_for(v)
            w = max(1.0, zero_x - x)
            colour = "#2e7d32" if abs(v) <= 0.01 else "#c62828"
        parts.append(
            f'<rect x="{_fmt(x)}" y="{y}" width="{_fmt(w)}" height="{bar_h}" '
            f'fill="{colour}"/>'
        )
        parts.append(
            f'<text x="{margin_left - 6}" y="{y + bar_h - 2}" '
            f'font-family="monospace" font-size="11" fill="#333" '
            f'text-anchor="end">{label}</text>'
        )
        # Numeric tag at end of bar
        text_x = x + w + 4 if v >= 0 else x - 4
        anchor = "start" if v >= 0 else "end"
        parts.append(
            f'<text x="{_fmt(text_x)}" y="{y + bar_h - 2}" '
            f'font-family="monospace" font-size="10" fill="#555" '
            f'text-anchor="{anchor}">{_fmt(v * 100)}%</text>'
        )

    # Axis labels
    parts.append(
        f'<text x="{margin_left}" y="{height - 6}" font-family="monospace" '
        f'font-size="10" fill="#666">−{_fmt(max_abs * 100)}%</text>'
    )
    parts.append(
        f'<text x="{_fmt(zero_x)}" y="{height - 6}" font-family="monospace" '
        f'font-size="10" fill="#666" text-anchor="middle">0%</text>'
    )
    parts.append(
        f'<text x="{margin_left + plot_w}" y="{height - 6}" '
        f'font-family="monospace" font-size="10" fill="#666" '
        f'text-anchor="end">+{_fmt(max_abs * 100)}%</text>'
    )

    parts.append('</svg>')
    return "".join(parts)


def verdict_pie_chart(
    counts: dict[str, int],
    *,
    size: int = 140,
    title: str = "Verdicts",
) -> str:
    """Tiny inline SVG pie chart (PASS/FAIL/SKIP/MISSING)."""
    total = max(1, sum(counts.values()))
    cx = size / 2
    cy = size / 2 + 8
    r = (size / 2) - 12
    colours = {
        "PASS": "#2e7d32",
        "FAIL": "#c62828",
        "SKIP": "#f9a825",
        "MISSING": "#9e9e9e",
    }
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" '
        f'height="{size + 4}" role="img" aria-label="{title}">'
    ]
    parts.append(
        f'<text x="{cx}" y="14" font-family="monospace" font-size="11" '
        f'text-anchor="middle" fill="#222">{title}</text>'
    )
    if total == 1 and sum(counts.values()) == 0:
        parts.append('</svg>')
        return "".join(parts)

    # Single slice short-circuit: render a full circle so the SVG doesn't
    # collapse to a zero-area path.
    nonzero = [(k, v) for k, v in sorted(counts.items()) if v > 0]
    if len(nonzero) == 1:
        k, _ = nonzero[0]
        parts.append(
            f'<circle cx="{_fmt(cx)}" cy="{_fmt(cy)}" r="{_fmt(r)}" '
            f'fill="{colours.get(k, "#666")}"/>'
        )
        parts.append('</svg>')
        return "".join(parts)

    import math

    angle_start = -math.pi / 2  # 12 o'clock
    for k in sorted(counts):
        n = counts[k]
        if n <= 0:
            continue
        frac = n / total
        angle_end = angle_start + frac * 2 * math.pi
        x1 = cx + r * math.cos(angle_start)
        y1 = cy + r * math.sin(angle_start)
        x2 = cx + r * math.cos(angle_end)
        y2 = cy + r * math.sin(angle_end)
        large_arc = 1 if frac > 0.5 else 0
        d = (
            f"M {_fmt(cx)},{_fmt(cy)} L {_fmt(x1)},{_fmt(y1)} "
            f"A {_fmt(r)},{_fmt(r)} 0 {large_arc} 1 {_fmt(x2)},{_fmt(y2)} Z"
        )
        parts.append(f'<path d="{d}" fill="{colours.get(k, "#666")}"/>')
        angle_start = angle_end

    parts.append('</svg>')
    return "".join(parts)
