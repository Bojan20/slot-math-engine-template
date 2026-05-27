"""W6.2 — DSL spec diff utility.

Designer-facing diff between two `MathDslSpec` instances. Returns a list
of `DiffEntry` records the studio UI / git log / sales deck can render.

Unlike a raw text diff (which is noisy because of comment/key-order
churn), this works on the semantic spec — meta, topology, symbols,
features, constraints, hints — and reports only meaningful changes.

Use cases:
  • Sales: "show me what changed between v1.0 and v1.1 of this game"
  • Compliance: "regulator asks for the math delta between
     pre-cert and post-cert IR"
  • Studio: live preview when a designer types a mutation phrase
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .spec import MathDslSpec


@dataclass
class DiffEntry:
    path: str          # dotted path: "constraints.target_rtp" / "features[+].kind"
    kind: str          # "set" | "added" | "removed" | "changed"
    before: Any
    after: Any

    @property
    def summary(self) -> str:
        if self.kind == "added":
            return f"+ {self.path} = {self.after!r}"
        if self.kind == "removed":
            return f"- {self.path} (was {self.before!r})"
        return f"  {self.path}: {self.before!r} → {self.after!r}"


def _diff_dict(a: dict, b: dict, prefix: str, out: list[DiffEntry]) -> None:
    keys = set(a) | set(b)
    for k in sorted(keys):
        path = f"{prefix}.{k}" if prefix else k
        if k not in a:
            out.append(DiffEntry(path=path, kind="added", before=None, after=b[k]))
        elif k not in b:
            out.append(DiffEntry(path=path, kind="removed", before=a[k], after=None))
        elif a[k] != b[k]:
            if isinstance(a[k], dict) and isinstance(b[k], dict):
                _diff_dict(a[k], b[k], path, out)
            else:
                out.append(DiffEntry(path=path, kind="changed",
                                     before=a[k], after=b[k]))


def diff_specs(a: MathDslSpec, b: MathDslSpec) -> list[DiffEntry]:
    """Return a list of diff entries from `a` → `b`. Stable order by path."""
    out: list[DiffEntry] = []

    # Meta
    _diff_dict(a.meta or {}, b.meta or {}, "meta", out)

    # Topology
    a_top = {
        "kind": a.topology.kind, "reels": a.topology.reels, "rows": a.topology.rows,
        "ways_cap": a.topology.ways_cap, "adjacency": a.topology.adjacency,
    }
    b_top = {
        "kind": b.topology.kind, "reels": b.topology.reels, "rows": b.topology.rows,
        "ways_cap": b.topology.ways_cap, "adjacency": b.topology.adjacency,
    }
    _diff_dict(a_top, b_top, "topology", out)

    # Symbols — compare by id
    a_ids = {s.id: s for s in a.symbols}
    b_ids = {s.id: s for s in b.symbols}
    for sid in sorted(set(a_ids) | set(b_ids)):
        a_s = a_ids.get(sid)
        b_s = b_ids.get(sid)
        if a_s is None:
            out.append(DiffEntry(f"symbols[{sid}]", "added", None, b_s.__dict__))
        elif b_s is None:
            out.append(DiffEntry(f"symbols[{sid}]", "removed", a_s.__dict__, None))
        else:
            _diff_dict(
                {k: v for k, v in a_s.__dict__.items() if v is not None},
                {k: v for k, v in b_s.__dict__.items() if v is not None},
                f"symbols[{sid}]", out,
            )

    # Features — by kind (a game has at most one of each kind in our DSL)
    a_kinds = {f.kind: f for f in a.features}
    b_kinds = {f.kind: f for f in b.features}
    for fk in sorted(set(a_kinds) | set(b_kinds)):
        a_f = a_kinds.get(fk)
        b_f = b_kinds.get(fk)
        if a_f is None:
            out.append(DiffEntry(f"features[{fk}]", "added", None, b_f.__dict__))
        elif b_f is None:
            out.append(DiffEntry(f"features[{fk}]", "removed", a_f.__dict__, None))
        else:
            _diff_dict(
                {k: v for k, v in a_f.__dict__.items() if v is not None and k != "extra"},
                {k: v for k, v in b_f.__dict__.items() if v is not None and k != "extra"},
                f"features[{fk}]", out,
            )

    # Paylines
    if a.paylines != b.paylines:
        out.append(DiffEntry("paylines", "changed",
                             before=a.paylines, after=b.paylines))

    # Constraints
    _diff_dict(a.constraints.__dict__, b.constraints.__dict__, "constraints", out)

    # Hints
    _diff_dict(a.hints or {}, b.hints or {}, "hints", out)

    return out


def render_diff(entries: list[DiffEntry]) -> str:
    """Render diff entries as human-readable text. Markdown-table-ish."""
    if not entries:
        return "(no semantic changes)\n"
    lines = ["| Change | Path | Before | After |", "|---|---|---|---|"]
    for e in entries:
        sym = {"added": "+", "removed": "-", "changed": "~", "set": "="}.get(e.kind, "?")
        before = "—" if e.before is None else str(e.before)
        after = "—" if e.after is None else str(e.after)
        # Keep cells short
        if len(before) > 80:
            before = before[:77] + "…"
        if len(after) > 80:
            after = after[:77] + "…"
        lines.append(f"| {sym} | `{e.path}` | {before} | {after} |")
    return "\n".join(lines) + "\n"
