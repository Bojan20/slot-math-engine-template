"""W5.7 acceptance suite — greenfield game pipeline demo.

Drives the full `tools.greenfield_demo.run_pipeline` end-to-end and
asserts the six gates the W5.7 mission requires:

  1. test_dsl_parses           — GDD YAML parses without error
  2. test_smt_converges        — Z3 model is SAT with closed-form delta < 1e-3
  3. test_ir_roundtrips        — emitted IR loads in Rust (cargo test wrapper)
  4. test_mc_within_tolerances — engine MC at 500k spins lands within
                                 ±1 % of target RTP and ≤ 1e-2 of target
                                 hit_freq
  5. test_cert_bundle_valid    — open ZIP, verify ed25519 signature,
                                 check all 9 required files present
  6. test_acceptance_pass      — `acceptance.json` reports all gates PASS

The suite runs the pipeline ONCE in a module-scoped fixture so the
expensive engine-MC + Z3 stages happen exactly once across all six
tests (each individual test then only validates a slice of the run).
"""

from __future__ import annotations

import io
import json
import subprocess
import zipfile
from pathlib import Path

import pytest

from tools.cert_bundle_swid import sign
from tools.cert_bundle_swid.manifest import sha256_bytes
from tools.greenfield_demo.pipeline import (
    DEMO_SLUG,
    ENGINE_BIN,
    MC_HF_TOL,
    MC_RTP_TOL,
    REPO,
    REQUIRED_CERT_FILES,
    SMT_RTP_TOLERANCE,
    SWID,
    run_pipeline,
)
from tools.math_dsl.spec import parse_spec


# W244 wave 7: ceo modul tagovan `slow` — `artefacts` fixture pokreće
# `run_pipeline` (DSL parse + Z3 SMT synth + IR roundtrip + 500k MC + cert
# bundle) jednom po modulu, ~33s. Skipovano u qa-quick L3 budgetu, runs u
# qa-full / CI nightly.
pytestmark = pytest.mark.slow


GDD_PATH = (
    Path(__file__).resolve().parents[1] / "greenfield_demo"
    / "wolf_eruption_mythic.gdd"
)


# ─── module-scoped pipeline fixture ─────────────────────────────────────


@pytest.fixture(scope="module")
def artefacts(tmp_path_factory):
    """Run the full pipeline once per test module.

    Skips the entire suite when the slot-sim release binary is missing —
    on a fresh checkout `cargo build --release` is required first.  The
    skip message tells the developer exactly what to build.
    """
    if not ENGINE_BIN.exists():
        pytest.skip(
            f"slot-sim release binary missing at {ENGINE_BIN}; "
            "run `cd engine/slot-sim && cargo build --release` first",
        )
    out_dir = tmp_path_factory.mktemp("greenfield-demo")
    return run_pipeline(GDD_PATH, out_dir=out_dir)


# ─── 1. DSL parse ───────────────────────────────────────────────────────


def test_dsl_parses():
    """GDD YAML parses without raising; required fields are populated."""
    spec = parse_spec(GDD_PATH.read_text())
    assert spec.meta.get("name") == "Wolf Eruption Mythic"
    assert spec.meta.get("swid") == SWID
    assert spec.topology.kind == "rectangular"
    assert spec.topology.reels == 5
    assert spec.topology.rows == 3
    # 10 symbols matching the W5.7 mission shape:
    # 1 wild + 1 scatter + 4 HP + 4 LP.
    assert len(spec.symbols) == 10
    assert sum(1 for s in spec.symbols if s.kind == "wild") == 1
    assert sum(1 for s in spec.symbols if s.kind == "scatter") == 1
    assert sum(1 for s in spec.symbols if s.kind == "hp") == 4
    assert sum(1 for s in spec.symbols if s.kind == "lp") == 4
    # Target RTP exactly the mission's 0.96 industry-standard.
    assert abs(spec.constraints.target_rtp - 0.96) < 1e-9
    # One feature: free_spins from 3+ scatter, 5 spins.
    assert len(spec.features) == 1
    assert spec.features[0].kind == "free_spins"
    assert spec.features[0].trigger_count_min == 3
    assert spec.features[0].initial_spins == 5
    # Paylines = 20 (industry default per mission spec).
    assert spec.paylines == 20


# ─── 2. SMT converged ───────────────────────────────────────────────────


def test_smt_converges(artefacts):
    """SMT model is SAT with reported closed-form delta < 1e-3."""
    smt = artefacts.smt_synth
    assert smt["converged"] is True, smt
    assert abs(smt["delta_rtp"]) <= SMT_RTP_TOLERANCE, (
        f"|Δ_rtp|={smt['delta_rtp']} > tolerance {SMT_RTP_TOLERANCE}"
    )
    # Z3 mode must be the multi-objective C-5 variant — that's the
    # synth we wired through `pipeline.run_pipeline`.
    assert smt["mode"] == "C-5_multi_objective"
    # All three per-reel weight vectors must be present and the right
    # length (5 reels per the GDD topology).
    for k in ("hp_w", "lp_w", "sp_w"):
        assert smt[k] is not None
        assert len(smt[k]) == 5


# ─── 3. IR round-trip through Rust serde ────────────────────────────────


