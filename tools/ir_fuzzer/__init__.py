"""W32 — IR Mutation Fuzzer.

Takes a valid universal IR and applies structured mutations
(probability perturbation, paytable scrambling, symbol pool
mangling, field deletion). Re-evaluates each mutant against a
lightweight invariant checker and aggregates crashes / invariant
breaks by mutation class.

Goal: prove the IR validator + engine guard rails reject every
realistic typo or designer mistake before it reaches MC.
"""
from tools.ir_fuzzer.fuzzer import (
    Mutation,
    FuzzResult,
    FuzzReport,
    mutate_ir,
    run_fuzz,
    DEFAULT_MUTATIONS,
)

__all__ = [
    "Mutation",
    "FuzzResult",
    "FuzzReport",
    "mutate_ir",
    "run_fuzz",
    "DEFAULT_MUTATIONS",
]
