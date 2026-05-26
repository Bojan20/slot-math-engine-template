"""IR hash pinner — write `meta.lock_root_hash` into a universal IR.

The pinned hash is the SHA-256 over the canonical JSON encoding of
the IR **with `meta.lock_root_hash` removed** (so the field doesn't
hash itself). This way `is_pinned_current()` can verify by removing
the field, re-canonicalizing, hashing, and comparing.
"""
from __future__ import annotations
import copy
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


LOCK_FIELD = "lock_root_hash"


def _canonical_no_lock(ir: dict[str, Any]) -> bytes:
    """Canonical bytes with `meta.lock_root_hash` stripped."""
    ir_copy = copy.deepcopy(ir)
    meta = ir_copy.get("meta")
    if isinstance(meta, dict):
        meta.pop(LOCK_FIELD, None)
    return json.dumps(
        ir_copy, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def canonical_hash(ir: dict[str, Any]) -> str:
    """SHA-256 hex of the IR's canonical bytes (with lock field stripped)."""
    return hashlib.sha256(_canonical_no_lock(ir)).hexdigest()


def is_pinned_current(ir: dict[str, Any]) -> bool:
    """True iff `meta.lock_root_hash` matches the canonical hash."""
    meta = ir.get("meta") or {}
    pinned = meta.get(LOCK_FIELD)
    if not isinstance(pinned, str) or not pinned:
        return False
    return pinned == canonical_hash(ir)


@dataclass
class PinResult:
    rel_path: str
    action: str           # "pinned" | "already_current" | "error"
    old_hash: str | None
    new_hash: str | None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "rel_path": self.rel_path,
            "action": self.action,
            "old_hash": self.old_hash,
            "new_hash": self.new_hash,
            "error": self.error,
        }


@dataclass
class PinRunReport:
    games_root: str
    results: list[PinResult] = field(default_factory=list)

    @property
    def n_pinned(self) -> int:
        return sum(1 for r in self.results if r.action == "pinned")

    @property
    def n_unchanged(self) -> int:
        return sum(1 for r in self.results if r.action == "already_current")

    @property
    def n_errors(self) -> int:
        return sum(1 for r in self.results if r.action == "error")

    def to_dict(self) -> dict[str, Any]:
        return {
            "games_root": self.games_root,
            "n_pinned": self.n_pinned,
            "n_unchanged": self.n_unchanged,
            "n_errors": self.n_errors,
            "results": [r.to_dict() for r in self.results],
        }


def pin_ir(ir_path: Path, *, in_place: bool = True) -> PinResult:
    """Pin the canonical hash into `meta.lock_root_hash`. When
    `in_place=True`, the file is rewritten atomically."""
    ir_path = Path(ir_path)
    try:
        ir = json.loads(ir_path.read_text())
    except Exception as e:  # noqa: BLE001
        return PinResult(
            rel_path=str(ir_path), action="error",
            old_hash=None, new_hash=None, error=str(e),
        )
    old_hash = (ir.get("meta") or {}).get(LOCK_FIELD)
    new_hash = canonical_hash(ir)
    if old_hash == new_hash:
        return PinResult(
            rel_path=str(ir_path), action="already_current",
            old_hash=old_hash, new_hash=new_hash,
        )
    meta = ir.setdefault("meta", {})
    meta[LOCK_FIELD] = new_hash
    if in_place:
        tmp = ir_path.with_suffix(ir_path.suffix + ".tmp")
        tmp.write_text(json.dumps(ir, indent=2, sort_keys=True) + "\n")
        tmp.replace(ir_path)
    return PinResult(
        rel_path=str(ir_path), action="pinned",
        old_hash=old_hash, new_hash=new_hash,
    )


DEFAULT_GLOBS = ("**/*.ir.json", "**/ir.json", "**/universal_ir.json")


def _discover_irs(games_root: Path,
                  globs: Iterable[str] = DEFAULT_GLOBS) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for pat in globs:
        for p in sorted(games_root.glob(pat)):
            if p.is_file() and p not in seen:
                seen.add(p)
                out.append(p)
    return out


def pin_repo(
    games_root: Path,
    *,
    in_place: bool = True,
    check_only: bool = False,
) -> PinRunReport:
    """Walk `games_root`, pin every IR (or report stale ones when
    check_only=True). Returns a PinRunReport."""
    games_root = Path(games_root)
    report = PinRunReport(games_root=str(games_root))
    for path in _discover_irs(games_root):
        try:
            ir = json.loads(path.read_text())
        except Exception as e:  # noqa: BLE001
            report.results.append(PinResult(
                rel_path=str(path.relative_to(games_root)),
                action="error", old_hash=None, new_hash=None,
                error=str(e),
            ))
            continue
        old_hash = (ir.get("meta") or {}).get(LOCK_FIELD)
        new_hash = canonical_hash(ir)
        rel = str(path.relative_to(games_root))
        if old_hash == new_hash:
            report.results.append(PinResult(
                rel_path=rel, action="already_current",
                old_hash=old_hash, new_hash=new_hash,
            ))
            continue
        if check_only:
            report.results.append(PinResult(
                rel_path=rel, action="error",
                old_hash=old_hash, new_hash=new_hash,
                error="lock_root_hash stale; rerun without --check",
            ))
            continue
        meta = ir.setdefault("meta", {})
        meta[LOCK_FIELD] = new_hash
        if in_place:
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_text(json.dumps(ir, indent=2, sort_keys=True) + "\n")
            tmp.replace(path)
        report.results.append(PinResult(
            rel_path=rel, action="pinned",
            old_hash=old_hash, new_hash=new_hash,
        ))
    return report
