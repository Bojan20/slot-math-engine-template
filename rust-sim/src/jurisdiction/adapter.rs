//! Faza 11.9 — Jurisdiction Adapter (Rust).
//!
//! Implements compliance validation and auto-fix for SlotGameIR
//! against registered jurisdiction profiles.

use crate::ir::{Feature, NearMissRule, SlotGameIR};
use super::profiles::{get_profile, ALL_PROFILES};
use super::types::{
    AppliedFix, AutoFixResult, ComplianceReport, ComplianceSummary, ComplianceViolation,
    JurisdictionProfile, ViolationSeverity,
};

// ─── feature kind helper ────────────────────────────────────────────────────

fn feature_kind(f: &Feature) -> &'static str {
    match f {
        Feature::FreeSpins { .. } => "free_spins",
        Feature::HoldAndWin { .. } => "hold_and_win",
        Feature::Cascade { .. } => "cascade",
        Feature::Respin { .. } => "respin",
        Feature::Pick { .. } => "pick",
        Feature::Wheel { .. } => "wheel",
        Feature::BuyFeature { .. } => "buy_feature",
        Feature::AnteBet { .. } => "ante_bet",
        Feature::Gamble { .. } => "gamble",
        Feature::MysterySymbol { .. } => "mystery_symbol",
        Feature::SymbolUpgrade { .. } => "symbol_upgrade",
    }
}

// ─── rule checkers ──────────────────────────────────────────────────────────

fn check_rtp(ir: &SlotGameIR, profile: &JurisdictionProfile) -> Vec<ComplianceViolation> {
    let mut violations = Vec::new();
    let rtp = ir.limits.target_rtp;
    let [min, max] = profile.rtp_range;

    if rtp < min || rtp > max {
        violations.push(ComplianceViolation {
            rule_id: format!("{}-RTP-001", profile.id),
            jurisdiction: profile.id.to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "target_rtp {:.4} is outside {} allowed range [{}, {}].",
                rtp, profile.name, min, max
            ),
            field: Some("limits.target_rtp".to_string()),
            can_auto_fix: false,
        });
    }

    let [req_min, req_max] = ir.compliance.rtp_range_required;
    if (req_min - min).abs() > f64::EPSILON || (req_max - max).abs() > f64::EPSILON {
        violations.push(ComplianceViolation {
            rule_id: format!("{}-RTP-002", profile.id),
            jurisdiction: profile.id.to_string(),
            severity: ViolationSeverity::Warning,
            message: format!(
                "compliance.rtp_range_required [{}, {}] does not match {} range [{}, {}].",
                req_min, req_max, profile.name, min, max
            ),
            field: Some("compliance.rtp_range_required".to_string()),
            can_auto_fix: true,
        });
    }

    violations
}

fn check_max_win(ir: &SlotGameIR, profile: &JurisdictionProfile) -> Vec<ComplianceViolation> {
    if let Some(cap) = profile.max_win_x {
        if ir.limits.max_win_x > cap {
            return vec![ComplianceViolation {
                rule_id: format!("{}-MAXWIN-001", profile.id),
                jurisdiction: profile.id.to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "max_win_x {} exceeds {} cap of {}.",
                    ir.limits.max_win_x, profile.name, cap
                ),
                field: Some("limits.max_win_x".to_string()),
                can_auto_fix: true,
            }];
        }
    }
    vec![]
}

fn check_prohibited_features(
    ir: &SlotGameIR,
    profile: &JurisdictionProfile,
) -> Vec<ComplianceViolation> {
    let mut violations = Vec::new();
    for &prohibited in profile.prohibited_features {
        if ir.features.iter().any(|f| feature_kind(f) == prohibited) {
            let feature_tag = prohibited.replace('_', "").to_uppercase();
            violations.push(ComplianceViolation {
                rule_id: format!("{}-FEAT-{}", profile.id, feature_tag),
                jurisdiction: profile.id.to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Feature '{}' is prohibited in {}.",
                    prohibited, profile.name
                ),
                field: Some("features".to_string()),
                can_auto_fix: true,
            });
        }
    }
    violations
}

