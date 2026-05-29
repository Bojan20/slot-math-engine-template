"""W7.4 — GDD → Multi-Modal Asset Manifest Pipeline (procedural shell).

The original W7.4 row in the master TODO assumed a heavy stack:
Stable Diffusion XL for symbol art, ElevenLabs for FS narration,
procedural BGM via DAW automation, Unity/Phaser scene graph. All of
that lives **upstream** of the slot math engine — what the engine
needs is a **deterministic manifest** that tells the asset pipeline
WHAT to generate for any given Game Design Document.

This module is exactly that manifest builder:

* :class:`GddSpec` — high-level designer-facing description of a
  game (theme, mood, volatility, symbols, features, BGM hint).
* :func:`build_asset_manifest(gdd)` → :class:`AssetManifest` with
  per-symbol art prompts, per-feature narration scripts, BGM tempo
  curve, scene-graph YAML stub, all derived deterministically from
  the GDD inputs.
* :func:`procedural_bgm_curve(...)` — volatility-class-based tempo
  envelope (low: 70 BPM steady, ultra: 120 BPM ramping).

Pure stdlib — no SDXL, no ElevenLabs, no DAW. The downstream pipeline
plugs into whichever external generator the operator licenses; this
module guarantees the input contract is sealed by the math team.

Industry-first per Kimi W181: a deterministic GDD→manifest layer
that the math team owns end-to-end with byte-stable hashes for
audit. No incumbent vendor ships one.
"""

from .pipeline import (
    AssetManifest,
    BgmCurve,
    GddSpec,
    NarrationScript,
    SceneGraphStub,
    SymbolAsset,
    build_asset_manifest,
    procedural_bgm_curve,
    write_manifest_yaml,
)

__all__ = [
    "AssetManifest",
    "BgmCurve",
    "GddSpec",
    "NarrationScript",
    "SceneGraphStub",
    "SymbolAsset",
    "build_asset_manifest",
    "procedural_bgm_curve",
    "write_manifest_yaml",
]
