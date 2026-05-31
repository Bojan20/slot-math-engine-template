"""SLOT-MATH Faza 6.6-6.9 — Provably fair, self-healing, bug-bounty, i18n.

Bundle of small utility modules:
  6.6 provably_fair_chain — commit/reveal hash chain across spin sequence
  6.7 self_healing — kernel composition fallback on per-feature failure
  6.8 bug_bounty_hook — per-build Stryker mutation runner + delta reporter
  6.9 currency_locale — multi-currency RTP clamp + locale-aware presentation
"""
from tools.par_extras.provably_fair_chain import (
    ChainEntry,
    append_spin_to_chain,
    new_chain,
    verify_chain,
)
from tools.par_extras.self_healing import (
    FallbackPlan,
    KernelHealth,
    build_fallback_plan,
    pick_kernel_with_fallback,
)
from tools.par_extras.bug_bounty_hook import (
    BugBountyConfig,
    BugReport,
    file_bug_report,
    list_open_bugs,
)
from tools.par_extras.currency_locale import (
    LocaleProfile,
    SUPPORTED_LOCALES,
    SUPPORTED_CURRENCIES,
    convert_amount,
    format_amount,
)

__all__ = [
    "ChainEntry",
    "append_spin_to_chain",
    "new_chain",
    "verify_chain",
    "FallbackPlan",
    "KernelHealth",
    "build_fallback_plan",
    "pick_kernel_with_fallback",
    "BugBountyConfig",
    "BugReport",
    "file_bug_report",
    "list_open_bugs",
    "LocaleProfile",
    "SUPPORTED_LOCALES",
    "SUPPORTED_CURRENCIES",
    "convert_amount",
    "format_amount",
]