def test_ir_roundtrips(artefacts):
    """The emitted universal IR loads in Rust via `cargo test`.

    Runs the dedicated `greenfield_demo_roundtrip` Rust test which calls
    `slot_sim::ir::Ir::load(...)` on the artefact and asserts metadata
    sanity.  This proves the JSON we wrote serde-deserialises into the
    engine's `Ir` struct without losing fields.
    """
    # The Rust test reads the IR at a fixed path under
    # reports/greenfield-demo/ — copy ours there so the test sees the
    # exact artefact we just emitted (the W5.7 pipeline writes there by
    # default; the tmp_path_factory in the fixture overrides out_dir,
    # so we mirror the IR back to the canonical path here for the
    # Rust test to find).
    canonical_dir = REPO / "reports" / "greenfield-demo"
    canonical_dir.mkdir(parents=True, exist_ok=True)
    canonical_ir = canonical_dir / f"{DEMO_SLUG}.slot-sim.ir.json"
    canonical_ir.write_bytes(artefacts.ir_path.read_bytes())

    # Run the dedicated Rust test (`#[test] fn ...`) — we name it via
    # `--test greenfield_demo_roundtrip` so cargo compiles only this
    # one integration test (the others stay un-rebuilt).
    #
    # CI shells that don't have `~/.cargo/bin` in PATH still expose
    # the binary at the conventional install paths; probe those first
    # before falling back to a `cargo`-on-PATH lookup so the test
    # remains green in restricted environments.
    cargo_bin = _find_cargo()
    if cargo_bin is None:
        pytest.skip(
            "cargo binary not found on PATH or in standard install "
            "paths (~/.cargo/bin, /opt/homebrew/bin, /usr/local/bin); "
            "Rust round-trip test requires cargo to compile the engine "
            "crate's integration test",
        )
    proc = subprocess.run(
        [cargo_bin, "test", "--release", "--test",
         "greenfield_demo_roundtrip", "--", "--nocapture"],
        cwd=REPO / "engine" / "slot-sim",
        capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        pytest.fail(
            f"cargo test failed (rc={proc.returncode}):\n"
            f"stdout (tail):\n{proc.stdout[-800:]}\n"
            f"stderr (tail):\n{proc.stderr[-800:]}",
        )


def _find_cargo() -> str | None:
    """Locate the cargo binary across standard install paths.

    Returns the first match from:
      1. `cargo` on PATH (via `shutil.which`)
      2. `~/.cargo/bin/cargo`  (rustup default)
      3. `/opt/homebrew/bin/cargo`  (Apple Silicon Homebrew)
      4. `/usr/local/bin/cargo`  (Intel Homebrew / Linux brew)
    """
    import os
    import shutil
    from pathlib import Path as _P
    on_path = shutil.which("cargo")
    if on_path:
        return on_path
    candidates = [
        _P.home() / ".cargo" / "bin" / "cargo",
        _P("/opt/homebrew/bin/cargo"),
        _P("/usr/local/bin/cargo"),
    ]
    for c in candidates:
        if c.exists() and os.access(c, os.X_OK):
            return str(c)
    return None


# ─── 4. MC within tolerances ────────────────────────────────────────────


def test_mc_within_tolerances(artefacts):
    """Engine MC at 500k spins inside ±1 % RTP / ≤ 1e-2 hit_freq."""
    mc = artefacts.mc_verdict
    assert mc["spins"] >= 500_000, (
        f"spins {mc['spins']} below 500k mission floor"
    )
    assert abs(mc["delta_rtp"]) <= MC_RTP_TOL, (
        f"|Δ_rtp|={mc['delta_rtp']} > ±{MC_RTP_TOL}"
    )
    assert abs(mc["delta_hit_freq"]) <= MC_HF_TOL, (
        f"|Δ_hit_freq|={mc['delta_hit_freq']} > ±{MC_HF_TOL}"
    )


# ─── 5. Cert bundle valid ──────────────────────────────────────────────


def test_cert_bundle_valid(artefacts):
    """ZIP opens, ed25519 signature verifies, every required path present.

    The list of required files comes from `REQUIRED_CERT_FILES` (defined
    in `pipeline.py`), which itself matches the 9 the W5.7 mission spec
    enumerated.
    """
    zip_bytes = artefacts.cert_zip_path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = set(zf.namelist())
        # All 9 mission-required files present
        missing = set(REQUIRED_CERT_FILES) - names
        assert not missing, f"missing cert files: {sorted(missing)}"
        # Manifest sha256 matches the bytes-in-zip for every listed file
        manifest_blob = zf.read("MANIFEST.json")
        manifest = json.loads(manifest_blob)
        for entry in manifest["files"]:
            path = entry["path"]
            assert path in names, f"manifest lists missing path {path}"
            data = zf.read(path)
            assert sha256_bytes(data) == entry["sha256"], (
                f"sha256 mismatch for {path}"
            )
            assert len(data) == entry["size_bytes"], (
                f"size mismatch for {path}"
            )
        # Signature verifies under the demo's deterministic public key
        sig_bytes = zf.read("SIGNATURE.sig")

    keys = sign.load_or_generate_key()
    assert sign.verify_signature(
        manifest_blob, sig_bytes,
        public_pem_path=keys.public_pem_path,
    ), "ed25519 signature verification failed"


# ─── 6. acceptance.json overall PASS ───────────────────────────────────


def test_acceptance_pass(artefacts):
    """`acceptance.json` records `all gates PASS`."""
    acc = artefacts.acceptance
    assert acc["verdict"] == "PASS", acc
    assert acc["passed"] is True, acc
    assert acc["all_gates_pass"] is True, acc
    gate_names = {g["name"] for g in acc["gates"]}
    assert gate_names == {
        "smt_converged",
        "mc_rtp_within_1pct",
        "mc_hit_freq_within_1e-2",
        "cert_bundle_complete",
    }, gate_names
    for g in acc["gates"]:
        assert g["status"] == "PASS", g
