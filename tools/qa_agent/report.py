"""tools.qa_agent.report — layer-result and consolidated report types.

The report is the contract surface for the QA Agent. Everything else
in the package produces or consumes these dataclasses, and the JSON +
Markdown writers here are the only place that knows how to serialise
them. This keeps determinism guarantees local: sort keys, ISO-8601 UTC
timestamps, no native floats with platform-specific repr.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class LayerStatus(str, Enum):
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"
    SKIP = "SKIP"
    ERROR = "ERROR"


@dataclass
class Finding:
    layer: str
    severity: str  # CRITICAL | HIGH | MEDIUM | LOW | INFO
    location: str  # "file:Lstart-Lend" or "scenario_id"
    symptom: str
    repro_cmd: str = ""
    antibody_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "layer": self.layer,
            "severity": self.severity,
            "location": self.location,
            "symptom": self.symptom,
            "repro_cmd": self.repro_cmd,
            "antibody_id": self.antibody_id,
        }


@dataclass
class LayerResult:
    layer: str  # "L0".."L9"
    name: str  # "selftest" .. "manual"
    status: LayerStatus
    elapsed_ms: float
    findings: list[Finding] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
    artefact: str | None = None
    detail: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "layer": self.layer,
            "name": self.name,
            "status": self.status.value,
            "elapsed_ms": round(self.elapsed_ms, 2),
            "findings": [f.to_dict() for f in self.findings],
            "counts": dict(sorted(self.counts.items())),
            "artefact": self.artefact,
            "detail": self.detail,
        }


@dataclass
class QaReport:
    schema: str = "urn:slotmath:qa-agent:report:v1"
    scope: str = ""
    baseline: str = ""
    seed: int = 42
    repo_sha: str = ""
    started_at: str = ""
    finished_at: str = ""
    layers: list[LayerResult] = field(default_factory=list)
    verdict: str = ""  # ALL_PASS | FAIL | BLOCKED_ANTIBODY | INFRA_ERROR | BAD_INPUT
    exit_code: int = 0
    antibody_matches: list[dict[str, Any]] = field(default_factory=list)
    determinism: dict[str, Any] = field(default_factory=dict)

    # ── serialisation ────────────────────────────────────────────────

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "scope": self.scope,
            "baseline": self.baseline,
            "seed": self.seed,
            "repo_sha": self.repo_sha,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "layers": [l.to_dict() for l in self.layers],
            "verdict": self.verdict,
            "exit_code": self.exit_code,
            "antibody_matches": list(self.antibody_matches),
            "determinism": dict(sorted(self.determinism.items())),
        }

    def to_canonical_dict(self) -> dict[str, Any]:
        """Timestamp- and elapsed-stripped dict for determinism hash."""
        d = self.to_dict()
        d.pop("started_at", None)
        d.pop("finished_at", None)
        for layer in d.get("layers", []):
            layer.pop("elapsed_ms", None)
            # detail can carry timing strings — keep but normalise
            layer["detail"] = _strip_volatile(layer.get("detail", ""))
        return d

    def canonical_hash(self) -> str:
        blob = json.dumps(self.to_canonical_dict(), sort_keys=True).encode("utf-8")
        return hashlib.sha256(blob).hexdigest()

    # ── verdict computation ──────────────────────────────────────────

    def compute_verdict(self) -> tuple[str, int]:
        """Pure function over self.layers + antibody_matches.

        Order of precedence:
          BAD_INPUT (set externally) > BLOCKED_ANTIBODY > INFRA_ERROR
          > FAIL > ALL_PASS.
        """
        if self.verdict == "BAD_INPUT":
            return "BAD_INPUT", 2

        # antibody block: any L1 finding HIGH+ → block
        antibody_layer = next((l for l in self.layers if l.layer == "L1"), None)
        if antibody_layer and antibody_layer.status == LayerStatus.FAIL:
            return "BLOCKED_ANTIBODY", 4

        # infra error: any layer ERROR
        if any(l.status == LayerStatus.ERROR for l in self.layers):
            return "INFRA_ERROR", 3

        # fail: any layer FAIL
        if any(l.status == LayerStatus.FAIL for l in self.layers):
            return "FAIL", 1

        return "ALL_PASS", 0

    # ── writers ──────────────────────────────────────────────────────

    def write_json(self, out_path: Path) -> Path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(self.to_dict(), sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        return out_path

    def write_markdown(self, out_path: Path) -> Path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(self.render_markdown(), encoding="utf-8")
        return out_path

    def render_markdown(self) -> str:
        lines: list[str] = []
        lines.append(f"**Scope.** {self.scope}")
        lines.append(f"**Baseline.** {self.baseline or '—'}")
        lines.append(f"**Seed.** {self.seed}")
        lines.append(f"**Repo SHA.** `{self.repo_sha or '—'}`")
        lines.append("")
        lines.append("**Layer verdicts.**")
        lines.append("| Layer | Status | Elapsed | Findings | Artefact |")
        lines.append("|---|---|---|---|---|")
        for l in self.layers:
            art = l.artefact or l.detail or "—"
            lines.append(
                f"| {l.layer} {l.name:<11} | {l.status.value} "
                f"| {int(l.elapsed_ms):>5} ms | {len(l.findings)} | `{art}` |"
            )
        lines.append("")
        lines.append(f"**Verdict.** {self.verdict}")
        lines.append(f"**Exit code.** {self.exit_code}")
        lines.append("")
        crit = [f for l in self.layers for f in l.findings
                if f.severity in ("CRITICAL", "HIGH")]
        lines.append("**Critical findings.**")
        if crit:
            lines.append("| # | Layer | Severity | Location | Symptom | Repro |")
            lines.append("|---|---|---|---|---|---|")
            for i, f in enumerate(crit, 1):
                lines.append(
                    f"| {i} | {f.layer} | {f.severity} | `{f.location}` "
                    f"| {f.symptom} | `{f.repro_cmd}` |"
                )
        else:
            lines.append("_(none)_")
        lines.append("")
        lines.append("**Antibody matches.**")
        if self.antibody_matches:
            lines.append("| Antibody | Severity | Recommended fix |")
            lines.append("|---|---|---|")
            for a in self.antibody_matches:
                lines.append(
                    f"| {a.get('id','?')} | {a.get('severity','?')} "
                    f"| {a.get('recommended_fix','—')} |"
                )
        else:
            lines.append("_(none)_")
        lines.append("")
        if self.determinism:
            lines.append(
                "**Determinism check.** "
                f"byte-identical: {self.determinism.get('byte_identical', '—')} "
                f"(hash `{self.determinism.get('canonical_hash', '—')[:16]}…`)"
            )
        lines.append("")
        return "\n".join(lines) + "\n"


# ─── helpers ──────────────────────────────────────────────────────────

_VOLATILE_PATTERNS = [
    # absolute home dirs, PIDs, timestamps in stderr blobs
    ("/Users/", "/Users/$USER/"),
    ("/home/", "/home/$USER/"),
]


def _strip_volatile(s: str) -> str:
    out = s
    for needle, repl in _VOLATILE_PATTERNS:
        # leave path prefix, drop the username segment
        idx = 0
        while True:
            i = out.find(needle, idx)
            if i < 0:
                break
            end = out.find("/", i + len(needle))
            if end < 0:
                break
            out = out[:i] + repl + out[end + 1:]
            idx = i + len(repl)
    return out


def now_iso_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def report_dir(out_root: Path) -> Path:
    """Create a fresh `reports/qa_agent/<timestamp>/` directory."""
    ts = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    d = out_root / ts
    d.mkdir(parents=True, exist_ok=True)
    return d


# ─── canonical hash helper (used by determinism scenario) ──────────────


_CANONICAL_STRIP_KEYS = (
    "started_at",
    "finished_at",
    "elapsed_ms",
    "ingested_at",
    "now",
    "ts",
)


def canonical_sha256(obj: Any) -> str:
    """Compute a stable SHA-256 over a dict/list, ignoring volatile fields.

    Strips top-level + nested keys in `_CANONICAL_STRIP_KEYS` so a
    report that differs only by timestamps still hashes identically.
    Used by the `determinism` manual scenario to assert determinism
    end-to-end without a full re-run.
    """
    def _strip(node: Any) -> Any:
        if isinstance(node, dict):
            return {
                k: _strip(v)
                for k, v in node.items()
                if k not in _CANONICAL_STRIP_KEYS
            }
        if isinstance(node, list):
            return [_strip(v) for v in node]
        return node

    blob = json.dumps(_strip(obj), sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()
