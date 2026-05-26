"""IR sanitizer — redact vendor identifiers."""
from __future__ import annotations
import copy
import re
from dataclasses import dataclass, field
from typing import Any


DEFAULT_REDACTIONS: dict[str, str] = {
    "meta.swid": "REDACTED",
    "meta.vendor": "REDACTED",
}


@dataclass
class SanitizeReport:
    redactions: list[str] = field(default_factory=list)

    @property
    def n_redactions(self) -> int:
        return len(self.redactions)

    def to_dict(self) -> dict[str, Any]:
        return {
            "n_redactions": self.n_redactions,
            "redactions": list(self.redactions),
        }


def _apply_path(ir: dict[str, Any], path: str, value: Any,
                report: SanitizeReport) -> None:
    parts = path.split(".")
    node: Any = ir
    for k in parts[:-1]:
        if not isinstance(node, dict) or k not in node:
            return
        node = node[k]
    last = parts[-1]
    if isinstance(node, dict) and last in node:
        if node[last] != value:
            report.redactions.append(path)
            node[last] = value


def sanitize_ir(
    ir: dict[str, Any],
    *,
    redactions: dict[str, str] | None = None,
    block_regex: str | None = None,
) -> tuple[dict[str, Any], SanitizeReport]:
    redactions = redactions or DEFAULT_REDACTIONS
    out = copy.deepcopy(ir)
    report = SanitizeReport()
    for path, value in redactions.items():
        _apply_path(out, path, value, report)
    if block_regex:
        pat = re.compile(block_regex, flags=re.IGNORECASE)

        def walk(node: Any, path: str) -> None:
            if isinstance(node, dict):
                for k, v in list(node.items()):
                    sub = f"{path}.{k}" if path else k
                    if isinstance(v, str) and pat.search(v):
                        node[k] = "REDACTED"
                        report.redactions.append(sub)
                    else:
                        walk(v, sub)
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    walk(v, f"{path}[{i}]")

        walk(out, "")
    return out, report
