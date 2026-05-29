"""W6.2 — System prompt + few-shot exemplars for the GDD LLM ingester.

The system prompt teaches Claude to call the ``output_gdd`` tool with a
strict JSON payload matching :mod:`tools.gdd_llm_ingest.schema`.  Every
example pins the canonical archetype shape so the model never invents
fields outside the schema.

Both ``SYSTEM_PROMPT`` and ``FEW_SHOT_BLOCK`` carry
``cache_control: ephemeral`` markers in :func:`build_messages` so
repeated invocations within Anthropic's 5-minute prompt-cache TTL hit
the cache + drop the per-request input-token cost.
"""

from __future__ import annotations

from typing import Any


# Bump this when SYSTEM_PROMPT / schema / FEW_SHOT_BLOCK change so old
# cache files invalidate cleanly.
SCHEMA_VERSION = "w6.2-llm-gdd-v1"

# Current production model (Claude Opus).  The W6.2 mission requires the
# current Opus; we default to the latest known ID and accept overrides
# via the CLI flag.
DEFAULT_MODEL = "claude-opus-4-5-20250929"


SYSTEM_PROMPT = """You are a slot-game math designer assisting Vendor B.

Your job: read a free-form natural-language game brief and respond
EXCLUSIVELY by calling the `output_gdd` tool with a structured JSON
payload that captures the game's mechanical skeleton.

Hard rules:
1. NEVER respond with prose.  ALWAYS call `output_gdd`.
2. The payload MUST validate against the tool's JSON schema.
3. Pick sensible defaults when the prompt is silent:
   - reels=5, rows=3
   - target_rtp=0.96 (for "lines"/"ways"/"megaways"/"hold_and_win"/"cascade")
   - volatility_class="medium"
   - hit_freq_target=0.25 for lines, 0.40 for ways/cascade, 0.30 for
     megaways, 0.25 for hold_and_win
   - paylines=20 ONLY when archetype="lines" or "hold_and_win"
   - symbols_hint.n_hp=4, n_lp=4
4. Use the user's stated RTP if present (e.g. "96 % RTP" => 0.96;
   "RTP 95" => 0.95).  Accept percentages or fractions.
5. Volatility hints: "low/medium/high/ultra" map 1:1.  "volatile" =>
   "high", "smooth"/"low-vol" => "low".
6. Features:
   - "free spins" / "FS" => feature with kind="free_spins",
     trigger_count_min=3, initial_spins=10
   - "hold and win" / "hold-and-win" / "H&W" => add a feature with
     kind="hold_and_win", trigger_prob=0.008, avg_pay_per_trigger=12.5
   - "cascade" / "tumble" / "avalanche" => kind="cascade",
     replacement="symbol_drop"
   - Always include free_spins UNLESS the user explicitly excludes it.
7. Archetype detection priority (first match wins):
   hold_and_win > megaways > cascade > ways > lines.
8. theme_tags: extract 1-5 lowercase keywords from the prompt
   (e.g. "wolf", "mythic", "vault", "fireball").  When the prompt is
   themeless use ["studio", "demo"].
9. symbols_hint.theme_hp_ids: 1-4 short lowercase identifiers prefixed
   with "hp_" derived from theme_tags (e.g. "hp_wolf").  Optional.

Output discipline: temperature is 0, top_k is 1, so identical prompts
must produce identical tool calls.  Never randomise.
"""


# Few-shot exemplars — five archetypes, one per shot.  These pin the
# schema-conformant shape; the LLM mimics them when answering new
# prompts.  Each is a (user_prompt, assistant_tool_use) pair encoded as
# message blocks.
FEW_SHOT_BLOCK: list[dict[str, Any]] = [
    # 1. lines
    {
        "role": "user",
        "content": [{
            "type": "text",
            "text": (
                "design a 5x3 lines slot, RTP 95%, medium volatility, "
                "20 paylines, name 'Wolf Eruption Demo'. Free spins."
            ),
        }],
    },
    {
        "role": "assistant",
        "content": [{
            "type": "tool_use",
            "id": "fs_lines_1",
            "name": "output_gdd",
            "input": {
                "name": "Wolf Eruption Demo",
                "theme_tags": ["wolf", "volcano", "mythic"],
                "archetype": "lines",
                "reels": 5,
                "rows": 3,
                "paylines": 20,
                "target_rtp": 0.95,
                "volatility_class": "medium",
                "hit_freq_target": 0.21,
                "max_win_x": 5000,
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
                    "theme_hp_ids": ["hp_wolf", "hp_volcano",
                                     "hp_moon", "hp_totem"],
                },
            },
        }],
    },
    # 2. ways
    {
        "role": "user",
        "content": [{
            "type": "text",
            "text": (
                "build a 243 ways tiger-themed slot at 96% RTP, "
                "medium volatility, free spins triggered by 3 scatters."
            ),
        }],
    },
    {
        "role": "assistant",
        "content": [{
            "type": "tool_use",
            "id": "fs_ways_2",
            "name": "output_gdd",
            "input": {
                "name": "Tiger 243 Ways",
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
                        "initial_spins": 10,
                    },
                ],
                "symbols_hint": {
                    "n_hp": 4,
                    "n_lp": 4,
                    "theme_hp_ids": ["hp_tiger", "hp_jade",
                                     "hp_lantern", "hp_dragon"],
                },
            },
        }],
    },
]


def build_messages(prompt: str) -> list[dict[str, Any]]:
    """Return the full Anthropic ``messages`` list (few-shot + user).

    The first few-shot user block carries ``cache_control: ephemeral``
    so the entire shared prefix is cache-eligible.  The trailing user
    prompt does NOT carry cache_control (it varies per request).
    """
    msgs: list[dict[str, Any]] = []
    for i, block in enumerate(FEW_SHOT_BLOCK):
        # Deep-ish copy that preserves nested dicts (cheap; lists are
        # short).
        new_content: list[dict[str, Any]] = []
        for c in block["content"]:
            entry = dict(c)
            # Mark the FIRST user content of the prefix as cache-boundary.
            if i == 0 and block["role"] == "user" and entry.get("type") == "text":
                entry["cache_control"] = {"type": "ephemeral"}
            new_content.append(entry)
        msgs.append({"role": block["role"], "content": new_content})
    # Trailing user message — actual prompt, not cached.
    msgs.append({
        "role": "user",
        "content": [{"type": "text", "text": prompt}],
    })
    return msgs


def build_system() -> list[dict[str, Any]]:
    """Return the Anthropic ``system`` field as a cacheable block list."""
    return [{
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    }]
