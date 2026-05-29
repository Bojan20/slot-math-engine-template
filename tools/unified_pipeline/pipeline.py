"""W7.11 — Unified Audit Pipeline implementation."""

from __future__ import annotations

import dataclasses
import hashlib
import json
from pathlib import Path
from typing import Any

from tools.gdd_asset_pipeline.pipeline import (
    AssetManifest,
    GddSpec,
    build_asset_manifest,
)
from tools.math_genome.genome import (
    GenomeConfig,
    GenomeSpec,
    SelfEvolvingMathGenome,
)
from tools.par_compiler_js.compile import JsBundle, build_js_bundle
from tools.provenance_mesh.mesh import (
    SessionMesh,
    build_session_mesh,
)
from tools.rl_player_emulator.player import (
    KPIReport,
    casual_archetype,
    run_cohort,
)
from tools.symbolic_slot_math.model import (
    DerivativeManifest,
    RtpModel,
    build_derivative_manifest,
)


# ─── Inputs ─────────────────────────────────────────────────────────


@dataclasses.dataclass
class UnifiedAuditConfig:
    """Knobs that control the unified pipeline run."""

    gdd: GddSpec
    rtp_model: RtpModel
    """Base RtpModel — used for symbolic differentiation + RL cohort."""
    n_genome_population: int = 16
    n_genome_generations: int = 8
    n_genome_seed: int = 12345
    target_rtp_pct: float = 96.0
    target_cv: float = 8.0
    target_hit_freq: float = 0.27
    n_rl_players: int = 4
    n_rl_sessions: int = 3
    rl_seed: int = 999
    n_session_mesh_spins: int = 32
    session_id: str = "unified-audit-session"


# ─── Outputs ────────────────────────────────────────────────────────


@dataclasses.dataclass
class UnifiedAuditReport:
    """The single artefact emitted by run_unified_pipeline().

    Every sub-manifest's canonical hash is recorded here so the
    consolidated_hash deterministically commits to all of them.
    """

    gdd_hash: str
    asset_manifest_hash: str
    derivative_manifest_hash: str
    pareto_hash: str
    rl_kpi_hash: str
    session_mesh_root: str
    js_bundle_sha256: str
    consolidated_hash: str

    # Plus inline copies of the smaller artefacts for one-stop audit.
    pareto_summary: list[dict[str, Any]]
    rl_kpi: dict[str, Any]
    asset_manifest_brief: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


# ─── Hash helpers ───────────────────────────────────────────────────


