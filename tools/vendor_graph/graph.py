"""W7.9 — Knowledge graph implementation."""

from __future__ import annotations

import dataclasses
import json
import re
import sqlite3
from pathlib import Path
from typing import Any, Iterable


# ─── Schema ──────────────────────────────────────────────────────────


SCHEMA = """
CREATE TABLE IF NOT EXISTS vendor (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    profile_version INTEGER NOT NULL,
    repo_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game (
    id INTEGER PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES vendor(id),
    name TEXT NOT NULL,
    swid TEXT NOT NULL,
    n_reels INTEGER,
    n_rows INTEGER,
    n_paylines INTEGER,
    left_to_right_only INTEGER,
    ir_repo_path TEXT,
    UNIQUE(vendor_id, swid)
);

CREATE TABLE IF NOT EXISTS feature (
    id INTEGER PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES game(id),
    kind TEXT NOT NULL,
    params_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS jurisdiction (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS game_jurisdiction (
    game_id INTEGER NOT NULL REFERENCES game(id),
    jurisdiction_id INTEGER NOT NULL REFERENCES jurisdiction(id),
    PRIMARY KEY(game_id, jurisdiction_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_game ON feature(game_id);
CREATE INDEX IF NOT EXISTS idx_feature_kind ON feature(kind);
CREATE INDEX IF NOT EXISTS idx_game_vendor ON game(vendor_id);
CREATE INDEX IF NOT EXISTS idx_game_jurisdiction ON game_jurisdiction(jurisdiction_id);
"""


# ─── Data classes ────────────────────────────────────────────────────


@dataclasses.dataclass
class QueryResult:
    columns: list[str]
    rows: list[tuple]

    def to_dict(self) -> dict[str, Any]:
        return {
            "columns": self.columns,
            "rows": [list(r) for r in self.rows],
        }

    def as_dicts(self) -> list[dict[str, Any]]:
        return [dict(zip(self.columns, r)) for r in self.rows]


# ─── Graph facade ────────────────────────────────────────────────────


class KnowledgeGraph:
    """In-memory (or file-backed) SQLite knowledge graph of slot games."""

    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db_path = str(db_path) if db_path is not None else ":memory:"
        self._conn = sqlite3.connect(self.db_path)
        self._conn.executescript(SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> "KnowledgeGraph":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    # ── Inserts ─────────────────────────────────────────────────

    def add_vendor(
        self,
        *,
        code: str,
        display_name: str,
        profile_version: int,
        repo_path: str,
    ) -> int:
        cur = self._conn.execute(
            "INSERT OR REPLACE INTO vendor(code, display_name, profile_version, repo_path) "
            "VALUES (?, ?, ?, ?)",
            (code, display_name, profile_version, repo_path),
        )
        self._conn.commit()
        return cur.lastrowid or self._vendor_id(code)

    def add_game(
        self,
        *,
        vendor_id: int,
        name: str,
        swid: str,
        n_reels: int | None,
        n_rows: int | None,
        n_paylines: int | None,
        left_to_right_only: bool | None,
        ir_repo_path: str | None,
    ) -> int:
        cur = self._conn.execute(
            "INSERT OR REPLACE INTO game(vendor_id, name, swid, n_reels, n_rows, "
            "n_paylines, left_to_right_only, ir_repo_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                vendor_id,
                name,
                swid,
                n_reels,
                n_rows,
                n_paylines,
                int(left_to_right_only) if left_to_right_only is not None else None,
                ir_repo_path,
            ),
        )
        self._conn.commit()
        return cur.lastrowid or self._game_id(vendor_id, swid)

    def add_feature(self, *, game_id: int, kind: str, params: dict[str, Any]) -> int:
        cur = self._conn.execute(
            "INSERT INTO feature(game_id, kind, params_json) VALUES (?, ?, ?)",
            (game_id, kind, json.dumps(params, sort_keys=True)),
        )
        self._conn.commit()
        return cur.lastrowid or 0

    def add_jurisdiction(self, code: str) -> int:
        cur = self._conn.execute(
            "INSERT OR IGNORE INTO jurisdiction(code) VALUES (?)", (code,)
        )
        self._conn.commit()
        if cur.lastrowid:
            return cur.lastrowid
        return self._conn.execute(
            "SELECT id FROM jurisdiction WHERE code = ?", (code,)
        ).fetchone()[0]

    def link_jurisdiction(self, *, game_id: int, jurisdiction_id: int) -> None:
        self._conn.execute(
            "INSERT OR IGNORE INTO game_jurisdiction(game_id, jurisdiction_id) "
            "VALUES (?, ?)",
            (game_id, jurisdiction_id),
        )
        self._conn.commit()

    # ── Lookups ─────────────────────────────────────────────────

    def _vendor_id(self, code: str) -> int:
        row = self._conn.execute(
            "SELECT id FROM vendor WHERE code = ?", (code,)
        ).fetchone()
        return row[0] if row else 0

    def _game_id(self, vendor_id: int, swid: str) -> int:
        row = self._conn.execute(
            "SELECT id FROM game WHERE vendor_id = ? AND swid = ?",
            (vendor_id, swid),
        ).fetchone()
        return row[0] if row else 0

    # ── Counters ────────────────────────────────────────────────

    def vendor_count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM vendor").fetchone()[0]

    def game_count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM game").fetchone()[0]

    def feature_count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM feature").fetchone()[0]

    # ── Queries ─────────────────────────────────────────────────

    def query(self, sql: str, params: tuple = ()) -> QueryResult:
        cur = self._conn.execute(sql, params)
        cols = [d[0] for d in (cur.description or [])]
        rows = cur.fetchall()
        return QueryResult(columns=cols, rows=rows)


