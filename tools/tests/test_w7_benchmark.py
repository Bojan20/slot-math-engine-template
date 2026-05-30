"""W7 — acceptance suite for the public math-compiler benchmark.

These tests drive `tools.benchmark.run_benchmark` end-to-end on the
`--quick` slice (10 samples, 2 per archetype) and assert the contracts
that make the benchmark an honest marketing artefact:

  test_generator_deterministic
      Same generator tag → byte-identical 50-sample spec list.

  test_quick_mode_runs
      `--quick` emits results.json + results.md + benchmark.svg +
      benchmark.sha256.txt in < 30 s wall-clock, with 10 samples
      successfully scored.

  test_speedup_threshold
      Overall median convergence speedup ≥ 5×.  If we can't beat naive
      uniform weights by 5× the compiler has no story to tell.

  test_report_self_contained
      Markdown + SVG contain NO external HTTP refs (the XML namespace
      declaration `xmlns="http://www.w3.org/2000/svg"` is not a fetch,
      so it is allow-listed explicitly).

  test_reproducible
      Two `--quick` runs produce byte-identical `benchmark.sha256.txt`
      (the timing-invariant handoff hash) and byte-identical
      `benchmark.svg` (no timing fields rendered).
"""

from __future__ import annotations

import re
import time
from pathlib import Path

import pytest

from tools.benchmark.generator import generate_specs, quick_specs
from tools.benchmark.runner import (
    BenchmarkConfig,
    ENGINE_BIN,
    run_benchmark,
)
from tools.math_dsl.spec import parse_spec


pytestmark = pytest.mark.skipif(
    not ENGINE_BIN.exists(),
    reason=(
        f"slot-sim release binary missing at {ENGINE_BIN}; "
        "run `cd engine/slot-sim && cargo build --release` first"
    ),
)


# ─── 1. generator determinism ───────────────────────────────────────────


def test_generator_deterministic():
    """Same generator tag → byte-identical 50-sample spec list."""
    run_a = generate_specs()
    run_b = generate_specs()
    assert len(run_a) == 50
    assert len(run_a) == len(run_b)
    for a, b in zip(run_a, run_b):
        assert a.sample_id == b.sample_id
        assert a.archetype == b.archetype
        assert a.target_rtp == b.target_rtp
        assert a.paylines == b.paylines
        assert a.symbol_count == b.symbol_count
        assert a.hp_count == b.hp_count
        assert a.dsl_yaml == b.dsl_yaml, (
            f"Sample {a.sample_id} drifted across re-generation: "
            f"YAML byte-mismatch"
        )
    # And: every spec must parse through the math-DSL grammar.
    for sp in run_a:
        try:
            parse_spec(sp.dsl_yaml)
        except Exception as exc:  # pragma: no cover - defence-in-depth
            pytest.fail(
                f"{sp.sample_id} failed parse_spec: "
                f"{type(exc).__name__}: {exc}\n{sp.dsl_yaml[:600]}"
            )
    # Archetype balance: 10 samples per archetype.
    by_arch: dict[str, int] = {}
    for sp in run_a:
        by_arch[sp.archetype] = by_arch.get(sp.archetype, 0) + 1
    assert all(v == 10 for v in by_arch.values()), (
        f"unbalanced archetypes: {by_arch}"
    )


# ─── 2. quick mode runs end-to-end ──────────────────────────────────────
# W244 wave 7: sledeća 5 testova tagovana `slow` — benchmark suite koja
# pokreće MC × archetype scoring 7-15s svaki. Skipovano u qa-quick L3.


@pytest.mark.slow
def test_quick_mode_runs(tmp_path: Path):
    """`--quick` emits all four artefact files in < 30 s and scores 10
    samples without error."""
    cfg = BenchmarkConfig(mode="quick", out_dir=tmp_path)
    t0 = time.perf_counter()
    agg = run_benchmark(cfg)
    elapsed = time.perf_counter() - t0
    assert elapsed < 30.0, f"--quick took {elapsed:.1f}s > 30 s budget"
    overall = agg.get("overall") or {}
    assert overall.get("samples_total") == 10
    assert overall.get("samples_ok") == 10, (
        f"expected 10 OK samples, got {overall}"
    )
    # All four artefact files emitted
    for name in (
        "results.json",
        "results.md",
        "benchmark.svg",
        "benchmark.sha256.txt",
    ):
        assert (tmp_path / name).exists(), f"missing {name}"
    # quick mode is 2-per-archetype × 5 archetypes
    per_arch = agg.get("per_archetype") or {}
    assert sorted(per_arch.keys()) == [
        "cascade", "hold_and_win", "lines", "megaways", "ways",
    ]
    for arch, bucket in per_arch.items():
        assert bucket["samples"] == 2, f"{arch}: {bucket['samples']}"


# ─── 3. speedup threshold ───────────────────────────────────────────────


