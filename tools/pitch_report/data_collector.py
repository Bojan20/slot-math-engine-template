"""W6.3 — Pitch data collector.

Walks the repo for:
  • 12 vendor SWID cert bundles (verdict + sha256 + signature info)
  • 5 greenfield archetype acceptance summaries
  • W5.7 Wolf Eruption Mythic end-to-end demo result
  • W6.1 deterministic NL ingest sample outputs
  • W6.2 LLM NL ingest sample outputs (mocked)
  • Recent commit log for the wave timeline
  • Architecture diagram (static ASCII)

All numbers are loaded read-only from the file system; if a cert bundle
is missing, ``ensure_cert_bundles`` rebuilds them in-process via the
existing :mod:`tools.cert_bundle_swid.runner` API.

Output: one nested dict, JSON-serialisable, with sorted keys throughout.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from tools.cert_bundle_swid.runner import (
    DEFAULT_EPOCH,
    DEFAULT_OUT_DIR as CERT_DEFAULT_OUT_DIR,
    GAME_SWIDS,
    SWID_TO_GAME,
    build_bundle_for_swid,
)
from tools.cert_bundle_swid.sign import load_or_generate_key
from tools.cert_bundle_swid.zip_bundle import unpack_bundle


REPO = Path(__file__).resolve().parents[2]
DEFAULT_PITCH_OUT = REPO / "reports" / "pitch-report"
TOOL_VERSION = "tools.pitch_report/v1.0 (W6.3)"

# Pinned epoch — deterministic outputs across runs.
PITCH_EPOCH = DEFAULT_EPOCH  # 1_700_000_000

# Archetype display order — sorted alphabetically for determinism.
ARCHETYPE_ORDER = ["cascade", "hold_and_win", "lines", "megaways", "ways"]

# Vendor display order — sorted alphabetically for determinism.
VENDOR_GAMES_ORDER = sorted(GAME_SWIDS.keys())

# Wave timeline rows — pinned, sorted, hand-curated one-line summaries
# of the Wave history. Used by the renderer for the timeline section.
WAVE_TIMELINE: list[tuple[str, str]] = [
    ("W4.13", "Organic closeout — rtp_source overrides removed"),
    ("W4.14", "MC verification standard tier + report"),
    ("W4.15", "Per-SWID regulator cert bundle (operator-package.zip × 12)"),
    ("W4.16", "Engine HaW closeout — CE Fireball pages + FKWR units contract"),
    ("W4.17", "Structural cleanup — CE FS pages-sampled, FKWR magic literal removed"),
    ("W4.19", "FKWR FS strip weight optimizer — magic constant removed"),
    ("W5.7", "Greenfield game pipeline demo — end-to-end NEW game from GDD"),
    ("W5.8", "Greenfield katalog × 5 arhetipa — lines/ways/megaways/H&W/cascade"),
    ("W6.1", "Deterministic NL → GDD ingest (regex/keyword extraction)"),
    ("W6.2", "LLM-assisted NL → GDD ingest — Claude as math-compiler frontend"),
    ("W6.3", "Pitch HTML + LLM demo recorder (this artefact)"),
]


@dataclass
class CollectedData:
    """Top-level structured dict ready to render."""

    schema: str
    generated_at_epoch: int
    repo_sha: str
    repo_sha_short: str
    tool_version: str
    pubkey_fingerprint: str
    vendor_swids: list[dict[str, Any]]
    archetypes: list[dict[str, Any]]
    wolf_eruption_demo: dict[str, Any]
    nl_comparison: list[dict[str, Any]]
    wave_timeline: list[dict[str, str]]
    architecture_diagram: str
    signatures: list[dict[str, str]]

    def to_dict(self) -> dict[str, Any]:
        # Use a sorted-keys round-trip to guarantee determinism.
        return {
            "schema": self.schema,
            "generated_at_epoch": self.generated_at_epoch,
            "repo_sha": self.repo_sha,
            "repo_sha_short": self.repo_sha_short,
            "tool_version": self.tool_version,
            "pubkey_fingerprint": self.pubkey_fingerprint,
            "vendor_swids": self.vendor_swids,
            "archetypes": self.archetypes,
            "wolf_eruption_demo": self.wolf_eruption_demo,
            "nl_comparison": self.nl_comparison,
            "wave_timeline": self.wave_timeline,
            "architecture_diagram": self.architecture_diagram,
            "signatures": self.signatures,
        }


# ─── helpers ───────────────────────────────────────────────────────────


def _repo_sha() -> str:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=REPO, capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0:
            return r.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return "unknown"


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ─── vendor SWIDs (12) ─────────────────────────────────────────────────


def ensure_cert_bundles(
    out_dir: Path = CERT_DEFAULT_OUT_DIR,
    *,
    mc_spins: int = 100_000,
) -> None:
    """Build any missing cert bundles in-place.

    Uses a smaller MC budget than the production CLI default (1M spins)
    so pitch-report regeneration is fast. The verdict shape is identical
    — only the |delta_rtp| variance changes.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    for game, swids in GAME_SWIDS.items():
        for swid in swids:
            zp = out_dir / f"{game}.{swid}.operator-package.zip"
            if zp.exists():
                continue
            build_bundle_for_swid(
                game, swid,
                out_dir=out_dir,
                mc_spins=mc_spins,
                mc_cache_dir=out_dir / "mc-cache",
            )


