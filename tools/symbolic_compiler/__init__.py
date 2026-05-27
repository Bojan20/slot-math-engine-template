"""PHASE 24 — Symbolic Engine Compiler.

Compile an IR into a human-readable symbolic-arithmetic derivation of
the Bernoulli line-eval RTP. Output is regulator-checkable WITHOUT
running MC; an auditor reads the symbolic formula + per-symbol
probabilities and confirms the arithmetic.

Pure stdlib (Fraction for exact rational arithmetic, no SymPy dep).

Public API:
    from tools.symbolic_compiler import (
        compile_symbolic,
        SymbolicCertificate,
        emit_derivation_markdown,
    )

    cert = compile_symbolic(ir)
    print(cert.symbolic_rtp)         # "p(A,A,A,A,A) * 10 + p(B,B,B,B,B) * 50"
    print(cert.numeric_rtp_rational) # Fraction(31, 200)
"""

from __future__ import annotations

from tools.symbolic_compiler.compiler import (
    compile_symbolic,
    SymbolicCertificate,
    emit_derivation_markdown,
)

__all__ = ["compile_symbolic", "SymbolicCertificate", "emit_derivation_markdown"]
