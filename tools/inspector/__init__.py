"""PHASE 38 — Slot Math Pretty-Print Inspector.

Self-contained HTML one-pager. Inputs: IR JSON. Outputs:
  - meta + topology summary table
  - per-reel symbol-frequency table (rational + percent)
  - paytable grid sa per-row contribution
  - features list
  - closed-form Bernoulli RTP estimate
  - tamper-evidence: SHA-256 of canonical IR

Pure stdlib HTML emit; no Studio dep.

Public API:
    from tools.inspector import emit_inspector_html
"""

from __future__ import annotations

from tools.inspector.html_inspector import emit_inspector_html

__all__ = ["emit_inspector_html"]
