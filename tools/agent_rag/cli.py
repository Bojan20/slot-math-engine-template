"""tools.agent_rag.cli — RAG ingest/search CLI (PHASE 8 P8.6a)."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    import yaml  # type: ignore
except ImportError:
    print("ERR: pyyaml required", file=sys.stderr)
    sys.exit(2)

from tools.agent_paths import agents_root as _agents_root

AGENTS_ROOT = _agents_root()
KNOWN_AGENTS = {"par-parser", "reg-oracle", "math-debug"}

# ── tokeniser ───────────────────────────────────────────────────────────


_token_re = re.compile(r"[A-Za-z0-9_]+")


def tokenise(text: str) -> List[str]:
    return [t.lower() for t in _token_re.findall(text or "")]


# ── manifest + corpus helpers ──────────────────────────────────────────


def _load_manifest(agent: str) -> Dict[str, Any]:
    return yaml.safe_load((AGENTS_ROOT / agent / "manifest.yaml").read_text())


def _corpus_path(agent: str) -> Path:
    return AGENTS_ROOT / agent / "corpus" / "traces.jsonl"


def _read_traces(agent: str) -> List[Dict[str, Any]]:
    p = _corpus_path(agent)
    if not p.exists():
        return []
    out = []
    with p.open() as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


# ── Qdrant backend (best-effort, urllib-only) ──────────────────────────


def _qdrant_reachable(endpoint: str, timeout: float = 2.0) -> bool:
    try:
        req = urllib.request.Request(f"{endpoint.rstrip('/')}/")
        with urllib.request.urlopen(req, timeout=timeout):  # noqa: S310
            return True
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        return False


def _qdrant_upsert_dryrun(agent: str, traces: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Without a real embedding model in-process we cannot push real
    vectors. We record the intent in the manifest's rag.last_ingest
    block so the daemon (or a future embedding worker) can pick up.
    """
    out = AGENTS_ROOT / agent / "corpus" / "qdrant_intent.json"
    payload = {
        "agent": agent,
        "n_traces": len(traces),
        "ids": [t.get("trace_id") for t in traces[:50]],
        "queued_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "note": "Vector ingest deferred — embedding worker not in-process. Mock store remains the live source.",
    }
    out.write_text(json.dumps(payload, indent=2))
    return payload


# ── Mock store (BM25-ish lexical scoring) ───────────────────────────────


