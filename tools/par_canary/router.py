"""SLOT-MATH Faza 6.1 — Canary router: deterministic per-player variant pick.

Same player → always same variant for the session lifetime (no leakage).
Different players → distribution converges to canary_pct ± Wilson noise.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class CanaryConfig:
    """Defines a live/canary split for a game."""
    game_id: str
    live_variant: str
    canary_variant: str
    canary_pct: int  # 0-100, integer percentage of traffic routed to canary

    def __post_init__(self) -> None:
        if not 0 <= self.canary_pct <= 100:
            raise ValueError(f"canary_pct must be in [0, 100], got {self.canary_pct}")
        if self.live_variant == self.canary_variant:
            raise ValueError(
                f"live and canary variants must differ; both are {self.live_variant!r}"
            )


def _player_bucket(player_id: str, game_id: str) -> int:
    """Return deterministic bucket 0-99 from (player_id, game_id) hash.

    Same (player, game) → same bucket every time → sticky variant.
    """
    material = f"slot-math/canary/{game_id}/{player_id}".encode("utf-8")
    digest = hashlib.sha256(material).digest()
    # Take first 4 bytes → u32 → modulo 100
    bucket = int.from_bytes(digest[:4], byteorder="big", signed=False) % 100
    return bucket


def pick_variant_for_player(player_id: str, config: CanaryConfig) -> str:
    """Return the variant_id that should serve `player_id` for `config.game_id`.

    Args:
        player_id: opaque player identifier (UUID, account ID, anonymous token)
        config: canary configuration for the game

    Returns:
        Either config.canary_variant or config.live_variant.
    """
    bucket = _player_bucket(player_id, config.game_id)
    if bucket < config.canary_pct:
        return config.canary_variant
    return config.live_variant


def route_session(
    session_id: str,
    player_id: str,
    config: CanaryConfig,
) -> dict[str, str]:
    """Build a routing decision payload (logged to audit + returned to RGS).

    Returns dict with: session_id, player_id, game_id, variant_id, bucket
    """
    bucket = _player_bucket(player_id, config.game_id)
    variant = pick_variant_for_player(player_id, config)
    return {
        "session_id": session_id,
        "player_id": player_id,
        "game_id": config.game_id,
        "variant_id": variant,
        "bucket": str(bucket),
        "canary_pct": str(config.canary_pct),
        "routing_decision": "canary" if variant == config.canary_variant else "live",
    }