@pytest.mark.slow
def test_speedup_threshold(tmp_path: Path):
    """Overall median convergence speedup must clear 5×.

    If the compiler can't beat naive uniform by 5× across the 10-sample
    quick slice, our story is broken — either the SMT step is failing
    silently or the spec generator is producing inputs the uniform
    baseline already nearly solves.
    """
    cfg = BenchmarkConfig(mode="quick", out_dir=tmp_path)
    agg = run_benchmark(cfg)
    overall = agg.get("overall") or {}
    median_speedup = float(overall.get("median_speedup", 0.0))
    assert median_speedup >= 5.0, (
        f"median convergence speedup {median_speedup:.2f}× is below the "
        "5× floor; either the SMT step is failing or the spec generator "
        "is producing inputs uniform weights already solve."
    )


# ─── 4. report is self-contained (no external HTTP fetches) ─────────────


# The SVG namespace identifier is the only allowed `http://` literal —
# it is a URI used by XML to identify the SVG namespace, NOT an HTTP
# fetch, and is required by every SVG file on the planet.
_SVG_NS = 'xmlns="http://www.w3.org/2000/svg"'


@pytest.mark.slow
def test_report_self_contained(tmp_path: Path):
    """Neither the Markdown nor the SVG references any external URL."""
    cfg = BenchmarkConfig(mode="quick", out_dir=tmp_path)
    run_benchmark(cfg)

    md_text = (tmp_path / "results.md").read_text(encoding="utf-8")
    svg_text = (tmp_path / "benchmark.svg").read_text(encoding="utf-8")

    # Strip the allowed SVG namespace declaration before grepping.
    svg_text_no_ns = svg_text.replace(_SVG_NS, "")

    http_pattern = re.compile(r"https?://", flags=re.IGNORECASE)
    md_refs = http_pattern.findall(md_text)
    svg_refs = http_pattern.findall(svg_text_no_ns)

    assert not md_refs, f"markdown contains http refs: {md_refs}"
    assert not svg_refs, f"svg contains non-namespace http refs: {svg_refs}"

    # Sanity: SVG and MD are non-trivial.
    assert len(svg_text) > 500
    assert len(md_text) > 500

# ─── 5. reproducibility — byte-stable handoff hash ──────────────────────


@pytest.mark.slow
def test_reproducible(tmp_path: Path):
    """Two `--quick` runs against the same config produce byte-identical
    timing-invariant handoff hashes AND byte-identical SVG output (the
    SVG renderer doesn't embed any timing fields, so it should match
    exactly across machines + runs).
    """
    cfg_a = BenchmarkConfig(mode="quick", out_dir=tmp_path / "a")
    cfg_b = BenchmarkConfig(mode="quick", out_dir=tmp_path / "b")
    run_benchmark(cfg_a)
    run_benchmark(cfg_b)

    sha_a = (tmp_path / "a" / "benchmark.sha256.txt").read_bytes()
    sha_b = (tmp_path / "b" / "benchmark.sha256.txt").read_bytes()
    assert sha_a == sha_b, (
        "timing-invariant handoff hash differs across two runs — the "
        "report is supposed to be byte-stable except for raw timing "
        "fields"
    )

    svg_a = (tmp_path / "a" / "benchmark.svg").read_bytes()
    svg_b = (tmp_path / "b" / "benchmark.svg").read_bytes()
    assert svg_a == svg_b, "SVG output drifted across re-runs"

    md_a = (tmp_path / "a" / "results.md").read_bytes()
    md_b = (tmp_path / "b" / "results.md").read_bytes()
    # The Markdown embeds the aggregate mean SMT/MC ms which are
    # wall-clock-derived; we don't insist on byte-equality on the
    # Markdown.  We DO insist that the rest of the structure is
    # identical: same number of rows, same archetype block.
    assert md_a.count(b"| `") == md_b.count(b"| `"), (
        "markdown table-row count drifted across runs"
    )


# ─── 6. CLI smoke (extra: keeps argparse honest) ────────────────────────


@pytest.mark.slow
def test_cli_quick(tmp_path: Path):
    """`python3 -m tools.benchmark --quick --out-dir <tmp>` exits 0."""
    from tools.benchmark.__main__ import main
    rc = main(["--quick", "--out-dir", str(tmp_path)])
    assert rc == 0
    assert (tmp_path / "results.json").exists()


# ─── 7. quick spec slice is honest (sanity test) ────────────────────────


def test_quick_slice_size():
    """`quick_specs()` returns exactly 10 samples, 2 per archetype."""
    qs = quick_specs()
    assert len(qs) == 10
    by_arch: dict[str, int] = {}
    for s in qs:
        by_arch[s.archetype] = by_arch.get(s.archetype, 0) + 1
    assert all(v == 2 for v in by_arch.values()), by_arch
