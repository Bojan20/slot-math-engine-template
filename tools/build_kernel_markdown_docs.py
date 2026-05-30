#!/usr/bin/env python3
"""W244 wave 69 — per-kernel Markdown documentation generator.

Generates `docs/kernels/{kernel}.md` — auditor-friendly Markdown sa:
  • Industry pattern paragraph (puni opis)
  • Module path + Merkle root
  • Closed-form formula (LaTeX inline math, GitHub renders by default)
  • Acceptance fixture table sa RTP rezultatima

Plus `docs/kernels/README.md` index sa linkovima.

Auditor printa .md kao PDF iz GitHub-a ili u VS Code preview za pitch.
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ACCEPT = REPO / "reports" / "acceptance"
OUT_DIR = REPO / "docs" / "kernels"
OUT_DIR.mkdir(parents=True, exist_ok=True)


SKIP_FILES = {
    "DONE_UNIVERSAL_CLOSURE_KERNEL.json",
    "RUST_PYTHON_PARITY_KERNEL.json",
    "SHOWCASE_GAME_KERNEL.json",
}

# Closed-form formulas in LaTeX (per kernel, hand-curated from W244 docs)
KERNEL_FORMULAS: dict[str, str] = {
    "both_ways":
        r"$\\text{RTP} = R_{\\text{LTR}} \\cdot (1 + s)$"
        r" where $s$ is the line-pay share (typically 0.5-1.0)",
    "buy_feature":
        r"$\\text{buy\\_rtp} = \\frac{E[\\text{bonus pay}]}"
        r"{\\text{buy cost}}$, subject to UKGC RTS 13C"
        r" $|\\text{buy\\_rtp} - \\text{base\\_rtp}| \\le 0.5\\text{pp}$",
    "cascade":
        r"$\\text{RTP} = p_0 \\cdot E[\\text{pay}] \\cdot "
        r"\\sum_{k=0}^{K} p^k \\cdot m_k$"
        r" — bounded geometric chain (max chain length $K$)",
    "charge_meter":
        r"$\\text{RTP}_{\\text{tier}} = \\frac{a_t}{\\tau_t / \\lambda}$"
        r" per Wald's identity, where $\\lambda$ = expected"
        r" charge per spin, $\\tau_t$ = tier threshold, $a_t$ = award",
    "cluster_pays":
        r"$E[\\text{pay}] = \\sum_{s} \\sum_{n} P[s, n] \\cdot v_s(n)$"
        r" — sum over symbol $s$ and cluster size $n$",
    "crash_kernel":
        r"$P[X < m] = 1 - \\frac{1-h}{m}$"
        r" (Pareto with house edge $h$); $\\text{RTP} = 1 - h$",
    "expanding_symbol":
        r"$E[\\text{reels expanded}] = N_r \\cdot "
        r"(1-(1-p)^{N_{rows}})$"
        r" — binomial reel expansion probability",
    "money_collect":
        r"Markov DP over (respins\\_left, cells\\_filled);"
        r" $E[\\text{episode}] = \\sum_{\\text{states}} P \\cdot v$",
    "must_hit_by":
        r"$\\text{RTP}_{\\text{pot}} = c + "
        r"\\frac{\\ln(M/s)}{\\ln(1+c/M)} \\cdot \\text{seed share}$"
        r" — conservation flow with log1p amortization",
    "pay_anywhere":
        r"$\\text{RTP} = \\sum_{k \\ge k_{\\min}} \\binom{N}{k}"
        r" p^k (1-p)^{N-k} \\cdot v_k$"
        r" — binomial PMF over $N$ cells",
    "persistent_multiplier":
        r"Exact DP w/ cap $M$:"
        r" $f(n) = \\min(\\text{multiplier},M)$",
    "pick_chain":
        r"First-order statistic over weighted picks +"
        r" Markov chain on tier transitions",
    "stacked_wilds":
        r"$P[k\\text{ wild reels}] = \\binom{N}{k} p^k (1-p)^{N-k}$"
        r" — independent reel stacks",
    "state_machine":
        r"Markov stationary $\\pi = \\pi P$ solved via"
        r" Gauss elimination w/ partial pivoting (pure-stdlib)",
    "sticky_wilds":
        r"Markov DP over (active wilds, spins remaining)",
    "ways_evaluator":
        r"$\\text{ways} = \\prod_{r=1}^{R} n_r$"
        r" where $n_r$ is the symbol multiplicity on reel $r$"
        r" (Megaways: $R=6$, max 117649)",
    "wheel":
        r"$E[\\text{award}] = \\frac{E[\\text{terminal}]}{1 - p_{\\text{again}}}$"
        r" — geometric amortisation over spin-again",
    "asymmetric_paytable":
        r"$\\text{RTP} = \\sum_s \\sum_k p_s(k) \\cdot v_s(k)$"
        r" — per-symbol cluster aggregator",
    "hold_and_win":
        r"Composed kernel: $\\text{RTP}_{\\text{H\\&W}} ="
        r" \\text{RTP}_{\\text{money\\_collect}} +"
        r" \\text{RTP}_{\\text{must\\_hit\\_by}}$",
    "both_ways_expanding_wild":
        r"Composed kernel:"
        r" $\\text{RTP} = \\text{RTP}_{\\text{both\\_ways}} +"
        r" \\text{RTP}_{\\text{expanding\\_symbol}}$",
    "inverse_solver":
        r"Newton-Raphson: $p_{n+1} = p_n -"
        r" \\frac{f(p_n) - t}{f'(p_n)}$"
        r" with bounds clamp + Bisection fallback",
    "multi_dim_inverse_solver":
        r"N-D Newton: $\\vec{p}_{n+1} = \\vec{p}_n -"
        r" J^{-1}(\\vec{p}_n) \\cdot (\\vec{f}(\\vec{p}_n) - \\vec{t})$,"
        r" $J^{-1}$ via Gauss elimination",
}


def _fmt_value(v) -> str:
    if isinstance(v, float):
        if abs(v) < 1e-4 or abs(v) > 1e6:
            return f"{v:.4e}"
        return f"{v:.6f}".rstrip("0").rstrip(".") or "0"
    if isinstance(v, bool):
        return "✓" if v else "✗"
    if v is None:
        return "—"
    if isinstance(v, (list, tuple, dict)):
        s = json.dumps(v, separators=(",", ":"))
        if len(s) > 60:
            return f"`{s[:57]}…`"
        return f"`{s}`"
    return str(v)


def _fixture_table(records: list[dict]) -> str:
    if not records:
        return "_No acceptance fixtures._\n"
    # Collect all keys present
    all_keys = []
    seen = set()
    for r in records:
        for k in r:
            if k not in seen:
                seen.add(k)
                all_keys.append(k)
    # Common keys first
    priority = ["fixture_name", "description", "rtp_contribution"]
    keys = [k for k in priority if k in seen]
    keys += [k for k in all_keys if k not in priority]
    # Cap to 6 columns for printability
    keys = keys[:6]

    header = "| " + " | ".join(keys) + " |"
    sep = "|" + "|".join("---" for _ in keys) + "|"
    rows = [header, sep]
    for r in records:
        row = "| " + " | ".join(_fmt_value(r.get(k)) for k in keys) + " |"
        rows.append(row)
    return "\n".join(rows) + "\n"


def _render_kernel_md(d: dict, file_stem: str) -> str:
    kernel = d.get("kernel", file_stem)
    module = d.get("module", "")
    industry = d.get("industry_pattern", "")
    merkle = d.get("merkle_root_sha256", "")
    fixtures_count = d.get("fixtures_count", len(d.get("records", [])))
    schema = d.get("schema", "")
    formula = KERNEL_FORMULAS.get(kernel, "_(formula in module docstring)_")
    # Un-escape LaTeX backslashes for Markdown emission
    formula = formula.replace("\\\\", "\\")

    return f"""# `{kernel}` — closed-form kernel reference

