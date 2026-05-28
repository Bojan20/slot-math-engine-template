"""IR paytable → CSV.

One row per paytable entry: `combo` is rendered as a `|`-joined symbol
list (no quoting headaches), and the four fixed columns are kept in a
stable order so the file is byte-deterministic.
"""
from __future__ import annotations

import csv
import io
from typing import Any


_HEADER = ["row_index", "combo", "pays", "scope", "marker"]


def paytable_to_csv_bytes(paytable: list[dict[str, Any]]) -> bytes:
    """Serialise a paytable list (the IR `paytable` array) to UTF-8 CSV.

    Each row of the IR is a dict like:
        {"combo": ["A","A","A"], "pays": 50, "scope": "line", "marker": ""}
    """
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    w.writerow(_HEADER)
    for i, row in enumerate(paytable):
        combo = row.get("combo", [])
        if isinstance(combo, list):
            combo_str = "|".join(str(x) for x in combo)
        else:
            combo_str = str(combo)
        pays = row.get("pays", 0)
        scope = row.get("scope", "")
        marker = row.get("marker", "")
        w.writerow([i, combo_str, pays, scope, marker])
    return buf.getvalue().encode("utf-8")