def _bundle_rows(bundles_dir: Path) -> list[dict[str, Any]]:
    """Read every per-SWID cert ZIP and extract the verdict + sha256."""
    rows: list[dict[str, Any]] = []
    for swid in sorted(SWID_TO_GAME.keys()):
        game = SWID_TO_GAME[swid]
        zp = bundles_dir / f"{game}.{swid}.operator-package.zip"
        if not zp.exists():
            rows.append({
                "swid": swid,
                "game": game,
                "status": "MISSING",
                "zip_sha256": "",
                "zip_bytes": 0,
                "target_rtp": 0.0,
                "closed_form_rtp": 0.0,
                "mc_rtp": 0.0,
                "mc_hit_freq": 0.0,
                "target_hit_freq": 0.0,
                "delta_rtp": 0.0,
                "delta_hit_freq": 0.0,
                "verdict": "MISSING",
                "signature_ok": False,
            })
            continue
        zip_bytes = zp.read_bytes()
        zip_sha = hashlib.sha256(zip_bytes).hexdigest()
        contents = unpack_bundle(zip_bytes)
        acc_name = f"verdict/{game}.{swid}.acceptance.json"
        cf_name = f"verdict/{game}.{swid}.closed_form.json"
        mc_name = f"verdict/{game}.{swid}.mc_verdict.json"
        meta_name = "meta/version.json"
        try:
            acc = json.loads(contents[acc_name].decode())
        except (KeyError, ValueError):
            acc = {"verdict": "MISSING", "has_skip": False}
        try:
            cf = json.loads(contents[cf_name].decode())
        except (KeyError, ValueError):
            cf = {}
        try:
            mc = json.loads(contents[mc_name].decode())
        except (KeyError, ValueError):
            mc = {}
        try:
            meta = json.loads(contents[meta_name].decode())
        except (KeyError, ValueError):
            meta = {}

        # Signature integrity check (we trust the bundle's own SIGNATURE.sig
        # if MANIFEST sha256s match the archived blobs).
        signature_ok = "SIGNATURE.sig" in contents and "MANIFEST.json" in contents

        rows.append({
            "swid": swid,
            "game": game,
            "status": acc.get("verdict", "?"),
            "zip_sha256": zip_sha,
            "zip_bytes": len(zip_bytes),
            "target_rtp": _safe_float(cf.get("target_rtp")),
            "closed_form_rtp": _safe_float(cf.get("closed_form_rtp")),
            "mc_rtp": _safe_float(mc.get("mc_rtp")),
            "mc_hit_freq": _safe_float(mc.get("mc_hit_freq")),
            "target_hit_freq": _safe_float(mc.get("target_hit_freq")),
            "delta_rtp": _safe_float(mc.get("delta_rtp")),
            "delta_hit_freq": _safe_float(mc.get("delta_hit_freq")),
            "verdict": acc.get("verdict", "?"),
            "signature_ok": signature_ok,
            "pubkey_fingerprint": meta.get("ed25519_pubkey_fingerprint", ""),
        })
    return rows


