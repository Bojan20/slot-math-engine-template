"""Monte-Carlo runner wrapper — shells out to the Rust slot-sim binary.

Mirrors the invocation that `tools/par_picker_fit_descent.py` already
uses (so we know the contract is stable) but trimmed down to the four
numbers we need for the verdict:

  • mc_rtp
  • mc_hit_freq
  • mc_win_freq
  • mc_max_single_x

Returns a dict ready to drop into `mc_verdict.json`.

Determinism note
----------------
The Rust slot-sim engine uses `std::collections::HashMap` for role and
event-count maps in its evaluation kernels, so even with `--threads 1`
and a fixed seed the MC output differs run-to-run by a few ppm due to
HashMap iteration order. The cert bundle spec requires byte-identical
ZIPs on rerun, so we cache the first MC result per
`(ir_sha256, spins, seed)` tuple to a deterministic JSON cache on disk.
Subsequent runs read the cache and never re-invoke the engine, which
makes the ZIP bit-equal across runs. Pass `force_rerun=True` to bypass
the cache (used by tests that want to exercise the engine path).
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[2]
ENGINE_BIN = REPO / "engine" / "slot-sim" / "target" / "release" / "slot-sim"
DEFAULT_CACHE_DIR = REPO / "reports" / "cert-bundle-swid" / "mc-cache"


class EngineUnavailable(RuntimeError):
    """Raised when the Rust slot-sim binary is missing or fails."""


def ensure_engine_available() -> None:
    if not ENGINE_BIN.exists():
        raise EngineUnavailable(
            f"slot-sim release binary not found at {ENGINE_BIN}. "
            f"Build with: cd engine/slot-sim && cargo build --release --bin slot-sim",
        )


def _parse_stdout(stdout: str) -> dict[str, float]:
    """Pull RTP / Hit freq / Win freq / Max spin out of slot-sim's text."""
    out: dict[str, float] = {}
    for line in stdout.splitlines():
        s = line.strip()
        if s.startswith("RTP:"):
            out["mc_rtp"] = float(s.split()[1])
        elif s.startswith("Hit freq:"):
            out["mc_hit_freq"] = float(s.split()[2])
        elif s.startswith("Win freq:"):
            out["mc_win_freq"] = float(s.split()[2])
        elif s.startswith("Max spin:"):
            # format: "Max spin:  329.97×"
            tok = s.split()[2].rstrip("××x")
            try:
                out["mc_max_single_x"] = float(tok)
            except ValueError:
                pass
        elif s.startswith("Spins:"):
            try:
                out["spins"] = float(s.split()[1])
            except ValueError:
                pass
    return out


def _cache_key(ir_blob: bytes, spins: int, seed: int) -> str:
    h = hashlib.sha256()
    h.update(ir_blob)
    h.update(f"|spins={spins}|seed={seed}|threads=1|v1".encode())
    return h.hexdigest()


def _read_cache(cache_dir: Path, key: str) -> dict[str, Any] | None:
    p = cache_dir / f"{key}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def _write_cache(cache_dir: Path, key: str, payload: dict[str, Any]) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    p = cache_dir / f"{key}.json"
    p.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n")


def run_mc(
    ir: dict[str, Any],
    *,
    spins: int,
    seed: int,
    timeout_sec: int = 600,
    threads: int = 1,
    cache_dir: Path | None = None,
    force_rerun: bool = False,
) -> dict[str, Any]:
    """Run the engine MC for one IR and return verdict numbers.

    The IR is written to a NamedTemporaryFile and removed afterwards;
    the engine binary is treated as a black box.

    `threads=1` is the default because the engine splits the spin budget
    across rayon threads and XORs the seed per chunk — so a multi-thread
    run is reproducible only when the thread count is also pinned. For
    a per-SWID cert bundle we want byte-identical output across machines
    so we always pin threads=1. 1M spins still completes in well under
    a second per SWID on a single core.
    """
    if cache_dir is None:
        cache_dir = DEFAULT_CACHE_DIR
    # Canonical IR blob — same bytes we'd use for the cache key.
    ir_blob = json.dumps(ir, sort_keys=True).encode("utf-8")
    key = _cache_key(ir_blob, spins, seed)
    if not force_rerun:
        cached = _read_cache(cache_dir, key)
        if cached is not None:
            return cached

    ensure_engine_available()
    with tempfile.NamedTemporaryFile(
        suffix=".slot-sim.ir.json", delete=False, mode="w",
    ) as tmp:
        # The engine doesn't care about IR canonicalisation but our
        # downstream reproducibility tests do — keep sort_keys on.
        tmp.write(ir_blob.decode("utf-8"))
        tmp_path = tmp.name
    try:
        r = subprocess.run(
            [
                str(ENGINE_BIN),
                "--ir", tmp_path,
                "--spins", str(spins),
                "--seed", str(seed),
                "--threads", str(threads),
            ],
            capture_output=True, text=True, timeout=timeout_sec,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
    if r.returncode != 0:
        raise EngineUnavailable(
            f"slot-sim failed rc={r.returncode}: {r.stderr[:400]}",
        )
    parsed = _parse_stdout(r.stdout)
    needed = {"mc_rtp", "mc_hit_freq", "mc_win_freq", "spins"}
    if not needed.issubset(parsed.keys()):
        raise EngineUnavailable(
            f"slot-sim output missing fields {needed - parsed.keys()}",
        )
    result = {
        "spins": int(parsed["spins"]),
        "seed": seed,
        "mc_rtp": parsed["mc_rtp"],
        "mc_hit_freq": parsed["mc_hit_freq"],
        "mc_win_freq": parsed["mc_win_freq"],
        "mc_max_single_x": parsed.get("mc_max_single_x", 0.0),
    }
    _write_cache(cache_dir, key, result)
    return result
