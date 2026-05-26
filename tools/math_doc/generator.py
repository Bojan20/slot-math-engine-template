"""Per-game math doc generator implementation."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class DocSection:
    title: str
    body: str


@dataclass
class GameMathDoc:
    title: str
    swid: str | None
    vendor: str | None
    generated_at: str
    sections: list[DocSection] = field(default_factory=list)


def _meta_section(ir: dict[str, Any]) -> DocSection:
    meta = ir.get("meta") or {}
    body = [
        f"- **Name:** {meta.get('name', '—')}",
        f"- **SWID:** `{meta.get('swid', '—')}`",
        f"- **Vendor:** {meta.get('vendor', '—')}",
        f"- **Version:** {meta.get('version', '—')}",
        f"- **Target RTP:** {meta.get('target_rtp', '—')}",
        f"- **Schema version:** {meta.get('schema_version', 1)}",
    ]
    return DocSection("Meta", "\n".join(body))


def _topology_section(ir: dict[str, Any]) -> DocSection:
    topo = ir.get("topology") or {}
    ev = ir.get("evaluation") or {}
    paylines = ev.get("paylines") or ev.get("lines") or []
    body = [
        f"- **Reels:** {topo.get('reels', '—')}",
        f"- **Rows:** {topo.get('rows', '—')}",
        f"- **Paylines:** {len(paylines)}",
        f"- **Topology kind:** {topo.get('kind', '—')}",
    ]
    return DocSection("Topology", "\n".join(body))


def _paytable_section(ir: dict[str, Any]) -> DocSection:
    pt = ir.get("paytable") or []
    if not pt:
        return DocSection("Paytable", "_no paytable entries_")
    lines = ["| Combo | Pays | Scope |", "|---|---|---|"]
    for entry in pt[:50]:  # cap for huge tables
        combo = entry.get("combo") or entry.get("symbols") or []
        scope = entry.get("scope", "line")
        pay = entry.get("pays", entry.get("pay", "—"))
        lines.append(f"| `{' '.join(str(c) for c in combo)}` | "
                      f"{pay} | {scope} |")
    if len(pt) > 50:
        lines.append(f"| _… {len(pt) - 50} more rows truncated …_ |||")
    return DocSection("Paytable", "\n".join(lines))


def _features_section(ir: dict[str, Any]) -> DocSection:
    feats = ir.get("features")
    if not feats:
        return DocSection("Features", "_no features_")
    if isinstance(feats, dict):
        items = list(feats.items())
    else:
        items = [(f.get("kind") or f.get("type") or "?", f) for f in feats
                 if isinstance(f, dict)]
    body = ["| Kind | Trigger | Notes |", "|---|---|---|"]
    for kind, cfg in items:
        trigger = ""
        if isinstance(cfg, dict):
            t = cfg.get("trigger") or {}
            if isinstance(t, dict):
                trigger = f"min={t.get('min', '—')}"
        body.append(f"| `{kind}` | {trigger} | — |")
    return DocSection("Features", "\n".join(body))


def _rtp_section(ir: dict[str, Any],
                  mc_report: dict[str, Any] | None) -> DocSection:
    target = (ir.get("meta") or {}).get("target_rtp")
    if not mc_report:
        return DocSection("RTP Report", f"- **Target RTP:** {target}")
    measured = mc_report.get("rtp") or mc_report.get("measured_rtp")
    spins = mc_report.get("spins") or mc_report.get("sample_size")
    delta = None
    if isinstance(measured, (int, float)) and isinstance(target, (int, float)):
        delta = abs(float(measured) - float(target))
    body = [
        f"- **Target RTP:** {target}",
        f"- **Measured RTP:** {measured}",
        f"- **Delta:** {delta}",
        f"- **Sample size:** {spins} spins",
        f"- **Hit frequency:** {mc_report.get('hit_freq', '—')}",
        f"- **Win frequency:** {mc_report.get('win_freq', '—')}",
        f"- **Volatility:** {mc_report.get('volatility', '—')}",
    ]
    return DocSection("RTP Report", "\n".join(body))


def _notes_section(ir: dict[str, Any]) -> DocSection:
    notes = (ir.get("meta") or {}).get("notes") or []
    if not notes:
        return DocSection("Audit notes", "_none_")
    return DocSection(
        "Audit notes",
        "\n".join(f"- {n}" for n in notes),
    )


def generate_math_doc(ir: dict[str, Any],
                       mc_report: dict[str, Any] | None = None,
                       ) -> GameMathDoc:
    meta = ir.get("meta") or {}
    doc = GameMathDoc(
        title=meta.get("name") or "Slot game",
        swid=meta.get("swid"),
        vendor=meta.get("vendor"),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    doc.sections = [
        _meta_section(ir),
        _topology_section(ir),
        _rtp_section(ir, mc_report),
        _paytable_section(ir),
        _features_section(ir),
        _notes_section(ir),
    ]
    return doc


def _md_for(doc: GameMathDoc) -> str:
    out = [f"# Math Specification — {doc.title}", ""]
    out.append(f"_Generated: {doc.generated_at}_  ")
    if doc.swid:
        out.append(f"_SWID: `{doc.swid}` · Vendor: `{doc.vendor or '—'}`_")
    out.append("")
    for s in doc.sections:
        out.append(f"## {s.title}")
        out.append("")
        out.append(s.body)
        out.append("")
    return "\n".join(out) + "\n"


def emit_math_doc(doc: GameMathDoc, out_path: Path) -> Path:
    """Write the math doc to `out_path` (Markdown)."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(_md_for(doc))
    return out_path


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    ap = argparse.ArgumentParser(
        prog="slot-math-doc",
        description="W27 — generate a Markdown math specification "
                    "from an IR + optional MC report.",
    )
    ap.add_argument("ir", help="path to IR JSON")
    ap.add_argument("--mc", help="optional MC report JSON")
    ap.add_argument("--out", required=True,
                    help="output Markdown path")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    ir_path = Path(args.ir)
    if not ir_path.is_file():
        print(f"error: {ir_path} not found", file=sys.stderr)
        return 2
    ir = json.loads(ir_path.read_text())
    mc = None
    if args.mc:
        mc_p = Path(args.mc)
        if not mc_p.is_file():
            print(f"error: {mc_p} not found", file=sys.stderr)
            return 2
        mc = json.loads(mc_p.read_text())

    doc = generate_math_doc(ir, mc)
    p = emit_math_doc(doc, Path(args.out))
    if not args.quiet:
        print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