def _canonical_hash(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def _list_hash(items: list[dict[str, Any]]) -> str:
    raw = json.dumps(items, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


# ─── Synthetic spin generator (deterministic) ───────────────────────


def _synthesize_spins(
    cfg: UnifiedAuditConfig,
) -> list[dict[str, Any]]:
    """Generate a deterministic short list of spin records for the
    provenance mesh demo. We use SHA-256(idx, session_id) as a stand-in
    for server_seed so the result is byte-stable across runs."""
    spins: list[dict[str, Any]] = []
    for i in range(cfg.n_session_mesh_spins):
        seed_bytes = hashlib.sha256(
            f"{cfg.session_id}:{i}".encode()
        ).hexdigest()
        spins.append({
            "server_seed_hex": seed_bytes,
            "client_seed": f"client-{i}",
            "nonce": i,
            "outcome": {
                "reel_stops": [(i + r) % 10 for r in range(cfg.rtp_model.n_reels)],
                "payout": 0.0 if i % 7 else 1.5,
            },
        })
    return spins


# ─── Top-level runner ──────────────────────────────────────────────


def run_unified_pipeline(cfg: UnifiedAuditConfig) -> UnifiedAuditReport:
    """Run every W7.x kernel in sequence and emit a UnifiedAuditReport.

    Pipeline order:

    1. **W7.4** asset manifest from the GDD.
    2. **W7.6** derivative manifest from the RtpModel.
    3. **W7.1** genome evolve → Pareto frontier summary.
    4. **W7.3** RL cohort run → KPI report.
    5. **W7.5** synthetic session mesh.
    6. **W7.7** live PAR compiler JS bundle (built once; bundle SHA
       pinned in the report).

    Each step is deterministic given the config. The final
    consolidated_hash is a SHA-256 over the ordered sub-manifest
    digests.
    """
    # ── W7.4 — asset manifest ────────────────────────────────────
    asset_manifest: AssetManifest = build_asset_manifest(cfg.gdd)
    asset_hash = asset_manifest.manifest_hash()

    # ── W7.6 — derivative manifest ───────────────────────────────
    deriv_manifest: DerivativeManifest = build_derivative_manifest(cfg.rtp_model)
    deriv_hash = deriv_manifest.sha256_hex

    # ── W7.1 — genome evolve ─────────────────────────────────────
    genome_spec = GenomeSpec(
        n_reels=cfg.rtp_model.n_reels,
        n_symbols=cfg.rtp_model.n_symbols,
        paytable=cfg.rtp_model.paytable,
        min_match=cfg.rtp_model.min_match,
        paylines=cfg.rtp_model.paylines,
        anchor=cfg.rtp_model.anchor,
        target_rtp=cfg.target_rtp_pct,
        target_cv=cfg.target_cv,
        target_hit_freq=cfg.target_hit_freq,
    )
    genome_cfg = GenomeConfig(
        population_size=cfg.n_genome_population,
        generations=cfg.n_genome_generations,
        seed=cfg.n_genome_seed,
    )
    pareto = SelfEvolvingMathGenome(genome_spec, genome_cfg).evolve()
    pareto_summary = [
        {
            "rtp": m.rtp,
            "cv": m.cv,
            "hit_freq": m.hit_freq,
            "fitness": list(m.fitness),
        }
        for m in pareto.members
    ]
    pareto_hash = _list_hash(pareto_summary)

    # ── W7.3 — RL cohort ─────────────────────────────────────────
    rl_kpi_report: KPIReport
    rl_kpi_report, _ = run_cohort(
        casual_archetype(),
        cfg.rtp_model,
        n_players=cfg.n_rl_players,
        sessions_per_player=cfg.n_rl_sessions,
        base_seed=cfg.rl_seed,
    )
    rl_kpi = rl_kpi_report.to_dict()
    rl_kpi_hash = _canonical_hash(rl_kpi)

    # ── W7.5 — provenance session mesh ───────────────────────────
    spins = _synthesize_spins(cfg)
    mesh: SessionMesh = build_session_mesh(cfg.session_id, spins)
    session_root = mesh.merkle_root_hex

    # ── W7.7 — JS bundle ─────────────────────────────────────────
    js_bundle: JsBundle = build_js_bundle()
    js_sha = js_bundle.sha256_hex

    # ── Consolidated commitment ──────────────────────────────────
    consolidated_hash = _canonical_hash({
        "gdd_hash": cfg.gdd.canonical_hash(),
        "asset_manifest_hash": asset_hash,
        "derivative_manifest_hash": deriv_hash,
        "pareto_hash": pareto_hash,
        "rl_kpi_hash": rl_kpi_hash,
        "session_mesh_root": session_root,
        "js_bundle_sha256": js_sha,
    })

    return UnifiedAuditReport(
        gdd_hash=cfg.gdd.canonical_hash(),
        asset_manifest_hash=asset_hash,
        derivative_manifest_hash=deriv_hash,
        pareto_hash=pareto_hash,
        rl_kpi_hash=rl_kpi_hash,
        session_mesh_root=session_root,
        js_bundle_sha256=js_sha,
        consolidated_hash=consolidated_hash,
        pareto_summary=pareto_summary,
        rl_kpi=rl_kpi,
        asset_manifest_brief={
            "gdd_id": asset_manifest.gdd_id,
            "n_symbol_assets": len(asset_manifest.symbol_assets),
            "n_narration_scripts": len(asset_manifest.narration_scripts),
            "n_bgm_curves": len(asset_manifest.bgm_curves),
        },
    )


def write_unified_report(report: UnifiedAuditReport, out_path: Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(report.to_dict(), sort_keys=True, indent=2)
    )
    return out_path
