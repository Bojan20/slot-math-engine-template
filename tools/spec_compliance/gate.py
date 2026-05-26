"""Spec compliance gate — math doc ↔ IR ↔ kernel."""
from __future__ import annotations
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# ─── Doc parsing ───────────────────────────────────────────────────


_RTP_PATTERNS = [
    re.compile(r"target[\s_-]*rtp[^\d]+([0-9]+\.[0-9]+)", re.IGNORECASE),
    re.compile(r"rtp[\s_:=-]+([0-9]+\.[0-9]+)", re.IGNORECASE),
]


def _parse_target_rtp(text: str) -> float | None:
    for pat in _RTP_PATTERNS:
        m = pat.search(text)
        if m:
            try:
                v = float(m.group(1))
                if v > 1.5:  # treat 96.0 as 0.96
                    v /= 100.0
                if 0.0 < v < 1.5:
                    return v
            except ValueError:
                continue
    return None


_PAY_ROW = re.compile(
    r"^\s*\|?\s*([A-Za-z0-9_+\-\s]+)\s*\|\s*([0-9]+)\s*\|?\s*$"
)


def _parse_paytable_rows(text: str) -> list[tuple[str, int]]:
    rows: list[tuple[str, int]] = []
    in_table = False
    for line in text.splitlines():
        if "|" not in line:
            in_table = False
            continue
        # Heuristic: looks like a markdown table row
        m = _PAY_ROW.match(line)
        if not m:
            continue
        combo = m.group(1).strip()
        if combo.lower() in ("combo", "symbol", "row", "----"):
            in_table = True
            continue
        try:
            pays = int(m.group(2))
        except ValueError:
            continue
        if combo and "---" not in combo:
            rows.append((combo, pays))
    return rows


@dataclass
class DocFacts:
    target_rtp: float | None
    paytable_rows: list[tuple[str, int]]


def extract_doc_facts(text: str) -> DocFacts:
    return DocFacts(
        target_rtp=_parse_target_rtp(text),
        paytable_rows=_parse_paytable_rows(text),
    )


# ─── IR parsing ────────────────────────────────────────────────────


@dataclass
class IRFacts:
    target_rtp: float | None
    paytable_rows: list[tuple[str, int]]


def _combo_to_key(combo: Any) -> str:
    if not isinstance(combo, list):
        return ""
    return "+".join(str(c) for c in combo)


def extract_ir_facts(ir: dict[str, Any]) -> IRFacts:
    meta = ir.get("meta") or {}
    target = meta.get("target_rtp")
    if isinstance(target, (int, float)) and target > 1.5:
        target = target / 100.0
    rows: list[tuple[str, int]] = []
    for row in ir.get("paytable") or []:
        if not isinstance(row, dict):
            continue
        combo_key = _combo_to_key(row.get("combo"))
        pays = row.get("pays", 0)
        if combo_key and isinstance(pays, (int, float)):
            rows.append((combo_key, int(pays)))
    return IRFacts(
        target_rtp=float(target) if isinstance(target, (int, float)) else None,
        paytable_rows=rows,
    )


# ─── Diff ──────────────────────────────────────────────────────────


@dataclass
class ComplianceIssue:
    category: str
    message: str
    severity: str = "error"

    def to_dict(self) -> dict[str, Any]:
        return {
            "category": self.category,
            "message": self.message,
            "severity": self.severity,
        }


@dataclass
class ComplianceReport:
    ir_path: str | None
    doc_path: str | None
    issues: list[ComplianceIssue] = field(default_factory=list)
    n_doc_rows: int = 0
    n_ir_rows: int = 0

    @property
    def passed(self) -> bool:
        return all(i.severity != "error" for i in self.issues)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ir_path": self.ir_path,
            "doc_path": self.doc_path,
            "n_doc_rows": self.n_doc_rows,
            "n_ir_rows": self.n_ir_rows,
            "passed": self.passed,
            "issues": [i.to_dict() for i in self.issues],
        }


def diff_facts(
    doc: DocFacts,
    ir: IRFacts,
    *,
    rtp_tolerance: float = 0.0001,
    kernel_rtp: float | None = None,
    kernel_tolerance: float = 0.05,
) -> list[ComplianceIssue]:
    issues: list[ComplianceIssue] = []

    if doc.target_rtp is not None and ir.target_rtp is not None:
        delta = abs(doc.target_rtp - ir.target_rtp)
        if delta > rtp_tolerance:
            issues.append(ComplianceIssue(
                category="target_rtp",
                message=(
                    f"doc target_rtp={doc.target_rtp:.6f} ≠ IR "
                    f"target_rtp={ir.target_rtp:.6f} (Δ={delta:.6f} > "
                    f"{rtp_tolerance:.6f})"
                ),
            ))
    elif doc.target_rtp is None:
        issues.append(ComplianceIssue(
            category="target_rtp_missing_doc",
            message="math doc does not specify target_rtp",
            severity="warning",
        ))
    elif ir.target_rtp is None:
        issues.append(ComplianceIssue(
            category="target_rtp_missing_ir",
            message="IR meta.target_rtp is missing",
        ))

    if kernel_rtp is not None and ir.target_rtp is not None:
        ratio = kernel_rtp / max(ir.target_rtp, 1e-9)
        if abs(ratio - 1.0) > kernel_tolerance:
            issues.append(ComplianceIssue(
                category="kernel_rtp_drift",
                message=(
                    f"closed-form RTP {kernel_rtp:.6f} drifts from IR "
                    f"target {ir.target_rtp:.6f} by {(ratio - 1)*100:+.2f}%"
                ),
            ))

    doc_set = {(c.lower(), p) for c, p in doc.paytable_rows}
    ir_set = {(c.lower(), p) for c, p in ir.paytable_rows}
    only_doc = doc_set - ir_set
    only_ir = ir_set - doc_set
    if only_doc:
        for c, p in sorted(only_doc):
            issues.append(ComplianceIssue(
                category="paytable_in_doc_not_ir",
                message=f"doc has row ({c}, pays={p}) missing from IR",
            ))
    if only_ir:
        for c, p in sorted(only_ir):
            issues.append(ComplianceIssue(
                category="paytable_in_ir_not_doc",
                message=f"IR has row ({c}, pays={p}) missing from doc",
            ))

    return issues


def run_gate(
    ir_path: Path | None,
    doc_path: Path | None,
    *,
    ir: dict[str, Any] | None = None,
    doc_text: str | None = None,
    rtp_tolerance: float = 0.0001,
    kernel_rtp: float | None = None,
    kernel_tolerance: float = 0.05,
) -> ComplianceReport:
    if ir is None:
        if ir_path is None:
            raise ValueError("must pass ir or ir_path")
        ir = json.loads(Path(ir_path).read_text())
    if doc_text is None:
        if doc_path is None:
            raise ValueError("must pass doc_text or doc_path")
        doc_text = Path(doc_path).read_text()

    doc_facts = extract_doc_facts(doc_text)
    ir_facts = extract_ir_facts(ir)

    issues = diff_facts(
        doc_facts, ir_facts,
        rtp_tolerance=rtp_tolerance,
        kernel_rtp=kernel_rtp,
        kernel_tolerance=kernel_tolerance,
    )

    return ComplianceReport(
        ir_path=str(ir_path) if ir_path else None,
        doc_path=str(doc_path) if doc_path else None,
        issues=issues,
        n_doc_rows=len(doc_facts.paytable_rows),
        n_ir_rows=len(ir_facts.paytable_rows),
    )
