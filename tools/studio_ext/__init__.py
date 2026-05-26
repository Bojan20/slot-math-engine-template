"""Mission #8 — Studio UI extensions.

Adds advanced Studio components on top of the W5.4 scaffold:
    • WebWorker MC harness    — paralelni Monte Carlo runs u browseru
    • Paytable heatmap        — probability × pay vizualizacija
    • IR editor               — live edit IR + RTP-on-the-fly

CLI: `slot-studio-extend <studio_dir> [--components mc,heatmap,editor]`
"""
from .extend import (
    emit_mc_worker,
    emit_paytable_heatmap,
    emit_ir_editor,
    EXT_COMPONENTS as _EXT_BATCH1,
)
from .extend2 import (
    emit_rtp_gauge,
    emit_vendor_switcher,
    emit_reel_viz,
)


EXT_COMPONENTS = _EXT_BATCH1 + ("gauge", "switcher", "reelviz")


def extend_studio(studio_root, components=EXT_COMPONENTS):
    """Drop Mission #8 extension components into a Studio scaffold.

    Components: mc, heatmap, editor, gauge, switcher, reelviz.
    """
    from pathlib import Path
    root = Path(studio_root)
    root.mkdir(parents=True, exist_ok=True)
    out: dict[str, list] = {}
    comps = set(components)
    if "mc" in comps:
        out["mc"] = [emit_mc_worker(root)]
    if "heatmap" in comps:
        h, j = emit_paytable_heatmap(root)
        out["heatmap"] = [h, j]
    if "editor" in comps:
        h, j = emit_ir_editor(root)
        out["editor"] = [h, j]
    if "gauge" in comps:
        h, j = emit_rtp_gauge(root)
        out["gauge"] = [h, j]
    if "switcher" in comps:
        h, j = emit_vendor_switcher(root)
        out["switcher"] = [h, j]
    if "reelviz" in comps:
        h, j = emit_reel_viz(root)
        out["reelviz"] = [h, j]
    return out


__all__ = [
    "extend_studio",
    "emit_mc_worker",
    "emit_paytable_heatmap",
    "emit_ir_editor",
    "emit_rtp_gauge",
    "emit_vendor_switcher",
    "emit_reel_viz",
    "EXT_COMPONENTS",
]
