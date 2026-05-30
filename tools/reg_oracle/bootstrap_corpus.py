#!/usr/bin/env python3
"""
W244 wave 9 — Bootstrap deterministic traces.jsonl for the reg-oracle agent.

Walks `tools/jurisdiction/profiles/*.yaml` and emits one trace per
(profile, field-of-interest) tuple plus one trace per few-shot example
markdown. Output is byte-stable across reruns at the same seed because:

  * traces are sorted lexicographically by (jurisdiction, field, kind);
  * UUIDs are derived from `uuid5(REG_ORACLE_NS, f"{jurisdiction}|{field}|{kind}")`
    NOT random;
  * `ingested_at` uses a deterministic-by-merkle timestamp scheme so the
    file Merkle-hashes consistently for the qa-quick determinism gate.

Output: agents/reg-oracle/corpus/traces.jsonl
"""
from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
PROFILES_ROOT = REPO / "tools" / "jurisdiction" / "profiles"
EXAMPLES_ROOT = REPO / "agents" / "reg-oracle" / "examples"
SPEC_MD = REPO / "agents" / "REGULATORY_ORACLE.md"
OUT = REPO / "agents" / "reg-oracle" / "corpus" / "traces.jsonl"

REG_ORACLE_NS = uuid.UUID("a7b3c2d1-e4f5-6789-abcd-ef0123456789")

# Profile fields we surface as individual lookups. Each becomes its own
# trace so RAG retrieval can pin a single (jurisdiction, field) hit.
FIELDS_OF_INTEREST = [
    ("rtp_range", "rtp", "RTP floor + ceiling tuple"),
    ("max_win_x", "stake", "Max win multiplier (× total stake)"),
    ("min_spin_duration_ms", "duration", "Minimum spin cycle (ms)"),
    ("max_stake_default", "stake", "Default stake ceiling (currency-neutral)"),
    ("prohibited_features", "prohibited", "Feature blacklist"),
    ("require_ldw_disclosure", "disclosure", "Losses-disguised-as-wins disclosure"),
    ("require_session_time_display", "disclosure", "Session timer display"),
    ("require_loss_limits", "disclosure", "Loss limit toggle"),
    ("require_reality_checks", "disclosure", "Reality check intervals"),
    ("near_miss_rule", "disclosure", "Near-miss randomness contract"),
    ("age_tiered_stakes", "age", "Age-tiered stake limits"),
]


def _det_uuid(*parts: str) -> str:
    """Deterministic UUID5 over a delimited key."""
    key = "|".join(parts)
    return str(uuid.uuid5(REG_ORACLE_NS, key))


def _profile_trace(jurisdiction: str, profile: dict, field: str,
                   category: str, hint: str) -> dict | None:
    """Build one trace for a (jurisdiction, field) tuple if present."""
    if field not in profile:
        return None
    value = profile[field]
    text = (
        f"# Jurisdiction lookup — {profile.get('name', jurisdiction.upper())}\n\n"
        f"**Field:** `{field}`  \n"
        f"**Category:** {category}  \n"
        f"**Value:** `{json.dumps(value, ensure_ascii=False)}`  \n"
        f"**Hint:** {hint}  \n\n"
        f"Source: `tools/jurisdiction/profiles/{jurisdiction}.yaml`"
    )
    return {
        "trace_id": _det_uuid("profile", jurisdiction, field),
        "agent": "reg-oracle",
        "source": "profile",
        "path": f"tools/jurisdiction/profiles/{jurisdiction}.yaml",
        "kind": "lookup",
        "text": text,
        "metadata": {
            "jurisdiction": jurisdiction,
            "field": field,
            "category": category,
        },
        "license": "internal",
        "ingested_at": "deterministic-by-merkle",
    }


def _example_trace(example_path: Path) -> dict:
    """Build one trace per few-shot example markdown."""
    rel = example_path.relative_to(REPO)
    return {
        "trace_id": _det_uuid("few_shot", str(rel)),
        "agent": "reg-oracle",
        "source": "few_shot_example",
        "path": str(rel),
        "kind": "example",
        "text": example_path.read_text(encoding="utf-8"),
        "metadata": {"taxonomy_hint": example_path.stem},
        "license": "internal",
        "ingested_at": "deterministic-by-merkle",
    }


def _spec_trace() -> dict | None:
    if not SPEC_MD.exists():
        return None
    rel = SPEC_MD.relative_to(REPO)
    return {
        "trace_id": _det_uuid("spec", str(rel)),
        "agent": "reg-oracle",
        "source": "spec",
        "path": str(rel),
        "kind": "spec",
        "text": SPEC_MD.read_text(encoding="utf-8"),
        "metadata": {"agent_spec": True},
        "license": "internal",
        "ingested_at": "deterministic-by-merkle",
    }


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)

    traces: list[dict] = []

    # 1. Per-profile lookups (sorted for deterministic order)
    profile_paths = sorted(PROFILES_ROOT.glob("*.yaml"))
    for pp in profile_paths:
        profile = yaml.safe_load(pp.read_text(encoding="utf-8"))
        jurisdiction = pp.stem
        for field, category, hint in FIELDS_OF_INTEREST:
            t = _profile_trace(jurisdiction, profile, field, category, hint)
            if t is not None:
                traces.append(t)

    # 2. Few-shot examples (sorted)
    if EXAMPLES_ROOT.exists():
        for ex in sorted(EXAMPLES_ROOT.glob("*.md")):
            traces.append(_example_trace(ex))

    # 3. Spec markdown
    spec_trace = _spec_trace()
    if spec_trace is not None:
        traces.append(spec_trace)

    # Sort once more by (kind, source, trace_id) for byte-stable JSONL
    traces.sort(key=lambda t: (t["kind"], t["source"], t["trace_id"]))

    # Compute Merkle root over trace_id+text for the deterministic timestamp
    h = hashlib.sha256()
    for t in traces:
        h.update(f"{t['trace_id']}|{hashlib.sha256(t['text'].encode()).hexdigest()}\n".encode())
    merkle_root = h.hexdigest()
    det_ts = f"deterministic-by-merkle:{merkle_root[:16]}"

    # Inject deterministic timestamp + write
    for t in traces:
        t["ingested_at"] = det_ts
    OUT.write_text(
        "\n".join(json.dumps(t, ensure_ascii=False) for t in traces) + "\n",
        encoding="utf-8",
    )
    print(f"[reg-oracle] wrote {OUT.relative_to(REPO)}")
    print(f"  traces:      {len(traces)}")
    print(f"  profiles:    {len(profile_paths)}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
