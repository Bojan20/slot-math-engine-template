"""W6.1 — GDD PDF extractor.

First step of Phase 4 (GDD ingestion). Reads a Game Design Document
PDF and emits a semi-structured JSON with the math-relevant fields
(grid topology, paytable, paylines, RTP target, volatility, features,
free-spins trigger) ready for downstream DSL → IR synthesis.

Approach: heuristic-driven section detection + table parsing. Each
GDD has a different layout, but math-relevant sections always have
predictable headers ("RTP", "Hit Frequency", "Paytable", "Free
Spins", "Reel Configuration", "Volatility", "Bet Range", etc.).
We extract page text, group lines by header proximity, then run
per-section parsers.

Public API:
    from tools.gdd_extract.extract import extract_gdd
    semi_structured = extract_gdd(Path("game.gdd.pdf"))

Output shape:
    {
        "meta": {"name", "version", "target_rtp", "volatility"},
        "topology": {"reels", "rows", "paylines"},
        "paytable": [{"symbol", "count", "pays"}],
        "features": [{"kind", "trigger", "params"}],
        "bet_range": {"min", "max", "denom"},
        "raw_sections": {"<header>": "<verbatim text>"},
    }
"""