# ─── High-level query helpers ────────────────────────────────────────


def cross_vendor_feature_query(
    graph: KnowledgeGraph, feature_kinds: list[str]
) -> QueryResult:
    """List every game that carries **every** feature kind in `feature_kinds`.

    The cross-vendor angle: results join `vendor` so the caller sees
    which vendors share the same feature combination — useful for spotting
    "everyone-but-Vendor X" mechanic gaps.
    """
    if not feature_kinds:
        return graph.query(
            "SELECT v.code AS vendor, g.name AS game, g.swid FROM game g "
            "JOIN vendor v ON v.id = g.vendor_id ORDER BY v.code, g.name"
        )
    placeholders = ",".join("?" * len(feature_kinds))
    sql = (
        "SELECT v.code AS vendor, g.name AS game, g.swid AS swid, "
        "GROUP_CONCAT(f.kind, ', ') AS features "
        "FROM game g "
        "JOIN vendor v ON v.id = g.vendor_id "
        "JOIN feature f ON f.game_id = g.id "
        f"WHERE f.kind IN ({placeholders}) "
        "GROUP BY g.id "
        f"HAVING COUNT(DISTINCT f.kind) = ? "
        "ORDER BY v.code, g.name"
    )
    return graph.query(sql, (*feature_kinds, len(feature_kinds)))


def games_by_jurisdiction(graph: KnowledgeGraph, code: str) -> QueryResult:
    return graph.query(
        "SELECT v.code AS vendor, g.name AS game, g.swid FROM game g "
        "JOIN vendor v ON v.id = g.vendor_id "
        "JOIN game_jurisdiction gj ON gj.game_id = g.id "
        "JOIN jurisdiction j ON j.id = gj.jurisdiction_id "
        "WHERE j.code = ? ORDER BY v.code, g.name",
        (code,),
    )


def similar_games(graph: KnowledgeGraph, *, n_reels: int, n_paylines: int) -> QueryResult:
    """Find games with the same reels × paylines topology."""
    return graph.query(
        "SELECT v.code AS vendor, g.name AS game, g.swid FROM game g "
        "JOIN vendor v ON v.id = g.vendor_id "
        "WHERE g.n_reels = ? AND g.n_paylines = ? "
        "ORDER BY v.code, g.name",
        (n_reels, n_paylines),
    )


# ─── Ingest ──────────────────────────────────────────────────────────


_YAML_SCALAR_RE = re.compile(
    r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$"
)


