"""W5.8 — Greenfield archetype pipeline tests.

Verifies the four new archetype GDD → IR → MC pipelines:
  * ways (243)
  * megaways
  * hold_and_win
  * cascade

Each test runs the pipeline at 50k spins (smoke level — keeps the
test suite under 90s on a single laptop core) and asserts the
acceptance verdict is PASS plus the IR is valid for the engine.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.greenfield_demo.archetype_pipeline import (
    ENGINE_BIN,
    _parse_yaml_subset,
    load_gdd,
    run_pipeline,
)


REPO = Path(__file__).resolve().parents[2]
GDD_DIR = REPO / "tools" / "greenfield_demo"


pytestmark = pytest.mark.skipif(
    not ENGINE_BIN.exists(),
    reason=f"slot-sim release binary missing: {ENGINE_BIN}",
)


@pytest.mark.parametrize("gdd_name,archetype", [
    ("tiger_243ways.gdd", "ways"),
    ("storm_megaways.gdd", "megaways"),
    ("golden_holdwin.gdd", "hold_and_win"),
    ("orchard_cascade.gdd", "cascade"),
])
def test_archetype_pipeline_passes(gdd_name: str, archetype: str, tmp_path):
    """Each archetype GDD must pass the full pipeline (PASS verdict).

    Uses a 50k spin smoke budget so the test runs in <90 s; calibration
    will still bring the engine MC inside ±1 % of target because the
    paytable scale converges geometrically.
    """
    gdd_path = GDD_DIR / gdd_name
    assert gdd_path.exists(), f"GDD missing: {gdd_path}"
    # 200k spins keeps MC noise floor < 0.005 so the ±1 % gate
    # passes deterministically across all four archetypes.
    art = run_pipeline(gdd_path, out_dir=tmp_path, spins=200_000)
    # Confirm archetype detection.
    assert art.archetype == archetype, (
        f"archetype mismatch for {gdd_name}: "
        f"expected {archetype}, got {art.archetype}"
    )
    # Confirm pipeline emits every required artefact.
    for path in (
        art.dsl_path, art.smt_path, art.ir_path, art.mc_path,
        art.acc_path, art.cert_zip_path,
    ):
        assert path.exists(), f"artefact missing: {path}"
    # Confirm cert ZIP has the expected entries.
    import zipfile
    with zipfile.ZipFile(art.cert_zip_path) as z:
        names = set(z.namelist())
        required = {"MANIFEST.json", "SIGNATURE.sig", "README.md"}
        assert required.issubset(names), (
            f"cert ZIP missing required entries: "
            f"{sorted(required - names)}"
        )
    # Acceptance must be PASS.
    assert art.acceptance["verdict"] == "PASS", (
        f"archetype {archetype} verdict={art.acceptance['verdict']}: "
        f"{art.acceptance['gates']}"
    )


def test_yaml_subset_parser_lists_with_inline_dict_items():
    """YAML parser must handle list-of-dict items (e.g. `symbols:`
    block with each item carrying multiple keys at indent+4).
    """
    text = """
symbols:
  - id: wild
    kind: wild
    substitutes: "*"
  - id: scatter
    kind: scatter
"""
    parsed = _parse_yaml_subset(text)
    assert parsed["symbols"][0] == {
        "id": "wild", "kind": "wild", "substitutes": "*",
    }
    assert parsed["symbols"][1] == {"id": "scatter", "kind": "scatter"}


def test_yaml_subset_parser_handles_flow_dict():
    """Inline flow dicts (`{k: v, ...}`) must parse to nested dicts."""
    text = """
reels:
  per_reel_distribution:
    - {wild: 0.03, scatter: 0.025, hp_a: 0.10}
    - {wild: 0.02, scatter: 0.02, hp_a: 0.12}
"""
    parsed = _parse_yaml_subset(text)
    assert parsed["reels"]["per_reel_distribution"][0]["wild"] == 0.03
    assert parsed["reels"]["per_reel_distribution"][1]["hp_a"] == 0.12


def test_load_gdd_rejects_missing_archetype(tmp_path: Path):
    """A GDD without `archetype:` must raise ValueError."""
    bad = tmp_path / "bad.gdd"
    bad.write_text("schema_version: \"1.0.0\"\nmeta:\n  name: Bad\n")
    with pytest.raises(ValueError, match="archetype"):
        load_gdd(bad)
