"""W9.1 — Multi-jurisdiction IR generator.

Each regulator imposes a different set of constraints on the same game:
  • UK Gambling Commission (UKGC): 92 % RTP minimum (some buckets),
    autoplay forbidden since 2018, max win caps per game class,
    LDW (loss-disguised-as-win) must be disclosed
  • MGA (Malta): 85 % RTP minimum, more permissive on buy_feature
  • ADM (Italy): minimum 90 % RTP, max bet €1 for some categories,
    min spin time 4 s
  • DGOJ (Spain): 85-94 % RTP band, autoplay rules
  • KSA (Netherlands): 92.5 % RTP minimum, time-on-task reminders
  • NMi / iTechLabs (US Class III): vendor-specific
  • Compensated mode (Class II / VLT) — outcomes pre-drawn from a pool

Given ONE source spec + a target jurisdiction code, this kernel:
  1. consults the registry of per-market overrides
  2. mutates the spec's constraints to honor the strictest limits
  3. emits a `JurisdictionVariant` (per-market spec + IR + provenance note)

Use case: one design, six certified IRs, six cert bundles → six markets
ready in a single CLI call.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Optional

from .spec import MathDslSpec
from .compile import compile_to_ir


# ─── Jurisdiction registry ───────────────────────────────────────────


@dataclass
class JurisdictionRules:
    code: str
    name: str
    rtp_min: float
    rtp_max: float
    max_win_x_cap: Optional[float] = None
    max_bet_x_cap: Optional[float] = None
    min_spin_time_ms: Optional[int] = None
    autoplay_forbidden: bool = False
    force_ldw_disclosure: bool = False
    forbidden_features: list[str] = field(default_factory=list)
    compensated_mode: bool = False
    notes: str = ""


REGISTRY: dict[str, JurisdictionRules] = {
    "UKGC": JurisdictionRules(
        code="UKGC", name="UK Gambling Commission",
        rtp_min=0.85, rtp_max=0.98,
        max_win_x_cap=125_000.0,
        min_spin_time_ms=2_500,
        autoplay_forbidden=True,
        force_ldw_disclosure=True,
        forbidden_features=[],
        notes="UKGC RTS-7. Autoplay banned since Oct 2018. B3 cat max bet £2.",
    ),
    "MGA": JurisdictionRules(
        code="MGA", name="Malta Gaming Authority",
        rtp_min=0.85, rtp_max=0.98,
        max_win_x_cap=500_000.0,
        notes="MGA Class IV remote gaming. Permissive on buy_feature.",
    ),
    "ADM": JurisdictionRules(
        code="ADM", name="Agenzia Dogane Monopoli (Italy)",
        rtp_min=0.90, rtp_max=0.95,
        max_win_x_cap=30_000.0,
        max_bet_x_cap=1.0,
        min_spin_time_ms=4_000,
        force_ldw_disclosure=True,
        notes="Italian VLT regulations. €1 bet cap, 4 s min spin.",
    ),
    "DGOJ": JurisdictionRules(
        code="DGOJ", name="Dirección General de Ordenación del Juego (Spain)",
        rtp_min=0.85, rtp_max=0.94,
        max_win_x_cap=50_000.0,
        autoplay_forbidden=False,
        force_ldw_disclosure=True,
        notes="Spanish online slot regulations.",
    ),
    "KSA": JurisdictionRules(
        code="KSA", name="Kansspelautoriteit (Netherlands)",
        rtp_min=0.925, rtp_max=0.98,
        max_win_x_cap=100_000.0,
        min_spin_time_ms=2_000,
        autoplay_forbidden=True,
        force_ldw_disclosure=True,
        notes="NL post-Toto Online Act 2021. 92.5 % RTP minimum.",
    ),
    "NMI": JurisdictionRules(
        code="NMI", name="NMi (Nederlands Meetinstituut)",
        rtp_min=0.85, rtp_max=0.98,
        notes="Test lab — same caps as host jurisdiction.",
    ),
}


@dataclass
class JurisdictionAdaptation:
    field: str
    before: object
    after: object
    rule: str


@dataclass
class JurisdictionVariant:
    code: str
    spec: MathDslSpec
    ir: dict
    adaptations: list[JurisdictionAdaptation] = field(default_factory=list)
    compatible: bool = True
    incompatibility_reason: str = ""

    def summary(self) -> str:
        lines = [
            f"# Jurisdiction variant: {self.code} — {REGISTRY[self.code].name if self.code in REGISTRY else self.code}",
            f"compatible: {self.compatible}",
        ]
        if not self.compatible:
            lines.append(f"reason: {self.incompatibility_reason}")
        if self.adaptations:
            lines.append("")
            lines.append("| Field | Before | After | Rule |")
            lines.append("|---|---|---|---|")
            for a in self.adaptations:
                lines.append(f"| `{a.field}` | {a.before} | {a.after} | {a.rule} |")
        return "\n".join(lines) + "\n"


def adapt_spec_for_jurisdiction(
    spec: MathDslSpec, jurisdiction_code: str,
) -> JurisdictionVariant:
    """Return a `JurisdictionVariant` — spec mutated to honor `jurisdiction_code`
    rules, plus the compiled IR. Adaptations describe every mutation."""
    code = jurisdiction_code.upper()
    if code not in REGISTRY:
        # Unknown jurisdiction → emit pass-through variant
        new_spec = copy.deepcopy(spec)
        if code not in new_spec.constraints.jurisdictions:
            new_spec.constraints.jurisdictions.append(code)
        ir = compile_to_ir(new_spec)
        return JurisdictionVariant(
            code=code, spec=new_spec, ir=ir,
            incompatibility_reason=f"unknown jurisdiction {code!r} — pass-through",
        )

    rules = REGISTRY[code]
    new_spec = copy.deepcopy(spec)
    adaptations: list[JurisdictionAdaptation] = []
    compatible = True
    reason = ""

    # RTP target — clamp into the allowed band
    orig_rtp = new_spec.constraints.target_rtp
    if orig_rtp < rules.rtp_min:
        new_spec.constraints.target_rtp = rules.rtp_min
        adaptations.append(JurisdictionAdaptation(
            "constraints.target_rtp", orig_rtp, rules.rtp_min,
            f"{code} requires RTP ≥ {rules.rtp_min:.4f}",
        ))
    elif orig_rtp > rules.rtp_max:
        new_spec.constraints.target_rtp = rules.rtp_max
        adaptations.append(JurisdictionAdaptation(
            "constraints.target_rtp", orig_rtp, rules.rtp_max,
            f"{code} requires RTP ≤ {rules.rtp_max:.4f}",
        ))

    # Max win cap
    if (rules.max_win_x_cap is not None
            and new_spec.constraints.max_win_x > rules.max_win_x_cap):
        before = new_spec.constraints.max_win_x
        new_spec.constraints.max_win_x = rules.max_win_x_cap
        adaptations.append(JurisdictionAdaptation(
            "constraints.max_win_x", before, rules.max_win_x_cap,
            f"{code} max win cap",
        ))

    # Forbidden features
    if rules.forbidden_features:
        before = [f.kind for f in new_spec.features]
        new_spec.features = [
            f for f in new_spec.features if f.kind not in rules.forbidden_features
        ]
        after = [f.kind for f in new_spec.features]
        if before != after:
            adaptations.append(JurisdictionAdaptation(
                "features", before, after,
                f"{code} forbids {rules.forbidden_features}",
            ))

    # Inject jurisdiction code if missing
    if code not in new_spec.constraints.jurisdictions:
        before = list(new_spec.constraints.jurisdictions)
        new_spec.constraints.jurisdictions = [
            *new_spec.constraints.jurisdictions, code,
        ]
        adaptations.append(JurisdictionAdaptation(
            "constraints.jurisdictions", before,
            new_spec.constraints.jurisdictions,
            f"add {code} to jurisdiction list",
        ))

    # Compile IR
    ir = compile_to_ir(new_spec)

    # Inject jurisdiction_overrides block into IR root (W4.7)
    overrides_block: dict = {}
    if rules.max_win_x_cap is not None:
        overrides_block["max_win_x"] = rules.max_win_x_cap
    if rules.max_bet_x_cap is not None:
        overrides_block["max_bet_x"] = rules.max_bet_x_cap
    if rules.min_spin_time_ms is not None:
        overrides_block["min_spin_time_ms"] = rules.min_spin_time_ms
    if rules.autoplay_forbidden:
        overrides_block["autoplay_forbidden"] = True
    if rules.force_ldw_disclosure:
        overrides_block["force_ldw_disclosure"] = True
    if rules.compensated_mode:
        overrides_block["compensated_mode"] = True
    overrides_block["target_rtp"] = new_spec.constraints.target_rtp
    ir.setdefault("jurisdiction_overrides", {})[code] = overrides_block

    return JurisdictionVariant(
        code=code, spec=new_spec, ir=ir,
        adaptations=adaptations, compatible=compatible,
        incompatibility_reason=reason,
    )


def adapt_for_all(
    spec: MathDslSpec,
    codes: Optional[list[str]] = None,
) -> dict[str, JurisdictionVariant]:
    """Return `{code: JurisdictionVariant}` for every code in `codes` or
    for every code declared in `spec.constraints.jurisdictions`.
    """
    if codes is None:
        codes = list(spec.constraints.jurisdictions)
    return {c.upper(): adapt_spec_for_jurisdiction(spec, c) for c in codes}


def list_jurisdictions() -> list[str]:
    return sorted(REGISTRY.keys())


def render_variants_summary(variants: dict[str, JurisdictionVariant]) -> str:
    """Render a single markdown table summarizing all variants."""
    if not variants:
        return "(no variants)\n"
    lines = [
        "# Multi-jurisdiction variants",
        "",
        "| Jurisdiction | RTP | Max Win × | Adaptations | Compatible |",
        "|---|---|---|---|---|",
    ]
    for code, v in variants.items():
        sym = "✓" if v.compatible else "✗"
        lines.append(
            f"| **{code}** | {v.spec.constraints.target_rtp:.4f} | "
            f"{v.spec.constraints.max_win_x:,g}× | {len(v.adaptations)} | {sym} |"
        )
    return "\n".join(lines) + "\n"
