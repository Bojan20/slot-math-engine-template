"""Coverage reporter implementation."""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class Coverage:
    repo_root: str
    solver_kernels: list[str] = field(default_factory=list)
    jurisdiction_profiles: list[str] = field(default_factory=list)
    vendor_profiles: list[str] = field(default_factory=list)
    console_scripts: list[str] = field(default_factory=list)
    test_files: list[str] = field(default_factory=list)
    test_count_estimated: int = 0
    games_present: list[str] = field(default_factory=list)


def _list_dir(p: Path, suffix: str) -> list[str]:
    if not p.is_dir():
        return []
    return sorted(f.stem for f in p.glob(f"*{suffix}")
                  if not f.name.startswith("_"))


def _list_console_scripts(pyproject: Path) -> list[str]:
    if not pyproject.is_file():
        return []
    text = pyproject.read_text()
    # Pull lines under [project.scripts]
    in_scripts = False
    out = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("[project.scripts]"):
            in_scripts = True
            continue
        if in_scripts and s.startswith("[") and not s.startswith("[project.scripts]"):
            break
        if in_scripts and "=" in s and not s.startswith("#"):
            name = s.split("=", 1)[0].strip()
            if name:
                out.append(name)
    return sorted(out)


def _count_tests(test_dir: Path) -> int:
    """Rough count: number of `def test_` matches across all test files."""
    if not test_dir.is_dir():
        return 0
    pattern = re.compile(r"^\s*def test_", re.MULTILINE)
    n = 0
    for f in test_dir.glob("test_*.py"):
        try:
            n += len(pattern.findall(f.read_text()))
        except OSError:
            continue
    return n


def aggregate_coverage(repo_root: Path) -> Coverage:
    repo_root = Path(repo_root)
    cov = Coverage(repo_root=str(repo_root))
    cov.solver_kernels = _list_dir(repo_root / "tools" / "solvers", ".py")
    # Filter out __init__-only entries
    cov.solver_kernels = [k for k in cov.solver_kernels
                           if k not in ("__init__", "__main__")]
    cov.jurisdiction_profiles = _list_dir(
        repo_root / "tools" / "jurisdiction" / "profiles", ".yaml",
    )
    cov.vendor_profiles = _list_dir(
        repo_root / "tools" / "vendor_profiles", ".yaml",
    )
    cov.console_scripts = _list_console_scripts(repo_root / "pyproject.toml")
    cov.test_files = [
        f.name for f in (repo_root / "tools" / "tests").glob("test_*.py")
    ]
    cov.test_count_estimated = _count_tests(repo_root / "tools" / "tests")
    games_dir = repo_root / "games"
    if games_dir.is_dir():
        cov.games_present = sorted(
            p.name for p in games_dir.iterdir() if p.is_dir()
        )
    return cov


def _md_for(cov: Coverage) -> str:
    out = [
        "# Slot Math Engine — Coverage Report",
        "",
        f"_Repo root: `{cov.repo_root}`_",
        "",
        "## Inventory",
        "",
        f"- **Solver kernels:** {len(cov.solver_kernels)}",
        f"- **Jurisdiction profiles:** {len(cov.jurisdiction_profiles)}",
        f"- **Vendor profiles:** {len(cov.vendor_profiles)}",
        f"- **Console entry points:** {len(cov.console_scripts)}",
        f"- **Test files:** {len(cov.test_files)}",
        f"- **Test cases (estimated):** {cov.test_count_estimated}",
        f"- **Games tracked:** {len(cov.games_present)}",
        "",
        "## Solver kernels",
        "",
    ]
    for k in cov.solver_kernels:
        out.append(f"- `{k}`")
    out += [
        "",
        "## Jurisdiction profiles",
        "",
    ]
    for j in cov.jurisdiction_profiles:
        out.append(f"- `{j}`")
    out += [
        "",
        "## Vendor profiles",
        "",
    ]
    for v in cov.vendor_profiles:
        out.append(f"- `{v}`")
    out += [
        "",
        "## Console entry points",
        "",
    ]
    for s in cov.console_scripts:
        out.append(f"- `{s}`")
    out += [
        "",
        "## Games tracked",
        "",
    ]
    for g in cov.games_present:
        out.append(f"- `{g}`")
    return "\n".join(out) + "\n"


def emit_coverage(cov: Coverage, out_dir: Path) -> dict[str, Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    j = out_dir / "coverage.json"
    m = out_dir / "coverage.md"
    j.write_text(json.dumps(asdict(cov), indent=2, ensure_ascii=False))
    m.write_text(_md_for(cov))
    return {"json": j, "md": m}