def _parse_minimal_yaml(text: str) -> dict[str, Any]:
    """Tiny YAML reader for vendor profile *header* lines.

    We only need top-level scalar key/values like ``vendor:``,
    ``display_name:``, ``profile_version:`` — full YAML support would
    drag in PyYAML which we don't want as a dep for one file format.
    """
    out: dict[str, Any] = {}
    for line in text.splitlines():
        if line.startswith("#"):
            continue
        m = _YAML_SCALAR_RE.match(line)
        if not m:
            continue
        key, raw = m.group(1), m.group(2).strip()
        if raw.startswith(("'", '"')) and raw.endswith(("'", '"')):
            raw = raw[1:-1]
        if raw.isdigit():
            out[key] = int(raw)
        else:
            try:
                out[key] = float(raw)
            except ValueError:
                out[key] = raw
    return out


def _ingest_vendor_profile(graph: KnowledgeGraph, path: Path) -> int | None:
    text = path.read_text()
    header = _parse_minimal_yaml(text)
    code = header.get("vendor")
    if not code:
        return None
    display = header.get("display_name", code)
    version = int(header.get("profile_version", 1))
    return graph.add_vendor(
        code=str(code),
        display_name=str(display),
        profile_version=version,
        repo_path=str(path),
    )


def _ingest_ir(
    graph: KnowledgeGraph, vendor_id: int, path: Path
) -> int | None:
    try:
        ir = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    meta = ir.get("meta") if isinstance(ir, dict) else None
    if not isinstance(meta, dict):
        return None
    swid = meta.get("swid")
    if not swid:
        return None
    game_id = graph.add_game(
        vendor_id=vendor_id,
        name=meta.get("name", "unknown"),
        swid=str(swid),
        n_reels=meta.get("reels"),
        n_rows=meta.get("rows"),
        n_paylines=meta.get("lines") or meta.get("paylines"),
        left_to_right_only=meta.get("left_to_right_only"),
        ir_repo_path=str(path),
    )
    # Features
    features = ir.get("features") if isinstance(ir, dict) else None
    if isinstance(features, list):
        for f in features:
            kind = f.get("kind") if isinstance(f, dict) else None
            if not kind:
                continue
            params = {k: v for k, v in f.items() if k != "kind"}
            graph.add_feature(game_id=game_id, kind=str(kind), params=params)
    # Light placeholder feature flags from top-level IR blocks (W4.7).
    for block_name in ("linear_progressive", "fort_knox_pick_bonus", "free_spins"):
        if isinstance(ir.get(block_name), dict):
            graph.add_feature(
                game_id=game_id, kind=block_name, params={"detected_from_block": True}
            )
    # Jurisdictions
    jurisdictions = ir.get("jurisdictions") if isinstance(ir, dict) else None
    if isinstance(jurisdictions, list):
        for j in jurisdictions:
            if isinstance(j, str) and j:
                jid = graph.add_jurisdiction(j)
                graph.link_jurisdiction(game_id=game_id, jurisdiction_id=jid)
    return game_id


def _vendor_id_for_path(graph: KnowledgeGraph, path: Path) -> int | None:
    """Pull vendor code from filename convention ``<vendor>.<swid>.*.json``."""
    parts = path.name.split(".")
    if len(parts) < 2:
        return None
    vendor_code = parts[0]
    vid = graph._vendor_id(vendor_code)
    return vid if vid else None


def ingest_repo(
    *,
    profiles_dir: Path | str,
    games_glob: Iterable[Path] | None = None,
    db_path: str | Path | None = None,
) -> KnowledgeGraph:
    """Build a KnowledgeGraph from vendor profiles + IR globs.

    `profiles_dir` defaults to the conventional ``tools/vendor_profiles``.
    `games_glob` is an iterable of IR JSON paths (caller decides which
    to include — keeps the function testable without a fixed repo
    layout).
    """
    graph = KnowledgeGraph(db_path=db_path)
    profiles_dir = Path(profiles_dir)
    if profiles_dir.exists():
        for yaml_path in sorted(profiles_dir.glob("*.yaml")):
            _ingest_vendor_profile(graph, yaml_path)
    if games_glob is None:
        return graph
    for ir_path in sorted(games_glob):
        vendor_id = _vendor_id_for_path(graph, ir_path)
        if vendor_id is None:
            continue
        _ingest_ir(graph, vendor_id, ir_path)
    return graph
