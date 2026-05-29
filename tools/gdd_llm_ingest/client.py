"""W6.2 — Anthropic SDK shim + protocol so the rest of the package can
work against a tiny abstract client (so tests don't need the SDK).

Why a shim and not a direct ``anthropic.Anthropic`` import?

* The repo's CI image does not ship the SDK; the shim lets us depend
  on a *protocol* (one ``messages_create(...)``-shaped method) and
  inject the SDK only when it's actually installed AND
  ``ANTHROPIC_API_KEY`` is present.
* Tests pass a `MockClient` implementing the same protocol — no SDK
  required.
* Keeps the dependency surface tight: the only thing the package
  imports from ``anthropic`` is the constructor.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Protocol


class LLMClientProtocol(Protocol):
    """Minimal contract: one ``messages_create`` call that returns the
    raw Anthropic Messages API response dict (or any obj exposing
    ``content``, ``usage``).
    """

    def messages_create(
        self,
        *,
        model: str,
        system: list[dict[str, Any]],
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        tool_choice: dict[str, Any],
        max_tokens: int,
        temperature: float,
        top_k: int | None,
    ) -> "LLMResponse":
        ...


@dataclass
class LLMResponse:
    """SDK-agnostic response object.

    ``tool_use_input`` is the ``input`` dict of the FIRST ``tool_use``
    content block returned by the model — i.e. the structured GDD
    payload we ultimately compile.
    """

    tool_use_input: dict[str, Any]
    stop_reason: str = "end_turn"
    model: str = ""
    usage: dict[str, int] = field(default_factory=dict)


class AnthropicShim:
    """Thin wrapper around the real ``anthropic.Anthropic`` client.

    Constructed lazily so the SDK import doesn't fire when the package
    is imported in offline / mocked tests.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self._api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY not set; "
                "use a mocked client or set the env var."
            )
        # Lazy import so CI without the SDK still loads this module.
        import anthropic  # noqa: WPS433 (runtime-only import is intentional)
        self._client = anthropic.Anthropic(api_key=self._api_key)

    def messages_create(
        self,
        *,
        model: str,
        system: list[dict[str, Any]],
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        tool_choice: dict[str, Any],
        max_tokens: int,
        temperature: float,
        top_k: int | None,
    ) -> LLMResponse:
        kwargs: dict[str, Any] = dict(
            model=model,
            system=system,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if top_k is not None:
            kwargs["top_k"] = top_k
        raw = self._client.messages.create(**kwargs)
        # Pull the first tool_use block.
        tool_use_input: dict[str, Any] = {}
        for block in raw.content:
            btype = getattr(block, "type", None)
            if btype == "tool_use":
                tool_use_input = dict(getattr(block, "input", {}) or {})
                break
        if not tool_use_input:
            raise RuntimeError(
                "Anthropic response contained no tool_use block; "
                f"stop_reason={getattr(raw, 'stop_reason', '?')}"
            )
        usage_obj = getattr(raw, "usage", None)
        usage: dict[str, int] = {}
        if usage_obj is not None:
            for k in (
                "input_tokens", "output_tokens",
                "cache_creation_input_tokens",
                "cache_read_input_tokens",
            ):
                v = getattr(usage_obj, k, None)
                if v is not None:
                    usage[k] = int(v)
        return LLMResponse(
            tool_use_input=tool_use_input,
            stop_reason=str(getattr(raw, "stop_reason", "end_turn")),
            model=str(getattr(raw, "model", model)),
            usage=usage,
        )


def build_default_client(
    api_key: str | None = None,
) -> LLMClientProtocol | None:
    """Construct the real client if possible, else return ``None``.

    Centralises the "is the API key set + is the SDK importable?"
    decision so callers don't sprinkle ``try / except ImportError`` all
    over.
    """
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        return AnthropicShim(api_key=key)
    except Exception:  # noqa: BLE001 — SDK missing / runtime failure
        return None