fn check_compliance(ir: &SlotGameIR, profile: &JurisdictionProfile) -> Vec<ComplianceViolation> {
    let mut violations = Vec::new();

    if profile.require_ldw_disclosure && !ir.compliance.ldw_disclosure {
        violations.push(ComplianceViolation {
            rule_id: format!("{}-LDW-001", profile.id),
            jurisdiction: profile.id.to_string(),
            severity: ViolationSeverity::Error,
            message: format!("{} requires ldw_disclosure to be true.", profile.name),
            field: Some("compliance.ldw_disclosure".to_string()),
            can_auto_fix: true,
        });
    }

    if profile.require_session_time_display && !ir.compliance.session_time_display {
        violations.push(ComplianceViolation {
            rule_id: format!("{}-SESSION-001", profile.id),
            jurisdiction: profile.id.to_string(),
            severity: ViolationSeverity::Error,
            message: format!("{} requires session_time_display to be true.", profile.name),
            field: Some("compliance.session_time_display".to_string()),
            can_auto_fix: true,
        });
    }

    if let Some(required_rule) = profile.required_near_miss_rule {
        let current = match ir.compliance.near_miss_rule {
            NearMissRule::MustBeRandom => "must_be_random",
            NearMissRule::AllowedWithinDistribution => "allowed_within_distribution",
        };
        if current != required_rule {
            violations.push(ComplianceViolation {
                rule_id: format!("{}-NEARMISS-001", profile.id),
                jurisdiction: profile.id.to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "{} requires near_miss_rule to be '{}', got '{}'.",
                    profile.name, required_rule, current
                ),
                field: Some("compliance.near_miss_rule".to_string()),
                can_auto_fix: true,
            });
        }
    }

    violations
}

fn check_jurisdiction_declared(
    ir: &SlotGameIR,
    profile: &JurisdictionProfile,
) -> Vec<ComplianceViolation> {
    if !ir.compliance.jurisdictions.contains(&profile.id.to_string()) {
        return vec![ComplianceViolation {
            rule_id: format!("{}-DECL-001", profile.id),
            jurisdiction: profile.id.to_string(),
            severity: ViolationSeverity::Warning,
            message: format!(
                "Jurisdiction '{}' is not declared in compliance.jurisdictions.",
                profile.id
            ),
            field: Some("compliance.jurisdictions".to_string()),
            can_auto_fix: true,
        }];
    }
    vec![]
}

fn check_informational(profile: &JurisdictionProfile) -> Vec<ComplianceViolation> {
    profile
        .informational_notes
        .iter()
        .enumerate()
        .map(|(idx, note)| ComplianceViolation {
            rule_id: format!("{}-INFO-{:03}", profile.id, idx + 1),
            jurisdiction: profile.id.to_string(),
            severity: ViolationSeverity::Info,
            message: note.to_string(),
            field: None,
            can_auto_fix: false,
        })
        .collect()
}

// ─── apply fix ──────────────────────────────────────────────────────────────

fn apply_fix(
    ir: &mut SlotGameIR,
    violation: &ComplianceViolation,
    profile: &JurisdictionProfile,
) -> Option<AppliedFix> {
    let rule_id = &violation.rule_id;

    if rule_id.ends_with("-RTP-002") {
        let [min, max] = profile.rtp_range;
        ir.compliance.rtp_range_required = [min, max];
        return Some(AppliedFix {
            rule_id: rule_id.clone(),
            description: format!(
                "Set compliance.rtp_range_required to [{}, {}] for {}.",
                min, max, profile.id
            ),
        });
    }

    if rule_id.ends_with("-MAXWIN-001") {
        if let Some(cap) = profile.max_win_x {
            ir.limits.max_win_x = cap;
            ir.compliance.max_win_cap_required = cap;
            return Some(AppliedFix {
                rule_id: rule_id.clone(),
                description: format!("Capped max_win_x to {} for {}.", cap, profile.id),
            });
        }
    }

    if rule_id.contains("-FEAT-") {
        // Determine the prohibited kind from the profile (match rule suffix)
        // The rule_id is like "UKGC-FEAT-GAMBLE" or "UKGC-FEAT-BUYFEATURE"
        let before = ir.features.len();
        for &prohibited in profile.prohibited_features {
            let feature_tag = prohibited.replace('_', "").to_uppercase();
            let expected_rule = format!("{}-FEAT-{}", profile.id, feature_tag);
            if rule_id == &expected_rule {
                ir.features.retain(|f| feature_kind(f) != prohibited);
                let removed = before - ir.features.len();
                if removed > 0 {
                    return Some(AppliedFix {
                        rule_id: rule_id.clone(),
                        description: format!(
                            "Removed {} '{}' feature(s) prohibited by {}.",
                            removed, prohibited, profile.id
                        ),
                    });
                }
                break;
            }
        }
        return None;
    }

    if rule_id.ends_with("-LDW-001") {
        ir.compliance.ldw_disclosure = true;
        return Some(AppliedFix {
            rule_id: rule_id.clone(),
            description: format!("Set compliance.ldw_disclosure = true for {}.", profile.id),
        });
    }

    if rule_id.ends_with("-SESSION-001") {
        ir.compliance.session_time_display = true;
        return Some(AppliedFix {
            rule_id: rule_id.clone(),
            description: format!(
                "Set compliance.session_time_display = true for {}.",
                profile.id
            ),
        });
    }

    if rule_id.ends_with("-NEARMISS-001") {
        if let Some(required) = profile.required_near_miss_rule {
            if required == "must_be_random" {
                ir.compliance.near_miss_rule = NearMissRule::MustBeRandom;
                return Some(AppliedFix {
                    rule_id: rule_id.clone(),
                    description: format!(
                        "Set compliance.near_miss_rule = 'must_be_random' for {}.",
                        profile.id
                    ),
                });
            }
        }
    }

    if rule_id.ends_with("-DECL-001") {
        let jid = profile.id.to_string();
        if !ir.compliance.jurisdictions.contains(&jid) {
            ir.compliance.jurisdictions.push(jid);
        }
        return Some(AppliedFix {
            rule_id: rule_id.clone(),
            description: format!("Added '{}' to compliance.jurisdictions.", profile.id),
        });
    }

    None
}

