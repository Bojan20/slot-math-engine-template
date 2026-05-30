#!/usr/bin/env python3
"""W244 wave 43 — DONE-UNIVERSAL #1 + #2 final closure acceptance artefakt."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.asymmetric_showcase import asymmetric_showcase_run
from tools.math_dsl.both_ways import BothWaysParams
from tools.math_dsl.both_ways_expanding_wild import (
    BothWaysExpandingWildParams, both_ways_expanding_wild_rtp,
)
from tools.math_dsl.expanding_symbol import ExpandingSymbolParams

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "DONE_UNIVERSAL_CLOSURE_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)


def main() -> int:
    # DONE-UNIVERSAL #1 — Thunderstruck II both-ways + expanding wild
    bw = BothWaysParams(ltr_only_rtp=0.80, line_pay_share=0.7)
    es = ExpandingSymbolParams(
        fs_trigger_p=0.005, fs_initial_spins=10,
        reels=5, rows=3,
        p_per_cell_in_fs=0.12,
        pay_table={3: 1.0, 4: 5.0, 5: 100.0},
        symbol_name="explorer",
    )
    bw_es_result = both_ways_expanding_wild_rtp(
        BothWaysExpandingWildParams(both_ways_params=bw, expanding_params=es)
    )

    # DONE-UNIVERSAL #2 — three asymmetric proxies
    asym_results = {
        proxy: asymmetric_showcase_run(proxy)
        for proxy in ("twin_spin", "wild_west_gold", "wild_toro")
    }

    leaf_lines = [
        f"both_ways_expanding_wild|{bw_es_result['rtp_contribution']:.15e}\n",
    ]
    for proxy, r in sorted(asym_results.items()):
        leaf_lines.append(
            f"asymmetric_showcase_{proxy}|{r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256(
        "".join(leaf_lines).encode("utf-8")
    ).hexdigest()

    artefact = {
        "schema": "done-universal-closure/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "done_universal_items_closed": ["#1", "#2"],
        "remaining_done_universal": "20/20 zatvoreno (sa wave 41 crash_kernel za #19)",
        "both_ways_expanding_wild": bw_es_result,
        "asymmetric_showcase": asym_results,
        "verification": (
            "Re-run `python -m tools.build_done_universal_closure_kernel`. "
            "Output must match `merkle_root_sha256` exactly."
        ),
    }
    OUT.write_text(json.dumps(artefact, ensure_ascii=False, indent=2))
    print(f"[done-universal-closure] wrote {OUT.relative_to(REPO)}")
    print(f"  both_ways_expanding_wild RTP: {bw_es_result['rtp_contribution']:.4f}")
    for proxy, r in sorted(asym_results.items()):
        print(f"  asymmetric_{proxy:18s}: RTP={r['rtp_contribution']:.4f}  "
              f"symbols={r['symbols_count']}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
