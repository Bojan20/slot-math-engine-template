"""PHASE 32 — Type checker kernel."""

from __future__ import annotations

from dataclasses import dataclass, asdict, field
from typing import Any


_VALID_PAYTABLE_SCOPES = ("line", "scatter", "cluster", "ways", "pattern")


@dataclass(frozen=True)
class TypeIssue:
    path: str            # dot-path into IR (e.g. "paytable[3].pays")
    kind: str            # "missing" / "wrong_type" / "out_of_range" / "enum"
    message: str


@dataclass
class TypeReport:
    schema_version: str = "urn:slotmath:type-system:v1"
    ok: bool = True
    issues: list[TypeIssue] = field(default_factory=list)

    def add(self, path: str, kind: str, message: str) -> None:
        self.ok = False
        self.issues.append(TypeIssue(path=path, kind=kind, message=message))


def type_check_ir(ir: Any) -> TypeReport:
    """Strict IR type check. Always returns a TypeReport (never raises)."""
    report = TypeReport()
    if not isinstance(ir, dict):
        report.add("", "wrong_type", f"IR root must be dict; got {type(ir).__name__}")
        return report

    # ── meta
    meta = ir.get("meta")
    if not isinstance(meta, dict):
        report.add("meta", "missing", "must be dict")
    else:
        if "name" not in meta or not isinstance(meta["name"], str):
            report.add("meta.name", "missing", "must be string")
        rtp = meta.get("target_rtp")
        if not isinstance(rtp, (int, float)):
            report.add("meta.target_rtp", "missing", "must be number")
        elif not 0 < rtp <= 1.1:
            report.add("meta.target_rtp", "out_of_range",
                        f"{rtp} outside (0, 1.1]")

    # ── topology
    topo = ir.get("topology")
    if not isinstance(topo, dict):
        report.add("topology", "missing", "must be dict")
    else:
        for k in ("reels", "rows"):
            v = topo.get(k)
            if not isinstance(v, int):
                report.add(f"topology.{k}", "wrong_type",
                            f"must be int; got {type(v).__name__}")
            elif v < 1:
                report.add(f"topology.{k}", "out_of_range", f"{v} < 1")

    # ── paytable
    paytable = ir.get("paytable")
    if not isinstance(paytable, list):
        report.add("paytable", "wrong_type", "must be list")
    else:
        for i, entry in enumerate(paytable):
            base = f"paytable[{i}]"
            if not isinstance(entry, dict):
                report.add(base, "wrong_type", "must be dict")
                continue
            combo = entry.get("combo")
            if not isinstance(combo, list):
                report.add(f"{base}.combo", "missing", "must be list")
            else:
                for j, sym in enumerate(combo):
                    if not isinstance(sym, str):
                        report.add(f"{base}.combo[{j}]", "wrong_type",
                                    f"must be string; got {type(sym).__name__}")
            pay = entry.get("pays", entry.get("pay"))
            if not isinstance(pay, (int, float)):
                report.add(f"{base}.pays", "missing", "must be number")
            elif pay < 0:
                report.add(f"{base}.pays", "out_of_range", f"{pay} < 0")
            scope = entry.get("scope")
            if scope is not None and scope not in _VALID_PAYTABLE_SCOPES:
                report.add(f"{base}.scope", "enum",
                            f"{scope!r} not in {_VALID_PAYTABLE_SCOPES}")

    # ── reels
    reels = ir.get("reels")
    if reels is not None and not isinstance(reels, dict):
        report.add("reels", "wrong_type", "must be dict if present")
    elif isinstance(reels, dict):
        base = reels.get("base")
        if base is not None and not isinstance(base, list):
            report.add("reels.base", "wrong_type", "must be list if present")
        elif isinstance(base, list):
            for s, set_obj in enumerate(base):
                if not isinstance(set_obj, dict):
                    report.add(f"reels.base[{s}]", "wrong_type", "must be dict")
                    continue
                reels_list = set_obj.get("reels")
                if not isinstance(reels_list, list):
                    report.add(f"reels.base[{s}].reels", "missing", "must be list")
                    continue
                for r_idx, reel in enumerate(reels_list):
                    if not isinstance(reel, list):
                        report.add(
                            f"reels.base[{s}].reels[{r_idx}]",
                            "wrong_type", "must be list",
                        )
                        continue
                    for c_idx, cell in enumerate(reel):
                        path = f"reels.base[{s}].reels[{r_idx}][{c_idx}]"
                        if isinstance(cell, dict):
                            sym = cell.get("symbol")
                            if not isinstance(sym, str):
                                report.add(f"{path}.symbol", "missing",
                                            "must be string")
                            w = cell.get("weight", 1)
                            if not isinstance(w, int):
                                report.add(f"{path}.weight", "wrong_type",
                                            f"must be int; got {type(w).__name__}")
                            elif w < 1:
                                report.add(f"{path}.weight", "out_of_range",
                                            f"{w} < 1")
                        elif not isinstance(cell, str):
                            report.add(path, "wrong_type",
                                        "must be dict or string")

    # ── features (optional)
    features = ir.get("features")
    if features is not None:
        if not isinstance(features, list):
            report.add("features", "wrong_type", "must be list if present")
        else:
            for i, feat in enumerate(features):
                if not isinstance(feat, dict):
                    report.add(f"features[{i}]", "wrong_type", "must be dict")
                    continue
                if "kind" not in feat or not isinstance(feat["kind"], str):
                    report.add(f"features[{i}].kind", "missing",
                                "must be string")

    return report


def report_to_dict(report: TypeReport) -> dict[str, Any]:
    return {
        "schema_version": report.schema_version,
        "ok": report.ok,
        "issues": [asdict(i) for i in report.issues],
    }
