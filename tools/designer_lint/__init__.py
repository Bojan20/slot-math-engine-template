"""W45 — Designer Sanity Linter.

Catches common designer mistakes before MC verification burns
compute. Each rule has a severity (error / warning) and a clear
remediation hint. Output is intentionally noisy on warnings so a
designer notices subtle issues during the math doc → IR sync step.
"""
from tools.designer_lint.linter import (
    LintIssue,
    LintReport,
    DEFAULT_RULES,
    lint_ir,
)

__all__ = [
    "LintIssue",
    "LintReport",
    "DEFAULT_RULES",
    "lint_ir",
]