def _build_mock_index(traces: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute (idf, lengths, postings) for a small BM25-style score."""
    N = len(traces)
    if N == 0:
        return {"N": 0, "idf": {}, "lengths": [], "avg_len": 0, "tokens": [], "ids": []}
    df: Counter = Counter()
    tokens_per_doc: List[List[str]] = []
    for t in traces:
        toks = tokenise(t.get("text", ""))
        tokens_per_doc.append(toks)
        for tok in set(toks):
            df[tok] += 1
    idf = {tok: math.log(1 + (N - n + 0.5) / (n + 0.5)) for tok, n in df.items()}
    lengths = [len(toks) for toks in tokens_per_doc]
    avg_len = (sum(lengths) / N) if N else 0
    return {
        "N": N,
        "idf": idf,
        "lengths": lengths,
        "avg_len": avg_len,
        "tokens": tokens_per_doc,
        "ids": [t.get("trace_id") for t in traces],
    }


def _bm25_score(query: str, index: Dict[str, Any], k1: float = 1.5, b: float = 0.75) -> List[Tuple[int, float]]:
    """Return ranked (doc_idx, score) for query against index."""
    q_toks = tokenise(query)
    if not q_toks or index["N"] == 0:
        return []
    scores = [0.0] * index["N"]
    for tok in q_toks:
        if tok not in index["idf"]:
            continue
        idf = index["idf"][tok]
        for i, doc_toks in enumerate(index["tokens"]):
            if tok not in doc_toks:
                continue
            tf = doc_toks.count(tok)
            dl = index["lengths"][i]
            denom = tf + k1 * (1 - b + b * dl / max(1, index["avg_len"]))
            scores[i] += idf * (tf * (k1 + 1)) / denom
    ranked = sorted(enumerate(scores), key=lambda iv: -iv[1])
    return [(i, s) for i, s in ranked if s > 0]


def _save_mock_index(agent: str, index: Dict[str, Any]) -> Path:
    """Persist a compact representation so search.py can rehydrate."""
    out = AGENTS_ROOT / agent / "corpus" / "mock_index.json"
    compact = {
        "N": index["N"],
        "avg_len": index["avg_len"],
        "idf": index["idf"],
        "lengths": index["lengths"],
        "tokens": index["tokens"],
        "ids": index["ids"],
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    out.write_text(json.dumps(compact))
    return out


def _load_mock_index(agent: str) -> Optional[Dict[str, Any]]:
    p = AGENTS_ROOT / agent / "corpus" / "mock_index.json"
    if not p.exists():
        return None
    return json.loads(p.read_text())


# ── public ops ─────────────────────────────────────────────────────────


def ingest(agent: str) -> Dict[str, Any]:
    if agent not in KNOWN_AGENTS:
        raise ValueError(f"unknown agent '{agent}'")
    manifest = _load_manifest(agent)
    rag_cfg = manifest.get("rag", {}) or {}
    endpoint = rag_cfg.get("endpoint", "http://localhost:6333")
    traces = _read_traces(agent)
    if not traces:
        return {"agent": agent, "ok": False, "reason": "empty corpus — run `python -m tools.agent_corpus refresh <agent>`"}

    # Always build mock index (cheap + offline)
    index = _build_mock_index(traces)
    _save_mock_index(agent, index)

    backend = "mock"
    qdrant_payload: Dict[str, Any] = {}
    if _qdrant_reachable(endpoint):
        backend = "qdrant"
        qdrant_payload = _qdrant_upsert_dryrun(agent, traces)

    return {
        "agent": agent,
        "ok": True,
        "n_traces": len(traces),
        "backend": backend,
        "qdrant_endpoint": endpoint,
        "qdrant_payload": qdrant_payload,
        "mock_index": str(AGENTS_ROOT / agent / "corpus" / "mock_index.json"),
    }


def search(agent: str, query: str, k: int = 5) -> List[Dict[str, Any]]:
    if agent not in KNOWN_AGENTS:
        raise ValueError(f"unknown agent '{agent}'")
    traces = _read_traces(agent)
    index = _load_mock_index(agent)
    if index is None:
        index = _build_mock_index(traces)
        _save_mock_index(agent, index)
    ranked = _bm25_score(query, index)[:k]
    out = []
    for idx, score in ranked:
        if idx >= len(traces):
            continue
        t = traces[idx]
        text = t.get("text", "")
        snippet = text if len(text) <= 600 else (text[:580] + " …")
        out.append({
            "trace_id": t.get("trace_id"),
            "source": t.get("source"),
            "path": t.get("path"),
            "score": round(score, 4),
            "snippet": snippet,
        })
    return out


def self_test() -> int:
    failures: List[str] = []
    for agent in sorted(KNOWN_AGENTS):
        try:
            res = ingest(agent)
            if not res.get("ok"):
                failures.append(f"{agent}: ingest not ok — {res.get('reason')}")
                continue
            hits = search(agent, "rtp drift" if agent == "math-debug" else "vendor par sheet" if agent == "par-parser" else "ukgc autoplay")
            if not hits:
                failures.append(f"{agent}: search returned 0 hits")
        except Exception as exc:
            failures.append(f"{agent}: exception {exc!r}")
    if failures:
        for f in failures:
            print(" -", f)
        print("self-test FAIL")
        return 1
    print(f"self-test PASS — 3 agent indexes built, search returns hits")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="PHASE 8 RAG ingest/search")
    sub = p.add_subparsers(dest="cmd")
    sp_in = sub.add_parser("ingest"); sp_in.add_argument("agent", choices=sorted(KNOWN_AGENTS) + ["all"])
    sp_sr = sub.add_parser("search"); sp_sr.add_argument("agent", choices=sorted(KNOWN_AGENTS))
    sp_sr.add_argument("query")
    sp_sr.add_argument("--k", type=int, default=5)
    sub.add_parser("self-test")
    args = p.parse_args(argv)

    if args.cmd == "ingest":
        if args.agent == "all":
            results = [ingest(a) for a in sorted(KNOWN_AGENTS)]
            print(json.dumps(results, indent=2))
        else:
            print(json.dumps(ingest(args.agent), indent=2))
        return 0
    if args.cmd == "search":
        print(json.dumps(search(args.agent, args.query, args.k), indent=2))
        return 0
    if args.cmd == "self-test":
        return self_test()
    p.print_help()
    return 2
