"""W7.3 — Append-only audit trail with SHA-256 hash chain.

Every CLI / pipeline action writes one JSON line (`.jsonl`) carrying:
  • action name (parse / compile / synth / sign / verify / pipeline.run)
  • timestamp (UTC ISO-8601 with microseconds)
  • inputs (paths, args)
  • outputs (cert zip path, ir_sha256, signature prefix, RTP measured)
  • prev_sha256 (SHA-256 of previous line's full JSON)
  • sha256_chain (SHA-256 of `prev_sha256 || canonical_json_of_this_line`)

The chain field makes the audit log tamper-evident: changing any past
entry invalidates every subsequent `sha256_chain` link, easily detectable
by a single scan.

Use cases
=========
- Compliance: regulator asks "what's the chain of custody on this IR?"
  → grep audit.log.jsonl for the spec_path / ir_sha256 and follow the
  chain backward to the build moment.
- Sales: "we ran 432 synth jobs last month and 0 failed verify"
  → wc -l + grep.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Optional


def _sha256_str(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _last_chain(audit_path: Path) -> str:
    """Return the previous line's sha256_chain, or all-zeros if empty."""
    if not audit_path.exists():
        return "0" * 64
    try:
        with audit_path.open("rb") as f:
            last_line = b""
            for line in f:
                line = line.strip()
                if line:
                    last_line = line
            if not last_line:
                return "0" * 64
            data = json.loads(last_line.decode("utf-8"))
            return data.get("sha256_chain") or "0" * 64
    except (OSError, ValueError):
        return "0" * 64


def append_audit(
    audit_path: Path | str,
    *,
    action: str,
    inputs: Optional[dict] = None,
    outputs: Optional[dict] = None,
    started_at_utc: Optional[str] = None,
) -> dict[str, Any]:
    """Append one audit entry to `audit_path`. Returns the entry as dict
    (including the freshly computed `sha256_chain`)."""
    from datetime import datetime, timezone

    audit_path = Path(audit_path)
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    prev = _last_chain(audit_path)
    entry: dict[str, Any] = {
        "action": action,
        "timestamp_utc": started_at_utc or datetime.now(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%S.%fZ"
        ),
        "inputs": inputs or {},
        "outputs": outputs or {},
        "prev_sha256": prev,
    }
    canonical = json.dumps(entry, sort_keys=True, separators=(",", ":"))
    entry["sha256_chain"] = _sha256_str(prev + canonical)

    # Append as JSON line
    with audit_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, sort_keys=False) + "\n")
    return entry


def verify_audit_chain(audit_path: Path | str) -> tuple[bool, list[int]]:
    """Walk the audit log forward, recomputing each line's
    `sha256_chain` and asserting it matches. Returns (ok, bad_lines)
    where `bad_lines` are 1-based line numbers of broken links.
    """
    audit_path = Path(audit_path)
    if not audit_path.exists():
        return True, []
    prev = "0" * 64
    bad: list[int] = []
    with audit_path.open("r", encoding="utf-8") as f:
        for i, raw in enumerate(f, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                entry = json.loads(raw)
            except ValueError:
                bad.append(i)
                continue
            if entry.get("prev_sha256") != prev:
                bad.append(i)
            chain = entry.pop("sha256_chain", "")
            canonical = json.dumps(entry, sort_keys=True, separators=(",", ":"))
            expected = _sha256_str(prev + canonical)
            if expected != chain:
                bad.append(i)
            prev = chain
    return (len(bad) == 0), bad


def read_audit(audit_path: Path | str) -> list[dict]:
    """Read the full audit log as a list of dicts (in chronological order)."""
    audit_path = Path(audit_path)
    if not audit_path.exists():
        return []
    out: list[dict] = []
    with audit_path.open("r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                out.append(json.loads(raw))
            except ValueError:
                continue
    return out
