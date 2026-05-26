"""Exact enumeration engine — exhaustive reel-combination RTP."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
import itertools
import math


class ExactEnumerationLimitExceeded(RuntimeError):
    pass


def combination_count(ir: dict[str, Any]) -> int:
    reels = (ir.get("reels") or {}).get("base") or []
    if not reels:
        return 0
    total = 1
    for strip in reels:
        if not strip:
            return 0
        total *= len(strip)
    return total


@dataclass
class PayHistogramEntry:
    pay: float
    count: int
    probability: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "pay": self.pay,
            "count": self.count,
            "probability": self.probability,
        }


@dataclass
class ExactEnumReport:
    combinations: int
    sum_pay: float
    sum_pay_sq: float
    n_paying: int
    exact_rtp: float
    exact_variance: float
    max_pay: float
    min_paying_pay: float
    hit_freq: float
    histogram: list[PayHistogramEntry] = field(default_factory=list)
    paytable_rows_evaluated: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "combinations": self.combinations,
            "sum_pay": self.sum_pay,
            "sum_pay_sq": self.sum_pay_sq,
            "n_paying": self.n_paying,
            "exact_rtp": self.exact_rtp,
            "exact_variance": self.exact_variance,
            "max_pay": self.max_pay,
            "min_paying_pay": self.min_paying_pay,
            "hit_freq": self.hit_freq,
            "paytable_rows_evaluated": self.paytable_rows_evaluated,
            "histogram": [h.to_dict() for h in self.histogram],
        }


def _payline_anchor_at_row(reels: list[list[str]], row_idx_per_reel: list[int]) -> list[str]:
    """Read off the symbol at the chosen row of each reel position."""
    return [
        reels[r][row_idx_per_reel[r]]
        for r in range(len(reels))
    ]


def _line_pay(line: list[str], paytable: list[dict[str, Any]]) -> float:
    """Best-pay payline evaluator: longest matching prefix wins."""
    # Group paytable rows by combo length, scan longest first
    best = 0.0
    for row in paytable:
        combo = row.get("combo") or []
        pays = row.get("pays", 0)
        if not isinstance(pays, (int, float)) or not combo:
            continue
        if len(combo) > len(line):
            continue
        # Match prefix of `line` against `combo` allowing wildcard "*"
        # (treat literal symbol equality only — we keep the
        # enumerator simple; wild-substitution belongs to a separate
        # extension that callers can layer on by pre-expanding
        # the paytable).
        ok = True
        for i in range(len(combo)):
            if combo[i] != line[i] and combo[i] != "*":
                ok = False
                break
        if ok and pays > best:
            best = float(pays)
    return best


def enumerate_exact(
    ir: dict[str, Any],
    *,
    max_combinations: int = 50_000_000,
    histogram_top_n: int = 32,
) -> ExactEnumReport:
    """Enumerate every (reel_pos × reel_pos × ...) combination, sum
    payline pay, derive exact moments."""
    reels = (ir.get("reels") or {}).get("base") or []
    paytable = ir.get("paytable") or []
    if not reels:
        raise ValueError("IR has no reels.base")
    if not paytable:
        raise ValueError("IR has no paytable")

    combos = combination_count(ir)
    if combos == 0:
        raise ValueError("zero combinations (empty reel strip?)")
    if combos > max_combinations:
        raise ExactEnumerationLimitExceeded(
            f"combinations={combos:,} exceeds limit={max_combinations:,}; "
            f"raise max_combinations or shrink the IR"
        )

    sum_pay = 0.0
    sum_pay_sq = 0.0
    n_paying = 0
    max_pay = 0.0
    min_paying_pay = math.inf
    pay_histogram: dict[float, int] = {}

    ranges = [range(len(strip)) for strip in reels]
    for combo_idx in itertools.product(*ranges):
        line = [reels[r][combo_idx[r]] for r in range(len(reels))]
        pay = _line_pay(line, paytable)
        sum_pay += pay
        sum_pay_sq += pay * pay
        if pay > 0:
            n_paying += 1
            if pay > max_pay:
                max_pay = pay
            if pay < min_paying_pay:
                min_paying_pay = pay
        if pay > 0:
            pay_histogram[pay] = pay_histogram.get(pay, 0) + 1

    exact_rtp = sum_pay / combos
    mean = exact_rtp
    e_x2 = sum_pay_sq / combos
    exact_variance = max(0.0, e_x2 - mean * mean)
    hit_freq = n_paying / combos
    if min_paying_pay == math.inf:
        min_paying_pay = 0.0

    # Top-N histogram entries by frequency
    sorted_hist = sorted(
        pay_histogram.items(), key=lambda kv: (-kv[1], -kv[0])
    )[:histogram_top_n]
    histogram = [
        PayHistogramEntry(pay=p, count=c, probability=c / combos)
        for p, c in sorted_hist
    ]

    return ExactEnumReport(
        combinations=combos,
        sum_pay=sum_pay,
        sum_pay_sq=sum_pay_sq,
        n_paying=n_paying,
        exact_rtp=exact_rtp,
        exact_variance=exact_variance,
        max_pay=max_pay,
        min_paying_pay=min_paying_pay,
        hit_freq=hit_freq,
        histogram=histogram,
        paytable_rows_evaluated=len(paytable),
    )
