"""W6.2 — Five canonical demo prompts (one per archetype).

The prompts double as:

* test fixtures (``test_5_archetype_prompts_compile``)
* CLI demo seeds for ``python3 -m tools.gdd_llm_ingest --demo-corpus``
* canonical mock-response keys (each prompt maps to a hand-authored
  schema-conformant tool_use payload in
  :mod:`tools.gdd_llm_ingest.demo_responses`)
"""

from __future__ import annotations

DEMO_PROMPTS: dict[str, str] = {
    "lines": (
        "design a 96% RTP wolf-themed 5x3 lines slot with 20 paylines, "
        "medium volatility, free spins triggered by 3 scatters. "
        "Name 'Wolf Eruption LLM'."
    ),
    "ways": (
        "build a 96% RTP tiger-themed 243 ways slot at 5 reels 3 rows, "
        "medium volatility, free spins. Name 'Tiger 243 Ways LLM'."
    ),
    "megaways": (
        "design a 95% RTP storm/olympus megaways slot, high volatility, "
        "free spins, max win 25000x. Name 'Storm Megaways LLM'."
    ),
    "hold_and_win": (
        "design a 96 % RTP wolf-themed 5x3 lines game with 20 paylines, "
        "a hold-and-win Fireball bonus and free spins, medium volatility. "
        "Name 'Wolf Fireball HW LLM'."
    ),
    "cascade": (
        "build a 96% RTP orchard-themed 5x3 cascade slot, medium volatility, "
        "free spins, max win 10000x. Name 'Orchard Cascade LLM'."
    ),
}


# Hand-authored mocked tool_use payloads — one per archetype.  These
# stand in for the real Anthropic response in tests + offline demos.
# Each payload is intentionally schema-conformant and tuned to land
# in the feasible region of the downstream pipeline.
DEMO_RESPONSES: dict[str, dict] = {
    "lines": {
        "name": "Wolf Eruption LLM",
        "theme_tags": ["wolf", "volcano", "mythic"],
        "archetype": "lines",
        "reels": 5,
        "rows": 3,
        "paylines": 20,
        "target_rtp": 0.96,
        "volatility_class": "medium",
        "hit_freq_target": 0.21,
        "max_win_x": 5000,
        "features": [
            {
                "kind": "free_spins",
                "trigger_count_min": 3,
                "initial_spins": 5,
                "global_multiplier": 1.0,
            },
        ],
        "symbols_hint": {
            "n_hp": 4,
            "n_lp": 4,
            "theme_hp_ids": [
                "hp_wolf", "hp_volcano", "hp_moon", "hp_totem",
            ],
        },
    },
    "ways": {
        "name": "Tiger 243 Ways LLM",
        "theme_tags": ["tiger", "jade", "lantern"],
        "archetype": "ways",
        "reels": 5,
        "rows": 3,
        "target_rtp": 0.96,
        "volatility_class": "medium",
        "hit_freq_target": 0.40,
        "max_win_x": 10000,
        "features": [
            {
                "kind": "free_spins",
                "trigger_count_min": 3,
                "initial_spins": 8,
            },
        ],
        "symbols_hint": {
            "n_hp": 4,
            "n_lp": 4,
            "theme_hp_ids": [
                "hp_tiger", "hp_jade", "hp_lantern", "hp_dragon",
            ],
        },
    },
    "megaways": {
        "name": "Storm Megaways LLM",
        "theme_tags": ["storm", "thunder", "olympus"],
        "archetype": "megaways",
        "reels": 5,
        "rows": 3,
        "target_rtp": 0.95,
        "volatility_class": "high",
        "hit_freq_target": 0.30,
        "max_win_x": 25000,
        "features": [
            {
                "kind": "free_spins",
                "trigger_count_min": 3,
                "initial_spins": 10,
            },
        ],
        "symbols_hint": {
            "n_hp": 4,
            "n_lp": 4,
            "theme_hp_ids": [
                "hp_zeus", "hp_lightning", "hp_eagle", "hp_helmet",
            ],
        },
    },
    "hold_and_win": {
        "name": "Wolf Fireball HW LLM",
        "theme_tags": ["wolf", "fireball", "mythic"],
        "archetype": "hold_and_win",
        "reels": 5,
        "rows": 3,
        "paylines": 20,
        "target_rtp": 0.96,
        "volatility_class": "medium",
        "hit_freq_target": 0.21,
        "max_win_x": 5000,
        "features": [
            {
                "kind": "free_spins",
                "trigger_count_min": 3,
                "initial_spins": 5,
                "global_multiplier": 1.0,
            },
            {
                "kind": "hold_and_win",
                "trigger_count_min": 6,
                "respins_initial": 3,
            },
        ],
        "symbols_hint": {
            "n_hp": 4,
            "n_lp": 4,
            "theme_hp_ids": [
                "hp_wolf", "hp_fireball", "hp_moon", "hp_totem",
            ],
        },
    },
    "cascade": {
        "name": "Orchard Cascade LLM",
        "theme_tags": ["fruit", "orchard", "harvest"],
        "archetype": "cascade",
        "reels": 5,
        "rows": 3,
        "target_rtp": 0.96,
        "volatility_class": "medium",
        "hit_freq_target": 0.45,
        "max_win_x": 10000,
        "features": [
            {
                "kind": "free_spins",
                "trigger_count_min": 3,
                "initial_spins": 10,
            },
            {
                "kind": "cascade",
                "replacement": "drop",
                "max_chain": 20,
            },
        ],
        "symbols_hint": {
            "n_hp": 3,
            "n_lp": 3,
            "theme_hp_ids": [
                "hp_apple", "hp_pear", "hp_cherry",
            ],
        },
    },
}


def pick_demo_response(prompt: str) -> dict:
    """Pick the canonical mock response for a prompt by keyword.

    Used by the offline demo flow + the CLI when no real client is
    available.  Selection priority matches the LLM prompt rules in
    :mod:`tools.gdd_llm_ingest.prompt`.
    """
    low = prompt.lower()
    if "hold" in low and "win" in low:
        return DEMO_RESPONSES["hold_and_win"]
    if "megaways" in low:
        return DEMO_RESPONSES["megaways"]
    if "cascade" in low or "tumble" in low or "avalanche" in low:
        return DEMO_RESPONSES["cascade"]
    if "ways" in low and "243" in low:
        return DEMO_RESPONSES["ways"]
    if "ways" in low:
        return DEMO_RESPONSES["ways"]
    return DEMO_RESPONSES["lines"]