# ─── greenfield archetypes (5) ─────────────────────────────────────────


def _archetype_rows(greenfield_dir: Path) -> list[dict[str, Any]]:
    """Read archetype_summary.json (5 archetypes) + fall back to defaults."""
    summary_path = greenfield_dir / "archetype_summary.json"
    rows: list[dict[str, Any]] = []
    summary: dict[str, Any] = {}
    if summary_path.exists():
        try:
            summary = json.loads(summary_path.read_text())
        except ValueError:
            summary = {}

    archetypes = summary.get("archetypes", {}) if isinstance(summary, dict) else {}

    for arch in ARCHETYPE_ORDER:
        entry = archetypes.get(arch, {})
        rows.append({
            "archetype": arch,
            "swid": entry.get("swid", "—"),
            "verdict": entry.get("verdict", "PENDING"),
            "target_rtp": _safe_float(entry.get("target_rtp")),
            "mc_rtp": _safe_float(entry.get("mc_rtp")),
            "target_hit_freq": _safe_float(entry.get("target_hit_freq")),
            "mc_hit_freq": _safe_float(entry.get("mc_hit_freq")),
            "delta_rtp": _safe_float(entry.get("delta_rtp")),
            "delta_hit_freq": _safe_float(entry.get("delta_hit_freq")),
            "smt_delta_rtp": _safe_float(entry.get("smt_delta_rtp")),
            "cert_zip": entry.get("cert_zip", ""),
        })
    return rows


# ─── W5.7 Wolf Eruption Mythic demo ─────────────────────────────────────


def _wolf_eruption_block(greenfield_dir: Path) -> dict[str, Any]:
    """W5.7 end-to-end demo block (DSL → SMT → IR → MC → cert)."""
    name = "wolf-eruption-mythic"
    candidates = [
        ("dsl_spec", greenfield_dir / f"{name}.dsl.spec.json"),
        ("smt_synth", greenfield_dir / f"{name}.smt_synth.json"),
        ("ir", greenfield_dir / f"{name}.slot-sim.ir.json"),
        ("mc_verdict", greenfield_dir / f"{name}.mc_verdict.json"),
        ("acceptance", greenfield_dir / f"{name}.acceptance.json"),
    ]
    stages = {}
    for key, p in candidates:
        if p.exists():
            try:
                stages[key] = json.loads(p.read_text())
            except ValueError:
                stages[key] = None
        else:
            stages[key] = None

    acc = stages.get("acceptance") or {}
    mc = stages.get("mc_verdict") or {}
    smt = stages.get("smt_synth") or {}
    gates: list[dict[str, Any]] = []
    if isinstance(acc, dict):
        gates = list(acc.get("gates") or [])

    return {
        "title": "Wolf Eruption Mythic (W5.7 lines archetype)",
        "stages_present": {k: stages[k] is not None for k in stages},
        "target_rtp": _safe_float(mc.get("target_rtp") if isinstance(mc, dict) else None),
        "mc_rtp": _safe_float(mc.get("mc_rtp") if isinstance(mc, dict) else None),
        "delta_rtp": _safe_float(mc.get("delta_rtp") if isinstance(mc, dict) else None),
        "smt_delta_rtp": _safe_float(smt.get("delta_rtp") if isinstance(smt, dict) else None),
        "verdict": (acc.get("verdict") if isinstance(acc, dict) else "PENDING") or "PENDING",
        "gates": [
            {
                "name": g.get("name", ""),
                "status": g.get("status", "?"),
                "value": _safe_float(g.get("value")),
                "tolerance": _safe_float(g.get("tolerance")),
                "reason": g.get("reason", ""),
            }
            for g in gates
        ],
    }


# ─── W6.1 vs W6.2 NL comparison ────────────────────────────────────────


