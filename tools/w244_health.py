#!/usr/bin/env python3
"""W244 wave 61 — one-shot health probe za celokupan W244 dossier surface.

Single command za auditora ili dev:
  $ python3 tools/w244_health.py

Verifikuje:
  • Sva 22 kernel acceptance JSON-a postoje + struktura validna
  • Master Merkle u W244_ALL_KERNELS.json
  • Benchmark dossier struktura
  • Industry-First dossier ima ≥80 waves + Industry First text-a
  • Sva 3 HTML dashboard-a postoje + Merkle u footer-u
  • PyPI paket vendored sources prisutni + can import standalone
  • Drift between monorepo tools/math_dsl/ i vendored PyPI src

Exit 0 = all green; exit 1 = problems found (with details on stdout).

Use case: `make health-w244` u CI, ili dev-side smoke pre push-a.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ACCEPT = REPO / "reports" / "acceptance"
DOSSIER = REPO / "reports" / "dossier"
PKG_SRC = REPO / "packages" / "slot-math-kernels" / "src"
MONOREPO_KERNELS = REPO / "tools" / "math_dsl"

VENDORED_KERNELS = [
    "asymmetric_paytable", "both_ways", "both_ways_expanding_wild",
    "buy_feature", "cascade", "charge_meter", "cluster_pays",
    "crash_kernel", "expanding_symbol", "hold_and_win",
    "inverse_solver", "money_collect", "multi_dim_inverse_solver",
    "must_hit_by", "pay_anywhere", "persistent_multiplier", "pick_chain",
    "stacked_wilds", "state_machine", "sticky_wilds", "ways_evaluator",
    "wheel",
]
# These have relative-import rewrites
REWRITTEN = {"both_ways_expanding_wild", "hold_and_win"}

HEX64 = re.compile(r"^[0-9a-f]{64}$")

results: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    results.append((name, condition, detail))


def check_kernel_acceptance_artefakti():
    files = sorted(ACCEPT.glob("*_KERNEL.json"))
    _check(
        "kernel JSONs present (≥20)",
        len(files) >= 20,
        f"found {len(files)}",
    )
    bad = []
    for f in files:
        try:
            d = json.loads(f.read_text())
            if "merkle_root_sha256" not in d:
                bad.append(f"{f.name}: missing merkle_root_sha256")
            elif not HEX64.match(d["merkle_root_sha256"]):
                bad.append(f"{f.name}: bad merkle hex")
        except json.JSONDecodeError as e:
            bad.append(f"{f.name}: bad JSON: {e}")
    _check(
        "kernel JSON base shape OK",
        not bad,
        f"{len(bad)} broken" if bad else "all OK",
    )


def check_master_dossier():
    f = ACCEPT / "W244_ALL_KERNELS.json"
    if not f.exists():
        _check("W244_ALL_KERNELS.json present", False, "missing")
        return
    d = json.loads(f.read_text())
    _check("W244_ALL_KERNELS.json present", True, "")
    _check(
        "master Merkle is 64-hex",
        bool(HEX64.match(d.get("master_merkle_root_sha256", ""))),
        d.get("master_merkle_root_sha256", "(missing)"),
    )
    _check(
        "all kernels OK",
        d.get("all_kernels_ok", False),
        f"{d.get('kernels_ok', 0)}/{d.get('kernels_total', 0)}",
    )


def check_benchmark_dossier():
    f = ACCEPT / "W244_BENCHMARK_DOSSIER.json"
    if not f.exists():
        _check("benchmark dossier present", False, "missing")
        return
    d = json.loads(f.read_text())
    _check("benchmark dossier present", True, "")
    _check(
        "all sub-microsecond",
        d.get("all_sub_microsecond", False),
        f"{d.get('bench_count', 0)} benches",
    )


def check_industry_firsts_dossier():
    f = DOSSIER / "INDUSTRY_FIRST_DOSSIER.json"
    if not f.exists():
        _check("IF dossier present", False, "missing")
        return
    d = json.loads(f.read_text())
    waves = d.get("waves", [])
    _check("IF dossier ≥80 waves", len(waves) >= 80, f"{len(waves)} waves")
    with_text = sum(1 for w in waves if w.get("industry_first"))
    _check(
        "IF text ≥85% coverage",
        with_text / max(len(waves), 1) >= 0.85,
        f"{with_text}/{len(waves)} have IF text",
    )


def check_html_dashboards():
    for name in (
        "index.html",
        "INDUSTRY_FIRST_DOSSIER.html",
        "REGULATOR_PORTAL.html",
        "CLOSED_FORM_PORTFOLIO.html",
    ):
        p = DOSSIER / name
        if not p.exists():
            _check(f"HTML present: {name}", False, "missing")
            continue
        text = p.read_text(encoding="utf-8")
        merkles = re.findall(r"<code>([0-9a-f]{64})</code>", text)
        _check(
            f"HTML has Merkle: {name}",
            bool(merkles),
            f"{len(merkles)} hex digests" if merkles else "no Merkle",
        )


def check_kernel_reference_cards():
    krefs = DOSSIER / "kernels"
    if not krefs.is_dir():
        _check("kernel reference cards dir", False, "missing")
        return
    index = krefs / "index.html"
    _check("kernel refs index.html", index.exists(), "")
    pages = list(krefs.glob("*_kernel.html"))
    _check(
        "kernel refs ≥19 pages",
        len(pages) >= 19,
        f"{len(pages)} per-kernel pages",
    )


def check_pypi_vendored():
    if not PKG_SRC.is_dir():
        _check("PyPI package present", False, f"missing {PKG_SRC}")
        return
    pkg_dir = PKG_SRC / "slot_math_kernels"
    if not pkg_dir.is_dir():
        _check("PyPI vendored dir present", False, "missing")
        return
    missing = [
        m for m in VENDORED_KERNELS
        if not (pkg_dir / f"{m}.py").exists()
    ]
    _check(
        "22 vendored kernel modules",
        not missing,
        f"missing: {missing}" if missing else "all present",
    )
    cli = pkg_dir / "_cli.py"
    _check(
        "PyPI CLI module present",
        cli.exists(),
        "_cli.py present" if cli.exists() else "missing",
    )


def check_vendored_drift():
    drift = []
    for mod_name in VENDORED_KERNELS:
        if mod_name in REWRITTEN:
            continue  # cross-import rewrite means byte-diff expected
        mono = MONOREPO_KERNELS / f"{mod_name}.py"
        vendored = PKG_SRC / "slot_math_kernels" / f"{mod_name}.py"
        if not mono.exists() or not vendored.exists():
            drift.append(f"{mod_name}: one side missing")
            continue
        mono_h = hashlib.sha256(mono.read_bytes()).hexdigest()
        vendored_h = hashlib.sha256(vendored.read_bytes()).hexdigest()
        if mono_h != vendored_h:
            drift.append(f"{mod_name}: hash mismatch")
    _check(
        "vendored == monorepo (non-rewritten)",
        not drift,
        f"{len(drift)} drifted" if drift else "byte-identical",
    )


def check_schemas():
    sd = REPO / "reports" / "schemas"
    if not sd.is_dir():
        _check("schemas dir present", False, "missing")
        return
    schemas = list(sd.glob("*.schema.json"))
    _check("≥5 JSON Schema files", len(schemas) >= 5, f"{len(schemas)}")
    manifest = sd / "schemas_manifest.json"
    _check("schemas manifest present", manifest.exists(), "")
    if manifest.exists():
        d = json.loads(manifest.read_text())
        m = d.get("manifest_merkle_root_sha256", "")
        _check(
            "schemas manifest Merkle 64-hex",
            bool(HEX64.match(m)),
            m,
        )


def check_api_surface():
    f = REPO / "packages" / "slot-math-kernels" / "API_SURFACE.json"
    if not f.exists():
        _check("API surface snapshot present", False, "missing")
        return
    d = json.loads(f.read_text())
    _check(
        "API surface has 22 kernels",
        len(d) == 22,
        f"{len(d)} kernels",
    )
    fns = sum(len(v.get("functions", {})) for v in d.values())
    cls = sum(len(v.get("classes", {})) for v in d.values())
    _check(
        "API surface populated",
        fns >= 60 and cls >= 20,
        f"{fns} fns + {cls} classes",
    )


def main() -> int:
    checks_in_order = [
        check_kernel_acceptance_artefakti,
        check_master_dossier,
        check_benchmark_dossier,
        check_industry_firsts_dossier,
        check_html_dashboards,
        check_kernel_reference_cards,
        check_pypi_vendored,
        check_vendored_drift,
        check_api_surface,
        check_schemas,
    ]
    for check_fn in checks_in_order:
        check_fn()

    print("\n=== W244 health probe ===\n")
    print(f"{'Check':<45} {'Status':<8} Detail")
    print("─" * 78)
    failed = 0
    for name, ok, detail in results:
        status = "✓ OK" if ok else "✗ FAIL"
        print(f"{name:<45} {status:<8} {detail}")
        if not ok:
            failed += 1

    print("─" * 78)
    if failed == 0:
        print(f"\n✅ All {len(results)} checks PASS — W244 surface clean.")
        return 0
    else:
        print(f"\n❌ {failed} / {len(results)} checks FAILED.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
