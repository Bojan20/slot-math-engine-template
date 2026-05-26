"""Master pipeline gate core (W74)."""
from __future__ import annotations
import json
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class MasterVerdict(str, Enum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"
    ERROR = "error"


@dataclass
class MasterStep:
    name: str
    status: str                 # pass | warn | fail | error | skip
    detail: str = ""
    counts: dict[str, Any] = field(default_factory=dict)
    artifact: str = ""
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MasterGateReport:
    repo_root: str
    games_root: str
    steps: list[MasterStep] = field(default_factory=list)

    @property
    def verdict(self) -> MasterVerdict:
        order = {
            "pass": 0, "skip": 1, "warn": 2, "fail": 3, "error": 4,
        }
        worst = max(
            (order.get(s.status, 0) for s in self.steps),
            default=0,
        )
        return {
            0: MasterVerdict.PASS,
            1: MasterVerdict.PASS,
            2: MasterVerdict.WARN,
            3: MasterVerdict.FAIL,
            4: MasterVerdict.ERROR,
        }[worst]

    def exit_code(self) -> int:
        return {
            MasterVerdict.PASS: 0,
            MasterVerdict.WARN: 1,
            MasterVerdict.FAIL: 2,
            MasterVerdict.ERROR: 3,
        }[self.verdict]

    def to_dict(self) -> dict[str, Any]:
        return {
            "repo_root": self.repo_root,
            "games_root": self.games_root,
            "verdict": self.verdict.value,
            "exit_code": self.exit_code(),
            "steps": [s.to_dict() for s in self.steps],
        }

    def to_markdown(self) -> str:
        rows = [
            "| Step | Status | Detail |",
            "|---|---|---|",
        ]
        for s in self.steps:
            rows.append(f"| {s.name} | {s.status} | {s.detail} |")
        return (
            f"# Master Gate Report\n\n"
            f"- Repo: `{self.repo_root}`\n"
            f"- Games root: `{self.games_root}`\n"
            f"- Verdict: **{self.verdict.value.upper()}** "
            f"(exit {self.exit_code()})\n\n"
            + "\n".join(rows) + "\n"
        )


# ─── per-gate adapters ─────────────────────────────────────────────


def _step_drift_sentinel(games_root: Path, repo_root: Path) -> MasterStep:
    try:
        from tools.drift_sentinel.sentinel import scan_directory
    except ImportError as e:  # pragma: no cover
        return MasterStep(name="drift_sentinel", status="error",
                          error=str(e))
    try:
        baseline = repo_root / ".drift-baselines.json"
        result = scan_directory(
            games_root, baseline_path=baseline, update_baseline=False,
        )
        entries = list(getattr(result, "entries", []) or [])
        red = sum(
            1 for r in entries
            if getattr(getattr(r, "severity", None), "value", str(
                getattr(r, "severity", ""))) == "red"
        )
        yellow = sum(
            1 for r in entries
            if getattr(getattr(r, "severity", None), "value", str(
                getattr(r, "severity", ""))) == "yellow"
        )
        status = "pass"
        if red:
            status = "fail"
        elif yellow:
            status = "warn"
        return MasterStep(
            name="drift_sentinel",
            status=status,
            detail=f"scanned={len(entries)} red={red} yellow={yellow}",
            counts={"scanned": len(entries), "red": red, "yellow": yellow},
        )
    except Exception as e:  # noqa: BLE001
        return MasterStep(name="drift_sentinel", status="error",
                          error=str(e))


def _step_operator_dashboard(games_root: Path, out_dir: Path) -> MasterStep:
    try:
        from tools.operator_dashboard.aggregator import aggregate, emit_dashboard
    except ImportError as e:  # pragma: no cover
        return MasterStep(name="operator_dashboard", status="error",
                          error=str(e))
    try:
        rep = aggregate(games_root)
        out = out_dir / "operator_dashboard"
        paths = emit_dashboard(rep, out)
        counts = rep.counts
        red = counts.get("red", 0)
        yellow = counts.get("yellow", 0)
        status = "pass"
        if red:
            status = "fail"
        elif yellow:
            status = "warn"
        return MasterStep(
            name="operator_dashboard",
            status=status,
            detail=(
                f"total={counts.get('total', 0)} red={red} "
                f"yellow={yellow} green={counts.get('green', 0)}"
            ),
            counts=counts,
            artifact=str(paths["html"]),
        )
    except Exception as e:  # noqa: BLE001
        return MasterStep(name="operator_dashboard", status="error",
                          error=str(e))


def _step_cert_sbom(repo_root: Path, out_dir: Path) -> MasterStep:
    try:
        from tools.cert_sbom.emitter import build_sbom
    except ImportError as e:  # pragma: no cover
        return MasterStep(name="cert_sbom", status="error", error=str(e))
    try:
        out = out_dir / "sbom.json"
        sbom = build_sbom(repo_root=repo_root, bump_serial=False)
        out.write_text(json.dumps(sbom.to_cyclonedx(), indent=2,
                                  sort_keys=True))
        return MasterStep(
            name="cert_sbom",
            status="pass",
            detail=f"components={sbom.n_components}",
            counts={"components": sbom.n_components,
                    "entry_points": len(sbom.entry_points)},
            artifact=str(out),
        )
    except Exception as e:  # noqa: BLE001
        return MasterStep(name="cert_sbom", status="error", error=str(e))


def _step_catalog_sync(repo_root: Path, out_dir: Path) -> MasterStep:
    try:
        from tools.catalog_sync.builder import build_catalog, write_catalog
    except ImportError:
        return MasterStep(name="catalog_sync", status="skip",
                          detail="catalog_sync not present")
    try:
        out = out_dir / "catalog"
        cat = build_catalog(repo_root=repo_root)
        write_catalog(cat, out)
        return MasterStep(
            name="catalog_sync",
            status="pass",
            detail=f"kernels={len(cat.kernels)} version={cat.version}",
            counts={"kernels": len(cat.kernels)},
            artifact=str(out / "INDEX.json"),
        )
    except Exception as e:  # noqa: BLE001
        return MasterStep(name="catalog_sync", status="error", error=str(e))


def _step_ir_diff_gate_self(repo_root: Path, games_root: Path) -> MasterStep:
    """Smoke-test that ir_diff_gate runs without crash on an identity diff."""
    try:
        from tools.ir_diff_gate.gate import run_gate, GateConfig
    except ImportError as e:  # pragma: no cover
        return MasterStep(name="ir_diff_gate_self", status="error",
                          error=str(e))
    # Find one IR; identity diff should yield PASS.
    found: Path | None = None
    for pat in ("*.ir.json", "ir.json", "universal_ir.json"):
        for p in sorted(games_root.rglob(pat)):
            found = p
            break
        if found:
            break
    if found is None:
        return MasterStep(name="ir_diff_gate_self", status="skip",
                          detail="no IR present")
    try:
        ir = json.loads(found.read_text())
        rep = run_gate(ir, ir, config=GateConfig())
        status = "pass" if rep.verdict.value == "pass" else "fail"
        return MasterStep(
            name="ir_diff_gate_self",
            status=status,
            detail=f"verdict={rep.verdict.value} findings={len(rep.findings)}",
        )
    except Exception as e:  # noqa: BLE001
        return MasterStep(name="ir_diff_gate_self", status="error",
                          error=str(e))


# ─── public entry ──────────────────────────────────────────────────


def run_master_gate(
    *,
    repo_root: Path,
    games_root: Path,
    out_dir: Path,
) -> MasterGateReport:
    repo_root = Path(repo_root)
    games_root = Path(games_root)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    report = MasterGateReport(
        repo_root=str(repo_root),
        games_root=str(games_root),
    )

    # 1) drift sentinel
    report.steps.append(_step_drift_sentinel(games_root, repo_root))
    # 2) operator dashboard
    report.steps.append(_step_operator_dashboard(games_root, out_dir))
    # 3) cert SBOM
    report.steps.append(_step_cert_sbom(repo_root, out_dir))
    # 4) catalog sync (optional)
    report.steps.append(_step_catalog_sync(repo_root, out_dir))
    # 5) ir diff gate self-smoke
    report.steps.append(_step_ir_diff_gate_self(repo_root, games_root))

    # Persist gate report
    (out_dir / "master-gate.json").write_text(
        json.dumps(report.to_dict(), indent=2)
    )
    (out_dir / "master-gate.md").write_text(report.to_markdown())
    return report
