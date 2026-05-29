"""W7.4 — GDD → Asset Manifest Pipeline implementation."""

from __future__ import annotations

import dataclasses
import hashlib
import json
from pathlib import Path
from typing import Any


# ─── GDD spec ────────────────────────────────────────────────────────


VOLATILITY_TEMPO = {
    "low": (70, 75),       # steady, contemplative
    "medium": (90, 100),   # standard slot pace
    "high": (105, 115),    # energetic
    "ultra": (115, 130),   # high-stakes, ramping
}


@dataclasses.dataclass
class GddSpec:
    """High-level designer-facing description of one game."""

    game_id: str
    name: str
    theme: str
    mood: str
    """e.g. "epic", "playful", "noir", "festive" """
    volatility_class: str
    """one of: low, medium, high, ultra"""
    symbols: list[str]
    """ordered list of symbol display names"""
    features: list[str]
    """ordered list of feature kinds: free_spins, hold_and_win, ..."""
    target_age_band: str = "18-34"
    studio: str = "internal"

    def validate(self) -> None:
        if not self.game_id:
            raise ValueError("game_id required")
        if not self.symbols:
            raise ValueError("at least one symbol required")
        if self.volatility_class not in VOLATILITY_TEMPO:
            raise ValueError(
                f"volatility_class must be one of {sorted(VOLATILITY_TEMPO)}"
            )

    def canonical_hash(self) -> str:
        payload = json.dumps(
            dataclasses.asdict(self), sort_keys=True, separators=(",", ":")
        ).encode()
        return hashlib.sha256(payload).hexdigest()


# ─── Asset dataclasses ──────────────────────────────────────────────


@dataclasses.dataclass
class SymbolAsset:
    """Per-symbol art prompt descriptor."""

    symbol_id: str
    display_name: str
    prompt: str
    style_tags: list[str]
    aspect_ratio: str
    seed_hint: int

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclasses.dataclass
class NarrationScript:
    """One voice-over script for a feature trigger / outcome."""

    cue_id: str
    feature_kind: str
    trigger: str
    """e.g. 'enter_free_spins', 'big_win', 'jackpot'"""
    text: str
    voice_persona: str

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclasses.dataclass
class BgmCurve:
    """BPM envelope per phase."""

    phase: str
    bpm_start: int
    bpm_end: int
    duration_s: float

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclasses.dataclass
class SceneGraphStub:
    """High-level Unity/Phaser scene graph as YAML-friendly dict tree."""

    root: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return self.root


@dataclasses.dataclass
class AssetManifest:
    """Full manifest emitted by build_asset_manifest."""

    gdd_id: str
    gdd_hash: str
    symbol_assets: list[SymbolAsset]
    narration_scripts: list[NarrationScript]
    bgm_curves: list[BgmCurve]
    scene_graph: SceneGraphStub

    def manifest_hash(self) -> str:
        payload = json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(payload).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        return {
            "gdd_id": self.gdd_id,
            "gdd_hash": self.gdd_hash,
            "symbol_assets": [s.to_dict() for s in self.symbol_assets],
            "narration_scripts": [n.to_dict() for n in self.narration_scripts],
            "bgm_curves": [b.to_dict() for b in self.bgm_curves],
            "scene_graph": self.scene_graph.to_dict(),
        }


# ─── Builders ───────────────────────────────────────────────────────


_STYLE_BY_MOOD = {
    "epic": ["cinematic", "dramatic lighting", "high contrast"],
    "playful": ["pastel", "soft-edge", "cartoon"],
    "noir": ["monochrome", "shadow-heavy", "rim-light"],
    "festive": ["confetti", "warm palette", "bokeh"],
    "default": ["clean", "high-detail", "neutral palette"],
}


def _symbol_prompt(gdd: GddSpec, symbol: str) -> str:
    style = _STYLE_BY_MOOD.get(gdd.mood, _STYLE_BY_MOOD["default"])
    style_str = ", ".join(style)
    return (
        f"{symbol} icon for {gdd.theme}-themed slot game, "
        f"{style_str}, transparent background, square frame"
    )


