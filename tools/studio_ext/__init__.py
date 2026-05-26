"""Mission #8 — Studio UI extensions.

Adds advanced Studio components on top of the W5.4 scaffold:
    • WebWorker MC harness    — paralelni Monte Carlo runs u browseru
    • Paytable heatmap        — probability × pay vizualizacija
    • IR editor               — live edit IR + RTP-on-the-fly

CLI: `slot-studio-extend <studio_dir> [--components mc,heatmap,editor]`
"""
from .extend import (
    extend_studio,
    emit_mc_worker,
    emit_paytable_heatmap,
    emit_ir_editor,
    EXT_COMPONENTS,
)

__all__ = [
    "extend_studio",
    "emit_mc_worker",
    "emit_paytable_heatmap",
    "emit_ir_editor",
    "EXT_COMPONENTS",
]