**Module:** `{module}`
**Schema:** `{schema}`
**Merkle (SHA-256):** `{merkle}`
**Fixtures:** {fixtures_count}

## Industry pattern

{industry}

## Closed-form formula

{formula}

## Acceptance fixtures

{_fixture_table(d.get("records", []))}

## Related dossiers

- [Industry First Dossier](../../reports/dossier/INDUSTRY_FIRST_DOSSIER.html)
- [Regulator Portal](../../reports/dossier/REGULATOR_PORTAL.html)
- [Closed-Form Portfolio](../../reports/dossier/CLOSED_FORM_PORTFOLIO.html)
- [Per-kernel HTML deep-dive](../../reports/dossier/kernels/{file_stem.lower()}.html)
- [PyPI package](../../packages/slot-math-kernels/)

## Verification

```bash
# Rebuild this kernel's acceptance artefakt:
python3 -m tools.build_{kernel}_kernel

# Verify Merkle root matches this document:
python3 -c "import json; print(json.load(
    open('reports/acceptance/{file_stem}.json'))['merkle_root_sha256'])"
```

---

_Source: `reports/acceptance/{file_stem}.json` · Auto-generated by_
_`tools/build_kernel_markdown_docs.py`._
"""


def _render_index(entries: list[tuple[str, dict]]) -> str:
    lines = [
        "# W244 kernel reference — Markdown index",
        "",
        "Per-kernel auditor-facing Markdown documentation with LaTeX "
        "math formulas (GitHub renders inline `$…$` by default).",
        "",
        f"Total kernels documented: **{len(entries)}**",
        "",
        "| Kernel | Industry pattern (preview) | Fixtures | Merkle |",
        "|---|---|---:|---|",
    ]
    for stem, d in sorted(entries, key=lambda t: t[1].get("kernel", t[0])):
        kernel = d.get("kernel", stem)
        ind = (d.get("industry_pattern") or "").replace("\n", " ")[:80]
        fixtures = d.get("fixtures_count", 0)
        merkle_short = (d.get("merkle_root_sha256") or "")[:12]
        lines.append(
            f"| [`{kernel}`]({stem.lower()}.md) | {ind}… | "
            f"{fixtures} | `{merkle_short}…` |"
        )
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("_Auto-generated by `tools/build_kernel_markdown_docs.py`._")
    return "\n".join(lines) + "\n"


def main() -> int:
    files = sorted(ACCEPT.glob("*_KERNEL.json"))
    files = [f for f in files if f.name not in SKIP_FILES]
    if not files:
        print("[kernel-md] no kernel JSONs found")
        return 1

    rendered = []
    for f in files:
        try:
            d = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            print(f"[kernel-md] skip {f.name}: {e}")
            continue
        stem = f.stem
        md = _render_kernel_md(d, stem)
        out = OUT_DIR / f"{stem.lower()}.md"
        out.write_text(md, encoding="utf-8")
        rendered.append((stem.lower(), d))

    index_md = _render_index(rendered)
    (OUT_DIR / "README.md").write_text(index_md, encoding="utf-8")

    print(f"[kernel-md] wrote {len(rendered)} per-kernel docs + index")
    print(f"  output dir: {OUT_DIR.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
