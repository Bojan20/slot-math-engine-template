"""W6.3 — asciinema-cast emitter + plain-text transcript builder.

The asciinema v2 format is a JSON header object followed by one JSON
array per event::

    {"version": 2, "width": 100, "height": 30, "timestamp": <epoch>, ...}
    [0.1, "o", "first stdout chunk"]
    [0.4, "o", "next chunk"]

We pin the epoch + every event timestamp so the same run inputs produce
byte-identical `.cast` output across runs.

Output is a plain-text record with section headers, the prompt, the
serialised GDD YAML, sha256 of the YAML, and a one-line stats footer.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


CAST_VERSION = 2
CAST_WIDTH = 100
CAST_HEIGHT = 36
CAST_EPOCH = 1_700_000_000  # pinned for determinism
CAST_SHELL = "/bin/bash"
CAST_TERM = "xterm-256color"


@dataclass
class CastEvent:
    rel_time: float  # seconds since cast start
    stream: str       # "o" = stdout, "i" = stdin
    data: str

    def to_json(self) -> str:
        # asciinema-cast emits one JSON array per line.
        return json.dumps([round(self.rel_time, 4), self.stream, self.data])


@dataclass
class CastSession:
    title: str
    events: list[CastEvent] = field(default_factory=list)
    cursor_time: float = 0.0

    def emit(self, text: str, *, advance_ms: int = 0) -> None:
        if advance_ms:
            self.cursor_time += advance_ms / 1000.0
        self.events.append(CastEvent(self.cursor_time, "o", text))

    def serialise(self) -> str:
        header = {
            "version": CAST_VERSION,
            "width": CAST_WIDTH,
            "height": CAST_HEIGHT,
            "timestamp": CAST_EPOCH,
            "title": self.title,
            "env": {"SHELL": CAST_SHELL, "TERM": CAST_TERM},
        }
        # Stable header order via sort_keys; events keep insertion order.
        out = [json.dumps(header, sort_keys=True)]
        for ev in self.events:
            out.append(ev.to_json())
        return "\n".join(out) + "\n"


@dataclass
class DemoRecord:
    archetype: str
    mode: str                # "mock" | "live"
    prompt: str
    wall_clock_ms: int
    model: str
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    gdd_yaml: str
    gdd_sha256: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "archetype": self.archetype,
            "mode": self.mode,
            "prompt": self.prompt,
            "wall_clock_ms": self.wall_clock_ms,
            "model": self.model,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cache_creation_input_tokens": self.cache_creation_input_tokens,
            "cache_read_input_tokens": self.cache_read_input_tokens,
            "gdd_sha256": self.gdd_sha256,
        }


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_cast(record: DemoRecord) -> str:
    """Build a deterministic asciinema cast for one demo prompt."""
    cs = CastSession(title=f"W6.2 LLM ingest demo — {record.archetype}")
    cs.emit(
        f"$ python3 -m tools.gdd_llm_ingest \\\n"
        f"      \"{record.prompt}\"\n",
        advance_ms=0,
    )
    cs.emit(
        f"▶ archetype={record.archetype}\n",
        advance_ms=200,
    )
    cs.emit(
        f"  prompt: {record.prompt!r}\n",
        advance_ms=50,
    )
    cs.emit(
        f"  calling {record.model} (mode={record.mode})...\n",
        advance_ms=50,
    )
    cs.emit(
        f"  wall_clock={record.wall_clock_ms} ms\n",
        advance_ms=record.wall_clock_ms,
    )
    cs.emit(
        f"  tokens in={record.input_tokens} out={record.output_tokens} "
        f"cache_create={record.cache_creation_input_tokens} "
        f"cache_read={record.cache_read_input_tokens}\n",
        advance_ms=10,
    )
    cs.emit(
        f"  GDD sha256={record.gdd_sha256[:16]}…\n",
        advance_ms=10,
    )
    cs.emit(
        "  → wrote GDD YAML\n",
        advance_ms=10,
    )
    return cs.serialise()


def build_transcript(record: DemoRecord) -> str:
    lines = [
        f"### W6.2 LLM ingest demo — {record.archetype}",
        "",
        f"Mode: {record.mode}",
        f"Model: {record.model}",
        f"Wall-clock: {record.wall_clock_ms} ms",
        f"Tokens (in/out/cache_create/cache_read): "
        f"{record.input_tokens} / {record.output_tokens} / "
        f"{record.cache_creation_input_tokens} / "
        f"{record.cache_read_input_tokens}",
        f"GDD sha256: {record.gdd_sha256}",
        "",
        "Prompt:",
        record.prompt,
        "",
        "Generated GDD YAML:",
        "----------------------------------------",
        record.gdd_yaml.rstrip("\n"),
        "----------------------------------------",
        "",
    ]
    return "\n".join(lines) + "\n"


def write_cast(out_dir: Path, record: DemoRecord) -> Path:
    p = out_dir / f"{record.archetype}.cast"
    p.write_text(build_cast(record), encoding="utf-8")
    return p


def write_transcript(out_dir: Path, record: DemoRecord) -> Path:
    p = out_dir / f"{record.archetype}.transcript.txt"
    p.write_text(build_transcript(record), encoding="utf-8")
    return p