def _symbol_seed(gdd_hash: str, symbol: str) -> int:
    seed_bytes = hashlib.sha256((gdd_hash + symbol).encode()).digest()
    return int.from_bytes(seed_bytes[:4], "big")


def build_symbol_assets(gdd: GddSpec) -> list[SymbolAsset]:
    gdd_hash = gdd.canonical_hash()
    style = _STYLE_BY_MOOD.get(gdd.mood, _STYLE_BY_MOOD["default"])
    return [
        SymbolAsset(
            symbol_id=f"sym_{i:03d}",
            display_name=sym,
            prompt=_symbol_prompt(gdd, sym),
            style_tags=list(style),
            aspect_ratio="1:1",
            seed_hint=_symbol_seed(gdd_hash, sym),
        )
        for i, sym in enumerate(gdd.symbols)
    ]


def build_narration_scripts(gdd: GddSpec) -> list[NarrationScript]:
    """One script per (feature × canonical trigger)."""
    out: list[NarrationScript] = []
    persona = "warm_baritone" if gdd.mood in {"epic", "noir"} else "bright_alto"
    for feat in gdd.features:
        # Standard trigger taxonomy across features.
        triggers = [
            ("enter", f"Enter {feat.replace('_', ' ')}!"),
            ("big_win", "Big win!"),
        ]
        if feat == "free_spins":
            triggers.append(("retrigger", "Free spins retriggered!"))
        if feat == "hold_and_win":
            triggers.append(("jackpot", "Jackpot!"))
        for trigger, base_text in triggers:
            out.append(NarrationScript(
                cue_id=f"{feat}.{trigger}",
                feature_kind=feat,
                trigger=trigger,
                text=f"[{gdd.theme}] {base_text}",
                voice_persona=persona,
            ))
    return out


def procedural_bgm_curve(volatility_class: str) -> list[BgmCurve]:
    lo, hi = VOLATILITY_TEMPO.get(volatility_class, VOLATILITY_TEMPO["medium"])
    return [
        BgmCurve(phase="lobby", bpm_start=lo, bpm_end=lo, duration_s=30.0),
        BgmCurve(phase="base_game", bpm_start=lo, bpm_end=hi, duration_s=120.0),
        BgmCurve(phase="bonus", bpm_start=hi, bpm_end=hi + 5, duration_s=60.0),
        BgmCurve(phase="big_win", bpm_start=hi + 10, bpm_end=hi + 10, duration_s=8.0),
    ]


def build_scene_graph_stub(gdd: GddSpec) -> SceneGraphStub:
    return SceneGraphStub(root={
        "type": "Scene",
        "id": f"{gdd.game_id}_root",
        "theme": gdd.theme,
        "children": [
            {
                "type": "ReelStrip",
                "id": "reels",
                "n_reels": 5,
                "n_rows": 3,
                "anchor_symbols": gdd.symbols[:1],
            },
            {
                "type": "PaytablePanel",
                "id": "paytable",
                "symbols": [{"id": f"sym_{i:03d}", "name": s}
                            for i, s in enumerate(gdd.symbols)],
            },
            {
                "type": "FeatureOverlay",
                "id": "features",
                "features": gdd.features,
            },
            {
                "type": "AudioLayer",
                "id": "audio",
                "tempo_envelope": "see bgm_curves",
            },
        ],
    })


def build_asset_manifest(gdd: GddSpec) -> AssetManifest:
    gdd.validate()
    gdd_hash = gdd.canonical_hash()
    return AssetManifest(
        gdd_id=gdd.game_id,
        gdd_hash=gdd_hash,
        symbol_assets=build_symbol_assets(gdd),
        narration_scripts=build_narration_scripts(gdd),
        bgm_curves=procedural_bgm_curve(gdd.volatility_class),
        scene_graph=build_scene_graph_stub(gdd),
    )


def write_manifest_yaml(manifest: AssetManifest, out_path: Path) -> Path:
    """Emit the manifest as a YAML-friendly JSON document.

    We stay JSON to keep the dep set minimal — PyYAML round-trip ⇒
    same logical content; downstream loaders handle both formats.
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(manifest.to_dict(), indent=2, sort_keys=True))
    return out_path
