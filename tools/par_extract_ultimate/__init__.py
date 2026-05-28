"""Ultimate XLSX → JSON extractor for vendor PAR sheets.

Pulls EVERY possible cell-level attribute (value, formula, number format,
comments, hyperlinks, validation, conditional formats, merged ranges,
named ranges, table definitions, autofilter, chart metadata, frozen panes,
hidden rows/cols, column widths, row heights, font/fill/border styling)
and writes the dump to a local agent corpus directory.

Designed for **offline-only** operation: no network calls, no telemetry,
no prompts containing raw cell values. The CLI runs the parse in a
subprocess so that the orchestrator (Claude Code) never sees the raw
cells — it only sees aggregate counts and the resulting summary.json.

Public API:
    extract_workbook(xlsx_path, out_dir) -> ExtractionStats
"""
from .extract import (  # noqa: F401
    extract_workbook,
    ExtractionStats,
    SheetStats,
)