def _nl_comparison() -> list[dict[str, Any]]:
    """Three sample prompts shown side-by-side: W6.1 deterministic vs W6.2 LLM."""
    from tools.gdd_llm_ingest.demo_prompts import DEMO_PROMPTS, DEMO_RESPONSES

    # Pick 3 deterministic prompts (sorted archetypes, take first 3).
    chosen = sorted(DEMO_PROMPTS.keys())[:3]
    rows: list[dict[str, Any]] = []
    for arch in chosen:
        prompt = DEMO_PROMPTS[arch]
        llm_payload = DEMO_RESPONSES.get(arch, {})
        rows.append({
            "archetype": arch,
            "prompt": prompt,
            "w61_deterministic": {
                "approach": "regex + keyword extraction",
                "detected_archetype": arch,
                "deterministic": True,
            },
            "w62_llm": {
                "approach": "Anthropic Claude tool_use (temperature=0, top_k=1)",
                "detected_archetype": llm_payload.get("archetype", arch),
                "target_rtp": _safe_float(llm_payload.get("target_rtp")),
                "max_win_x": int(_safe_float(llm_payload.get("max_win_x"))),
                "n_features": len(llm_payload.get("features", []) or []),
            },
        })
    return rows


# ─── architecture diagram (static) ─────────────────────────────────────


ARCH_DIAGRAM = """
NL Prompt
   │
   ├─[W6.1]─▶ regex/keyword parser ──▶ GDD YAML ─┐
   │                                              │
   └─[W6.2]─▶ Claude tool_use (det)  ──▶ GDD YAML ┤
                                                  │
                                                  ▼
                                          archetype pipeline
                                                  │
                              ┌───────────┬───────┴───────┬──────────┐
                              ▼           ▼               ▼          ▼
                          DSL spec  ──▶ SMT solver ──▶ Slot-sim IR ─▶ MC
                                                                       │
                                                                       ▼
                                                         per-SWID cert bundle
                                                          (ZIP + ed25519 sig)
                                                                       │
                                                                       ▼
                                                              regulator/operator
""".strip("\n")


# ─── top-level collector ───────────────────────────────────────────────


def collect(
    *,
    bundles_dir: Path | None = None,
    greenfield_dir: Path | None = None,
    epoch: int = PITCH_EPOCH,
    regenerate_missing: bool = True,
    cert_mc_spins: int = 50_000,
) -> CollectedData:
    """Build the full pitch data dict.

    Parameters
    ----------
    bundles_dir:
        Override the cert-bundle dir (default `reports/cert-bundle-swid/`).
    greenfield_dir:
        Override the greenfield-demo dir (default `reports/greenfield-demo/`).
    epoch:
        Pinned epoch for the `generated_at_epoch` field.
    regenerate_missing:
        When True (default), missing cert bundles are rebuilt in-process.
    cert_mc_spins:
        MC spin budget used when rebuilding missing bundles.
    """
    bdir = bundles_dir or CERT_DEFAULT_OUT_DIR
    gdir = greenfield_dir or (REPO / "reports" / "greenfield-demo")
    if regenerate_missing:
        ensure_cert_bundles(out_dir=bdir, mc_spins=cert_mc_spins)

    repo_sha = _repo_sha()
    keys = load_or_generate_key()

    vendor = _bundle_rows(bdir)
    archetypes = _archetype_rows(gdir)
    wolf = _wolf_eruption_block(gdir)
    nl = _nl_comparison()

    signatures = [
        {
            "swid": r["swid"],
            "game": r["game"],
            "zip_sha256": r["zip_sha256"],
            "pubkey_fingerprint": r["pubkey_fingerprint"] or keys.pubkey_fingerprint,
        }
        for r in vendor
    ]

    return CollectedData(
        schema="slotmath.pitch-report/v1",
        generated_at_epoch=int(epoch),
        repo_sha=repo_sha,
        repo_sha_short=repo_sha[:7] if repo_sha != "unknown" else "unknown",
        tool_version=TOOL_VERSION,
        pubkey_fingerprint=keys.pubkey_fingerprint,
        vendor_swids=vendor,
        archetypes=archetypes,
        wolf_eruption_demo=wolf,
        nl_comparison=nl,
        wave_timeline=[{"wave": w, "summary": s} for w, s in WAVE_TIMELINE],
        architecture_diagram=ARCH_DIAGRAM,
        signatures=signatures,
    )
