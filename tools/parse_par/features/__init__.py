"""Feature parser registry.

Each feature parser has signature:

    def parse(rows: list[list[str]], config: dict, profile: VendorProfile) -> Any

Register via `register("type_name", parser_fn)`. The vendor profile
references parsers by `type_name` in its `features:` list.
"""
from __future__ import annotations
from typing import Callable

_REGISTRY: dict[str, Callable] = {}


def register(name: str, fn: Callable):
    if name in _REGISTRY:
        raise ValueError(f"feature parser {name!r} already registered")
    _REGISTRY[name] = fn


def get_parser(name: str):
    return _REGISTRY.get(name)


def registered_parsers() -> list[str]:
    return sorted(_REGISTRY.keys())


# Eager-register all bundled parsers.
from . import free_spins as _fs        # noqa: F401, E402
from . import cash_eruption as _ce     # noqa: F401, E402
from . import linear_progressive as _lp  # noqa: F401, E402
from . import fort_knox_pick_bonus as _fk  # noqa: F401, E402