// ─── public API ─────────────────────────────────────────────────────────────

/// Resolve jurisdictions: use explicit list, fall back to IR declarations,
/// fall back to all profiles.
fn resolve_jurisdictions<'a>(ir: &SlotGameIR, explicit: &'a [&'a str]) -> Vec<String> {
    if !explicit.is_empty() {
        return explicit.iter().map(|s| s.to_string()).collect();
    }
    if !ir.compliance.jurisdictions.is_empty() {
        return ir.compliance.jurisdictions.clone();
    }
    ALL_PROFILES.iter().map(|p| p.id.to_string()).collect()
}

/// Validate an IR against the given jurisdictions (or all if empty).
pub fn validate(ir: &SlotGameIR, jurisdictions: &[&str]) -> ComplianceReport {
    let resolved = resolve_jurisdictions(ir, jurisdictions);
    let mut violations: Vec<ComplianceViolation> = Vec::new();

    for jid in &resolved {
        match get_profile(jid) {
            None => {
                violations.push(ComplianceViolation {
                    rule_id: format!("{}-UNKNOWN-001", jid),
                    jurisdiction: jid.clone(),
                    severity: ViolationSeverity::Warning,
                    message: format!("Unknown jurisdiction '{}' — no profile available.", jid),
                    field: None,
                    can_auto_fix: false,
                });
            }
            Some(profile) => {
                violations.extend(check_rtp(ir, profile));
                violations.extend(check_max_win(ir, profile));
                violations.extend(check_prohibited_features(ir, profile));
                violations.extend(check_compliance(ir, profile));
                violations.extend(check_jurisdiction_declared(ir, profile));
                violations.extend(check_informational(profile));
            }
        }
    }

    let errors = violations.iter().filter(|v| v.severity == ViolationSeverity::Error).count();
    let warnings = violations.iter().filter(|v| v.severity == ViolationSeverity::Warning).count();
    let infos = violations.iter().filter(|v| v.severity == ViolationSeverity::Info).count();
    let auto_fixable = violations.iter().filter(|v| v.can_auto_fix).count();

    ComplianceReport {
        checked_jurisdictions: resolved,
        violations,
        is_compliant: errors == 0,
        auto_fixable: auto_fixable > 0,
        summary: ComplianceSummary {
            errors,
            warnings,
            infos,
            auto_fixable,
        },
    }
}

/// Auto-fix all fixable violations in a clone of the IR. Returns the modified IR and fix result.
pub fn auto_fix(ir: &SlotGameIR, jurisdictions: &[&str]) -> (SlotGameIR, AutoFixResult) {
    let resolved = resolve_jurisdictions(ir, jurisdictions);
    let resolved_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();
    let mut working = ir.clone();

    let initial_report = validate(&working, &resolved_refs);
    let mut applied_fixes: Vec<AppliedFix> = Vec::new();

    for violation in initial_report.violations.iter().filter(|v| v.can_auto_fix) {
        if let Some(profile) = get_profile(&violation.jurisdiction) {
            if let Some(fix) = apply_fix(&mut working, violation, profile) {
                applied_fixes.push(fix);
            }
        }
    }

    // Re-validate after fixes
    let final_report = validate(&working, &resolved_refs);
    let remaining_violations: Vec<ComplianceViolation> = final_report
        .violations
        .into_iter()
        .filter(|v| v.severity == ViolationSeverity::Error || v.severity == ViolationSeverity::Warning)
        .collect();

    let result = AutoFixResult {
        applied_fixes,
        remaining_violations,
        is_fully_compliant: final_report.is_compliant,
    };

    (working, result)
}
